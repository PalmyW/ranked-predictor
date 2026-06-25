import { defineStore } from 'pinia'
import { computed } from 'vue'
import type { TeamStrengthRow, UpcomingMatchPrediction } from '../composables/useScorePredictor'
import { buildStrengthRows, predictMatch, UPCOMING_STATUSES } from '../composables/useScorePredictor'
import { useAFLData } from '../composables/useAFLData'

/**
 * Single owner of the canonical full-season team-strength derivation.
 *
 * `strengthRows` / `teamMap` are venue-independent, so multiple prediction
 * consumers (e.g. PalmyScore predictions and the simulator's PalmyScore
 * probabilities) can share one cached pass instead of each rebuilding it.
 */
export const usePredictionsStore = defineStore('predictions', () => {
  const { matches } = useAFLData()

  const strengthRows = computed<TeamStrengthRow[]>(() => buildStrengthRows(matches.value))

  const teamMap = computed<Map<number, TeamStrengthRow>>(() => {
    const map = new Map<number, TeamStrengthRow>()
    for (const r of strengthRows.value) map.set(r.teamId, r)
    return map
  })

  const hasEnoughData = computed(() => strengthRows.value.some((r) => r.played > 0))

  /** Predictions for every upcoming match, using the shared (cached) teamMap. */
  function upcomingPredictions(venueAdjusted: boolean): UpcomingMatchPrediction[] {
    return matches.value
      .filter((m) => UPCOMING_STATUSES.has(m.status))
      .map((m) => predictMatch(m, teamMap.value, venueAdjusted))
  }

  return { strengthRows, teamMap, hasEnoughData, upcomingPredictions }
})
