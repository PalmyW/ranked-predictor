import { computed, ref } from 'vue'
import type { AflMatch, LadderRow, TeamRanking } from '../types/afl'
import { TEAMS } from './useAFLData'
import { homeWinProbFromScore, type PalmyVariant } from '../utils/palmyWinProb'
import { invNorm } from '../utils/normal'
import { checkGpuSupport, createGpuSimContext, runGpuRangeBatch, destroyGpuSimContext, gpuMaxBatch } from './useGpuSimulation'
import { buildFinalsTemplate, resolveFinalsForOrder, type FinalsTemplate, type FinalsSimOutcome } from './useFinals'
import { LEAGUE_CONFIG } from '../config/league'

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
  prelimCount: number         // # sims where the team made the Preliminary Final
  grandFinalCount: number     // # sims where the team reached the Grand Final
  premiershipCount: number    // # sims where the team won the Grand Final
}

export interface SimulationStats {
  mostCommonLadder: number[]   // team IDs in finishing order
  mostCommonCount: number      // how many times that exact ladder appeared
  consensusLadder: number[]    // greedy: for each position, the most-likely team (no repeats)
  uniqueCount: number          // number of distinct ladder orderings seen
  hasFinalsData: boolean       // whether the fixture has finals matches to derive finals stats from
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
const ELO_SPREAD = 300      // total rating range across TEAMS.length teams
const ELO_HOME_ADV = 60     // additive home advantage in Elo points
const ELO_DIVISOR = 400     // standard Elo scaling divisor

// Scoring model constants — league-scoped (src/config/league.ts): AFL keeps
// its long-established values, AFLW currently uses rough initial guesses
// (shorter, lower-scoring games) pending recalibration against a full AFLW
// backfill. See LEAGUE_CONFIG.sim's own TODO note.
const AVG_WIN_MARGIN = LEAGUE_CONFIG.sim.avgWinMargin
const AVG_AFL_SCORE  = LEAGUE_CONFIG.sim.avgScore
// Fixed scores used only by the deterministic paths (predictedLadder's
// non-random simulateMatches branch, buildPalmyLadder's no-prediction
// fallback). Random simulations sample scores instead — see sampleMatchScores.
export const SIM_WIN_SCORE  = AVG_AFL_SCORE + Math.round(AVG_WIN_MARGIN / 2)
export const SIM_LOSS_SCORE = AVG_AFL_SCORE - Math.round(AVG_WIN_MARGIN / 2)
const SIM_DRAW_SCORE = AVG_AFL_SCORE  // both teams score AVG_AFL_SCORE in a drawn game

// Random-score model for the stochastic simulators. The home margin of each
// simulated game is N(mu, MARGIN_SIGMA) with mu = MARGIN_SIGMA * invNorm(p),
// so its sign agrees exactly with the winner already decided by the win-prob
// roll, and favourites win big more often than underdogs do. Both teams share
// a game-level scoring midpoint of N(AVG_AFL_SCORE, MID_SIGMA), so per-team
// scores still average out to AVG_AFL_SCORE across a run. Mirrored in the GPU
// shader (useGpuSimulation.ts) — keep the two in sync.
const MARGIN_SIGMA = LEAGUE_CONFIG.sim.marginSigma
const MID_SIGMA = LEAGUE_CONFIG.sim.midSigma

interface SimScores { winnerScore: number; loserScore: number }

// Sample winner/loser scores for a decided game. `u` is the same uniform that
// decided the winner (u < p means home won), so the sampled margin's sign is
// consistent with that decision by construction; only its magnitude is new
// randomness (plus the shared midpoint draw).
export function sampleMatchScores(u: number, p: number): SimScores {
  const homeMargin = MARGIN_SIGMA * (invNorm(p) + invNorm(1 - u))
  const absMargin = Math.max(1, Math.round(Math.abs(homeMargin)))
  const mid = AVG_AFL_SCORE + MID_SIGMA * invNorm(Math.random())
  const loserScore = Math.max(0, Math.round(mid - absMargin / 2))
  return { winnerScore: loserScore + absMargin, loserScore }
}

// Drawn-game score: both teams land on the same randomised midpoint.
function sampleDrawScore(): number {
  return Math.max(0, Math.round(AVG_AFL_SCORE + MID_SIGMA * invNorm(Math.random())))
}

// Chance of any simulated game ending in a draw. A single random roll decides
// the whole match: r < DRAW_PROB is a draw, otherwise r is rescaled back to
// [0,1) and compared against the home win probability. Mirrored as a hardcoded
// constant in the GPU shader (useGpuSimulation.ts) — keep the two in sync.
export const DRAW_PROB = 0.009

// Sentinel in winner maps (simulatedMatchWinners, nextWinners) for a drawn
// match: present, but matches no team ID.
export const DRAW_RESULT = 0

function homeWinProb(hRank: number, aRank: number): number {
  const homeRating = ELO_TOP_RATING - (hRank - 1) * (ELO_SPREAD / (TEAMS.length - 1)) + ELO_HOME_ADV
  const awayRating = ELO_TOP_RATING - (aRank - 1) * (ELO_SPREAD / (TEAMS.length - 1))
  const prob = 1 / (1 + Math.pow(10, (awayRating - homeRating) / ELO_DIVISOR))
  return Math.min(0.95, Math.max(0.05, prob))
}

// Per-match home win probability. In PalmyScore mode, uses the calibration curve
// for the match's predicted margin; otherwise (or when no prediction) the Elo model.
// Exported so the GPU batch runner computes probabilities identically to the CPU path.
export function matchHomeWinProb(
  match: AflMatch,
  rankMap: Record<number, number>,
  predMap: Map<number, MatchScorePrediction> | null,
  usePalmy: boolean,
  variant: PalmyVariant,
): number {
  return homeWinProbFor(match.id, match.homeTeamId, match.awayTeamId, rankMap, predMap, usePalmy, variant)
}

// Same as matchHomeWinProb but takes the three fields it actually reads
// directly instead of a full AflMatch, so callers that only know a
// synthetic/hypothetical pairing (e.g. resolveFinalsForOrder in useFinals.ts,
// called once per simulated season — up to millions of times per Range run)
// don't need to allocate a throwaway match object just to satisfy the type.
export function homeWinProbFor(
  matchId: number,
  homeTeamId: number,
  awayTeamId: number,
  rankMap: Record<number, number>,
  predMap: Map<number, MatchScorePrediction> | null,
  usePalmy: boolean,
  variant: PalmyVariant,
): number {
  if (usePalmy && predMap) {
    const p = predMap.get(matchId)
    if (p?.hasStrengthData && p.predictedHomeScore !== p.predictedAwayScore) {
      return homeWinProbFromScore(p.predictedHomeScore, p.predictedAwayScore, variant)
    }
  }
  const hRank = rankMap[homeTeamId] ?? 999
  const aRank = rankMap[awayTeamId] ?? 999
  return homeWinProb(hRank, aRank)
}

export interface TeamStats {
  teamId: number
  wins: number
  losses: number
  draws: number
  pts: number
  for: number
  against: number
  played: number
}

// Credits a simulated draw to both teams (2 pts, equal scores). No-ops if
// either team is unrecognised, matching how the win/loss paths guard.
function applyDraw(stats: Record<number, TeamStats>, hId: number, aId: number, score = SIM_DRAW_SCORE): void {
  if (!stats[hId] || !stats[aId]) return
  stats[hId].draws++; stats[hId].pts += 2; stats[hId].played++
  stats[hId].for += score; stats[hId].against += score
  stats[aId].draws++; stats[aId].pts += 2; stats[aId].played++
  stats[aId].for += score; stats[aId].against += score
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

// Fixed team-id list, computed once, so the hot per-sim loop below can clone
// stats and rebuild the ladder without allocating an Object.entries()/
// Object.values() pair array on every single simulation.
export const TEAM_IDS = TEAMS.map((t) => t.id)

function runOneSim(
  baseStats: Record<number, TeamStats>,
  activeMatches: readonly AflMatch[],
  rankMap: Record<number, number>,
  predMap: Map<number, MatchScorePrediction> | null,
  usePalmy: boolean,
  variant: PalmyVariant,
  captureMatchIds: Set<number> | null,
): { order: number[]; nextWinners: Record<number, number> } {
  const simStats: Record<number, TeamStats> = {}
  for (const id of TEAM_IDS) {
    const s = baseStats[id]
    simStats[id] = { teamId: s.teamId, wins: s.wins, losses: s.losses, draws: s.draws, pts: s.pts, for: s.for, against: s.against, played: s.played }
  }
  const nextWinners: Record<number, number> = {}

  // activeMatches is pre-filtered to non-concluded matches with both teams
  // present, so every iteration here does real work (no "already played" skips).
  for (const match of activeMatches) {
    const hId = match.homeTeamId
    const aId = match.awayTeamId
    const r = Math.random()
    if (r < DRAW_PROB) {
      if (captureMatchIds?.has(match.id)) nextWinners[match.id] = DRAW_RESULT
      applyDraw(simStats, hId, aId, sampleDrawScore())
      continue
    }
    const u = (r - DRAW_PROB) / (1 - DRAW_PROB)
    const p = matchHomeWinProb(match, rankMap, predMap, usePalmy, variant)
    const homeWins = u < p
    const winnerId = homeWins ? hId : aId
    const loserId = homeWins ? aId : hId
    if (captureMatchIds?.has(match.id)) nextWinners[match.id] = winnerId
    const { winnerScore, loserScore } = sampleMatchScores(u, p)
    simStats[winnerId].wins++; simStats[winnerId].pts += 4; simStats[winnerId].played++
    simStats[winnerId].for += winnerScore; simStats[winnerId].against += loserScore
    simStats[loserId].losses++; simStats[loserId].played++
    simStats[loserId].for += loserScore; simStats[loserId].against += winnerScore
  }

  const order = TEAM_IDS.map((id) => simStats[id])
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
export interface RangeAccumulator {
  counts: Record<number, number[]>
  winNextCounts: Record<number, number[]>
  ladderCounts: Map<string, number>
  nextMatchId: Record<number, number>
  nextOpponentName: Record<number, string>
  nextIsHome: Record<number, boolean>
  nextMatchIds: Set<number>
  baseStats: Record<number, TeamStats>
  // Non-concluded matches with both teams recognised, filtered once so the
  // per-sim hot loop never wastes iterations re-checking already-played
  // matches or missing teams.
  activeMatches: AflMatch[]
  teamMap: Record<number, { name: string; abbreviation: string; iconId: string }>
  ran: number
  finalsTemplate: FinalsTemplate
  prelimCounts: Record<number, number>
  grandFinalCounts: Record<number, number>
  premiershipCounts: Record<number, number>
  // Tracked incrementally in accumulateSimResult (O(1) per sim) rather than
  // by scanning ladderCounts in buildRangeResults: that map grows roughly
  // linearly with total sims run (18-team orderings rarely collide), so a
  // full rescan after every batch made large runs (e.g. 10m) effectively
  // O(n^2) and could take far longer than the simulations themselves.
  mostCommonKey: string
  mostCommonCount: number
}

function createRangeAccumulator(matches: readonly AflMatch[]): RangeAccumulator {
  const teamMap = Object.fromEntries(TEAMS.map((t) => [t.id, t]))
  const counts: Record<number, number[]> = {}
  const winNextCounts: Record<number, number[]> = {}
  const prelimCounts: Record<number, number> = {}
  const grandFinalCounts: Record<number, number> = {}
  const premiershipCounts: Record<number, number> = {}
  for (const team of TEAMS) {
    counts[team.id] = new Array(TEAMS.length).fill(0)
    winNextCounts[team.id] = new Array(TEAMS.length).fill(0)
    prelimCounts[team.id] = 0
    grandFinalCounts[team.id] = 0
    premiershipCounts[team.id] = 0
  }

  // Each team's next game: the first upcoming (non-concluded) match they appear
  // in, walking the fixture in order. A single match is the next game for both
  // its teams, so the distinct next-game match IDs are few (≤ ~9).
  const nextMatchId: Record<number, number> = {}
  const nextOpponentName: Record<number, string> = {}
  const nextIsHome: Record<number, boolean> = {}
  const nextMatchIds = new Set<number>()
  const activeMatches: AflMatch[] = []
  for (const match of matches) {
    if (match.status === 'CONCLUDED') continue
    const hId = match.homeTeamId
    const aId = match.awayTeamId
    if (hId && aId && teamMap[hId] && teamMap[aId]) activeMatches.push(match)
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
    activeMatches,
    nextMatchIds,
    baseStats: buildStats(matches),
    teamMap,
    ran: 0,
    finalsTemplate: buildFinalsTemplate(matches),
    prelimCounts,
    grandFinalCounts,
    premiershipCounts,
    mostCommonKey: '',
    mostCommonCount: 0,
  }
}

// Folds one simulated season's result into the running tallies. Shared by both
// the CPU and GPU batch runners so the two engines can only ever differ in how
// they produce `order`/`wonNextGame`, never in how results get counted.
export function accumulateSimResult(
  acc: RangeAccumulator,
  order: readonly number[],
  wonNextGame: (teamId: number) => boolean,
): void {
  const key = order.join(',')
  const newCount = (acc.ladderCounts.get(key) ?? 0) + 1
  acc.ladderCounts.set(key, newCount)
  if (newCount > acc.mostCommonCount) { acc.mostCommonCount = newCount; acc.mostCommonKey = key }
  for (let pos = 0; pos < order.length; pos++) {
    const tid = order[pos]
    if (!acc.counts[tid]) continue
    acc.counts[tid][pos]++
    if (acc.nextMatchId[tid] !== undefined && wonNextGame(tid)) acc.winNextCounts[tid][pos]++
  }
}

// Folds one simulated season's finals outcome into the running tallies.
// Shared by the CPU and GPU batch runners, same as accumulateSimResult.
export function accumulateFinalsResult(acc: RangeAccumulator, outcome: FinalsSimOutcome): void {
  for (const tid of outcome.prelimFinalists) {
    if (acc.prelimCounts[tid] !== undefined) acc.prelimCounts[tid]++
  }
  for (const tid of outcome.grandFinalists) {
    if (acc.grandFinalCounts[tid] !== undefined) acc.grandFinalCounts[tid]++
  }
  if (outcome.premier !== null && acc.premiershipCounts[outcome.premier] !== undefined) {
    acc.premiershipCounts[outcome.premier]++
  }
}

function runRangeBatch(
  acc: RangeAccumulator,
  rankMap: Record<number, number>,
  batch: number,
  predMap: Map<number, MatchScorePrediction> | null,
  usePalmy: boolean,
  variant: PalmyVariant,
): void {
  const hasFinals = acc.finalsTemplate.matches.length > 0
  for (let i = 0; i < batch; i++) {
    const { order, nextWinners } = runOneSim(acc.baseStats, acc.activeMatches, rankMap, predMap, usePalmy, variant, acc.nextMatchIds)
    accumulateSimResult(acc, order, (tid) => nextWinners[acc.nextMatchId[tid]] === tid)
    if (hasFinals) {
      accumulateFinalsResult(acc, resolveFinalsForOrder(acc.finalsTemplate, order, rankMap, predMap, usePalmy, variant))
    }
  }
  acc.ran += batch
}

// Build a results/stats snapshot from the accumulator's current tallies.
// Count arrays are copied so the returned snapshot is stable even as later
// batches keep mutating the accumulator in place.
function buildRangeResults(acc: RangeAccumulator): { results: RangeEntry[]; stats: SimulationStats } {
  const { counts, winNextCounts, ladderCounts, teamMap, mostCommonKey, mostCommonCount } = acc

  const mostCommonLadder = mostCommonKey ? mostCommonKey.split(',').map(Number) : []

  // Consensus ladder: rank teams by mean finishing position across all runs.
  // (A prior greedy "claim the most-appeared team per position" approach could
  // force whichever teams were left unclaimed into the wrong slot — e.g. a
  // mid-table team shoved to last — since it was a one-pass assignment with no
  // backtracking. Sorting by expected position is a pure, deterministic sort
  // that can't misplace a team relative to its own distribution.)
  const meanPosition = (teamId: number): number => {
    const arr = counts[teamId] ?? []
    let weighted = 0
    let total = 0
    for (let pos = 0; pos < arr.length; pos++) { weighted += arr[pos] * pos; total += arr[pos] }
    return total > 0 ? weighted / total : 999
  }
  const consensusLadder: number[] = TEAMS.map((team) => team.id).sort((a, b) => {
    const diff = meanPosition(a) - meanPosition(b)
    if (diff !== 0) return diff
    // Tie-break: prefer the team with more weight at better positions.
    const ca = counts[a] ?? []
    const cb = counts[b] ?? []
    for (let pos = 0; pos < ca.length; pos++) {
      if (ca[pos] !== cb[pos]) return cb[pos] - ca[pos]
    }
    return a - b
  })

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
    prelimCount: acc.prelimCounts[team.id] ?? 0,
    grandFinalCount: acc.grandFinalCounts[team.id] ?? 0,
    premiershipCount: acc.premiershipCounts[team.id] ?? 0,
  }))

