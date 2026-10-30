import type { AflMatch } from '../types/afl'
import { teamsInMatches } from './useAFLData'
import { isFinalsMatch } from './useFinals'
import { buildBasicStats, buildOfficialRankMap } from './useAlgorithmRankings'

// Break lengths (days between consecutive matches) broken out individually;
// anything shorter or longer (e.g. a bye) is grouped as "other".
export const BREAK_DAYS = [5, 6, 7, 8, 9, 10]

// Weekdays (Melbourne time) broken out individually; anything else (a
// Wednesday opener, a public-holiday Monday) is grouped as "other".
export const GAME_DAYS = ['Thu', 'Fri', 'Sat', 'Sun']

// A Friday match kicking off at or after this hour (Melbourne time) is a
// Friday-night match.
const NIGHT_FROM_HOUR = 17

// Breaks this short or shorter are listed individually with the opponent's
// break into the same match.
export const SHORT_BREAK_MAX_DAYS = 6

// A match is a "Broadcast King" when no other match kicks off within this many
// hours either side of it (a match exactly this far away still counts as a clash).
export const BROADCAST_WINDOW_HOURS = 3

export interface DoubleUp {
  opponentId: number
  meetings: Array<{ matchId: number; roundNumber: number; isHome: boolean }>
}

export interface ShortBreak {
  matchId: number
  roundNumber: number
  isHome: boolean
  days: number
  opponentId: number
  // The opponent's break into the same match; null if it's their first game.
  opponentDays: number | null
}

export interface OpponentOffBye {
  matchId: number
  roundNumber: number
  isHome: boolean
  opponentId: number
  // Breaks into this match; null when a game involved is still untimed.
  opponentDays: number | null
  days: number | null
}

export interface BroadcastKing {
  matchId: number
  roundNumber: number
  isHome: boolean
  opponentId: number
  utcStartTime: string
}

export interface FixtureTeamAnalysis {
  teamId: number
  games: number
  // Average opponent rank (17-team adjusted, as the ladder's Diff column) —
  // lower = harder. null when no opponent has a rank under that basis.
  rankingDifficulty: number | null
  ladderDifficulty: number | null
  // Average opponent percentage — higher = harder.
  percentageDifficulty: number | null
  // 1 = hardest fixture in the competition under that basis.
  rankingOrder: number | null
  ladderOrder: number | null
  percentageOrder: number | null
  doubleUps: DoubleUp[]
  // Days → count, only for gaps where both matches have confirmed times.
  breaks: Record<number, number>
  // Gaps involving a PLACEHOLDER match, whose start time is a dummy value.
  pendingBreaks: number
  // Breaks of SHORT_BREAK_MAX_DAYS or fewer, shortest first, then by round.
  shortBreaks: ShortBreak[]
  // Matches where the opponent is coming off a bye, in round order.
  opponentsOffBye: OpponentOffBye[]
  // Weekday ('Thu', 'Mon', …) → count, only for matches with confirmed times.
  gameDays: Record<string, number>
  // Friday-night matches that are the only match on that Friday night.
  standaloneFridayNights: number
  // Timed matches with no other timed match kicking off within
  // BROADCAST_WINDOW_HOURS either side, in round order.
  broadcastKings: BroadcastKing[]
  // PLACEHOLDER matches, whose day isn't known yet.
  untimedGames: number
}

const MELBOURNE_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Melbourne',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const MELBOURNE_WEEKDAY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Australia/Melbourne',
  weekday: 'short',
})

const MELBOURNE_HOUR = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Australia/Melbourne',
  hour: 'numeric',
  hourCycle: 'h23',
})

// Calendar days between two kick-offs in Melbourne time, so a Saturday night
// game to the next Friday night is a 6-day break regardless of kick-off times.
function calendarDaysBetween(a: string, b: string): number {
  const day = (iso: string) => Date.parse(`${MELBOURNE_DATE.format(new Date(iso))}T00:00:00Z`)
  return Math.round((day(b) - day(a)) / 86_400_000)
}

function isFridayNight(m: AflMatch): boolean {
  const start = new Date(m.utcStartTime)
  return MELBOURNE_WEEKDAY.format(start) === 'Fri' && Number(MELBOURNE_HOUR.format(start)) >= NIGHT_FROM_HOUR
}

/**
 * A season's finishing positions (1 = premier), keyed by team id. Finalists
 * rank by how far they got — the Grand Final winner, then the loser, then the
 * preliminary-final losers, and so on — with teams knocked out in the same
 * round ordered by home-and-away ladder position. Non-finalists follow in
 * ladder order. Before any final is played this is just the ladder.
 */
