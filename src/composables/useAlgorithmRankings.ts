import { computed } from 'vue'
import type { AflMatch } from '../types/afl'
import { TEAMS } from './useAFLData'

export type AlgorithmId = 'winpct' | 'srs' | 'colley' | 'massey' | 'winflow' | 'palmy'

export interface AlgorithmInfo {
  id: AlgorithmId
  name: string
  description: string
  ratingLabel: string
}

export const ALGORITHMS: AlgorithmInfo[] = [
  {
    id: 'winpct',
    name: 'Win %',
    description: 'Basic win percentage — wins divided by games played, with draws counting as half a win. Ignores who you beat or by how much.',
    ratingLabel: 'Win%',
  },
  {
    id: 'srs',
    name: 'SRS',
    description: 'Simple Rating System: your rating equals your average score margin plus your average opponent\'s rating. Iterated until convergence — beating good teams lifts you higher.',
    ratingLabel: 'Rating',
  },
  {
    id: 'colley',
    name: 'Colley Matrix',
    description: 'Solves 18 simultaneous equations encoding every head-to-head record. Uses only wins and losses (no margins), and every result cascades through the whole schedule.',
    ratingLabel: 'Rating',
  },
  {
    id: 'massey',
    name: 'Massey',
    description: 'Least-squares system that finds ratings which best explain every score margin. A win by 80 counts more than a win by 1.',
    ratingLabel: 'Rating',
  },
  {
    id: 'winflow',
    name: 'Win Flow',
    description: 'PageRank-style: each loss distributes a team\'s rating to whoever beat them. Beating a team that everyone else also beats is worth less than beating a team that beats others.',
    ratingLabel: 'Flow',
  },
  {
    id: 'palmy',
    name: 'Palmy',
    description: 'For each team, every opponent they\'ve faced is ranked by their margin in that specific match — biggest win at #1, biggest loss at last. Your Palmy rating is your average rank position across all opponent ladders you appear in. Hover a team to see their full opponent ladder.',
    ratingLabel: 'Rank',
  },
]

export interface PalmyLadderEntry {
  teamId: number
  teamName: string
  abbreviation: string
  iconId: string
  differential: number
  rank: number
  roundNumber: number
  roundName: string
}

export interface AlgorithmRankRow {
  rank: number
  teamId: number
  teamName: string
  abbreviation: string
  iconId: string
  rating: number
  wins: number
  losses: number
  draws: number
  played: number
  officialRank: number
}

// --- Module-level constants derived from TEAMS ---

const N = TEAMS.length
const teamIndex = Object.fromEntries(TEAMS.map((t, i) => [t.id, i]))
const teamIds = TEAMS.map((t) => t.id)

// --- Internal helpers ---

interface BasicStats {
  wins: number
  losses: number
  draws: number
  played: number
  for: number
  against: number
}

function buildBasicStats(matches: readonly AflMatch[]): Record<number, BasicStats> {
  const stats: Record<number, BasicStats> = {}
  for (const t of TEAMS) stats[t.id] = { wins: 0, losses: 0, draws: 0, played: 0, for: 0, against: 0 }
  for (const m of matches) {
    if (m.status !== 'CONCLUDED' || !m.homeScore || !m.awayScore) continue
    const hs = m.homeScore.totalScore
    const as_ = m.awayScore.totalScore
    const hId = m.homeTeamId
    const aId = m.awayTeamId
    if (!stats[hId] || !stats[aId]) continue
    stats[hId].for += hs; stats[hId].against += as_; stats[hId].played++
    stats[aId].for += as_; stats[aId].against += hs; stats[aId].played++
    if (hs > as_) { stats[hId].wins++; stats[aId].losses++ }
    else if (as_ > hs) { stats[aId].wins++; stats[hId].losses++ }
    else { stats[hId].draws++; stats[aId].draws++ }
  }
  return stats
}

function buildOfficialRankMap(stats: Record<number, BasicStats>): Map<number, number> {
  const sorted = TEAMS.map((t) => ({
    id: t.id,
    pts: (stats[t.id]?.wins ?? 0) * 4 + (stats[t.id]?.draws ?? 0) * 2,
    pct: stats[t.id] && stats[t.id].against > 0
      ? stats[t.id].for / stats[t.id].against
      : (stats[t.id]?.for ?? 0) > 0 ? 999 : 1,
  })).sort((a, b) => b.pts - a.pts || b.pct - a.pct)
  const map = new Map<number, number>()
  sorted.forEach((t, i) => map.set(t.id, i + 1))
  return map
}

