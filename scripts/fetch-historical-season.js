/**
 * One-time script to pull all data for a historical AFL/AFLW season.
 * Usage: node scripts/fetch-historical-season.js --year=2025 --compSeasonId=77
 *        node scripts/fetch-historical-season.js --league=aflw --year=2022a
 *
 * Creates public/data/[aflw/]{year}/ with fixture.json, stats/, match-team-stats/, and team-stats/.
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync, mkdirSync, unlinkSync, readdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { leagueFromArgv, dataDir, loadSeasonRegistry } from './lib/league.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LEAGUE = leagueFromArgv()
const SEASON_REGISTRY = loadSeasonRegistry(ROOT, LEAGUE)

const yearArg = process.argv.find((a) => a.startsWith('--year='))
const compSeasonArg = process.argv.find((a) => a.startsWith('--compSeasonId='))

if (!yearArg) {
  console.error('Usage: node scripts/fetch-historical-season.js --year=2025 [--compSeasonId=73] [--league=aflw]')
  process.exit(1)
}

const year = yearArg.split('=')[1]
const compSeasonId = compSeasonArg
  ? compSeasonArg.split('=')[1]
  : String(SEASON_REGISTRY[year] ?? '')

if (!compSeasonId) {
  console.error(`Unknown compSeasonId for ${LEAGUE.key} year ${year}. Pass --compSeasonId=<id> explicitly.`)
  process.exit(1)
}

console.log(`[${LEAGUE.key}] Season ${year} → compSeasonId=${compSeasonId}`)

const DATA_DIR = dataDir(ROOT, LEAGUE, year)
const FIXTURE = join(DATA_DIR, 'fixture.json')
const STATS_DIR = join(DATA_DIR, 'stats')
const MATCH_TEAM_STATS_DIR = join(DATA_DIR, 'match-team-stats')
const TEAM_STATS_DIR = join(DATA_DIR, 'team-stats')

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(STATS_DIR, { recursive: true })

// ─── Step 1: Fetch fixture ────────────────────────────────────────────────────

console.log(`\nFetching ${LEAGUE.key} ${year} fixture (compSeasonId=${compSeasonId})...`)
execSync(
  `curl -fsSL` +
    ` -H 'accept: */*'` +
    ` -H 'account: afl'` +
    ` -H 'origin: https://www.afl.com.au'` +
    ` -H 'referer: https://www.afl.com.au/'` +
    ` -H 'user-agent: Mozilla/5.0 (compatible; ranked-predictor-ci/1.0)'` +
    ` 'https://aflapi.afl.com.au/afl/v2/matches?pageSize=300&competitionId=${LEAGUE.competitionId}&compSeasonId=${compSeasonId}'` +
    ` -o '${FIXTURE}'`,
  { stdio: ['ignore', 'ignore', 'pipe'] },
)
console.log(`Fixture saved to ${FIXTURE}`)

// ─── Step 2: Fetch player stats ───────────────────────────────────────────────

let TOKEN = process.env.AFL_STATS_TOKEN
if (!TOKEN) {
  const tokRes = execSync(
    `curl -fsSL -X POST` +
      ` -H 'accept: */*'` +
      ` -H 'content-length: 0'` +
      ` -H 'origin: https://www.afl.com.au'` +
      ` -H 'referer: https://www.afl.com.au/'` +
      ` -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'` +
      ` 'https://api.afl.com.au/cfs/afl/WMCTok'`,
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  TOKEN = JSON.parse(tokRes).token
  console.log('Fetched fresh token.')
}

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))
const concluded = (fixture.matches ?? []).filter(
  (m) => m.status === 'CONCLUDED' || m.status === 'POSTGAME',
)

const missing = concluded.filter(
  (m) => m.providerId && !existsSync(join(STATS_DIR, `${m.providerId}.json`)),
)

console.log(`\n${concluded.length} concluded matches, ${concluded.length - missing.length} already fetched, ${missing.length} to fetch.`)

let ok = 0
let failed = 0

for (const match of missing) {
  const id = match.providerId
  const outFile = join(STATS_DIR, `${id}.json`)
  const label = `${match.home?.team?.name ?? '?'} v ${match.away?.team?.name ?? '?'} (${id})`
  process.stdout.write(`Fetching ${label}... `)
  try {
    execSync(
      `curl -fsSL` +
        ` -H 'accept: */*'` +
        ` -H 'origin: https://www.afl.com.au'` +
        ` -H 'referer: https://www.afl.com.au/'` +
        ` -H 'user-agent: Mozilla/5.0 (compatible; ranked-predictor-ci/1.0)'` +
        ` -H 'x-media-mis-token: ${TOKEN}'` +
        ` 'https://api.afl.com.au/cfs/afl/playerStats/match/${id}'` +
        ` -o '${outFile}'`,
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )
    console.log('done')
    ok++
  } catch {
    console.log('FAILED')
    if (existsSync(outFile)) unlinkSync(outFile)
    failed++
  }
}

if (failed > 0) {
  console.error(`\n${failed} stats fetches failed. Fix and re-run — already-fetched files are skipped.`)
  process.exit(1)
}
console.log(`Stats: ${ok} fetched.`)

