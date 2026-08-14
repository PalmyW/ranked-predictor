import { execSync } from 'child_process'
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { leagueFromArgv, dataDir, dataRoot, playersDir, loadCurrentSeasonYear } from './lib/league.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LEAGUE = leagueFromArgv()

const seasonArg = process.argv.find((a) => a.startsWith('--season='))
const season = seasonArg ? seasonArg.split('=')[1] : (loadCurrentSeasonYear(ROOT, LEAGUE) ?? '2026')

const FIXTURE = join(dataDir(ROOT, LEAGUE, season), 'fixture.json')
const STATS_DIR = join(dataDir(ROOT, LEAGUE, season), 'stats')
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

mkdirSync(STATS_DIR, { recursive: true })

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))
const concluded = (fixture.matches ?? []).filter(
  (m) => m.status === 'CONCLUDED' || m.status === 'POSTGAME',
)

const missing = concluded.filter(
  (m) => m.providerId && !existsSync(join(STATS_DIR, `${m.providerId}.json`)),
)

console.log(`${concluded.length} concluded matches, ${concluded.length - missing.length} already fetched, ${missing.length} to fetch.`)

let ok = 0
let failed = 0

if (missing.length === 0) {
  console.log('Nothing to do.')
} else {
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
    } catch (e) {
      console.log('FAILED')
      if (existsSync(outFile)) unlinkSync(outFile)
      failed++
    }
  }

  console.log(`\nDone. ${ok} fetched, ${failed} failed.`)
  if (failed > 0) process.exit(1)
}

// --- Match team stats (coach teamStats) ---
const MATCH_TEAM_STATS_DIR = join(dataDir(ROOT, LEAGUE, season), 'match-team-stats')
mkdirSync(MATCH_TEAM_STATS_DIR, { recursive: true })

const missingTeamStats = concluded.filter(
  (m) => m.providerId && !existsSync(join(MATCH_TEAM_STATS_DIR, `${m.providerId}.json`)),
)

console.log(`\n${concluded.length} concluded matches, ${concluded.length - missingTeamStats.length} match team stats already fetched, ${missingTeamStats.length} to fetch.`)

let okT = 0
let failedT = 0

if (missingTeamStats.length === 0) {
  console.log('Nothing to do.')
} else {
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
    } catch (e) {
      console.log('FAILED')
      if (existsSync(outFile)) unlinkSync(outFile)
      failedT++
    }
  }

  console.log(`\nDone. ${okT} fetched, ${failedT} failed.`)
  if (failedT > 0) process.exit(1)
}

// --- Match details (matchItem) ---
const MATCH_DETAILS_DIR = join(dataDir(ROOT, LEAGUE, season), 'match-details')
mkdirSync(MATCH_DETAILS_DIR, { recursive: true })

const missingDetails = concluded.filter(
  (m) => m.providerId && !existsSync(join(MATCH_DETAILS_DIR, `${m.providerId}.json`)),
)

console.log(`\n${concluded.length} concluded matches, ${concluded.length - missingDetails.length} match details already fetched, ${missingDetails.length} to fetch.`)

let okD = 0
let failedD = 0

if (missingDetails.length === 0) {
  console.log('Nothing to do.')
} else {
  for (const match of missingDetails) {
    const id = match.providerId
    const outFile = join(MATCH_DETAILS_DIR, `${id}.json`)
    const label = `${match.home?.team?.name ?? '?'} v ${match.away?.team?.name ?? '?'} (${id})`
    process.stdout.write(`Fetching match details ${label}... `)
    try {
      execSync(
        `curl -fsSL` +
          ` -H 'accept: */*'` +
          ` -H 'origin: https://www.afl.com.au'` +
          ` -H 'referer: https://www.afl.com.au/'` +
          ` -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'` +
          ` -H 'x-media-mis-token: ${TOKEN}'` +
          ` 'https://api.afl.com.au/cfs/afl/matchItem/${id}'` +
          ` -o '${outFile}'`,
        { stdio: ['ignore', 'ignore', 'pipe'] },
      )
      console.log('done')
      okD++
    } catch (e) {
      console.log('FAILED')
      if (existsSync(outFile)) unlinkSync(outFile)
      failedD++
    }
  }

  console.log(`\nDone. ${okD} fetched, ${failedD} failed.`)
  if (failedD > 0) process.exit(1)
}

