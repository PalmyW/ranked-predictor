import { computed, ref } from 'vue'
import type { AflMatch, LadderRow, TeamRanking } from '../types/afl'
import { TEAMS } from './useAFLData'
import { homeWinProbFromScore, type PalmyVariant } from '../utils/palmyWinProb'

export interface RangeEntry {
  teamId: number
  teamName: string
  abbreviation: string
  iconId: string
  counts: number[]  // counts[i] = times finished in position i+1
  winNextCounts: number[]     // counts restricted to sims where the team won its next game
  nextGameWinTotal: number    // # sims where the team won its next game (= sum of winNextCounts)
  nextMatchId: number | null  // first upcoming match for this team (null if none)
  nextOpponentName: string | null
  nextIsHome: boolean
}

export interface SimulationStats {
  mostCommonLadder: number[]   // team IDs in finishing order
  mostCommonCount: number      // how many times that exact ladder appeared
  consensusLadder: number[]    // greedy: for each position, the most-likely team (no repeats)
  uniqueCount: number          // number of distinct ladder orderings seen
}

type MatchesRef = { readonly value: readonly AflMatch[] }
type RankingRef = { readonly value: TeamRanking }

interface SimulationOptions {
  // PalmyScore predicted scores for upcoming matches (per-match favourite + margin)
  palmyPredictions?: { readonly value: readonly MatchScorePrediction[] }
  // When true, the simulator derives each match's win chance from PalmyScore's
  // predicted margin via the historical calibration curve instead of team ranking
  usePalmyProb?: { readonly value: boolean }
  // When true (default), PalmyScore win chances use the home/away venue-adjusted
  // ratings and matching calibration curve; when false, the all-games variant.
  // Must agree with how palmyPredictions were generated so the predicted margin
  // is scored on the correct curve.
  venueAdjusted?: { readonly value: boolean }
}

// Elo-style logistic win probability for the home team.
// Each rank maps to a pseudo-Elo rating (rank 1 → 1550, rank 18 → 1250).
// Home advantage is modelled as an additive +60 Elo points (~58.6% for equal teams).
const ELO_TOP_RATING = 1550
const ELO_SPREAD = 300      // total rating range across 18 teams
const ELO_HOME_ADV = 60     // additive home advantage in Elo points
const ELO_DIVISOR = 400     // standard Elo scaling divisor

const AVG_WIN_MARGIN = 32   // average AFL winning margin in points
const AVG_AFL_SCORE  = 85   // average points per team per game
const SIM_WIN_SCORE  = AVG_AFL_SCORE + Math.round(AVG_WIN_MARGIN / 2)  // 101
const SIM_LOSS_SCORE = AVG_AFL_SCORE - Math.round(AVG_WIN_MARGIN / 2)  // 69

function homeWinProb(hRank: number, aRank: number): number {
  const homeRating = ELO_TOP_RATING - (hRank - 1) * (ELO_SPREAD / 17) + ELO_HOME_ADV
  const awayRating = ELO_TOP_RATING - (aRank - 1) * (ELO_SPREAD / 17)
  const prob = 1 / (1 + Math.pow(10, (awayRating - homeRating) / ELO_DIVISOR))
  return Math.min(0.95, Math.max(0.05, prob))
}