export function finalLadderPositions(matches: readonly AflMatch[]): Record<number, number> {
  const ladder = buildOfficialRankMap(buildBasicStats(matches.filter((m) => !isFinalsMatch(m))))
  const finals = matches.filter(
    (m) => isFinalsMatch(m) && m.status === 'CONCLUDED' && m.homeScore && m.awayScore,
  )

  // The last finals round each team played in (a qualifying-final loser plays
  // on, so it's the furthest round reached, not the round they lost in).
  const furthest = new Map<number, number>()
  for (const m of finals) {
    for (const id of [m.homeTeamId, m.awayTeamId]) {
      furthest.set(id, Math.max(furthest.get(id) ?? 0, m.roundNumber))
    }
  }
  const gf = finals.find((m) => m.roundAbbreviation === 'GF')
  const premier = gf && gf.homeScore!.totalScore !== gf.awayScore!.totalScore
    ? (gf.homeScore!.totalScore > gf.awayScore!.totalScore ? gf.homeTeamId : gf.awayTeamId)
    : null

  const order = [...ladder.keys()].sort(
    (a, b) =>
      (furthest.get(b) ?? -1) - (furthest.get(a) ?? -1) ||
      Number(b === premier) - Number(a === premier) ||
      ladder.get(a)! - ladder.get(b)!,
  )
  return Object.fromEntries(order.map((id, i) => [id, i + 1]))
}

/** A season's final home-and-away percentages (points for ÷ against × 100), keyed by team id. */
export function finalPercentages(matches: readonly AflMatch[]): Record<number, number> {
  const stats = buildBasicStats(matches.filter((m) => !isFinalsMatch(m)))
  const result: Record<number, number> = {}
  for (const [id, s] of Object.entries(stats)) {
    if (s.against > 0) result[Number(id)] = (s.for / s.against) * 100
  }
  return result
}