  return {
    results,
    stats: {
      mostCommonLadder,
      mostCommonCount,
      consensusLadder,
      uniqueCount: ladderCounts.size,
      hasFinalsData: acc.finalsTemplate.matches.length > 0,
    },
  }
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
    let winnerId: number
    let winnerScore = SIM_WIN_SCORE
    let loserScore = SIM_LOSS_SCORE
    if (random) {
      const r = Math.random()
      if (r < DRAW_PROB) {
        applyDraw(simStats, hId, aId, sampleDrawScore())
        continue
      }
      const u = (r - DRAW_PROB) / (1 - DRAW_PROB)
      const p = homeWinProb(hRank, aRank)
      winnerId = u < p ? hId : aId
      const scores = sampleMatchScores(u, p)
      winnerScore = scores.winnerScore
      loserScore = scores.loserScore
    } else {
      winnerId = hRank < aRank ? hId : aId
    }
    const loserId = winnerId === hId ? aId : hId
    simStats[winnerId].wins++; simStats[winnerId].pts += 4; simStats[winnerId].played++
    simStats[winnerId].for += winnerScore; simStats[winnerId].against += loserScore
    simStats[loserId].losses++; simStats[loserId].played++
    simStats[loserId].for += loserScore; simStats[loserId].against += winnerScore
  }

  return statsToLadder(simStats, matches, rankMap)
}

