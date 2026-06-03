import { computed } from 'vue'
import type { Ref } from 'vue'
import type { AflMatch } from '../types/afl'
import { TEAMS } from './useAFLData'
import { buildBasicStats } from './useAlgorithmRankings'

export interface TeamStrengthRow {
  teamId: number
  teamName: string
  abbreviation: string
  iconId: string
  // All-game stats
  played: number
  avgFor: number
  avgAgainst: number
  defenceAdjustment: number // avg pts opponents score above their all-game avg against this team
  attackRank: number        // 1 = highest avgFor
  defenceRank: number       // 1 = most negative defenceAdjustment
  // Home-specific stats
  playedHome: number
  avgForHome: number
  avgAgainstHome: number
  defenceAdjHome: number    // when this team is home, how much above their all-avg do visitors score
  // Away-specific stats
  playedAway: number
  avgForAway: number
  avgAgainstAway: number
  defenceAdjAway: number    // when this team is away, how much above their all-avg do home teams score
}

export interface UpcomingMatchPrediction {
  matchId: number
  roundNumber: number
  roundName: string
  utcStartTime: string
  homeTeamId: number
  homeTeamName: string
  homeTeamAbbreviation: string
  homeTeamIconId: string
  awayTeamId: number
  awayTeamName: string
  awayTeamAbbreviation: string
  awayTeamIconId: string
  predictedHomeScore: number
  predictedAwayScore: number
  homeVsAvg: number
  awayVsAvg: number
  hasStrengthData: boolean
}

export type StrengthSortKey = 'attackRank' | 'defenceRank'

const UPCOMING_STATUSES = new Set(['SCHEDULED', 'CONFIRMED_TEAMS', 'UNCONFIRMED_TEAMS'])