// ─── Step 2b: Fetch match team stats ─────────────────────────────────────────

mkdirSync(MATCH_TEAM_STATS_DIR, { recursive: true })

const missingTeamStats = concluded.filter(
  (m) => m.providerId && !existsSync(join(MATCH_TEAM_STATS_DIR, `${m.providerId}.json`)),
)

console.log(`\n${concluded.length} concluded matches, ${concluded.length - missingTeamStats.length} match team stats already fetched, ${missingTeamStats.length} to fetch.`)

let okT = 0
let failedT = 0

for (const match of missingTeamStats) {
  const id = match.providerId
  const outFile = join(MATCH_TEAM_STATS_DIR, `${id}.json`)
  const label = `${match.home?.team?.name ?? '?'} v ${match.away?.team?.name ?? '?'} (${id})`
  process.stdout.write(`Fetching match team stats ${label}... `)
  try {
    execSync(
      `curl -fsSL` +
        ` -H 'accept: */*'` +
        ` -H 'origin: https://www.afl.com.au'` +
        ` -H 'referer: https://www.afl.com.au/'` +
        ` -H 'user-agent: Mozilla/5.0 (compatible; ranked-predictor-ci/1.0)'` +
        ` -H 'x-media-mis-token: ${TOKEN}'` +
        ` 'https://api.afl.com.au/cfs/afl/coach/match/${id}/teamStats'` +
        ` -o '${outFile}'`,
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )
    console.log('done')
    okT++
  } catch {
    console.log('FAILED')
    if (existsSync(outFile)) unlinkSync(outFile)
    failedT++
  }
}

if (failedT > 0) {
  console.error(`\n${failedT} match team stats fetches failed. Fix and re-run — already-fetched files are skipped.`)
  process.exit(1)
}
console.log(`Match team stats: ${okT} fetched.`)

// ─── Step 3: Aggregate team stats ────────────────────────────────────────────

console.log(`\nAggregating team stats for ${year}...`)

const DIRECT_STATS = [
  'goals', 'behinds', 'superGoals', 'kicks', 'handballs', 'disposals',
  'marks', 'bounces', 'tackles', 'contestedPossessions', 'uncontestedPossessions',
  'totalPossessions', 'inside50s', 'marksInside50', 'contestedMarks', 'hitouts',
  'onePercenters', 'disposalEfficiency', 'clangers', 'freesFor', 'freesAgainst',
  'dreamTeamPoints', 'rebound50s', 'goalAssists', 'goalAccuracy', 'ratingPoints',
  'turnovers', 'intercepts', 'tacklesInside50', 'shotsAtGoal', 'scoreInvolvements',
  'metresGained',
]
const CLEARANCE_STATS = ['centreClearances', 'stoppageClearances', 'totalClearances']
const EXTENDED_STATS = [
  'effectiveKicks', 'kickEfficiency', 'kickToHandballRatio', 'effectiveDisposals',
  'marksOnLead', 'interceptMarks', 'contestedPossessionRate', 'hitoutsToAdvantage',
  'hitoutWinPercentage', 'hitoutToAdvantageRate', 'groundBallGets', 'f50GroundBallGets',
  'scoreLaunches', 'pressureActs', 'defHalfPressureActs', 'spoils', 'ruckContests',
  'contestDefOneOnOnes', 'contestDefLosses', 'contestDefLossPercentage',
  'contestOffOneOnOnes', 'contestOffWins', 'contestOffWinsPercentage',
  'centreBounceAttendances', 'kickins', 'kickinsPlayon',
]
const ALL_STATS = [...DIRECT_STATS, ...CLEARANCE_STATS, ...EXTENDED_STATS, 'timeOnGroundPercentage']

const players = new Map()

function getKey(teamId, playerId) { return `${teamId}::${playerId}` }

function accumulatePlayerStats(entry) {
  const teamId = entry.teamId
  const playerData = entry.player?.player?.player
  const playerStats = entry.playerStats
  if (!teamId || !playerData || !playerStats) return
  const playerId = playerData.playerId
  if (!playerId) return
  const key = getKey(teamId, playerId)
  if (!players.has(key)) {
    players.set(key, {
      teamId, playerId,
      givenName: playerData.playerName?.givenName ?? '',
      surname: playerData.playerName?.surname ?? '',
      position: entry.player?.player?.position ?? '',
      jumperNumber: playerData.playerJumperNumber ?? null,
      photoURL: entry.player?.photoURL ?? '',
      gamesPlayed: 0,
      sums: Object.fromEntries(ALL_STATS.map((s) => [s, 0])),
      counts: Object.fromEntries(ALL_STATS.map((s) => [s, 0])),
    })
  }
  const acc = players.get(key)
  acc.givenName = playerData.playerName?.givenName ?? acc.givenName
  acc.surname = playerData.playerName?.surname ?? acc.surname
  acc.position = entry.player?.player?.position ?? acc.position
  acc.jumperNumber = playerData.playerJumperNumber ?? acc.jumperNumber
  acc.photoURL = entry.player?.photoURL ?? acc.photoURL
  acc.gamesPlayed++
  const stats = playerStats.stats ?? {}
  const clearances = stats.clearances ?? {}
  const extended = stats.extendedStats ?? {}
  for (const k of DIRECT_STATS) { const v = stats[k]; if (v != null && typeof v === 'number') { acc.sums[k] += v; acc.counts[k]++ } }
  for (const k of CLEARANCE_STATS) { const v = clearances[k]; if (v != null && typeof v === 'number') { acc.sums[k] += v; acc.counts[k]++ } }
  for (const k of EXTENDED_STATS) { const v = extended[k]; if (v != null && typeof v === 'number') { acc.sums[k] += v; acc.counts[k]++ } }
  const tog = playerStats.timeOnGroundPercentage
  if (tog != null && typeof tog === 'number') { acc.sums['timeOnGroundPercentage'] += tog; acc.counts['timeOnGroundPercentage']++ }
}

