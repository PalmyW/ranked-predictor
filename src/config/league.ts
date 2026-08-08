// Active-league resolution, mirroring seasons.ts's ?season= pattern:
// resolved once from the URL at module load (switching leagues is a hard
// reload — see useLeague.ts for why), so any module capturing LEAGUE at its
// own load time (same idiom as `const SEASON = getActiveSeasonYear()`
// elsewhere) stays consistent for the lifetime of the page.
export type LeagueKey = 'afl' | 'aflw'

export interface SimConfig {
  avgScore: number
  avgWinMargin: number
  marginSigma: number
  midSigma: number
}

export interface LeagueConfig {
  key: LeagueKey
  label: string
  // '' for AFL (data lives at the existing public/data/{year}/ root),
  // 'aflw/' for AFLW (public/data/aflw/{year}/) — see scripts/lib/league.js's
  // matching `subdir` on the fetch-script side.
  dataPrefix: string
  // Appended to AFL's existing (year-baked) localStorage keys so AFLW state
  // never collides with or clobbers AFL state. '' for AFL == zero migration
  // for existing users' saved rankings/preferences.
  lsSuffix: string
  sim: SimConfig
}

const AFL_CONFIG: LeagueConfig = {
  key: 'afl',
  label: 'AFL',
  dataPrefix: '',
  lsSuffix: '',
  sim: { avgScore: 85, avgWinMargin: 32, marginSigma: 36, midSigma: 15 },
}

const AFLW_CONFIG: LeagueConfig = {
  key: 'aflw',
  label: 'AFLW',
  dataPrefix: 'aflw/',
  lsSuffix: '-aflw',
  // Rough initial guesses (AFLW games are shorter and lower-scoring than
  // men's AFL) — not yet calibrated against real AFLW score history.
  // TODO: recalibrate once a full AFLW backfill is in.
  sim: { avgScore: 45, avgWinMargin: 24, marginSigma: 20, midSigma: 8 },
}

export function getActiveLeague(): LeagueKey {
  if (typeof window === 'undefined') return 'afl'
  const l = new URLSearchParams(window.location.search).get('league')
  return l === 'aflw' ? 'aflw' : 'afl'
}

export const LEAGUE: LeagueKey = getActiveLeague()
export const LEAGUE_CONFIG: LeagueConfig = LEAGUE === 'aflw' ? AFLW_CONFIG : AFL_CONFIG

// Shared base for every runtime data fetch (fixture/stats/team-stats JSON).
export const DATA_BASE = `${import.meta.env.BASE_URL}data/${LEAGUE_CONFIG.dataPrefix}`
