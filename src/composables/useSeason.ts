import { readonly, ref } from 'vue'
import { SEASONS, CURRENT_SEASON_YEAR, getActiveSeasonYear } from '../config/seasons'

const activeSeasonYear = ref(getActiveSeasonYear())

export function useSeason() {
  function switchSeason(year: string) {
    const params = new URLSearchParams(window.location.search)
    if (year === CURRENT_SEASON_YEAR) params.delete('season')
    else params.set('season', year)
    const qs = params.toString()
    window.location.href = window.location.pathname + (qs ? `?${qs}` : '')
  }

  return {
    activeSeasonYear: readonly(activeSeasonYear),
    seasons: SEASONS,
    currentSeasonYear: CURRENT_SEASON_YEAR,
    isCurrentSeason: activeSeasonYear.value === CURRENT_SEASON_YEAR,
    switchSeason,
  }
}
