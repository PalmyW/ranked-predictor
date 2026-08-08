import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { leagueFromArgv, dataDir, loadCurrentSeasonYear } from './lib/league.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LEAGUE = leagueFromArgv()

const seasonArg = process.argv.find((a) => a.startsWith('--season='))
const season = seasonArg ? seasonArg.split('=')[1] : (loadCurrentSeasonYear(ROOT, LEAGUE) ?? '2026')

const STATS_DIR = join(dataDir(ROOT, LEAGUE, season), 'stats')
const OUTPUT_DIR = join(dataDir(ROOT, LEAGUE, season), 'team-stats')

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

// teamId+playerId -> accumulated data
const players = new Map()

function getKey(teamId, playerId) {
  return `${teamId}::${playerId}`
}

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
      teamId,
      playerId,
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

  // Update metadata from latest appearance
  acc.givenName = playerData.playerName?.givenName ?? acc.givenName
  acc.surname = playerData.playerName?.surname ?? acc.surname
  acc.position = entry.player?.player?.position ?? acc.position
  acc.jumperNumber = playerData.playerJumperNumber ?? acc.jumperNumber
  acc.photoURL = entry.player?.photoURL ?? acc.photoURL
  acc.gamesPlayed++

  const stats = playerStats.stats ?? {}
  const clearances = stats.clearances ?? {}
  const extended = stats.extendedStats ?? {}

  for (const key of DIRECT_STATS) {
    const val = stats[key]
    if (val != null && typeof val === 'number') {
      acc.sums[key] += val
      acc.counts[key]++
    }
  }

  for (const key of CLEARANCE_STATS) {
    const val = clearances[key]
    if (val != null && typeof val === 'number') {
      acc.sums[key] += val
      acc.counts[key]++
    }
  }

  for (const key of EXTENDED_STATS) {
    const val = extended[key]
    if (val != null && typeof val === 'number') {
      acc.sums[key] += val
      acc.counts[key]++
    }
  }

  const tog = playerStats.timeOnGroundPercentage
  if (tog != null && typeof tog === 'number') {
    acc.sums['timeOnGroundPercentage'] += tog
    acc.counts['timeOnGroundPercentage']++
  }
}

const files = readdirSync(STATS_DIR).filter((f) => f.endsWith('.json')).sort()
console.log(`Processing ${files.length} match files...`)

for (const file of files) {
  const data = JSON.parse(readFileSync(join(STATS_DIR, file), 'utf8'))
  for (const entry of data.homeTeamPlayerStats ?? []) accumulatePlayerStats(entry)
  for (const entry of data.awayTeamPlayerStats ?? []) accumulatePlayerStats(entry)
}

// Group by team
const teams = new Map()
for (const acc of players.values()) {
  if (!teams.has(acc.teamId)) teams.set(acc.teamId, [])
  teams.get(acc.teamId).push(acc)
}

mkdirSync(OUTPUT_DIR, { recursive: true })

const generatedAt = new Date().toISOString()

for (const [teamId, teamPlayers] of teams) {
  teamPlayers.sort((a, b) => {
    if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed
    return a.surname.localeCompare(b.surname)
  })

  const output = {
    teamId,
    generatedAt,
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
      return {
        playerId: acc.playerId,
        givenName: acc.givenName,
        surname: acc.surname,
        position: acc.position,
        jumperNumber: acc.jumperNumber,
        photoURL: acc.photoURL,
        gamesPlayed: acc.gamesPlayed,
        totals,
        averages,
      }
    }),
  }

  writeFileSync(join(OUTPUT_DIR, `${teamId}.json`), JSON.stringify(output, null, 2))
}

console.log(`Done. Wrote ${teams.size} team files to ${OUTPUT_DIR}`)