// --- Player profiles ---
const PLAYERS_DIR = playersDir(ROOT, LEAGUE)
mkdirSync(PLAYERS_DIR, { recursive: true })

const DATA_DIR = dataRoot(ROOT, LEAGUE)
// player_id → Set of competition codes derived from seasons they appeared in
const playerCompCodes = new Map()
for (const yearDir of readdirSync(DATA_DIR).filter(d => LEAGUE.keyPattern.test(d))) {
  const seasonStatsDir = join(DATA_DIR, yearDir, 'stats')
  if (!existsSync(seasonStatsDir)) continue
  const matchFiles = readdirSync(seasonStatsDir).filter(f => f.endsWith('.json'))
  // Derive competition code from match ID filename, e.g. CD_M20120140101 → CD_C014
  const compCode = matchFiles[0] ? `CD_C${matchFiles[0].slice(8, 11)}` : null
  for (const file of matchFiles) {
    const data = JSON.parse(readFileSync(join(seasonStatsDir, file), 'utf8'))
    for (const entry of [...(data.homeTeamPlayerStats ?? []), ...(data.awayTeamPlayerStats ?? [])]) {
      const pid = entry.player?.player?.player?.playerId
      if (!pid) continue
      if (!playerCompCodes.has(pid)) playerCompCodes.set(pid, new Set())
      if (compCode) playerCompCodes.get(pid).add(compCode)
    }
  }
}
const allPlayerIds = new Set(playerCompCodes.keys())

const newPlayers = [...allPlayerIds].filter(pid => {
  const profilePath = join(PLAYERS_DIR, `${pid}.json`)
  if (!existsSync(profilePath)) return true
  // Re-try players that previously 404'd without the competitionCode param
  try { return readFileSync(profilePath, 'utf8').trim() === 'null' } catch { return false }
})

function fetchPlayerProfile(pid, url) {
  const res = execSync(
    `curl -sL -w '\\n%{http_code}'` +
    ` -H 'accept: */*'` +
    ` -H 'origin: https://www.afl.com.au'` +
    ` -H 'referer: https://www.afl.com.au/'` +
    ` -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'` +
    ` -H 'x-media-mis-token: ${TOKEN}'` +
    ` '${url}'`,
    { stdio: ['ignore', 'pipe', 'pipe'] },
  ).toString()
  const lastNewline = res.lastIndexOf('\n')
  return {
    status: parseInt(res.slice(lastNewline + 1).trim(), 10),
    body: res.slice(0, lastNewline),
  }
}

if (newPlayers.length === 0) {
  console.log('\nNo new players found.')
} else {
  console.log(`\nFetching profiles for ${newPlayers.length} new player(s)...`)
  const BATCH = 5
  let okP = 0
  let failedP = 0
  for (let i = 0; i < newPlayers.length; i += BATCH) {
    const batch = newPlayers.slice(i, i + BATCH)
    for (const pid of batch) {
      process.stdout.write(`  ${pid}... `)
      try {
        let { status, body } = fetchPlayerProfile(pid, `https://api.afl.com.au/statspro/playerProfile/${pid}`)
        if (status === 404) {
          // Retry with each competition code from seasons the player appeared in
          for (const code of (playerCompCodes.get(pid) ?? [])) {
            ;({ status, body } = fetchPlayerProfile(pid, `https://api.afl.com.au/statspro/playerProfile/${pid}?competitionCode=${code}`))
            if (status === 200) break
          }
        }
        if (status === 200) {
          const { playerDetails } = JSON.parse(body)
          writeFileSync(join(PLAYERS_DIR, `${pid}.json`), JSON.stringify(playerDetails, null, 2))
          console.log('done')
          okP++
        } else if (status === 404) {
          // Both attempts 404 — permanently mark as not found
          writeFileSync(join(PLAYERS_DIR, `${pid}.json`), JSON.stringify({ notFound: true }))
          console.log('not found')
          okP++
        } else {
          console.log(`FAILED (${status})`)
          failedP++
        }
      } catch {
        console.log('FAILED')
        failedP++
      }
    }
    if (i + BATCH < newPlayers.length) {
      execSync('sleep 0.5')
    }
  }
  console.log(`\nPlayers: ${okP} fetched, ${failedP} failed.`)
}