// Per-match home win probability. In PalmyScore mode, uses the calibration curve
// for the match's predicted margin; otherwise (or when no prediction) the Elo model.
function matchHomeWinProb(
  match: AflMatch,
  rankMap: Record<number, number>,
  predMap: Map<number, MatchScorePrediction> | null,
  usePalmy: boolean,
  variant: PalmyVariant,
): number {
  if (usePalmy && predMap) {
    const p = predMap.get(match.id)
    if (p?.hasStrengthData && p.predictedHomeScore !== p.predictedAwayScore) {
      return homeWinProbFromScore(p.predictedHomeScore, p.predictedAwayScore, variant)
    }
  }
  const hRank = rankMap[match.homeTeamId] ?? 999
  const aRank = rankMap[match.awayTeamId] ?? 999
  return homeWinProb(hRank, aRank)
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

interface DifficultyInfo {
  avg: number | null
  opponents: Array<{ matchId: number; name: string; rank: number; isHome: boolean; predictedWin: boolean; winPct: number; roundNumber: number }>
}

// Average rank of remaining opponents for each team, plus ordered opponent list
function computeDifficulty(
  matches: readonly AflMatch[],
  rankMap: Record<number, number>,
): Record<number, DifficultyInfo> {
  const teamMap = Object.fromEntries(TEAMS.map((t) => [t.id, t]))
  const oppMap: Record<number, Array<{ matchId: number; id: number; isHome: boolean; teamRank: number; roundNumber: number }>> = {}
  for (const team of TEAMS) oppMap[team.id] = []

  for (const match of matches) {
    if (match.status === 'CONCLUDED') continue
    const hId = match.homeTeamId
    const aId = match.awayTeamId
    if (oppMap[hId]) oppMap[hId].push({ matchId: match.id, id: aId, isHome: true, teamRank: rankMap[hId] ?? 999, roundNumber: match.roundNumber })
    if (oppMap[aId]) oppMap[aId].push({ matchId: match.id, id: hId, isHome: false, teamRank: rankMap[aId] ?? 999, roundNumber: match.roundNumber })
  }

  const result: Record<number, DifficultyInfo> = {}
  for (const team of TEAMS) {
    const opps = oppMap[team.id]
    if (!opps || opps.length === 0) {
      result[team.id] = { avg: null, opponents: [] }
    } else {
      const tGlobalRank = rankMap[team.id] ?? 999
      const oppDetails = opps
        .map((o) => {
          const oppRank = rankMap[o.id] ?? 999
          const winPct = o.isHome
            ? homeWinProb(o.teamRank, oppRank)
            : 1 - homeWinProb(oppRank, o.teamRank)
          return {
            matchId: o.matchId,
            name: teamMap[o.id]?.name ?? String(o.id),
            rank: oppRank,
            isHome: o.isHome,
            predictedWin: o.teamRank < oppRank,
            winPct,
            roundNumber: o.roundNumber,
          }
        })
        .sort((a, b) => b.winPct - a.winPct)
      // Rank opponents in a 17-team system (current team excluded): opponents
      // ranked below the current team shift down by one.
      const sum = opps.reduce((acc, o) => {
        const oGlobal = rankMap[o.id] ?? 0
        return acc + (oGlobal > tGlobalRank ? oGlobal - 1 : oGlobal)
      }, 0)
      result[team.id] = { avg: sum / opps.length, opponents: oppDetails }
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
      iconId: team?.iconId ?? '',
      played: s.played,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      pts: s.pts,
      for: s.for,
      against: s.against,
      percentage,
      isFinalist: false,
      difficulty: difficulty[s.teamId]?.avg ?? null,
      remainingOpponents: difficulty[s.teamId]?.opponents ?? [],
    }
  })

  rows.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    return b.percentage - a.percentage
  })

  rows.forEach((row, i) => { row.isFinalist = i < 8 })

  return rows
}

