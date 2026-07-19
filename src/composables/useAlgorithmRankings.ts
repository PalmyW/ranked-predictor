import { computed } from 'vue'
import type { AflMatch } from '../types/afl'
import { teamsInMatches, teamById } from './useAFLData'

export type VenueFilter = 'both' | 'home' | 'away'

export type AlgorithmId =
  | 'winpct'
  | 'srs'
  | 'colley'
  | 'massey'
  | 'winflow'
  | 'palmy'
  | 'xpalmy'

export interface AlgorithmInfo {
  id: AlgorithmId
  name: string
  description: string
  ratingLabel: string
  creditName?: string
  creditUrl?: string
}

export const ALGORITHMS: AlgorithmInfo[] = [
  {
    id: 'winpct',
    name: 'Win %',
    description:
      'Basic win percentage — wins divided by games played, with draws counting as half a win. Ignores who you beat or by how much.',
    ratingLabel: 'Win%',
  },
  {
    id: 'srs',
    name: 'SRS',
    description:
      "Simple Rating System: your rating equals your average score margin plus your average opponent's rating. Iterated until convergence — beating good teams lifts you higher.",
    ratingLabel: 'Rating',
    creditName: 'Pro Football Reference',
    creditUrl: 'https://www.pro-football-reference.com/about/win_prob.htm',
  },
  {
    id: 'colley',
    name: 'Colley Matrix',
    description:
      'Solves 18 simultaneous equations encoding every head-to-head record. Uses only wins and losses (no margins), and every result cascades through the whole schedule.',
    ratingLabel: 'Rating',
    creditName: 'Wesley Colley',
    creditUrl: 'https://www.colleyrankings.com/',
  },
  {
    id: 'massey',
    name: 'Massey',
    description:
      'Least-squares system that finds ratings which best explain every score margin. A win by 80 counts more than a win by 1.',
    ratingLabel: 'Rating',
    creditName: 'Kenneth Massey',
    creditUrl: 'https://www.masseyratings.com/',
  },
  {
    id: 'winflow',
    name: 'Win Flow',
    description:
      "PageRank-style: each loss distributes a team's rating to whoever beat them. Beating a team that everyone else also beats is worth less than beating a team that beats others.",
    ratingLabel: 'Flow',
    creditName: 'Brin & Page (PageRank)',
    creditUrl:
      'https://research.google/pubs/the-anatomy-of-a-large-scale-hypertextual-web-search-engine/',
  },
  {
    id: 'palmy',
    name: 'Palmy',
    description:
      `For each team, every opponent they've faced is ranked by the margin in that specific match—biggest win at #1, biggest loss at the bottom. Your Palmy rating is your average rank across all the opponent ladders you appear on. It doesn't care whether you won or lost; it only measures how you performed compared with each opponent's other games.`,
    ratingLabel: 'Rank',
    creditName: 'Original (PalmyW)',
  },
  {
    id: 'xpalmy',
    name: 'XPalmy',
    description:
      'Palmy run twice to produce two independent axes. X: for each opponent, rank how much they scored against you (most → least) — your average position measures how threatening you are offensively. Y: for each opponent, rank how much you scored against them (least → most) — your average position measures how hard you are to score against defensively. Teams are plotted on a scatter chart: right = stronger attack, up = stronger defense.',
    ratingLabel: 'Score',
    creditName: 'Original (PalmyW)',
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
  wasTeamHome: boolean
}

export interface XPalmyLadderEntry {
  teamId: number
  teamName: string
  abbreviation: string
  iconId: string
  oppScore: number
  ownScore: number
  rank: number
  roundNumber: number
  roundName: string
  wasTeamHome: boolean
}

export interface XPalmyTeamPoint {
  teamId: number
  teamName: string
  abbreviation: string
  iconId: string
  xRating: number
  yRating: number
  wins: number
  losses: number
  draws: number
  played: number
  officialRank: number
}

export interface XPalmyResult {
  points: XPalmyTeamPoint[]
  xLadders: Record<number, XPalmyLadderEntry[]>
  yLadders: Record<number, XPalmyLadderEntry[]>
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

// --- Internal helpers ---

interface BasicStats {
  wins: number
  losses: number
  draws: number
  played: number
  for: number
  against: number
}

// Team roster comes from the matches themselves (via teamsInMatches), not a
// fixed current-season list — so a past season's stats/ratings are keyed only
// by the teams that actually played, and defunct clubs resolve correctly.
export function buildBasicStats(
  matches: readonly AflMatch[],
  venueFilter: VenueFilter = 'both',
): Record<number, BasicStats> {
  const stats: Record<number, BasicStats> = {}
  for (const t of teamsInMatches(matches))
    stats[t.id] = {
      wins: 0,
      losses: 0,
      draws: 0,
      played: 0,
      for: 0,
      against: 0,
    }
  for (const m of matches) {
    if (m.status !== 'CONCLUDED' || !m.homeScore || !m.awayScore) continue
    const hs = m.homeScore.totalScore
    const as_ = m.awayScore.totalScore
    const hId = m.homeTeamId
    const aId = m.awayTeamId
    if (!stats[hId] || !stats[aId]) continue
    if (venueFilter !== 'away') {
      stats[hId].for += hs
      stats[hId].against += as_
      stats[hId].played++
      if (hs > as_) stats[hId].wins++
      else if (as_ > hs) stats[hId].losses++
      else stats[hId].draws++
    }
    if (venueFilter !== 'home') {
      stats[aId].for += as_
      stats[aId].against += hs
      stats[aId].played++
      if (as_ > hs) stats[aId].wins++
      else if (hs > as_) stats[aId].losses++
      else stats[aId].draws++
    }
  }
  return stats
}

export function buildOfficialRankMap(
  stats: Record<number, BasicStats>,
): Map<number, number> {
  const sorted = Object.keys(stats).map(Number).map((id) => ({
    id,
    pts: (stats[id]?.wins ?? 0) * 4 + (stats[id]?.draws ?? 0) * 2,
    pct:
      stats[id] && stats[id].against > 0
        ? stats[id].for / stats[id].against
        : (stats[id]?.for ?? 0) > 0
          ? 999
          : 1,
  })).sort((a, b) => b.pts - a.pts || b.pct - a.pct)
  const map = new Map<number, number>()
  sorted.forEach((t, i) => map.set(t.id, i + 1))
  return map
}

export function toRows(
  ratings: Record<number, number>,
  stats: Record<number, BasicStats>,
  officialRankMap: Map<number, number>,
): AlgorithmRankRow[] {
  const rows: AlgorithmRankRow[] = Object.keys(stats).map(Number).map((id) => {
    const t = teamById(id)
    return {
      rank: 0,
      teamId: id,
      teamName: t?.name ?? String(id),
      abbreviation: t?.abbreviation ?? '???',
      iconId: t?.iconId ?? '',
      rating: ratings[id] ?? 0,
      wins: stats[id]?.wins ?? 0,
      losses: stats[id]?.losses ?? 0,
      draws: stats[id]?.draws ?? 0,
      played: stats[id]?.played ?? 0,
      officialRank: officialRankMap.get(id) ?? 0,
    }
  })
  rows.sort((a, b) => b.rating - a.rating)
  rows.forEach((r, i) => {
    r.rank = i + 1
  })
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
  for (const id of Object.keys(stats).map(Number)) {
    const ts = stats[id]
    ratings[id] = ts.played > 0 ? (ts.wins + 0.5 * ts.draws) / ts.played : 0
  }
  return toRows(ratings, stats, officialRankMap)
}

function runSRS(
  concluded: readonly AflMatch[],
  stats: Record<number, BasicStats>,
  officialRankMap: Map<number, number>,
): AlgorithmRankRow[] {
  const teamIds = Object.keys(stats).map(Number)
  const marginSum: Record<number, number> = {}
  const oppList: Record<number, number[]> = {}
  for (const id of teamIds) {
    marginSum[id] = 0
    oppList[id] = []
  }
  for (const m of concluded) {
    if (!m.homeScore || !m.awayScore) continue
    const diff = m.homeScore.totalScore - m.awayScore.totalScore
    marginSum[m.homeTeamId] = (marginSum[m.homeTeamId] ?? 0) + diff
    marginSum[m.awayTeamId] = (marginSum[m.awayTeamId] ?? 0) - diff
    oppList[m.homeTeamId]?.push(m.awayTeamId)
    oppList[m.awayTeamId]?.push(m.homeTeamId)
  }
  let ratings: Record<number, number> = {}
  for (const id of teamIds) {
    const gp = stats[id]?.played ?? 0
    ratings[id] = gp > 0 ? marginSum[id] / gp : 0
  }
  for (let iter = 0; iter < 1000; iter++) {
    const next: Record<number, number> = {}
    let maxDiff = 0
    for (const id of teamIds) {
      const gp = stats[id]?.played ?? 0
      if (gp === 0) {
        next[id] = 0
        continue
      }
      const avgOpp =
        oppList[id].reduce((sum, oid) => sum + (ratings[oid] ?? 0), 0) / gp
      next[id] = marginSum[id] / gp + avgOpp
      maxDiff = Math.max(maxDiff, Math.abs(next[id] - ratings[id]))
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
  const teamIds = Object.keys(stats).map(Number)
  const N = teamIds.length
  const teamIndex = Object.fromEntries(teamIds.map((id, i) => [id, i]))
  const C: number[][] = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (__, j) => (i === j ? 2 : 0)),
  )
  const b: number[] = new Array(N).fill(1)
  for (const m of concluded) {
    const i = teamIndex[m.homeTeamId]
    const j = teamIndex[m.awayTeamId]
    if (i === undefined || j === undefined) continue
    C[i][i]++
    C[j][j]++
    C[i][j]--
    C[j][i]--
  }
  for (let i = 0; i < N; i++) {
    const ts = stats[teamIds[i]]
    b[i] = 1 + ((ts?.wins ?? 0) - (ts?.losses ?? 0)) / 2
  }
  const sol = gaussianElim(C, b)
  const ratings: Record<number, number> = {}
  if (!sol) {
    for (const id of teamIds) ratings[id] = 0.5
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
  const teamIds = Object.keys(stats).map(Number)
  const N = teamIds.length
  const teamIndex = Object.fromEntries(teamIds.map((id, i) => [id, i]))
  const M: number[][] = Array.from({ length: N }, () => new Array(N).fill(0))
  const p: number[] = new Array(N).fill(0)
  for (const m of concluded) {
    if (!m.homeScore || !m.awayScore) continue
    const i = teamIndex[m.homeTeamId]
    const j = teamIndex[m.awayTeamId]
    if (i === undefined || j === undefined) continue
    const margin = m.homeScore.totalScore - m.awayScore.totalScore
    M[i][i]++
    M[j][j]++
    M[i][j]--
    M[j][i]--
    p[i] += margin
    p[j] -= margin
  }
  for (let j = 0; j < N; j++) M[N - 1][j] = 1
  p[N - 1] = 0
  const sol = gaussianElim(M, p)
  const ratings: Record<number, number> = {}
  if (!sol) {
    for (const id of teamIds) ratings[id] = 0
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
  const teamIds = Object.keys(stats).map(Number)
  const N = teamIds.length
  const winsOver: Record<number, Record<number, number>> = {}
  for (const id of teamIds) winsOver[id] = {}
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
  for (const id of teamIds) ratings[id] = 1 / N
  for (let iter = 0; iter < 300; iter++) {
    const next: Record<number, number> = {}
    let maxDiff = 0
    for (const id of teamIds) {
      let flow = (1 - DAMPING) / N
      for (const otherId of teamIds) {
        if (otherId === id) continue
        const w = winsOver[id][otherId] ?? 0
        if (w === 0) continue
        const gp = stats[otherId]?.played ?? 0
        if (gp === 0) continue
        flow += DAMPING * (w / gp) * ratings[otherId]
      }
      next[id] = flow
      maxDiff = Math.max(maxDiff, Math.abs(flow - ratings[id]))
    }
    ratings = next
    if (maxDiff < 1e-9) break
  }
  return toRows(ratings, stats, officialRankMap)
}

export function runPalmy(
  concluded: readonly AflMatch[],
  stats: Record<number, BasicStats>,
  officialRankMap: Map<number, number>,
  venueFilter: VenueFilter = 'both',
): {
  ranking: AlgorithmRankRow[]
  opponentLadders: Record<number, PalmyLadderEntry[]>
} {
  const teamIds = Object.keys(stats).map(Number)
  const teamMap = new Map(teamIds.map((id) => [id, teamById(id)]))
  const opponentLadders: Record<number, PalmyLadderEntry[]> = {}
  for (const id of teamIds) opponentLadders[id] = []

  for (const m of concluded) {
    if (!m.homeScore || !m.awayScore) continue
    const hScore = m.homeScore.totalScore
    const aScore = m.awayScore.totalScore
    const hId = m.homeTeamId
    const aId = m.awayTeamId
    const hTeam = teamMap.get(hId)
    const aTeam = teamMap.get(aId)
    if (!hTeam || !aTeam) continue
    // aId (away team) appears in hId's ladder; aId was away in this game
    opponentLadders[hId].push({
      teamId: aId,
      teamName: aTeam.name,
      abbreviation: aTeam.abbreviation,
      iconId: aTeam.iconId,
      differential: aScore - hScore,
      rank: 0,
      roundNumber: m.roundNumber,
      roundName: m.roundName,
      wasTeamHome: false,
    })
    // hId (home team) appears in aId's ladder; hId was home in this game
    opponentLadders[aId].push({
      teamId: hId,
      teamName: hTeam.name,
      abbreviation: hTeam.abbreviation,
      iconId: hTeam.iconId,
      differential: hScore - aScore,
      rank: 0,
      roundNumber: m.roundNumber,
      roundName: m.roundName,
      wasTeamHome: true,
    })
  }

  for (const id of teamIds) {
    opponentLadders[id].sort((a, b) => b.differential - a.differential)
    opponentLadders[id].forEach((entry, i) => {
      entry.rank = i + 1
    })
  }

  const ratings: Record<number, number> = {}
  for (const teamYId of teamIds) {
    const fractions: number[] = []
    for (const teamXId of teamIds) {
      if (teamXId === teamYId) continue
      const ladder = opponentLadders[teamXId]
      for (const entry of ladder) {
        if (entry.teamId !== teamYId) continue
        if (venueFilter === 'home' && !entry.wasTeamHome) continue
        if (venueFilter === 'away' && entry.wasTeamHome) continue
        fractions.push((entry.rank - 1) / Math.max(ladder.length - 1, 1))
      }
    }
    ratings[teamYId] =
      fractions.length === 0
        ? -999
        : -(fractions.reduce((a, b) => a + b, 0) / fractions.length)
  }

  return { ranking: toRows(ratings, stats, officialRankMap), opponentLadders }
}

export function runXPalmy(
  concluded: readonly AflMatch[],
  stats: Record<number, BasicStats>,
  officialRankMap: Map<number, number>,
  venueFilter: VenueFilter = 'both',
): XPalmyResult {
  const teamIds = Object.keys(stats).map(Number)
  const teamMap = new Map(teamIds.map((id) => [id, teamById(id)]))
  const xLadders: Record<number, XPalmyLadderEntry[]> = {}
  const yLadders: Record<number, XPalmyLadderEntry[]> = {}
  for (const id of teamIds) {
    xLadders[id] = []
    yLadders[id] = []
  }

  for (const m of concluded) {
    if (!m.homeScore || !m.awayScore) continue
    const hScore = m.homeScore.totalScore
    const aScore = m.awayScore.totalScore
    const hId = m.homeTeamId
    const aId = m.awayTeamId
    const hTeam = teamMap.get(hId)
    const aTeam = teamMap.get(aId)
    if (!hTeam || !aTeam) continue

    const base = { rank: 0, roundNumber: m.roundNumber, roundName: m.roundName }
    // aId (away team) in hId's ladders; aId was away
    const homeEntry: XPalmyLadderEntry = {
      ...base,
      teamId: aId, teamName: aTeam.name, abbreviation: aTeam.abbreviation, iconId: aTeam.iconId,
      oppScore: aScore, ownScore: hScore, wasTeamHome: false,
    }
    xLadders[hId].push({ ...homeEntry })
    yLadders[hId].push({ ...homeEntry })
    // hId (home team) in aId's ladders; hId was home
    const awayEntry: XPalmyLadderEntry = {
      ...base,
      teamId: hId, teamName: hTeam.name, abbreviation: hTeam.abbreviation, iconId: hTeam.iconId,
      oppScore: hScore, ownScore: aScore, wasTeamHome: true,
    }
    xLadders[aId].push({ ...awayEntry })
    yLadders[aId].push({ ...awayEntry })
  }

  // X-ladders: sort by oppScore descending (highest opposition score = rank 1)
  for (const id of teamIds) {
    xLadders[id].sort((a, b) => b.oppScore - a.oppScore)
    xLadders[id].forEach((e, i) => { e.rank = i + 1 })
  }
  // Y-ladders: sort by ownScore ascending (lowest own score = rank 1)
  for (const id of teamIds) {
    yLadders[id].sort((a, b) => a.ownScore - b.ownScore)
    yLadders[id].forEach((e, i) => { e.rank = i + 1 })
  }

  const points: XPalmyTeamPoint[] = teamIds.map((teamYId) => {
    const teamY = teamMap.get(teamYId)!
    const xFracs: number[] = []
    const yFracs: number[] = []
    for (const teamXId of teamIds) {
      if (teamXId === teamYId) continue
      const xl = xLadders[teamXId]
      for (const e of xl) {
        if (e.teamId !== teamYId) continue
        if (venueFilter === 'home' && !e.wasTeamHome) continue
        if (venueFilter === 'away' && e.wasTeamHome) continue
        xFracs.push((e.rank - 1) / Math.max(xl.length - 1, 1))
      }
      const yl = yLadders[teamXId]
      for (const e of yl) {
        if (e.teamId !== teamYId) continue
        if (venueFilter === 'home' && !e.wasTeamHome) continue
        if (venueFilter === 'away' && e.wasTeamHome) continue
        yFracs.push((e.rank - 1) / Math.max(yl.length - 1, 1))
      }
    }
    const avg = (arr: number[]) =>
      arr.length === 0 ? 0.5 : arr.reduce((a, b) => a + b, 0) / arr.length
    return {
      teamId: teamYId,
      teamName: teamY.name,
      abbreviation: teamY.abbreviation,
      iconId: teamY.iconId,
      xRating: avg(xFracs),
      yRating: avg(yFracs),
      wins: stats[teamYId]?.wins ?? 0,
      losses: stats[teamYId]?.losses ?? 0,
      draws: stats[teamYId]?.draws ?? 0,
      played: stats[teamYId]?.played ?? 0,
      officialRank: officialRankMap.get(teamYId) ?? 0,
    }
  })

  return { points, xLadders, yLadders }
}

// --- Public API ---

/**
 * Keep only each team's most recent `perTeam` concluded matches (a "form" window).
 * A match is retained while either of its teams still has room in their window,
 * so every team's last `perTeam` games are represented.
 */
export function filterRecentMatches(
  matches: readonly AflMatch[],
  perTeam: number,
): AflMatch[] {
  const concluded = matches
    .filter((m) => m.status === 'CONCLUDED' && m.homeScore && m.awayScore)
    .sort((a, b) => a.roundNumber - b.roundNumber)
  const count: Record<number, number> = {}
  const kept: AflMatch[] = []
  for (let i = concluded.length - 1; i >= 0; i--) {
    const m = concluded[i]
    if ((count[m.homeTeamId] ?? 0) < perTeam || (count[m.awayTeamId] ?? 0) < perTeam) {
      kept.push(m)
      count[m.homeTeamId] = (count[m.homeTeamId] ?? 0) + 1
      count[m.awayTeamId] = (count[m.awayTeamId] ?? 0) + 1
    }
  }
  return kept
}

/** Compute a single algorithm's ranking for any arbitrary set of matches. */
export function computeAlgorithmRanking(
  id: AlgorithmId,
  matches: readonly AflMatch[],
): AlgorithmRankRow[] {
  const concluded = matches.filter(
    (m) => m.status === 'CONCLUDED' && m.homeScore && m.awayScore,
  )
  const stats = buildBasicStats(matches)
  const officialRankMap = buildOfficialRankMap(stats)
  switch (id) {
    case 'winpct':
      return runWinPct(stats, officialRankMap)
    case 'srs':
      return runSRS(concluded, stats, officialRankMap)
    case 'colley':
      return runColley(concluded, stats, officialRankMap)
    case 'massey':
      return runMassey(concluded, stats, officialRankMap)
    case 'winflow':
      return runWinFlow(concluded, stats, officialRankMap)
    case 'palmy':
      return runPalmy(concluded, stats, officialRankMap).ranking
    case 'xpalmy': {
      const { points } = runXPalmy(concluded, stats, officialRankMap)
      const ratings: Record<number, number> = {}
      for (const p of points) ratings[p.teamId] = -(p.xRating + p.yRating) / 2
      return toRows(ratings, stats, officialRankMap)
    }
  }
}

type MatchesRef = { readonly value: readonly AflMatch[] }

export function useAlgorithmRankings(matchesRef: MatchesRef) {
  const basicStats = computed(() => buildBasicStats(matchesRef.value))
  const concluded = computed(() =>
    matchesRef.value.filter(
      (m) => m.status === 'CONCLUDED' && m.homeScore && m.awayScore,
    ),
  )
  const officialRankMap = computed(() => buildOfficialRankMap(basicStats.value))

  const winPctRanking = computed(() =>
    runWinPct(basicStats.value, officialRankMap.value),
  )
  const srsRanking = computed(() =>
    runSRS(concluded.value, basicStats.value, officialRankMap.value),
  )
  const colleyRanking = computed(() =>
    runColley(concluded.value, basicStats.value, officialRankMap.value),
  )
  const masseyRanking = computed(() =>
    runMassey(concluded.value, basicStats.value, officialRankMap.value),
  )
  const winFlowRanking = computed(() =>
    runWinFlow(concluded.value, basicStats.value, officialRankMap.value),
  )

  const palmyData = computed(() =>
    runPalmy(concluded.value, basicStats.value, officialRankMap.value),
  )
  const palmyRanking = computed(() => palmyData.value.ranking)
  const palmyOpponentLadders = computed(() => palmyData.value.opponentLadders)

  const xpalmyData = computed(() =>
    runXPalmy(concluded.value, basicStats.value, officialRankMap.value),
  )
  const xpalmyPoints = computed(() => xpalmyData.value.points)
  const xpalmyXLadders = computed(() => xpalmyData.value.xLadders)
  const xpalmyYLadders = computed(() => xpalmyData.value.yLadders)
  const xpalmyRanking = computed(() => {
    const ratings: Record<number, number> = {}
    for (const p of xpalmyData.value.points) ratings[p.teamId] = -(p.xRating + p.yRating) / 2
    return toRows(ratings, basicStats.value, officialRankMap.value)
  })

  return {
    officialRankMap,
    winPctRanking,
    srsRanking,
    colleyRanking,
    masseyRanking,
    winFlowRanking,
    palmyRanking,
    palmyOpponentLadders,
    xpalmyPoints,
    xpalmyXLadders,
    xpalmyYLadders,
    xpalmyRanking,
  }
}
