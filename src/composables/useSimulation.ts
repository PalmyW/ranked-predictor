import { computed, ref } from 'vue'
import type { AflMatch, LadderRow, TeamRanking } from '../types/afl'
import { TEAMS } from './useAFLData'

type MatchesRef = { readonly value: readonly AflMatch[] }
type RankingRef = { readonly value: TeamRanking }

// Win probability scales linearly with rank gap:
// 1 place apart → 60%, 17 places apart → 95%
function favouriteWinProb(rankDiff: number): number {
  const clamped = Math.max(1, Math.min(17, Math.abs(rankDiff)))
  return 0.60 + (clamped - 1) * (0.35 / 16)
}

interface TeamStats {
  teamId: number
  wins: number
  losses: number
  draws: number
  pts: number
  for: number
  against: number
  played: number
}

function buildStats(matches: readonly AflMatch[]): Record<number, TeamStats> {
  const stats: Record<number, TeamStats> = {}
  for (const team of TEAMS) {
    stats[team.id] = { teamId: team.id, wins: 0, losses: 0, draws: 0, pts: 0, for: 0, against: 0, played: 0 }
  }
  for (const match of matches) {
    if (match.status !== 'CONCLUDED') continue
    if (!match.homeScore || !match.awayScore) continue
    const hId = match.homeTeamId
    const aId = match.awayTeamId
    const hScore = match.homeScore.totalScore
    const aScore = match.awayScore.totalScore
    if (!stats[hId] || !stats[aId]) continue
    stats[hId].for += hScore; stats[hId].against += aScore; stats[hId].played++
    stats[aId].for += aScore; stats[aId].against += hScore; stats[aId].played++
    if (hScore > aScore) {
      stats[hId].wins++; stats[hId].pts += 4; stats[aId].losses++
    } else if (aScore > hScore) {
      stats[aId].wins++; stats[aId].pts += 4; stats[hId].losses++
    } else {
      stats[hId].draws++; stats[hId].pts += 2; stats[aId].draws++; stats[aId].pts += 2
    }
  }
  return stats
}

// Average rank of remaining opponents for each team
function computeDifficulty(
  matches: readonly AflMatch[],
  rankMap: Record<number, number>,
): Record<number, number | null> {
  const opponents: Record<number, number[]> = {}
  for (const team of TEAMS) opponents[team.id] = []

  for (const match of matches) {
    if (match.status === 'CONCLUDED') continue
    const hId = match.homeTeamId
    const aId = match.awayTeamId
    if (opponents[hId]) opponents[hId].push(aId)
    if (opponents[aId]) opponents[aId].push(hId)
  }

  const result: Record<number, number | null> = {}
  for (const team of TEAMS) {
    const opps = opponents[team.id]
    if (!opps || opps.length === 0) {
      result[team.id] = null
    } else {
      const sum = opps.reduce((acc, id) => acc + (rankMap[id] ?? 0), 0)
      result[team.id] = sum / opps.length
    }
  }
  return result
}

function statsToLadder(
  stats: Record<number, TeamStats>,
  matches: readonly AflMatch[],
  rankMap: Record<number, number>,
): LadderRow[] {
  const teamMap = Object.fromEntries(TEAMS.map((t) => [t.id, t]))
  const difficulty = computeDifficulty(matches, rankMap)

  const rows: LadderRow[] = Object.values(stats).map((s) => {
    const team = teamMap[s.teamId]
    const percentage = s.against > 0 ? (s.for / s.against) * 100 : s.for > 0 ? 999.9 : 100
    return {
      teamId: s.teamId,
      teamName: team?.name ?? String(s.teamId),
      abbreviation: team?.abbreviation ?? '???',
      played: s.played,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      pts: s.pts,
      for: s.for,
      against: s.against,
      percentage,
      isFinalist: false,
      difficulty: difficulty[s.teamId] ?? null,
    }
  })

  rows.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    return b.percentage - a.percentage
  })

  rows.forEach((row, i) => { row.isFinalist = i < 8 })

  return rows
}

function simulateMatches(
  matches: readonly AflMatch[],
  rankMap: Record<number, number>,
  random: boolean,
): LadderRow[] {
  const baseStats = buildStats(matches)
  const simStats: Record<number, TeamStats> = {}
  for (const [id, s] of Object.entries(baseStats)) {
    simStats[Number(id)] = { ...s }
  }

  for (const match of matches) {
    if (match.status === 'CONCLUDED') continue
    const hId = match.homeTeamId
    const aId = match.awayTeamId
    if (!hId || !aId) continue
    if (!simStats[hId] || !simStats[aId]) continue
    const hRank = rankMap[hId] ?? 999
    const aRank = rankMap[aId] ?? 999
    if (hRank === aRank) continue
    const favouriteId = hRank < aRank ? hId : aId
    const underdogId = hRank < aRank ? aId : hId
    const winnerId = random
      ? (Math.random() < favouriteWinProb(hRank - aRank) ? favouriteId : underdogId)
      : favouriteId
    const loserId = winnerId === favouriteId ? underdogId : favouriteId
    simStats[winnerId].wins++; simStats[winnerId].pts += 4; simStats[winnerId].played++
    simStats[loserId].losses++; simStats[loserId].played++
  }

  return statsToLadder(simStats, matches, rankMap)
}

export function useSimulation(ranking: RankingRef, matches: MatchesRef) {
  const actualLadder = computed<LadderRow[]>(() => {
    const stats = buildStats(matches.value)
    // Derive rankMap from the natural current standings order
    const sorted = Object.values(stats).sort((a, b) => {
      const aPct = a.against > 0 ? a.for / a.against : (a.for > 0 ? 999 : 1)
      const bPct = b.against > 0 ? b.for / b.against : (b.for > 0 ? 999 : 1)
      if (b.pts !== a.pts) return b.pts - a.pts
      return bPct - aPct
    })
    const rankMap: Record<number, number> = {}
    sorted.forEach((s, i) => { rankMap[s.teamId] = i + 1 })
    return statsToLadder(stats, matches.value, rankMap)
  })

  const predictedLadder = computed<LadderRow[]>(() => {
    if (!ranking.value.length) return actualLadder.value
    const rankMap: Record<number, number> = {}
    ranking.value.forEach((id, i) => { rankMap[id] = i + 1 })
    return simulateMatches(matches.value, rankMap, false)
  })

  const simulatedLadder = ref<LadderRow[] | null>(null)

  function simulate() {
    if (!ranking.value.length) return
    const rankMap: Record<number, number> = {}
    ranking.value.forEach((id, i) => { rankMap[id] = i + 1 })
    simulatedLadder.value = simulateMatches(matches.value, rankMap, true)
  }

  return { actualLadder, predictedLadder, simulatedLadder, simulate }
}