function runOneSim(
  baseStats: Record<number, TeamStats>,
  matches: readonly AflMatch[],
  rankMap: Record<number, number>,
  predMap: Map<number, MatchScorePrediction> | null,
  usePalmy: boolean,
  variant: PalmyVariant,
  captureMatchIds: Set<number> | null,
): { order: number[]; nextWinners: Record<number, number> } {
  const simStats: Record<number, TeamStats> = {}
  for (const [id, s] of Object.entries(baseStats)) simStats[Number(id)] = { ...s }
  const nextWinners: Record<number, number> = {}

  for (const match of matches) {
    if (match.status === 'CONCLUDED') continue
    const hId = match.homeTeamId
    const aId = match.awayTeamId
    if (!hId || !aId || !simStats[hId] || !simStats[aId]) continue
    const homeWins = Math.random() < matchHomeWinProb(match, rankMap, predMap, usePalmy, variant)
    const winnerId = homeWins ? hId : aId
    const loserId = homeWins ? aId : hId
    if (captureMatchIds?.has(match.id)) nextWinners[match.id] = winnerId
    simStats[winnerId].wins++; simStats[winnerId].pts += 4; simStats[winnerId].played++
    simStats[winnerId].for += SIM_WIN_SCORE; simStats[winnerId].against += SIM_LOSS_SCORE
    simStats[loserId].losses++; simStats[loserId].played++
    simStats[loserId].for += SIM_LOSS_SCORE; simStats[loserId].against += SIM_WIN_SCORE
  }

  const order = Object.values(simStats)
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts
      const aPct = a.against > 0 ? a.for / a.against : (a.for > 0 ? 999 : 1)
      const bPct = b.against > 0 ? b.for / b.against : (b.for > 0 ? 999 : 1)
      return bPct - aPct
    })
    .map((s) => s.teamId)

  return { order, nextWinners }
}

// Accumulator that lets a large simulation run be split into batches: each
// batch adds to the running tallies and a snapshot of results/stats can be
// rebuilt after every batch to drive an incrementally-updating chart.
interface RangeAccumulator {
  counts: Record<number, number[]>
  winNextCounts: Record<number, number[]>
  ladderCounts: Map<string, number>
  nextMatchId: Record<number, number>
  nextOpponentName: Record<number, string>
  nextIsHome: Record<number, boolean>
  nextMatchIds: Set<number>
  baseStats: Record<number, TeamStats>
  teamMap: Record<number, { name: string; abbreviation: string; iconId: string }>
  ran: number
}

function createRangeAccumulator(matches: readonly AflMatch[]): RangeAccumulator {
  const teamMap = Object.fromEntries(TEAMS.map((t) => [t.id, t]))
  const counts: Record<number, number[]> = {}
  const winNextCounts: Record<number, number[]> = {}
  for (const team of TEAMS) {
    counts[team.id] = new Array(18).fill(0)
    winNextCounts[team.id] = new Array(18).fill(0)
  }

  // Each team's next game: the first upcoming (non-concluded) match they appear
  // in, walking the fixture in order. A single match is the next game for both
  // its teams, so the distinct next-game match IDs are few (≤ ~9).
  const nextMatchId: Record<number, number> = {}
  const nextOpponentName: Record<number, string> = {}
  const nextIsHome: Record<number, boolean> = {}
  const nextMatchIds = new Set<number>()
  for (const match of matches) {
    if (match.status === 'CONCLUDED') continue
    const hId = match.homeTeamId
    const aId = match.awayTeamId
    if (hId && nextMatchId[hId] === undefined) {
      nextMatchId[hId] = match.id
      nextOpponentName[hId] = teamMap[aId]?.name ?? String(aId)
      nextIsHome[hId] = true
      nextMatchIds.add(match.id)
    }
    if (aId && nextMatchId[aId] === undefined) {
      nextMatchId[aId] = match.id
      nextOpponentName[aId] = teamMap[hId]?.name ?? String(hId)
      nextIsHome[aId] = false
      nextMatchIds.add(match.id)
    }
  }

  return {
    counts,
    winNextCounts,
    ladderCounts: new Map<string, number>(),
    nextMatchId,
    nextOpponentName,
    nextIsHome,
    nextMatchIds,
    baseStats: buildStats(matches),
    teamMap,
    ran: 0,
  }
}

