import { computed } from 'vue'
import type { AflMatch, LadderRow, TeamRanking } from '../types/afl'

// Accept any ref-like object that holds an array of matches (including readonly refs)
type MatchesRef = { readonly value: readonly AflMatch[] }
type RankingRef = { readonly value: TeamRanking }
import { TEAMS } from './useAFLData'

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
    stats[team.id] = {
      teamId: team.id,
      wins: 0, losses: 0, draws: 0,
      pts: 0, for: 0, against: 0, played: 0,
    }
  }

  for (const match of matches) {
    if (match.status !== 'CONCLUDED') continue
    if (!match.homeScore || !match.awayScore) continue

    const hId = match.homeTeamId
    const aId = match.awayTeamId
    const hScore = match.homeScore.totalScore
    const aScore = match.awayScore.totalScore

    if (!stats[hId] || !stats[aId]) continue

    stats[hId].for += hScore
    stats[hId].against += aScore
    stats[hId].played++

    stats[aId].for += aScore
    stats[aId].against += hScore
    stats[aId].played++

    if (hScore > aScore) {
      stats[hId].wins++
      stats[hId].pts += 4
      stats[aId].losses++
    } else if (aScore > hScore) {
      stats[aId].wins++
      stats[aId].pts += 4
      stats[hId].losses++
    } else {
      stats[hId].draws++
      stats[hId].pts += 2
      stats[aId].draws++
      stats[aId].pts += 2
    }
  }

  return stats
}

function statsToLadder(stats: Record<number, TeamStats>): LadderRow[] {
  const teamMap = Object.fromEntries(TEAMS.map((t) => [t.id, t]))

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
    }
  })

  rows.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    return b.percentage - a.percentage
  })

  rows.forEach((row, i) => {
    row.isFinalist = i < 8
  })

  return rows
}

export function useSimulation(
  ranking: RankingRef,
  matches: MatchesRef,
) {
  const actualLadder = computed<LadderRow[]>(() => {
    const stats = buildStats(matches.value)
    return statsToLadder(stats)
  })

  const predictedLadder = computed<LadderRow[]>(() => {
    if (!ranking.value.length) return actualLadder.value

    // Build rank map: teamId → rank position (1 = best)
    const rankMap: Record<number, number> = {}
    ranking.value.forEach((id, i) => {
      rankMap[id] = i + 1
    })

    // Clone actual stats
    const baseStats = buildStats(matches.value)
    const simStats: Record<number, TeamStats> = {}
    for (const [id, s] of Object.entries(baseStats)) {
      simStats[Number(id)] = { ...s }
    }

    // Simulate remaining matches
    for (const match of matches.value) {
      if (match.status === 'CONCLUDED') continue

      const hId = match.homeTeamId
      const aId = match.awayTeamId
      if (!hId || !aId) continue
      if (!simStats[hId] || !simStats[aId]) continue

      const hRank = rankMap[hId] ?? 999
      const aRank = rankMap[aId] ?? 999
      if (hRank === aRank) continue

      const winnerId = hRank < aRank ? hId : aId
      const loserId = hRank < aRank ? aId : hId

      simStats[winnerId].wins++
      simStats[winnerId].pts += 4
      simStats[winnerId].played++
      simStats[loserId].losses++
      simStats[loserId].played++
    }

    return statsToLadder(simStats)
  })

  return { actualLadder, predictedLadder }
}
