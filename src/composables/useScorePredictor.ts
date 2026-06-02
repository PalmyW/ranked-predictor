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
  played: number
  avgFor: number
  avgAgainst: number
  defenceAdjustment: number // avg pts opponents score above their own avg when playing this team
  attackRank: number        // 1 = highest avgFor
  defenceRank: number       // 1 = most negative defenceAdjustment (hardest to score against)
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

export function useScorePredictor(matchesRef: Ref<readonly AflMatch[]>) {
  const strengthRows = computed<TeamStrengthRow[]>(() => {
    const matches = matchesRef.value

    // Pass 1: per-team avgFor and avgAgainst
    const stats = buildBasicStats(matches, 'both')
    const avgFor: Record<number, number> = {}
    const avgAgainst: Record<number, number> = {}
    for (const t of TEAMS) {
      const s = stats[t.id]
      avgFor[t.id] = s && s.played > 0 ? s.for / s.played : 0
      avgAgainst[t.id] = s && s.played > 0 ? s.against / s.played : 0
    }

    // Pass 2: defenceAdjustment per team
    // For each concluded match, the opponent's score vs. their own avgFor is an
    // adjustment contribution for the team they played against.
    const adjSum: Record<number, number> = {}
    const adjCount: Record<number, number> = {}
    for (const t of TEAMS) {
      adjSum[t.id] = 0
      adjCount[t.id] = 0
    }
    for (const m of matches) {
      if (m.status !== 'CONCLUDED' || !m.homeScore || !m.awayScore) continue
      const hId = m.homeTeamId
      const aId = m.awayTeamId
      if (adjSum[hId] === undefined || adjSum[aId] === undefined) continue
      // Away team scored against home team's defence
      adjSum[hId] += m.awayScore.totalScore - avgFor[aId]
      adjCount[hId]++
      // Home team scored against away team's defence
      adjSum[aId] += m.homeScore.totalScore - avgFor[hId]
      adjCount[aId]++
    }

    const defenceAdjustment: Record<number, number> = {}
    for (const t of TEAMS) {
      defenceAdjustment[t.id] = adjCount[t.id] > 0 ? adjSum[t.id] / adjCount[t.id] : 0
    }

    // Build rows
    const rows: Omit<TeamStrengthRow, 'attackRank' | 'defenceRank'>[] = TEAMS.map((t) => ({
      teamId: t.id,
      teamName: t.name,
      abbreviation: t.abbreviation,
      iconId: t.iconId,
      played: stats[t.id]?.played ?? 0,
      avgFor: avgFor[t.id],
      avgAgainst: avgAgainst[t.id],
      defenceAdjustment: defenceAdjustment[t.id],
    }))

    // Rank by attack: highest avgFor = rank 1, unplayed teams last
    const attackSorted = [...rows].sort((a, b) => {
      if (a.played === 0 && b.played === 0) return 0
      if (a.played === 0) return 1
      if (b.played === 0) return -1
      return b.avgFor - a.avgFor
    })
    const attackRankMap = new Map(attackSorted.map((r, i) => [r.teamId, i + 1]))

    // Rank by defence: most negative defenceAdjustment = rank 1, unplayed teams last
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
    const hasStrengthData = !!(home && away && home.played > 0 && away.played > 0)

    const predictedHomeScore = hasStrengthData
      ? Math.round(home!.avgFor + away!.defenceAdjustment)
      : 0
    const predictedAwayScore = hasStrengthData
      ? Math.round(away!.avgFor + home!.defenceAdjustment)
      : 0
    const homeVsAvg = hasStrengthData ? predictedHomeScore - Math.round(home!.avgFor) : 0
    const awayVsAvg = hasStrengthData ? predictedAwayScore - Math.round(away!.avgFor) : 0

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
