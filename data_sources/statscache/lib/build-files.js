/**
 * Build output files in the exact on-disk shapes used by the official 2012+ data
 * so the predictor app, aggregate-team-stats and local-db import consume them
 * unchanged.
 */

import { dobToCd } from './normalize.js'

// footywire column label → [bucket, key] in the CD player-stats shape.
// bucket: 'stats' | 'clearances' | 'extended' | 'tog'
const STAT_MAP = {
  K: ['stats', 'kicks'],
  HB: ['stats', 'handballs'],
  D: ['stats', 'disposals'],
  M: ['stats', 'marks'],
  G: ['stats', 'goals'],
  B: ['stats', 'behinds'],
  T: ['stats', 'tackles'],
  HO: ['stats', 'hitouts'],
  GA: ['stats', 'goalAssists'],
  I50: ['stats', 'inside50s'],
  CL: ['clearances', 'totalClearances'],
  CG: ['stats', 'clangers'],
  R50: ['stats', 'rebound50s'],
  FF: ['stats', 'freesFor'],
  FA: ['stats', 'freesAgainst'],
  AF: ['stats', 'dreamTeamPoints'],
  CP: ['stats', 'contestedPossessions'],
  UP: ['stats', 'uncontestedPossessions'],
  ED: ['extended', 'effectiveDisposals'],
  'DE%': ['stats', 'disposalEfficiency'],
  CM: ['stats', 'contestedMarks'],
  MI5: ['stats', 'marksInside50'],
  '1%': ['stats', 'onePercenters'],
  BO: ['stats', 'bounces'],
  'TOG%': ['tog', 'timeOnGroundPercentage'],
}

function teamObj(team) {
  return {
    id: team.numericId,
    providerId: team.providerId,
    name: team.name,
    abbreviation: team.abbreviation,
    nickname: team.nickname,
    teamType: 'MEN',
  }
}

/** One player's nested CD-shaped stats entry for a stats/*.json file. */
export function buildPlayerEntry(player, team, resolved, profile) {
  const stats = {}
  const clearances = {}
  const extended = {}
  let tog = null

  for (const [label, val] of Object.entries(player.stats)) {
    const target = STAT_MAP[label]
    if (!target) continue
    const [bucket, key] = target
    if (bucket === 'stats') stats[key] = val
    else if (bucket === 'clearances') clearances[key] = val
    else if (bucket === 'extended') extended[key] = val
    else if (bucket === 'tog') tog = val
  }
  if (stats.contestedPossessions != null && stats.uncontestedPossessions != null) {
    stats.totalPossessions = stats.contestedPossessions + stats.uncontestedPossessions
  }
  if (Object.keys(clearances).length) stats.clearances = clearances
  if (Object.keys(extended).length) stats.extendedStats = extended

  const playerName = { givenName: resolved.givenName, surname: resolved.surname }
  const inner = {
    playerId: resolved.playerId,
    playerName,
    captain: false,
    playerJumperNumber: null,
  }

  return {
    player: {
      player: { position: profile?.position ?? '', player: inner },
      jumperNumber: null,
      photoURL: '',
    },
    teamId: team.providerId,
    playerStats: {
      stats,
      player: inner,
      teamId: team.providerId,
      gamesPlayed: null,
      timeOnGroundPercentage: tog,
      lastUpdated: null,
    },
  }
}

export function buildStatsFile(homeEntries, awayEntries) {
  return { homeTeamPlayerStats: homeEntries, awayTeamPlayerStats: awayEntries }
}

function scoreObj(s) {
  return { goals: s.goals, behinds: s.behinds, totalScore: s.totalScore, superGoals: 0 }
}

export function buildFixture(year, compSeasonId, matches) {
  return {
    meta: {
      code: 200,
      source: 'statscache',
      pagination: { page: 0, numPages: 1, pageSize: 300, numEntries: matches.length },
    },
    matches: matches.map((m) => ({
      id: m.mid,
      providerId: `PW_M${m.mid}`,
      compSeason: {
        id: compSeasonId,
        providerId: `PW_S${year}`,
        name: `${year} AFL Premiership`,
        shortName: 'Premiership',
      },
      round: { roundNumber: m.roundNumber, name: m.roundName, byes: [] },
      home: { team: teamObj(m.homeTeam), score: scoreObj(m.homeScore) },
      away: { team: teamObj(m.awayTeam), score: scoreObj(m.awayScore) },
      venue: { providerId: null, name: m.venue ?? null, location: null, state: null },
      utcStartTime: m.utcStartTime,
      status: 'CONCLUDED',
    })),
  }
}