function toRows(
  ratings: Record<number, number>,
  stats: Record<number, BasicStats>,
  officialRankMap: Map<number, number>,
): AlgorithmRankRow[] {
  const rows: AlgorithmRankRow[] = TEAMS.map((t) => ({
    rank: 0,
    teamId: t.id,
    teamName: t.name,
    abbreviation: t.abbreviation,
    iconId: t.iconId,
    rating: ratings[t.id] ?? 0,
    wins: stats[t.id]?.wins ?? 0,
    losses: stats[t.id]?.losses ?? 0,
    draws: stats[t.id]?.draws ?? 0,
    played: stats[t.id]?.played ?? 0,
    officialRank: officialRankMap.get(t.id) ?? 0,
  }))
  rows.sort((a, b) => b.rating - a.rating)
  rows.forEach((r, i) => { r.rank = i + 1 })
  return rows
}

function gaussianElim(A: number[][], b: number[]): number[] | null {
  const n = A.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let maxRow = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row
    }
    ;[M[col], M[maxRow]] = [M[maxRow], M[col]]
    if (Math.abs(M[col][col]) < 1e-12) return null
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col]
      for (let k = col; k <= n; k++) M[row][k] -= factor * M[col][k]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n]
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j]
    x[i] /= M[i][i]
  }
  return x
}

// --- Algorithm implementations (pure functions) ---

function runWinPct(
  stats: Record<number, BasicStats>,
  officialRankMap: Map<number, number>,
): AlgorithmRankRow[] {
  const ratings: Record<number, number> = {}
  for (const t of TEAMS) {
    const ts = stats[t.id]
    ratings[t.id] = ts.played > 0 ? (ts.wins + 0.5 * ts.draws) / ts.played : 0
  }
  return toRows(ratings, stats, officialRankMap)
}

function runSRS(
  concluded: readonly AflMatch[],
  stats: Record<number, BasicStats>,
  officialRankMap: Map<number, number>,
): AlgorithmRankRow[] {
  const marginSum: Record<number, number> = {}
  const oppList: Record<number, number[]> = {}
  for (const t of TEAMS) { marginSum[t.id] = 0; oppList[t.id] = [] }
  for (const m of concluded) {
    if (!m.homeScore || !m.awayScore) continue
    const diff = m.homeScore.totalScore - m.awayScore.totalScore
    marginSum[m.homeTeamId] = (marginSum[m.homeTeamId] ?? 0) + diff
    marginSum[m.awayTeamId] = (marginSum[m.awayTeamId] ?? 0) - diff
    oppList[m.homeTeamId]?.push(m.awayTeamId)
    oppList[m.awayTeamId]?.push(m.homeTeamId)
  }
  let ratings: Record<number, number> = {}
  for (const t of TEAMS) {
    const gp = stats[t.id]?.played ?? 0
    ratings[t.id] = gp > 0 ? marginSum[t.id] / gp : 0
  }
  for (let iter = 0; iter < 1000; iter++) {
    const next: Record<number, number> = {}
    let maxDiff = 0
    for (const t of TEAMS) {
      const gp = stats[t.id]?.played ?? 0
      if (gp === 0) { next[t.id] = 0; continue }
      const avgOpp = oppList[t.id].reduce((sum, oid) => sum + (ratings[oid] ?? 0), 0) / gp
      next[t.id] = marginSum[t.id] / gp + avgOpp
      maxDiff = Math.max(maxDiff, Math.abs(next[t.id] - ratings[t.id]))
    }
    ratings = next
    if (maxDiff < 0.0001) break
  }
  return toRows(ratings, stats, officialRankMap)
}