export function useScorePredictor(
  matchesRef: Ref<readonly AflMatch[]>,
  venueAdjusted: Ref<boolean>,
) {
  const strengthRows = computed<TeamStrengthRow[]>(() => {
    const matches = matchesRef.value

    // Pass 1: per-team stats for all / home / away games
    const statsAll = buildBasicStats(matches, 'both')
    const statsHome = buildBasicStats(matches, 'home')
    const statsAway = buildBasicStats(matches, 'away')

    const avgFor: Record<number, number> = {}
    const avgForHome: Record<number, number> = {}
    const avgForAway: Record<number, number> = {}
    const avgAgainst: Record<number, number> = {}
    const avgAgainstHome: Record<number, number> = {}
    const avgAgainstAway: Record<number, number> = {}

    for (const t of TEAMS) {
      const s = statsAll[t.id]
      const sh = statsHome[t.id]
      const sa = statsAway[t.id]
      avgFor[t.id] = s?.played ? s.for / s.played : 0
      avgAgainst[t.id] = s?.played ? s.against / s.played : 0
      avgForHome[t.id] = sh?.played ? sh.for / sh.played : 0
      avgAgainstHome[t.id] = sh?.played ? sh.against / sh.played : 0
      avgForAway[t.id] = sa?.played ? sa.for / sa.played : 0
      avgAgainstAway[t.id] = sa?.played ? sa.against / sa.played : 0
    }

    // Pass 2: defence adjustments — opponent score vs opponent's all-game average
    // adjAll: both directions per game (existing all-games logic)
    // adjHome[t]: when t is home, how much do visiting opponents score above their all-avg
    // adjAway[t]: when t is away, how much do home opponents score above their all-avg
    const adjAllSum: Record<number, number> = {}
    const adjAllCount: Record<number, number> = {}
    const adjHomeSum: Record<number, number> = {}
    const adjHomeCount: Record<number, number> = {}
    const adjAwaySum: Record<number, number> = {}
    const adjAwayCount: Record<number, number> = {}

    for (const t of TEAMS) {
      adjAllSum[t.id] = 0; adjAllCount[t.id] = 0
      adjHomeSum[t.id] = 0; adjHomeCount[t.id] = 0
      adjAwaySum[t.id] = 0; adjAwayCount[t.id] = 0
    }

    for (const m of matches) {
      if (m.status !== 'CONCLUDED' || !m.homeScore || !m.awayScore) continue
      const hId = m.homeTeamId
      const aId = m.awayTeamId
      if (adjAllSum[hId] === undefined || adjAllSum[aId] === undefined) continue

      const hs = m.homeScore.totalScore
      const as_ = m.awayScore.totalScore

      // All-games: both teams get an adjustment entry
      adjAllSum[hId] += as_ - avgFor[aId]   // visitor scored vs their all-avg, vs home team
      adjAllCount[hId]++
      adjAllSum[aId] += hs - avgFor[hId]    // home scored vs their all-avg, vs away team
      adjAllCount[aId]++

      // Home-specific for hId: visitor score vs their all-avg when hId is at home
      adjHomeSum[hId] += as_ - avgFor[aId]
      adjHomeCount[hId]++

      // Away-specific for aId: home score vs their all-avg when aId is away
      adjAwaySum[aId] += hs - avgFor[hId]
      adjAwayCount[aId]++
    }

    // Build rows
    const rows: Omit<TeamStrengthRow, 'attackRank' | 'defenceRank'>[] = TEAMS.map((t) => ({
      teamId: t.id,
      teamName: t.name,
      abbreviation: t.abbreviation,
      iconId: t.iconId,
      played: statsAll[t.id]?.played ?? 0,
      avgFor: avgFor[t.id],
      avgAgainst: avgAgainst[t.id],
      defenceAdjustment: adjAllCount[t.id] > 0 ? adjAllSum[t.id] / adjAllCount[t.id] : 0,
      playedHome: statsHome[t.id]?.played ?? 0,
      avgForHome: avgForHome[t.id],
      avgAgainstHome: avgAgainstHome[t.id],
      defenceAdjHome: adjHomeCount[t.id] > 0 ? adjHomeSum[t.id] / adjHomeCount[t.id] : 0,
      playedAway: statsAway[t.id]?.played ?? 0,
      avgForAway: avgForAway[t.id],
      avgAgainstAway: avgAgainstAway[t.id],
      defenceAdjAway: adjAwayCount[t.id] > 0 ? adjAwaySum[t.id] / adjAwayCount[t.id] : 0,
    }))

    // Rank by all-games attack: highest avgFor = rank 1, unplayed teams last
    const attackSorted = [...rows].sort((a, b) => {
      if (a.played === 0 && b.played === 0) return 0
      if (a.played === 0) return 1
      if (b.played === 0) return -1
      return b.avgFor - a.avgFor
    })
    const attackRankMap = new Map(attackSorted.map((r, i) => [r.teamId, i + 1]))

    // Rank by all-games defence: most negative defenceAdjustment = rank 1, unplayed teams last
    const defenceSorted = [...rows].sort((a, b) => {
      if (a.played === 0 && b.played === 0) return 0
      if (a.played === 0) return 1
      if (b.played === 0) return -1
      return a.defenceAdjustment - b.defenceAdjustment
    })
    const defenceRankMap = new Map(defenceSorted.map((r, i) => [r.teamId, i + 1]))

    return rows.map((r) => ({
      ...r,
      attackRank: attackRankMap.get(r.teamId)!,
      defenceRank: defenceRankMap.get(r.teamId)!,
    }))
  })

  const teamMap = computed<Map<number, TeamStrengthRow>>(() => {
    const map = new Map<number, TeamStrengthRow>()
    for (const r of strengthRows.value) map.set(r.teamId, r)
    return map
  })

  const hasEnoughData = computed(() => strengthRows.value.some((r) => r.played > 0))

  const upcomingMatches = computed(() =>
    matchesRef.value.filter((m) => UPCOMING_STATUSES.has(m.status)),
  )

  const nextRoundNumber = computed<number | null>(() => {
    if (upcomingMatches.value.length === 0) return null
    return Math.min(...upcomingMatches.value.map((m) => m.roundNumber))
  })

  const nextRoundName = computed<string | null>(() => {
    if (nextRoundNumber.value === null) return null
    return upcomingMatches.value.find((m) => m.roundNumber === nextRoundNumber.value)?.roundName ?? null
  })

  function buildPrediction(m: AflMatch): UpcomingMatchPrediction {
    const home = teamMap.value.get(m.homeTeamId)
    const away = teamMap.value.get(m.awayTeamId)
    const venue = venueAdjusted.value

    const hasStrengthData = venue
      ? !!(home && away && home.playedHome > 0 && away.playedAway > 0)
      : !!(home && away && home.played > 0 && away.played > 0)

    let predictedHomeScore = 0
    let predictedAwayScore = 0
    let homeVsAvg = 0
    let awayVsAvg = 0

    if (hasStrengthData && home && away) {
      if (venue) {
        // Use home attack for home team, away attack for away team
        // defenceAdjAway[away] = how much home opponents score above all-avg vs this away team
        // defenceAdjHome[home] = how much visiting opponents score above all-avg at this home ground
        predictedHomeScore = Math.round(home.avgForHome + away.defenceAdjAway)
        predictedAwayScore = Math.round(away.avgForAway + home.defenceAdjHome)
        homeVsAvg = predictedHomeScore - Math.round(home.avgForHome)
        awayVsAvg = predictedAwayScore - Math.round(away.avgForAway)
      } else {
        predictedHomeScore = Math.round(home.avgFor + away.defenceAdjustment)
        predictedAwayScore = Math.round(away.avgFor + home.defenceAdjustment)
        homeVsAvg = predictedHomeScore - Math.round(home.avgFor)
        awayVsAvg = predictedAwayScore - Math.round(away.avgFor)
      }
    }

    return {
      matchId: m.id,
      roundNumber: m.roundNumber,
      roundName: m.roundName,
      utcStartTime: m.utcStartTime,
      homeTeamId: m.homeTeamId,
      homeTeamName: m.homeTeamName,
      homeTeamAbbreviation: home?.abbreviation ?? m.homeTeamName,
      homeTeamIconId: home?.iconId ?? '',
      awayTeamId: m.awayTeamId,
      awayTeamName: m.awayTeamName,
      awayTeamAbbreviation: away?.abbreviation ?? m.awayTeamName,
      awayTeamIconId: away?.iconId ?? '',
      predictedHomeScore,
      predictedAwayScore,
      homeVsAvg,
      awayVsAvg,
      hasStrengthData,
    }
  }

  const nextRoundPredictions = computed<UpcomingMatchPrediction[]>(() => {
    if (nextRoundNumber.value === null) return []
    return upcomingMatches.value
      .filter((m) => m.roundNumber === nextRoundNumber.value)
      .map(buildPrediction)
  })

  const allUpcomingPredictions = computed<UpcomingMatchPrediction[]>(() =>
    upcomingMatches.value.map(buildPrediction),
  )

  return {
    strengthRows,
    hasEnoughData,
    nextRoundNumber,
    nextRoundName,
    nextRoundPredictions,
    allUpcomingPredictions,
  }
}
