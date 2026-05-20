export interface SeasonConfig {
  year: string
  compSeasonId: number
}

export const SEASON_REGISTRY: Record<string, number> = {
  '2012': 2,
  '2013': 4,
  '2014': 5,
  '2015': 7,
  '2016': 9,
  '2017': 11,
  '2018': 14,
  '2019': 18,
  '2020': 20,
  '2021': 34,
  '2022': 43,
  '2023': 52,
  '2024': 62,
  '2025': 73,
  '2026': 85,
}

export const CURRENT_SEASON_YEAR = '2026'

export const SEASONS: SeasonConfig[] = [
  { year: '2012', compSeasonId: 2 },
  { year: '2013', compSeasonId: 4 },
  { year: '2014', compSeasonId: 5 },
  { year: '2015', compSeasonId: 7 },
  { year: '2016', compSeasonId: 9 },
  { year: '2017', compSeasonId: 11 },
  { year: '2018', compSeasonId: 14 },
  { year: '2019', compSeasonId: 18 },
  { year: '2020', compSeasonId: 20 },
  { year: '2021', compSeasonId: 34 },
  { year: '2022', compSeasonId: 43 },
  { year: '2023', compSeasonId: 52 },
  { year: '2024', compSeasonId: 62 },
  { year: '2025', compSeasonId: 73 },
  { year: '2026', compSeasonId: 85 },
]

export function getActiveSeasonYear(): string {
  if (typeof window === 'undefined') return CURRENT_SEASON_YEAR
  const s = new URLSearchParams(window.location.search).get('season')
  return s && SEASONS.some((x) => x.year === s) ? s : CURRENT_SEASON_YEAR
}
