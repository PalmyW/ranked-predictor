import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import type { AflMatch } from '../types/afl'
import { fetchSeasonMatches } from './useAFLData'
import { buildStrengthRows, predictMatch, type TeamStrengthRow } from './useScorePredictor'
import { previousSeasonKey } from '../config/seasons'

export interface TipResult {
  matchId: number
  roundNumber: number
  roundName: string
  homeTeamId: number
  awayTeamId: number
  homeAbbr: string
  awayAbbr: string
  homeIconId: string
  awayIconId: string
  homeName: string
  awayName: string
  predictedHomeScore: number
  predictedAwayScore: number
  actualHomeScore: number
  actualAwayScore: number
  predictedWinnerId: number | null
  actualWinnerId: number | null
  correct: boolean
  hasPrediction: boolean // false → no strength data or predicted tie; excluded from tally
}

export interface TipRound {
  roundNumber: number
  roundName: string
  correct: number
  total: number // matches that produced a prediction
  matches: TipResult[]
}

export interface TipTally {
  correct: number
  total: number
  pct: number
}

// Each team's rating must be built from at least this many matches; the current
// season is topped up with the team's most recent previous-season games until met.
const MIN_FORM_MATCHES = 5

function isConcluded(m: AflMatch): boolean {
  return m.status === 'CONCLUDED' && !!m.homeScore && !!m.awayScore
}

/**
 * Walk-forward backtest of the PalmyScore predictor. For each round R that has
 * concluded matches, it rebuilds team ratings from only the data available before
 * R (current-season concluded matches, supplemented per-team with previous-season
 * form to guarantee ≥5 matches each), predicts round R, and compares to the actual
 * result. Recomputes when the venue toggle flips or match data changes.
 */
export function useTipsBacktest(
  currentMatches: Ref<readonly AflMatch[]>,
  seasonYear: string,
  venueAdjusted: Ref<boolean>,
) {
  const prevMatches = ref<AflMatch[]>([])
  const loading = ref(true)

  // Registry-order-based, not `Number(seasonYear) - 1` — that arithmetic NaNs
  // on AFLW's '2022a'/'2022b' keys, and would be wrong generally if a
  // league's own season list ever isn't consecutive years.
  const prevKey = previousSeasonKey(seasonYear)
  if (prevKey) {
    fetchSeasonMatches(prevKey)
      .then((m) => { prevMatches.value = m })
      .finally(() => { loading.value = false })
  } else {
    loading.value = false
  }

  // Per-team previous-season concluded matches, most-recent-first.
  const prevByTeam = computed<Map<number, AflMatch[]>>(() => {
    const map = new Map<number, AflMatch[]>()
    const concluded = prevMatches.value
      .filter(isConcluded)
      .sort((a, b) => (a.utcStartTime < b.utcStartTime ? 1 : -1))
    for (const m of concluded) {
      for (const tid of [m.homeTeamId, m.awayTeamId]) {
        const arr = map.get(tid)
        if (arr) arr.push(m)
        else map.set(tid, [m])
      }
    }
    return map
  })

  const roundResults = computed<TipRound[]>(() => {
    const venue = venueAdjusted.value
    const prevIdx = prevByTeam.value
    const concluded = currentMatches.value.filter(isConcluded)

    const allTeamIds = new Set<number>()
    for (const m of concluded) { allTeamIds.add(m.homeTeamId); allTeamIds.add(m.awayTeamId) }

    const rounds = [...new Set(concluded.map((m) => m.roundNumber))].sort((a, b) => a - b)

    return rounds.map((R) => {
      const before = concluded.filter((m) => m.roundNumber < R)

      // Per-team count of current-season matches available before this round
      const count: Record<number, number> = {}
      for (const m of before) {
        count[m.homeTeamId] = (count[m.homeTeamId] ?? 0) + 1
        count[m.awayTeamId] = (count[m.awayTeamId] ?? 0) + 1
      }

      // Form pool = current-before, supplemented per-team to MIN_FORM_MATCHES.
      // Key by providerId (not numeric id) — current (CD) and previous-season
      // (possibly scraped, statscache mids) ids occupy overlapping ranges.
      const pool = new Map<string, AflMatch>()
      for (const m of before) pool.set(m.providerId, m)
      for (const tid of allTeamIds) {
        const need = MIN_FORM_MATCHES - (count[tid] ?? 0)
        if (need <= 0) continue
        for (const m of (prevIdx.get(tid) ?? []).slice(0, need)) pool.set(m.providerId, m)
      }

      const rows = buildStrengthRows([...pool.values()])
      const teamMap = new Map<number, TeamStrengthRow>()
      for (const r of rows) teamMap.set(r.teamId, r)

      const matches: TipResult[] = concluded
        .filter((m) => m.roundNumber === R)
        .map((m) => {
          const p = predictMatch(m, teamMap, venue)
          const ah = m.homeScore!.totalScore
          const aa = m.awayScore!.totalScore
          const actualWinnerId = ah > aa ? m.homeTeamId : aa > ah ? m.awayTeamId : null
          const hasPrediction = p.hasStrengthData && p.predictedHomeScore !== p.predictedAwayScore
          const predictedWinnerId = !hasPrediction
            ? null
            : p.predictedHomeScore > p.predictedAwayScore
              ? m.homeTeamId
              : m.awayTeamId
          return {
            matchId: m.id,
            roundNumber: R,
            roundName: m.roundName,
            homeTeamId: m.homeTeamId,
            awayTeamId: m.awayTeamId,
            homeAbbr: p.homeTeamAbbreviation,
            awayAbbr: p.awayTeamAbbreviation,
            homeIconId: p.homeTeamIconId,
            awayIconId: p.awayTeamIconId,
            homeName: m.homeTeamName,
            awayName: m.awayTeamName,
            predictedHomeScore: p.predictedHomeScore,
            predictedAwayScore: p.predictedAwayScore,
            actualHomeScore: ah,
            actualAwayScore: aa,
            predictedWinnerId,
            actualWinnerId,
            correct: hasPrediction && predictedWinnerId === actualWinnerId,
            hasPrediction,
          }
        })

      return {
        roundNumber: R,
        roundName: matches[0]?.roundName ?? `Round ${R}`,
        correct: matches.filter((m) => m.correct).length,
        total: matches.filter((m) => m.hasPrediction).length,
        matches,
      }
    })
  })

  const tally = computed<TipTally>(() => {
    let correct = 0
    let total = 0
    for (const r of roundResults.value) { correct += r.correct; total += r.total }
    return { correct, total, pct: total > 0 ? Math.round((correct / total) * 100) : 0 }
  })

  return { roundResults, tally, loading }
}
