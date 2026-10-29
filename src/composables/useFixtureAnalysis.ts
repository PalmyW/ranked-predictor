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

export interface DoubleUp {
  opponentId: number
  meetings: Array<{ matchId: number; roundNumber: number; isHome: boolean }>
}

export interface FixtureTeamAnalysis {
  teamId: number
  games: number
  // Average opponent rank (17-team adjusted, as the ladder's Diff column) —
  // lower = harder. null when no opponent has a rank under that basis.
  rankingDifficulty: number | null
  ladderDifficulty: number | null
  // 1 = hardest fixture in the competition under that basis.
  rankingOrder: number | null
  ladderOrder: number | null
  doubleUps: DoubleUp[]
  // Days → count, only for gaps where both matches have confirmed times.
  breaks: Record<number, number>
  // Gaps involving a PLACEHOLDER match, whose start time is a dummy value.
  pendingBreaks: number
  // Weekday ('Thu', 'Mon', …) → count, only for matches with confirmed times.
  gameDays: Record<string, number>
  // Friday-night matches that are the only match on that Friday night.
  standaloneFridayNights: number
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

/** A season's final home-and-away ladder positions (1 = top), keyed by team id. */
export function finalLadderPositions(matches: readonly AflMatch[]): Record<number, number> {
  const homeAndAway = matches.filter((m) => !isFinalsMatch(m))
  return Object.fromEntries(buildOfficialRankMap(buildBasicStats(homeAndAway)))
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

function orderByDifficulty(
  rows: FixtureTeamAnalysis[],
  key: 'rankingDifficulty' | 'ladderDifficulty',
): Map<number, number> {
  const ranked = rows
    .filter((r) => r[key] !== null)
    .sort((a, b) => (a[key] as number) - (b[key] as number))
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
 * under two opponent rankings (the user's power ranking and a previous season's
 * final ladder), opponents played twice, and the breaks between matches.
 */
export function analyseFixture(
  matches: readonly AflMatch[],
  rankingMap: Record<number, number>,
  ladderMap: Record<number, number>,
): FixtureTeamAnalysis[] {
  const homeAndAway = matches.filter((m) => !isFinalsMatch(m))

  // Friday-night matches per Melbourne date, to spot the stand-alone ones.
  const fridayNightCount = new Map<string, number>()
  for (const m of homeAndAway) {
    if (m.status === 'PLACEHOLDER' || !isFridayNight(m)) continue
    const date = MELBOURNE_DATE.format(new Date(m.utcStartTime))
    fridayNightCount.set(date, (fridayNightCount.get(date) ?? 0) + 1)
  }

  const rows = teamsInMatches(homeAndAway).map((team): FixtureTeamAnalysis => {
    const own = homeAndAway
      .filter((m) => m.homeTeamId === team.id || m.awayTeamId === team.id)
      .sort((a, b) => a.roundNumber - b.roundNumber || a.utcStartTime.localeCompare(b.utcStartTime))
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
    let pendingBreaks = 0
    for (let i = 1; i < own.length; i++) {
      if (own[i - 1].status === 'PLACEHOLDER' || own[i].status === 'PLACEHOLDER') {
        pendingBreaks++
        continue
      }
      const days = calendarDaysBetween(own[i - 1].utcStartTime, own[i].utcStartTime)
      breaks[days] = (breaks[days] ?? 0) + 1
    }

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

    return {
      teamId: team.id,
      games: own.length,
      rankingDifficulty: averageOpponentRank(team.id, opponentIds, rankingMap),
      ladderDifficulty: averageOpponentRank(team.id, opponentIds, ladderMap),
      rankingOrder: null,
      ladderOrder: null,
      doubleUps,
      breaks,
      pendingBreaks,
      gameDays,
      standaloneFridayNights,
      untimedGames,
    }
  })

  const rankingOrder = orderByDifficulty(rows, 'rankingDifficulty')
  const ladderOrder = orderByDifficulty(rows, 'ladderDifficulty')
  for (const r of rows) {
    r.rankingOrder = rankingOrder.get(r.teamId) ?? null
    r.ladderOrder = ladderOrder.get(r.teamId) ?? null
  }
  return rows
}
