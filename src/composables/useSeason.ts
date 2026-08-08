import { computed, readonly, ref } from 'vue'
import { ACTIVE_SEASONS, ACTIVE_CURRENT_SEASON_YEAR, getActiveSeasonYear } from '../config/seasons'

const activeSeasonYear = ref(getActiveSeasonYear())

export function useSeason() {
  function switchSeason(year: string) {
    const params = new URLSearchParams(window.location.search)
    if (year === ACTIVE_CURRENT_SEASON_YEAR) params.delete('season')
    else params.set('season', year)
    const qs = params.toString()
    window.location.href = window.location.pathname + (qs ? `?${qs}` : '')
  }

  // For routes with no season switcher (Predictor, Match Stats, Season Stats):
  // if a `?season=` override is still in the URL — a stale link, a manual
  // edit, or state left over from a page that does have the switcher — force
  // a hard reload back to the current season. A URL-only cleanup isn't enough
  // here: fixture/stats data is fetched once per full page load keyed off
  // this same query param, so anything short of a reload would leave that
  // data mismatched with the now-current-season URL.
  function enforceCurrentSeason() {
    const params = new URLSearchParams(window.location.search)
    if (!params.has('season')) return
    params.delete('season')
    const qs = params.toString()
    window.location.href = window.location.pathname + (qs ? `?${qs}` : '')
  }

  return {
    activeSeasonYear: readonly(activeSeasonYear),
    seasons: ACTIVE_SEASONS,
    currentSeasonYear: ACTIVE_CURRENT_SEASON_YEAR,
    isCurrentSeason: computed(() => activeSeasonYear.value === ACTIVE_CURRENT_SEASON_YEAR),
    switchSeason,
    enforceCurrentSeason,
  }
}