function runRangeBatch(
  acc: RangeAccumulator,
  rankMap: Record<number, number>,
  matches: readonly AflMatch[],
  batch: number,
  predMap: Map<number, MatchScorePrediction> | null,
  usePalmy: boolean,
  variant: PalmyVariant,
): void {
  for (let i = 0; i < batch; i++) {
    const { order, nextWinners } = runOneSim(acc.baseStats, matches, rankMap, predMap, usePalmy, variant, acc.nextMatchIds)
    const key = order.join(',')
    acc.ladderCounts.set(key, (acc.ladderCounts.get(key) ?? 0) + 1)
    for (let pos = 0; pos < order.length; pos++) {
      const tid = order[pos]
      if (!acc.counts[tid]) continue
      acc.counts[tid][pos]++
      const nm = acc.nextMatchId[tid]
      if (nm !== undefined && nextWinners[nm] === tid) acc.winNextCounts[tid][pos]++
    }
  }
  acc.ran += batch
}

// Build a results/stats snapshot from the accumulator's current tallies.
// Count arrays are copied so the returned snapshot is stable even as later
// batches keep mutating the accumulator in place.
function buildRangeResults(acc: RangeAccumulator): { results: RangeEntry[]; stats: SimulationStats } {
  const { counts, winNextCounts, ladderCounts, teamMap } = acc

  // Most common exact ladder
  let mostCommonKey = ''
  let mostCommonCount = 0
  for (const [key, count] of ladderCounts) {
    if (count > mostCommonCount) { mostCommonCount = count; mostCommonKey = key }
  }
  const mostCommonLadder = mostCommonKey ? mostCommonKey.split(',').map(Number) : []

  // Consensus ladder: greedy — for each position pick the team with most appearances there
  const consensusLadder: number[] = []
  const assigned = new Set<number>()
  for (let pos = 0; pos < 18; pos++) {
    let bestTeam = -1
    let bestCount = -1
    for (const team of TEAMS) {
      if (assigned.has(team.id)) continue
      const c = counts[team.id]?.[pos] ?? 0
      if (c > bestCount) { bestCount = c; bestTeam = team.id }
    }
    if (bestTeam !== -1) { consensusLadder.push(bestTeam); assigned.add(bestTeam) }
  }

  const results = TEAMS.map((team) => ({
    teamId: team.id,
    teamName: teamMap[team.id]?.name ?? String(team.id),
    abbreviation: teamMap[team.id]?.abbreviation ?? '???',
    iconId: teamMap[team.id]?.iconId ?? '',
    counts: counts[team.id].slice(),
    winNextCounts: winNextCounts[team.id].slice(),
    nextGameWinTotal: winNextCounts[team.id].reduce((a, b) => a + b, 0),
    nextMatchId: acc.nextMatchId[team.id] ?? null,
    nextOpponentName: acc.nextOpponentName[team.id] ?? null,
    nextIsHome: acc.nextIsHome[team.id] ?? false,
  }))

  return { results, stats: { mostCommonLadder, mostCommonCount, consensusLadder, uniqueCount: ladderCounts.size } }
}

export interface MatchScorePrediction {
  matchId: number
  homeTeamId: number
  awayTeamId: number
  predictedHomeScore: number
  predictedAwayScore: number
  hasStrengthData: boolean
}