export function buildMatchDetails(m) {
  const periodScore = (periods) =>
    periods.map((p, i) => ({
      periodNumber: i + 1,
      score: { totalScore: p.goals * 6 + p.behinds, goals: p.goals, behinds: p.behinds },
    }))

  return {
    match: {
      name: `${m.homeTeam.name} Vs ${m.awayTeam.name}`,
      date: m.utcStartTime,
      status: 'CONCLUDED',
      matchId: `PW_M${m.mid}`,
      homeTeamId: m.homeTeam.providerId,
      awayTeamId: m.awayTeam.providerId,
      round: m.roundName,
    },
    venue: { name: m.venue ?? null },
    round: { name: m.roundName, year: String(m.year), roundNumber: m.roundNumber },
    score: {
      status: 'CONCLUDED',
      matchId: `PW_M${m.mid}`,
      homeTeamScore: {
        matchScore: scoreObj(m.homeScore),
        periodScore: m.periods ? periodScore(m.periods.home) : [],
      },
      awayTeamScore: {
        matchScore: scoreObj(m.awayScore),
        periodScore: m.periods ? periodScore(m.periods.away) : [],
      },
      attendance: m.attendance ?? null,
    },
  }
}

export function buildPlayerProfile(resolved, profile) {
  return {
    givenName: resolved.givenName,
    surname: resolved.surname,
    age: null,
    heightCm: profile?.heightCm ?? null,
    weightKg: 0,
    jumperNumber: null,
    kickingFoot: null,
    stateOfOrigin: null,
    draftYear: profile?.draftYear ?? null,
    debutYear: null,
    recruitedFrom: profile?.origin ?? null,
    draftPosition: null,
    draftType: null,
    position: profile?.position ?? null,
    bio: null,
    aflAwards: null,
    photoURL: '',
    dateOfBirth: dobToCd(resolved.dob),
    source: 'statscache',
  }
}

// ─── Team-stats aggregation (mirrors scripts/aggregate-team-stats.js) ─────────

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

/**
 * Aggregate an array of stats-file objects into per-team season totals/averages.
 * Returns Map<teamProviderId, teamStatsFile>.
 */
export function aggregateTeamStats(statsFiles) {
  const players = new Map()
  const key = (t, p) => `${t}::${p}`

  function accumulate(entry) {
    const teamId = entry.teamId
    const playerData = entry.player?.player?.player
    const ps = entry.playerStats
    if (!teamId || !playerData || !ps) return
    const playerId = playerData.playerId
    if (!playerId) return
    const k = key(teamId, playerId)
    if (!players.has(k)) {
      players.set(k, {
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
    const acc = players.get(k)
    acc.gamesPlayed++
    const stats = ps.stats ?? {}
    const clearances = stats.clearances ?? {}
    const extended = stats.extendedStats ?? {}
    for (const s of DIRECT_STATS) { const v = stats[s]; if (typeof v === 'number') { acc.sums[s] += v; acc.counts[s]++ } }
    for (const s of CLEARANCE_STATS) { const v = clearances[s]; if (typeof v === 'number') { acc.sums[s] += v; acc.counts[s]++ } }
    for (const s of EXTENDED_STATS) { const v = extended[s]; if (typeof v === 'number') { acc.sums[s] += v; acc.counts[s]++ } }
    const tog = ps.timeOnGroundPercentage
    if (typeof tog === 'number') { acc.sums.timeOnGroundPercentage += tog; acc.counts.timeOnGroundPercentage++ }
  }

  for (const data of statsFiles) {
    for (const e of data.homeTeamPlayerStats ?? []) accumulate(e)
    for (const e of data.awayTeamPlayerStats ?? []) accumulate(e)
  }

  const teams = new Map()
  for (const acc of players.values()) {
    if (!teams.has(acc.teamId)) teams.set(acc.teamId, [])
    teams.get(acc.teamId).push(acc)
  }

  const generatedAt = new Date().toISOString()
  const out = new Map()
  for (const [teamId, teamPlayers] of teams) {
    teamPlayers.sort((a, b) =>
      b.gamesPlayed !== a.gamesPlayed ? b.gamesPlayed - a.gamesPlayed : a.surname.localeCompare(b.surname),
    )
    out.set(teamId, {
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
            // Never recorded in any of this player's games (e.g. advanced stats
            // pre-2010) → null ("not recorded"), distinct from a real 0.
            totals[stat] = null
            averages[stat] = null
          }
        }
        return {
          playerId: acc.playerId, givenName: acc.givenName, surname: acc.surname,
          position: acc.position, jumperNumber: acc.jumperNumber, photoURL: acc.photoURL,
          gamesPlayed: acc.gamesPlayed, totals, averages,
        }
      }),
    })
  }
  return out
}