function runColley(
  concluded: readonly AflMatch[],
  stats: Record<number, BasicStats>,
  officialRankMap: Map<number, number>,
): AlgorithmRankRow[] {
  const C: number[][] = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (__, j) => (i === j ? 2 : 0)),
  )
  const b: number[] = new Array(N).fill(1)
  for (const m of concluded) {
    const i = teamIndex[m.homeTeamId]
    const j = teamIndex[m.awayTeamId]
    if (i === undefined || j === undefined) continue
    C[i][i]++; C[j][j]++
    C[i][j]--; C[j][i]--
  }
  for (let i = 0; i < N; i++) {
    const ts = stats[teamIds[i]]
    b[i] = 1 + ((ts?.wins ?? 0) - (ts?.losses ?? 0)) / 2
  }
  const sol = gaussianElim(C, b)
  const ratings: Record<number, number> = {}
  if (!sol) {
    for (const t of TEAMS) ratings[t.id] = 0.5
  } else {
    for (let i = 0; i < N; i++) ratings[teamIds[i]] = sol[i]
  }
  return toRows(ratings, stats, officialRankMap)
}

function runMassey(
  concluded: readonly AflMatch[],
  stats: Record<number, BasicStats>,
  officialRankMap: Map<number, number>,
): AlgorithmRankRow[] {
  const M: number[][] = Array.from({ length: N }, () => new Array(N).fill(0))
  const p: number[] = new Array(N).fill(0)
  for (const m of concluded) {
    if (!m.homeScore || !m.awayScore) continue
    const i = teamIndex[m.homeTeamId]
    const j = teamIndex[m.awayTeamId]
    if (i === undefined || j === undefined) continue
    const margin = m.homeScore.totalScore - m.awayScore.totalScore
    M[i][i]++; M[j][j]++
    M[i][j]--; M[j][i]--
    p[i] += margin; p[j] -= margin
  }
  for (let j = 0; j < N; j++) M[N - 1][j] = 1
  p[N - 1] = 0
  const sol = gaussianElim(M, p)
  const ratings: Record<number, number> = {}
  if (!sol) {
    for (const t of TEAMS) ratings[t.id] = 0
  } else {
    for (let i = 0; i < N; i++) ratings[teamIds[i]] = sol[i]
  }
  return toRows(ratings, stats, officialRankMap)
}

function runWinFlow(
  concluded: readonly AflMatch[],
  stats: Record<number, BasicStats>,
  officialRankMap: Map<number, number>,
): AlgorithmRankRow[] {
  const winsOver: Record<number, Record<number, number>> = {}
  for (const t of TEAMS) winsOver[t.id] = {}
  for (const m of concluded) {
    if (!m.homeScore || !m.awayScore) continue
    const hs = m.homeScore.totalScore
    const as_ = m.awayScore.totalScore
    const hId = m.homeTeamId
    const aId = m.awayTeamId
    if (hs > as_) {
      winsOver[hId][aId] = (winsOver[hId][aId] ?? 0) + 1
    } else if (as_ > hs) {
      winsOver[aId][hId] = (winsOver[aId][hId] ?? 0) + 1
    } else {
      winsOver[hId][aId] = (winsOver[hId][aId] ?? 0) + 0.5
      winsOver[aId][hId] = (winsOver[aId][hId] ?? 0) + 0.5
    }
  }
  const DAMPING = 0.85
  let ratings: Record<number, number> = {}
  for (const t of TEAMS) ratings[t.id] = 1 / N
  for (let iter = 0; iter < 300; iter++) {
    const next: Record<number, number> = {}
    let maxDiff = 0
    for (const t of TEAMS) {
      let flow = (1 - DAMPING) / N
      for (const other of TEAMS) {
        if (other.id === t.id) continue
        const w = winsOver[t.id][other.id] ?? 0
        if (w === 0) continue
        const gp = stats[other.id]?.played ?? 0
        if (gp === 0) continue
        flow += DAMPING * (w / gp) * ratings[other.id]
      }
      next[t.id] = flow
      maxDiff = Math.max(maxDiff, Math.abs(flow - ratings[t.id]))
    }
    ratings = next
    if (maxDiff < 1e-9) break
  }
  return toRows(ratings, stats, officialRankMap)
}