export function buildPalmyLadder(
  matches: readonly AflMatch[],
  predictions: readonly MatchScorePrediction[],
  fallbackRankMap: Record<number, number>,
): LadderRow[] {
  const predMap = new Map(predictions.map(p => [p.matchId, p]))
  const baseStats = buildStats(matches)
  const simStats: Record<number, TeamStats> = {}
  for (const [id, s] of Object.entries(baseStats)) simStats[Number(id)] = { ...s }

  for (const match of matches) {
    if (match.status === 'CONCLUDED') continue
    const hId = match.homeTeamId
    const aId = match.awayTeamId
    if (!hId || !aId || !simStats[hId] || !simStats[aId]) continue

    const pred = predMap.get(match.id)
    let hScore: number
    let aScore: number
    if (pred?.hasStrengthData) {
      hScore = pred.predictedHomeScore
      aScore = pred.predictedAwayScore
    } else {
      const hWins = (fallbackRankMap[hId] ?? 999) <= (fallbackRankMap[aId] ?? 999)
      hScore = hWins ? SIM_WIN_SCORE : SIM_LOSS_SCORE
      aScore = hWins ? SIM_LOSS_SCORE : SIM_WIN_SCORE
    }

    simStats[hId].for += hScore; simStats[hId].against += aScore; simStats[hId].played++
    simStats[aId].for += aScore; simStats[aId].against += hScore; simStats[aId].played++
    if (hScore > aScore) {
      simStats[hId].wins++; simStats[hId].pts += 4; simStats[aId].losses++
    } else if (aScore > hScore) {
      simStats[aId].wins++; simStats[aId].pts += 4; simStats[hId].losses++
    } else {
      simStats[hId].draws++; simStats[hId].pts += 2
      simStats[aId].draws++; simStats[aId].pts += 2
    }
  }

  return statsToLadder(simStats, matches, fallbackRankMap)
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
    const winnerId = random
      ? (Math.random() < homeWinProb(hRank, aRank) ? hId : aId)
      : (hRank < aRank ? hId : aId)
    const loserId = winnerId === hId ? aId : hId
    simStats[winnerId].wins++; simStats[winnerId].pts += 4; simStats[winnerId].played++
    simStats[winnerId].for += SIM_WIN_SCORE; simStats[winnerId].against += SIM_LOSS_SCORE
    simStats[loserId].losses++; simStats[loserId].played++
    simStats[loserId].for += SIM_LOSS_SCORE; simStats[loserId].against += SIM_WIN_SCORE
  }

  return statsToLadder(simStats, matches, rankMap)
}