// Module-level singleton (not per-call state) so every caller — the
// Predictor page's Simulated tab and the Finals view alike — reads the exact
// same last-simulated result, letting Finals be "launched from Simulate"
// rather than running its own independent season simulation.
const simulatedLadder = ref<LadderRow[] | null>(null)
// matchId → winning teamId from last random simulation
const simulatedMatchWinners = ref<Record<number, number> | null>(null)
// matchId → sampled scores from the same simulation, so the ladder build and
// the round-by-round replay (getSimulationFrames) reuse identical scores.
// Internal only — the UI reads just the winners map.
const simulatedMatchScores = ref<Record<number, { home: number; away: number }> | null>(null)

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

  const rangeResults = ref<RangeEntry[] | null>(null)
  const rangeTotal = ref(0)
  const simStats = ref<SimulationStats | null>(null)
  const isRunningRange = ref(false)
  const rangeProgress = ref(0)  // 0..1 progress of the current batched run
  const gpuAvailable = ref(false)
  checkGpuSupport().then((ok) => { gpuAvailable.value = ok })

  function simulate() {
    if (!ranking.value.length) return
    const rankMap: Record<number, number> = {}
    ranking.value.forEach((id, i) => { rankMap[id] = i + 1 })

    // Capture per-match results while simulating
    const predMap = palmyPredMap()
    const palmy = usePalmy()
    const palmyVariant = variant()
    const winners: Record<number, number> = {}
    const scores: Record<number, { home: number; away: number }> = {}
    for (const match of matches.value) {
      if (match.status === 'CONCLUDED') continue
      const hId = match.homeTeamId
      const aId = match.awayTeamId
      if (!hId || !aId) continue
      const r = Math.random()
      if (r < DRAW_PROB) {
        winners[match.id] = DRAW_RESULT
        const drawScore = sampleDrawScore()
        scores[match.id] = { home: drawScore, away: drawScore }
        continue
      }
      const u = (r - DRAW_PROB) / (1 - DRAW_PROB)
      const p = matchHomeWinProb(match, rankMap, predMap, palmy, palmyVariant)
      const homeWins = u < p
      winners[match.id] = homeWins ? hId : aId
      const { winnerScore, loserScore } = sampleMatchScores(u, p)
      scores[match.id] = homeWins
        ? { home: winnerScore, away: loserScore }
        : { home: loserScore, away: winnerScore }
      // Use same winners/scores for the ladder calculation below
    }
    simulatedMatchWinners.value = winners
    simulatedMatchScores.value = scores

    // Build ladder from the captured winners (not a second random pass)
    const baseStats = buildStats(matches.value)
    const simStats: Record<number, TeamStats> = {}
    for (const [id, s] of Object.entries(baseStats)) simStats[Number(id)] = { ...s }
    for (const match of matches.value) {
      if (match.status === 'CONCLUDED') continue
      const winnerId = winners[match.id]
      if (winnerId === undefined) continue
      const score = scores[match.id]
      if (winnerId === DRAW_RESULT) {
        applyDraw(simStats, match.homeTeamId, match.awayTeamId, score.home)
        continue
      }
      const loserId = winnerId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
      if (!simStats[winnerId] || !simStats[loserId]) continue
      const winnerScore = winnerId === match.homeTeamId ? score.home : score.away
      const loserScore = winnerId === match.homeTeamId ? score.away : score.home
      simStats[winnerId].wins++; simStats[winnerId].pts += 4; simStats[winnerId].played++
      simStats[winnerId].for += winnerScore; simStats[winnerId].against += loserScore
      simStats[loserId].losses++; simStats[loserId].played++
      simStats[loserId].for += loserScore; simStats[loserId].against += winnerScore
    }
    simulatedLadder.value = statsToLadder(simStats, matches.value, rankMap)
  }

  function getSimulationFrames(): Array<{ roundNumber: number; roundName: string; ladder: LadderRow[] }> {
    const winners = simulatedMatchWinners.value
    if (!winners) return []
    const scores = simulatedMatchScores.value ?? {}

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
        if (winnerId === undefined) continue
        // Fixed-score fallback covers winners captured before scores existed
        // (e.g. a stale persisted simulation); normally the map has every match.
        const score = scores[match.id] ?? { home: SIM_WIN_SCORE, away: SIM_LOSS_SCORE }
        if (winnerId === DRAW_RESULT) {
          applyDraw(runningStats, match.homeTeamId, match.awayTeamId, scores[match.id]?.home ?? SIM_DRAW_SCORE)
          continue
        }
        const loserId = winnerId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
        if (!runningStats[winnerId] || !runningStats[loserId]) continue
        const winnerScore = winnerId === match.homeTeamId ? score.home : score.away
        const loserScore = winnerId === match.homeTeamId ? score.away : score.home
        runningStats[winnerId].wins++; runningStats[winnerId].pts += 4; runningStats[winnerId].played++
        runningStats[winnerId].for += winnerScore; runningStats[winnerId].against += loserScore
        runningStats[loserId].losses++; runningStats[loserId].played++
        runningStats[loserId].for += loserScore; runningStats[loserId].against += winnerScore
      }
      const snap: Record<number, TeamStats> = {}
      for (const [id, s] of Object.entries(runningStats)) snap[Number(id)] = { ...s }
      frames.push({ roundNumber, roundName, ladder: statsToLadder(snap, matches.value, rankMap) })
    }
    return frames
  }

  // Yields to the event loop without the ~4ms floor `setTimeout` imposes once
  // a few calls have nested (the HTML5 nested-timeout clamp) — a MessageChannel
  // task is scheduled as a plain macrotask, so batches resume as fast as the
  // browser will schedule them instead of being artificially throttled.
  let yieldChannel: MessageChannel | null = null
  function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => {
      const channel = yieldChannel ?? (yieldChannel = new MessageChannel())
      channel.port1.onmessage = () => resolve()
      channel.port2.postMessage(null)
    })
  }

  // Run in batches so the UI can repaint between them: the chart and progress
  // bar update after each batch instead of freezing until the whole run is
  // done. Batch size self-tunes toward a target compute slice per tick by
  // growing/shrinking gradually from the previous batch's measured time
  // (never jumping straight to an estimate from a single noisy sample), so a
  // fast device converges to doing proportionally more work per yield without
  // ever risking one batch blocking the main thread for seconds.
  const BATCH_TARGET_MS = 60    // aim for ~60ms of compute per batch
  const BATCH_CEILING_MS = 150  // shrink immediately if a batch overshoots this
  const MIN_BATCH_SIZE = 200
  const MAX_BATCH_SIZE = 50000

  // GPU batches are dispatched as a single large parallel job rather than a
  // main-thread loop, so the "yield" is the readback await itself and the
  // per-batch target can be much larger before it risks feeling unresponsive.
  const GPU_BATCH_TARGET_MS = 200
  const GPU_BATCH_CEILING_MS = 500
  const GPU_MIN_BATCH_SIZE = 5000

  // Returns true if the GPU handled the whole run. On any failure partway
  // through (device lost, out of memory, etc.) it returns false with
  // acc.ran reflecting whatever it completed, so the caller can fall back
  // to the CPU path for the remainder instead of leaving the run stuck.
  async function runManyGpu(n: number, rankMap: Record<number, number>, predMap: Map<number, MatchScorePrediction> | null, palmy: boolean, palmyVariant: PalmyVariant, acc: RangeAccumulator): Promise<boolean> {
    let gpuCtx: Awaited<ReturnType<typeof createGpuSimContext>> = null
    try {
      gpuCtx = await createGpuSimContext(acc, rankMap, predMap, palmy, palmyVariant)
      if (!gpuCtx) return false
      const maxBatch = gpuMaxBatch(gpuCtx)
      let done = 0
      // With finals data, the CPU-side per-sim post-processing (resolveFinalsForOrder)
      // adds real cost the GPU shader itself never accounted for, so the usual
      // "guess ~1/20th of n, up to maxBatch" start is unsafe here — a batch could
      // block for many seconds before the self-tuning ceiling check below ever
      // gets a chance to shrink it. Start at the floor and let elapsed-based tuning
      // ramp up safely instead of ramping down from an already-blocking size.
      let batchSize = acc.finalsTemplate.matches.length > 0
        ? GPU_MIN_BATCH_SIZE
        : Math.min(maxBatch, Math.max(GPU_MIN_BATCH_SIZE, Math.ceil(n / 20)))
      while (done < n) {
        const batch = Math.min(batchSize, maxBatch, n - done)
        const t0 = performance.now()
        await runGpuRangeBatch(gpuCtx, acc, batch)
        const elapsed = performance.now() - t0
        done += batch
        const { results, stats } = buildRangeResults(acc)
        rangeResults.value = results
        simStats.value = stats
        rangeTotal.value = done
        rangeProgress.value = done / n
        if (elapsed > GPU_BATCH_CEILING_MS) {
          batchSize = Math.max(GPU_MIN_BATCH_SIZE, Math.floor(batchSize / 2))
        } else if (elapsed < GPU_BATCH_TARGET_MS) {
          const growth = Math.min(2, GPU_BATCH_TARGET_MS / Math.max(elapsed, 1))
          batchSize = Math.min(maxBatch, Math.ceil(batchSize * growth))
        }
      }
      return true
    } catch {
      return false
    } finally {
      if (gpuCtx) destroyGpuSimContext(gpuCtx)
    }
  }

  async function runMany(n: number, useGpu = false) {
    if (!ranking.value.length) return
    isRunningRange.value = true
    rangeProgress.value = 0
    const rankMap: Record<number, number> = {}
    ranking.value.forEach((id, i) => { rankMap[id] = i + 1 })
    const predMap = palmyPredMap()
    const palmy = usePalmy()
    const palmyVariant = variant()
    const acc = createRangeAccumulator(matches.value)

    const gpuHandled = useGpu && gpuAvailable.value && await runManyGpu(n, rankMap, predMap, palmy, palmyVariant, acc)

    if (!gpuHandled) {
      let done = acc.ran
      let batchSize = MIN_BATCH_SIZE
      while (done < n) {
        const batch = Math.min(batchSize, n - done)
        const t0 = performance.now()
        runRangeBatch(acc, rankMap, batch, predMap, palmy, palmyVariant)
        const elapsed = performance.now() - t0
        done += batch
        const { results, stats } = buildRangeResults(acc)
        rangeResults.value = results
        simStats.value = stats
        rangeTotal.value = done
        rangeProgress.value = done / n
        if (elapsed > BATCH_CEILING_MS) {
          batchSize = Math.max(MIN_BATCH_SIZE, Math.floor(batchSize / 2))
        } else if (elapsed < BATCH_TARGET_MS) {
          const growth = Math.min(2, BATCH_TARGET_MS / Math.max(elapsed, 1))
          batchSize = Math.min(MAX_BATCH_SIZE, Math.ceil(batchSize * growth))
        }
        await yieldToEventLoop()
      }
    }
    rangeProgress.value = 1
    isRunningRange.value = false
  }

  return { actualLadder, predictedLadder, simulatedLadder, simulatedMatchWinners, simulate, getSimulationFrames, rangeResults, rangeTotal, simStats, isRunningRange, rangeProgress, runMany, gpuAvailable }
}
