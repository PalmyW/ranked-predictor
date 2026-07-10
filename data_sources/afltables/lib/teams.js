/**
 * afltables.com team-slug → canonical team identity.
 *
 * Only 12 distinct team slugs appear across the VFL's 1897–1964 span (confirmed by
 * sampling seasons across the whole range). All 12 already have a canonical identity
 * in the existing footywire scraper's team table (`../../statscache/lib/teams.js`) —
 * continuing clubs share the same ChampionData `CD_T*` id used by the 2012+ data,
 * and already-defunct clubs (Fitzroy, University) reuse the stable `PW_T9xx` ids
 * that table (and `src/composables/useAFLData.ts`'s `HISTORICAL_TEAMS`) already
 * define. No new team ids are minted by this scraper.
 */

import { TEAM_TABLE as FW } from '../../statscache/lib/teams.js'

// afltables slug → same identity object footywire's table already resolves to.
export const TEAM_TABLE = {
  carlton: FW['th-carlton-blues'],
  collingwood: FW['th-collingwood-magpies'],
  essendon: FW['th-essendon-bombers'],
  fitzroy: FW['th-fitzroy-lions'],
  geelong: FW['th-geelong-cats'],
  melbourne: FW['th-melbourne-demons'],
  richmond: FW['th-richmond-tigers'],
  stkilda: FW['th-st-kilda-saints'],
  swans: FW['th-south-melbourne'], // South Melbourne, same club as Sydney Swans → CD_T160
  kangaroos: FW['th-kangaroos'], // North Melbourne → CD_T100
  bullldogs: FW['th-footscray'], // sic (afltables' own slug spelling) → Western Bulldogs, CD_T140
  hawthorn: FW['th-hawthorn-hawks'],
  university: FW['th-university'], // defunct 1908-1914, PW_T903 — already reserved
}

/** Derive a display name from an unknown slug (defensive fallback only — all 12
 * slugs above are known in advance, so this should never actually trigger). */
export function nameFromSlug(slug) {
  return slug
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