export function useSimulation(ranking: RankingRef, matches: MatchesRef, options?: SimulationOptions) {
  const palmyPredMap = (): Map<number, MatchScorePrediction> | null => {
    const arr = options?.palmyPredictions?.value
    return arr && arr.length ? new Map(arr.map((p) => [p.matchId, p])) : null
  }
  const usePalmy = (): boolean => options?.usePalmyProb?.value ?? false
  const variant = (): PalmyVariant => (options?.venueAdjusted?.value ?? true) ? 'ha' : 'all'

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
  // matchId → winning teamId from last random simulation
  const simulatedMatchWinners = ref<Record<number, number> | null>(null)
  const rangeResults = ref<RangeEntry[] | null>(null)
  const rangeTotal = ref(0)
  const simStats = ref<SimulationStats | null>(null)
  const isRunningRange = ref(false)
  const rangeProgress = ref(0)  // 0..1 progress of the current batched run

  function simulate() {
    if (!ranking.value.length) return
    const rankMap: Record<number, number> = {}
    ranking.value.forEach((id, i) => { rankMap[id] = i + 1 })

    // Capture per-match results while simulating
    const predMap = palmyPredMap()
    const palmy = usePalmy()
    const palmyVariant = variant()
    const winners: Record<number, number> = {}
    for (const match of matches.value) {
      if (match.status === 'CONCLUDED') continue
      const hId = match.homeTeamId
      const aId = match.awayTeamId
      if (!hId || !aId) continue
      winners[match.id] = Math.random() < matchHomeWinProb(match, rankMap, predMap, palmy, palmyVariant) ? hId : aId
      // Use same winners for the ladder calculation below
    }
    simulatedMatchWinners.value = winners

    // Build ladder from the captured winners (not a second random pass)
    const baseStats = buildStats(matches.value)
    const simStats: Record<number, TeamStats> = {}
    for (const [id, s] of Object.entries(baseStats)) simStats[Number(id)] = { ...s }
    for (const match of matches.value) {
      if (match.status === 'CONCLUDED') continue
      const winnerId = winners[match.id]
      if (!winnerId) continue
      const loserId = winnerId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
      if (!simStats[winnerId] || !simStats[loserId]) continue
      simStats[winnerId].wins++; simStats[winnerId].pts += 4; simStats[winnerId].played++
      simStats[winnerId].for += SIM_WIN_SCORE; simStats[winnerId].against += SIM_LOSS_SCORE
      simStats[loserId].losses++; simStats[loserId].played++
      simStats[loserId].for += SIM_LOSS_SCORE; simStats[loserId].against += SIM_WIN_SCORE
    }
    simulatedLadder.value = statsToLadder(simStats, matches.value, rankMap)
  }

  function getSimulationFrames(): Array<{ roundNumber: number; roundName: string; ladder: LadderRow[] }> {
    const winners = simulatedMatchWinners.value
    if (!winners) return []

    const rankMap: Record<number, number> = {}
    ranking.value.forEach((id, i) => { rankMap[id] = i + 1 })

    // Group remaining matches by round in order
    const roundMap = new Map<number, { roundName: string; roundMatches: AflMatch[] }>()
    for (const match of matches.value) {
      if (match.status === 'CONCLUDED') continue
      if (!roundMap.has(match.roundNumber)) {
        roundMap.set(match.roundNumber, { roundName: match.roundName, roundMatches: [] })
      }
      roundMap.get(match.roundNumber)!.roundMatches.push(match)
    }
    const rounds = Array.from(roundMap.entries()).sort(([a], [b]) => a - b)

    // Accumulate stats round by round starting from actual concluded results
    const runningStats: Record<number, TeamStats> = {}
    const base = buildStats(matches.value)
    for (const [id, s] of Object.entries(base)) runningStats[Number(id)] = { ...s }

    const frames: Array<{ roundNumber: number; roundName: string; ladder: LadderRow[] }> = []
    for (const [roundNumber, { roundName, roundMatches }] of rounds) {
      for (const match of roundMatches) {
        const winnerId = winners[match.id]
        if (!winnerId) continue
        const loserId = winnerId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
        if (!runningStats[winnerId] || !runningStats[loserId]) continue
        runningStats[winnerId].wins++; runningStats[winnerId].pts += 4; runningStats[winnerId].played++
        runningStats[winnerId].for += SIM_WIN_SCORE; runningStats[winnerId].against += SIM_LOSS_SCORE
        runningStats[loserId].losses++; runningStats[loserId].played++
        runningStats[loserId].for += SIM_LOSS_SCORE; runningStats[loserId].against += SIM_WIN_SCORE
      }
      const snap: Record<number, TeamStats> = {}
      for (const [id, s] of Object.entries(runningStats)) snap[Number(id)] = { ...s }
      frames.push({ roundNumber, roundName, ladder: statsToLadder(snap, matches.value, rankMap) })
    }
    return frames
  }

  // Run in batches so the UI can repaint between them: the chart and progress
  // bar update after each batch instead of freezing until the whole run is done.
  const RANGE_BATCH_SIZE = 5000

  async function runMany(n: number) {
    if (!ranking.value.length) return
    isRunningRange.value = true
    rangeProgress.value = 0
    const rankMap: Record<number, number> = {}
    ranking.value.forEach((id, i) => { rankMap[id] = i + 1 })
    const predMap = palmyPredMap()
    const palmy = usePalmy()
    const palmyVariant = variant()
    const acc = createRangeAccumulator(matches.value)
    let done = 0
    while (done < n) {
      const batch = Math.min(RANGE_BATCH_SIZE, n - done)
      // setTimeout(0) yields to the event loop so Vue can flush the previous
      // batch's update (chart + progress bar) before the next batch runs.
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          runRangeBatch(acc, rankMap, matches.value, batch, predMap, palmy, palmyVariant)
          done += batch
          const { results, stats } = buildRangeResults(acc)
          rangeResults.value = results
          simStats.value = stats
          rangeTotal.value = done
          rangeProgress.value = done / n
          resolve()
        }, 0)
      })
    }
    rangeProgress.value = 1
    isRunningRange.value = false
  }

  return { actualLadder, predictedLadder, simulatedLadder, simulatedMatchWinners, simulate, getSimulationFrames, rangeResults, rangeTotal, simStats, isRunningRange, rangeProgress, runMany }
}