const files = readdirSync(STATS_DIR).filter((f) => f.endsWith('.json')).sort()
console.log(`Processing ${files.length} match files...`)
for (const file of files) {
  const data = JSON.parse(readFileSync(join(STATS_DIR, file), 'utf8'))
  for (const entry of data.homeTeamPlayerStats ?? []) accumulatePlayerStats(entry)
  for (const entry of data.awayTeamPlayerStats ?? []) accumulatePlayerStats(entry)
}

const teams = new Map()
for (const acc of players.values()) {
  if (!teams.has(acc.teamId)) teams.set(acc.teamId, [])
  teams.get(acc.teamId).push(acc)
}

mkdirSync(TEAM_STATS_DIR, { recursive: true })
const generatedAt = new Date().toISOString()

for (const [teamId, teamPlayers] of teams) {
  teamPlayers.sort((a, b) => b.gamesPlayed !== a.gamesPlayed ? b.gamesPlayed - a.gamesPlayed : a.surname.localeCompare(b.surname))
  const output = {
    teamId, generatedAt,
    players: teamPlayers.map((acc) => {
      const totals = {}
      const averages = {}
      for (const stat of ALL_STATS) {
        if (acc.counts[stat] > 0) {
          totals[stat] = Math.round(acc.sums[stat] * 10) / 10
          averages[stat] = Math.round((acc.sums[stat] / acc.counts[stat]) * 10) / 10
        } else {
          totals[stat] = 0
          averages[stat] = 0
        }
      }
      return { playerId: acc.playerId, givenName: acc.givenName, surname: acc.surname, position: acc.position, jumperNumber: acc.jumperNumber, photoURL: acc.photoURL, gamesPlayed: acc.gamesPlayed, totals, averages }
    }),
  }
  writeFileSync(join(TEAM_STATS_DIR, `${teamId}.json`), JSON.stringify(output, null, 2))
}

console.log(`Done. Wrote ${teams.size} team files to ${TEAM_STATS_DIR}/`)

// ─── Step 4: Update seasons config ───────────────────────────────────────────

const SEASONS_FILE = join(ROOT, 'src/config/seasons.ts')
const seasonsTsSource = readFileSync(SEASONS_FILE, 'utf8')

const entryStr = `{ year: '${year}', compSeasonId: ${compSeasonId} }`

// Anchored to `export const <League's SEASONS const>` and scoped to that
// array's own text — AFL and AFLW years overlap (both have e.g. '2026'), so
// an "already present" check against the whole file (or a bare "SEASONS"
// regex that could match either league's array) would wrongly skip writing
// a genuinely-missing entry into the OTHER league's array.
const arrayRe = new RegExp(`export const ${LEAGUE.seasonsConst}[^=]*=\\s*\\[([^\\]]*)\\]`)
const arrayMatch = seasonsTsSource.match(arrayRe)

if (!arrayMatch) {
  console.warn(`\nCould not parse ${LEAGUE.seasonsConst} array in seasons.ts — add manually:`)
  console.warn(`  ${entryStr}`)
} else if (arrayMatch[1].includes(`year: '${year}'`)) {
  console.log(`\nsrc/config/seasons.ts's ${LEAGUE.seasonsConst} already contains year '${year}' — no changes needed.`)
} else {
  const existingEntries = arrayMatch[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{'))

  const allEntries = [...existingEntries, entryStr]
    .sort((a, b) => {
      const ya = a.match(/year: '(\d{4}[ab]?)'/)?.[1] ?? ''
      const yb = b.match(/year: '(\d{4}[ab]?)'/)?.[1] ?? ''
      return ya.localeCompare(yb, undefined, { numeric: true })
    })

  const newArray = `[\n${allEntries.map((e) => `  ${e.replace(/,$/, '')},`).join('\n')}\n]`
  const updated = seasonsTsSource.replace(arrayRe, `export const ${LEAGUE.seasonsConst}: SeasonConfig[] = ${newArray}`)
  writeFileSync(SEASONS_FILE, updated)
  console.log(`\nAdded ${year} to ${LEAGUE.seasonsConst} in src/config/seasons.ts`)
}

console.log(`\n✓ [${LEAGUE.key}] Season ${year} data ready in ${DATA_DIR}/`)
