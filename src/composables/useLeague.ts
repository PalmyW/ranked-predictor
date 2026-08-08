import { readonly, ref } from 'vue'
import { LEAGUE, LEAGUE_CONFIG, getActiveLeague, type LeagueKey } from '../config/league'

const activeLeague = ref<LeagueKey>(LEAGUE)

export function useLeague() {
  // Same hard-reload rationale as useSeason.ts's switchSeason/
  // enforceCurrentSeason: fixture/stats data (and, from here on, the team
  // registry and sim constants) are all captured once per page load keyed
  // off this same query param, so anything short of a reload would leave
  // half the app on the old league. `?season` is dropped too — season keys
  // aren't shared across leagues ('2022a'/'2022b' don't exist for AFL, and
  // AFL years before 2017 don't exist for AFLW).
  function switchLeague(league: LeagueKey) {
    const params = new URLSearchParams(window.location.search)
    if (league === 'afl') params.delete('league')
    else params.set('league', league)
    params.delete('season')
    const qs = params.toString()
    window.location.href = window.location.pathname + (qs ? `?${qs}` : '')
  }

  return {
    activeLeague: readonly(activeLeague),
    leagueConfig: LEAGUE_CONFIG,
    switchLeague,
    getActiveLeague,
  }
}
