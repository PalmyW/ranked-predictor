/**
 * Ratings source team name → CD_T id.
 *
 * The ratings source only covers 2012+ (the same span the official ChampionData
 * feed already covers in full), so this is a fixed 18-team table — no defunct
 * clubs, no historical renames, nothing to mint. Keyed by the source's exact
 * `Team`/`HomeTeam`/`AwayTeam` string (not the abbreviation, which is
 * inconsistently shortened — "St K", "NM", "GC" — and not worth the ambiguity).
 */
export const TEAM_NAME_TO_CD = {
  Adelaide: 'CD_T10',
  Brisbane: 'CD_T20',
  Carlton: 'CD_T30',
  Collingwood: 'CD_T40',
  Essendon: 'CD_T50',
  Fremantle: 'CD_T60',
  Geelong: 'CD_T70',
  Hawthorn: 'CD_T80',
  Melbourne: 'CD_T90',
  'North Melbourne': 'CD_T100',
  'Port Adelaide': 'CD_T110',
  Richmond: 'CD_T120',
  'St Kilda': 'CD_T130',
  'Western Bulldogs': 'CD_T140',
  'West Coast': 'CD_T150',
  Sydney: 'CD_T160',
  'Gold Coast': 'CD_T1000',
  'Greater Western Sydney': 'CD_T1010',
}

export function cdTeamIdForRatingsName(name) {
  return TEAM_NAME_TO_CD[name] ?? null
}