function averageOpponentPercentage(
  opponentIds: readonly number[],
  percentages: Record<number, number>,
): number | null {
  const values = opponentIds.map((id) => percentages[id]).filter((p): p is number => p !== undefined)
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

// Mirrors computeDifficulty in useSimulation.ts (opponents ranked in a 17-team
// system, so opponents below the team shift up one), but over the whole fixture
// rather than only the remaining matches, and skipping unranked opponents.
function averageOpponentRank(
  teamId: number,
  opponentIds: readonly number[],
  rankMap: Record<number, number>,
): number | null {
  const own = rankMap[teamId]
  const ranks = opponentIds
    .map((id) => rankMap[id])
    .filter((r): r is number => r !== undefined)
    .map((r) => (own !== undefined && r > own ? r - 1 : r))
  return ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null
}

// `harderIsHigher`: for percentages a bigger average means a harder draw; for
// ranks a smaller one does.
function orderByDifficulty(
  rows: FixtureTeamAnalysis[],
  key: 'rankingDifficulty' | 'ladderDifficulty' | 'percentageDifficulty',
  harderIsHigher = false,
): Map<number, number> {
  const dir = harderIsHigher ? -1 : 1
  const ranked = rows
    .filter((r) => r[key] !== null)
    .sort((a, b) => dir * ((a[key] as number) - (b[key] as number)))
  // Equal averages share a place (e.g. three teams on 8.83 are all =6th).
  const order = new Map<number, number>()
  ranked.forEach((r, i) => {
    const prev = ranked[i - 1]
    const tied = prev && Math.abs((prev[key] as number) - (r[key] as number)) < 1e-9
    order.set(r.teamId, tied ? order.get(prev.teamId)! : i + 1)
  })
  return order
}

/**
 * Per-team analysis of a season's home-and-away fixture: schedule difficulty
 * under three opponent measures (the user's power ranking, and a previous
 * season's final ladder and percentages), opponents played twice, and the
 * breaks between matches.
 */
export function analyseFixture(
  matches: readonly AflMatch[],
  rankingMap: Record<number, number>,
  ladderMap: Record<number, number>,
  percentages: Record<number, number>,
): FixtureTeamAnalysis[] {
  const homeAndAway = matches.filter((m) => !isFinalsMatch(m))

  // Friday-night matches per Melbourne date, to spot the stand-alone ones.
  const fridayNightCount = new Map<string, number>()
  for (const m of homeAndAway) {
    if (m.status === 'PLACEHOLDER' || !isFridayNight(m)) continue
    const date = MELBOURNE_DATE.format(new Date(m.utcStartTime))
    fridayNightCount.set(date, (fridayNightCount.get(date) ?? 0) + 1)
  }

  // Timed matches with the broadcast window to themselves. Untimed matches are
  // ignored on both sides, since their start times are dummies.
  const timedStarts = homeAndAway
    .filter((m) => m.status !== 'PLACEHOLDER')
    .map((m) => ({ id: m.id, start: Date.parse(m.utcStartTime) }))
  const windowMs = BROADCAST_WINDOW_HOURS * 3_600_000
  const exclusive = new Set(
    timedStarts
      .filter((a) => !timedStarts.some((b) => b.id !== a.id && Math.abs(b.start - a.start) <= windowMs))
      .map((a) => a.id),
  )

  // Each team's matches in order, and its break (days) into each one — null
  // for its first match or when either game is still untimed. Built up front
  // so a short break can be compared with the opponent's break into that match.
  const teams = teamsInMatches(homeAndAway)
  const ownMatches = new Map<number, AflMatch[]>()
  const breakInto = new Map<string, number | null>()
  // Matches a team plays straight after a bye (its previous game was two or
  // more rounds earlier), keyed `${teamId}:${matchId}`.
  const afterBye = new Set<string>()
  for (const team of teams) {
    const own = homeAndAway
      .filter((m) => m.homeTeamId === team.id || m.awayTeamId === team.id)
      .sort((a, b) => a.roundNumber - b.roundNumber || a.utcStartTime.localeCompare(b.utcStartTime))
    ownMatches.set(team.id, own)
    own.forEach((m, i) => {
      const prev = own[i - 1]
      const timed = prev && prev.status !== 'PLACEHOLDER' && m.status !== 'PLACEHOLDER'
      breakInto.set(`${team.id}:${m.id}`, timed ? calendarDaysBetween(prev.utcStartTime, m.utcStartTime) : null)
      if (prev && m.roundNumber - prev.roundNumber > 1) afterBye.add(`${team.id}:${m.id}`)
    })
  }

  const rows = teams.map((team): FixtureTeamAnalysis => {
    const own = ownMatches.get(team.id)!
    const opponentIds = own.map((m) => (m.homeTeamId === team.id ? m.awayTeamId : m.homeTeamId))

    const meetings = new Map<number, DoubleUp['meetings']>()
    own.forEach((m, i) => {
      const list = meetings.get(opponentIds[i]) ?? []
      list.push({ matchId: m.id, roundNumber: m.roundNumber, isHome: m.homeTeamId === team.id })
      meetings.set(opponentIds[i], list)
    })
    const doubleUps = [...meetings.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([opponentId, list]) => ({ opponentId, meetings: list }))

    const breaks: Record<number, number> = {}
    const shortBreaks: ShortBreak[] = []
    let pendingBreaks = 0
    for (let i = 1; i < own.length; i++) {
      const m = own[i]
      const days = breakInto.get(`${team.id}:${m.id}`) ?? null
      if (days === null) {
        pendingBreaks++
        continue
      }
      breaks[days] = (breaks[days] ?? 0) + 1
      if (days <= SHORT_BREAK_MAX_DAYS) {
        shortBreaks.push({
          matchId: m.id,
          roundNumber: m.roundNumber,
          isHome: m.homeTeamId === team.id,
          days,
          opponentId: opponentIds[i],
          opponentDays: breakInto.get(`${opponentIds[i]}:${m.id}`) ?? null,
        })
      }
    }

    shortBreaks.sort((a, b) => a.days - b.days || a.roundNumber - b.roundNumber)

    const opponentsOffBye: OpponentOffBye[] = []
    own.forEach((m, i) => {
      if (!afterBye.has(`${opponentIds[i]}:${m.id}`)) return
      opponentsOffBye.push({
        matchId: m.id,
        roundNumber: m.roundNumber,
        isHome: m.homeTeamId === team.id,
        opponentId: opponentIds[i],
        opponentDays: breakInto.get(`${opponentIds[i]}:${m.id}`) ?? null,
        days: breakInto.get(`${team.id}:${m.id}`) ?? null,
      })
    })

    const gameDays: Record<string, number> = {}
    let standaloneFridayNights = 0
    let untimedGames = 0
    for (const m of own) {
      if (m.status === 'PLACEHOLDER') {
        untimedGames++
        continue
      }
      const start = new Date(m.utcStartTime)
      const weekday = MELBOURNE_WEEKDAY.format(start)
      gameDays[weekday] = (gameDays[weekday] ?? 0) + 1
      if (isFridayNight(m) && fridayNightCount.get(MELBOURNE_DATE.format(start)) === 1) {
        standaloneFridayNights++
      }
    }

    const broadcastKings: BroadcastKing[] = []
    own.forEach((m, i) => {
      if (!exclusive.has(m.id)) return
      broadcastKings.push({
        matchId: m.id,
        roundNumber: m.roundNumber,
        isHome: m.homeTeamId === team.id,
        opponentId: opponentIds[i],
        utcStartTime: m.utcStartTime,
      })
    })

    return {
      teamId: team.id,
      games: own.length,
      rankingDifficulty: averageOpponentRank(team.id, opponentIds, rankingMap),
      ladderDifficulty: averageOpponentRank(team.id, opponentIds, ladderMap),
      percentageDifficulty: averageOpponentPercentage(opponentIds, percentages),
      rankingOrder: null,
      ladderOrder: null,
      percentageOrder: null,
      doubleUps,
      breaks,
      pendingBreaks,
      shortBreaks,
      opponentsOffBye,
      gameDays,
      standaloneFridayNights,
      broadcastKings,
      untimedGames,
    }
  })

  const rankingOrder = orderByDifficulty(rows, 'rankingDifficulty')
  const ladderOrder = orderByDifficulty(rows, 'ladderDifficulty')
  const percentageOrder = orderByDifficulty(rows, 'percentageDifficulty', true)
  for (const r of rows) {
    r.rankingOrder = rankingOrder.get(r.teamId) ?? null
    r.ladderOrder = ladderOrder.get(r.teamId) ?? null
    r.percentageOrder = percentageOrder.get(r.teamId) ?? null
  }
  return rows
}