function runPalmy(
  concluded: readonly AflMatch[],
  stats: Record<number, BasicStats>,
  officialRankMap: Map<number, number>,
): { ranking: AlgorithmRankRow[]; opponentLadders: Record<number, PalmyLadderEntry[]> } {
  const teamMap = Object.fromEntries(TEAMS.map((t) => [t.id, t]))
  const opponentLadders: Record<number, PalmyLadderEntry[]> = {}
  for (const t of TEAMS) opponentLadders[t.id] = []

  for (const m of concluded) {
    if (!m.homeScore || !m.awayScore) continue
    const hScore = m.homeScore.totalScore
    const aScore = m.awayScore.totalScore
    const hId = m.homeTeamId
    const aId = m.awayTeamId
    const hTeam = teamMap[hId]
    const aTeam = teamMap[aId]
    if (!hTeam || !aTeam) continue
    opponentLadders[hId].push({
      teamId: aId, teamName: aTeam.name, abbreviation: aTeam.abbreviation,
      iconId: aTeam.iconId, differential: aScore - hScore, rank: 0,
      roundNumber: m.roundNumber, roundName: m.roundName,
    })
    opponentLadders[aId].push({
      teamId: hId, teamName: hTeam.name, abbreviation: hTeam.abbreviation,
      iconId: hTeam.iconId, differential: hScore - aScore, rank: 0,
      roundNumber: m.roundNumber, roundName: m.roundName,
    })
  }

  for (const t of TEAMS) {
    opponentLadders[t.id].sort((a, b) => b.differential - a.differential)
    opponentLadders[t.id].forEach((entry, i) => { entry.rank = i + 1 })
  }

  const ratings: Record<number, number> = {}
  for (const teamY of TEAMS) {
    const fractions: number[] = []
    for (const teamX of TEAMS) {
      if (teamX.id === teamY.id) continue
      const ladder = opponentLadders[teamX.id]
      for (const entry of ladder) {
        if (entry.teamId === teamY.id) fractions.push(entry.rank / ladder.length)
      }
    }
    ratings[teamY.id] = fractions.length === 0
      ? -999
      : -(fractions.reduce((a, b) => a + b, 0) / fractions.length)
  }

  return { ranking: toRows(ratings, stats, officialRankMap), opponentLadders }
}

// --- Public API ---

/** Compute a single algorithm's ranking for any arbitrary set of matches. */
export function computeAlgorithmRanking(
  id: AlgorithmId,
  matches: readonly AflMatch[],
): AlgorithmRankRow[] {
  const concluded = matches.filter((m) => m.status === 'CONCLUDED' && m.homeScore && m.awayScore)
  const stats = buildBasicStats(matches)
  const officialRankMap = buildOfficialRankMap(stats)
  switch (id) {
    case 'winpct':  return runWinPct(stats, officialRankMap)
    case 'srs':     return runSRS(concluded, stats, officialRankMap)
    case 'colley':  return runColley(concluded, stats, officialRankMap)
    case 'massey':  return runMassey(concluded, stats, officialRankMap)
    case 'winflow': return runWinFlow(concluded, stats, officialRankMap)
    case 'palmy':   return runPalmy(concluded, stats, officialRankMap).ranking
  }
}

type MatchesRef = { readonly value: readonly AflMatch[] }

export function useAlgorithmRankings(matchesRef: MatchesRef) {
  const basicStats = computed(() => buildBasicStats(matchesRef.value))
  const concluded = computed(() =>
    matchesRef.value.filter((m) => m.status === 'CONCLUDED' && m.homeScore && m.awayScore),
  )
  const officialRankMap = computed(() => buildOfficialRankMap(basicStats.value))

  const winPctRanking = computed(() => runWinPct(basicStats.value, officialRankMap.value))
  const srsRanking    = computed(() => runSRS(concluded.value, basicStats.value, officialRankMap.value))
  const colleyRanking = computed(() => runColley(concluded.value, basicStats.value, officialRankMap.value))
  const masseyRanking = computed(() => runMassey(concluded.value, basicStats.value, officialRankMap.value))
  const winFlowRanking = computed(() => runWinFlow(concluded.value, basicStats.value, officialRankMap.value))

  const palmyData = computed(() => runPalmy(concluded.value, basicStats.value, officialRankMap.value))
  const palmyRanking = computed(() => palmyData.value.ranking)
  const palmyOpponentLadders = computed(() => palmyData.value.opponentLadders)

  return {
    officialRankMap,
    winPctRanking,
    srsRanking,
    colleyRanking,
    masseyRanking,
    winFlowRanking,
    palmyRanking,
    palmyOpponentLadders,
  }
}
