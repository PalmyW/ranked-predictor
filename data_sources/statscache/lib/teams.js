/**
 * Footywire team-slug → canonical team identity.
 *
 * Current clubs map to their existing ChampionData provider id + the internal
 * numeric id used in src/composables/useAFLData.ts, so scraped historical seasons
 * line up with the 2012+ data. Continuing clubs that footywire lists under a
 * historical name (Footscray, South Melbourne, Kangaroos) alias onto the same
 * club. Defunct clubs (Fitzroy, Brisbane Bears, University) get stable PW_ ids.
 *
 * Unknown slugs are minted on the fly by the id resolver and stored in id-map.json.
 */

// providerId, numericId (internal), name, abbreviation, nickname
export const TEAM_TABLE = {
  // ── Current 18 (ids/names mirror the official CD data) ──────────────────────
  'th-adelaide-crows':              { providerId: 'CD_T10',   numericId: 1,  name: 'Adelaide Crows',    abbreviation: 'ADEL', nickname: 'Crows' },
  'th-brisbane-lions':              { providerId: 'CD_T20',   numericId: 2,  name: 'Brisbane Lions',    abbreviation: 'BL',   nickname: 'Lions' },
  'th-carlton-blues':               { providerId: 'CD_T30',   numericId: 5,  name: 'Carlton',           abbreviation: 'CARL', nickname: 'Blues' },
  'th-collingwood-magpies':         { providerId: 'CD_T40',   numericId: 3,  name: 'Collingwood',       abbreviation: 'COLL', nickname: 'Magpies' },
  'th-essendon-bombers':            { providerId: 'CD_T50',   numericId: 12, name: 'Essendon',          abbreviation: 'ESS',  nickname: 'Bombers' },
  'th-fremantle-dockers':           { providerId: 'CD_T60',   numericId: 14, name: 'Fremantle',         abbreviation: 'FRE',  nickname: 'Dockers' },
  'th-geelong-cats':                { providerId: 'CD_T70',   numericId: 10, name: 'Geelong Cats',      abbreviation: 'GEEL', nickname: 'Cats' },
  'th-gold-coast-suns':             { providerId: 'CD_T1000', numericId: 4,  name: 'Gold Coast SUNS',   abbreviation: 'GCS',  nickname: 'SUNS' },
  'th-greater-western-sydney-giants': { providerId: 'CD_T1010', numericId: 15, name: 'GWS GIANTS',     abbreviation: 'GWS',  nickname: 'GIANTS' },
  'th-hawthorn-hawks':              { providerId: 'CD_T80',   numericId: 9,  name: 'Hawthorn',          abbreviation: 'HAW',  nickname: 'Hawks' },
  'th-melbourne-demons':            { providerId: 'CD_T90',   numericId: 17, name: 'Melbourne',         abbreviation: 'MELB', nickname: 'Demons' },
  'th-kangaroos':                   { providerId: 'CD_T100',  numericId: 6,  name: 'North Melbourne',   abbreviation: 'NMFC', nickname: 'Kangaroos' },
  'th-north-melbourne-kangaroos':   { providerId: 'CD_T100',  numericId: 6,  name: 'North Melbourne',   abbreviation: 'NMFC', nickname: 'Kangaroos' },
  'th-north-melbourne':             { providerId: 'CD_T100',  numericId: 6,  name: 'North Melbourne',   abbreviation: 'NMFC', nickname: 'Kangaroos' },
  'th-port-adelaide-power':         { providerId: 'CD_T110',  numericId: 7,  name: 'Port Adelaide',     abbreviation: 'PORT', nickname: 'Power' },
  'th-richmond-tigers':             { providerId: 'CD_T120',  numericId: 16, name: 'Richmond',          abbreviation: 'RICH', nickname: 'Tigers' },
  'th-st-kilda-saints':             { providerId: 'CD_T130',  numericId: 11, name: 'St Kilda',          abbreviation: 'STK',  nickname: 'Saints' },
  'th-sydney-swans':                { providerId: 'CD_T160',  numericId: 13, name: 'Sydney Swans',      abbreviation: 'SYD',  nickname: 'Swans' },
  'th-west-coast-eagles':           { providerId: 'CD_T150',  numericId: 18, name: 'West Coast Eagles', abbreviation: 'WCE',  nickname: 'Eagles' },
  'th-western-bulldogs':            { providerId: 'CD_T140',  numericId: 8,  name: 'Western Bulldogs',  abbreviation: 'WB',   nickname: 'Bulldogs' },

  // ── Continuing clubs under historical footywire names (same club) ───────────
  'th-footscray':                   { providerId: 'CD_T140',  numericId: 8,  name: 'Western Bulldogs',  abbreviation: 'WB',   nickname: 'Bulldogs' },
  'th-south-melbourne':             { providerId: 'CD_T160',  numericId: 13, name: 'Sydney Swans',      abbreviation: 'SYD',  nickname: 'Swans' },
  // Footywire's slug for pre-1982 South Melbourne (relocated → Sydney Swans, same club).
  'th-south-melbourne-swans':       { providerId: 'CD_T160',  numericId: 13, name: 'Sydney Swans',      abbreviation: 'SYD',  nickname: 'Swans' },

  // ── Defunct clubs (stable PW_ ids; not in the current predictor TEAMS list) ──
  'th-fitzroy-lions':               { providerId: 'PW_T901',  numericId: 9001, name: 'Fitzroy',         abbreviation: 'FITZ', nickname: 'Lions' },
  'th-fitzroy':                     { providerId: 'PW_T901',  numericId: 9001, name: 'Fitzroy',         abbreviation: 'FITZ', nickname: 'Lions' },
  'th-brisbane-bears':              { providerId: 'PW_T902',  numericId: 9002, name: 'Brisbane Bears',   abbreviation: 'BB',   nickname: 'Bears' },
  'th-university':                  { providerId: 'PW_T903',  numericId: 9003, name: 'University',       abbreviation: 'UNI',  nickname: 'Students' },
}

/** Derive a display name from an unknown th- slug (fallback only). */
export function nameFromSlug(slug) {
  return slug
    .replace(/^th-/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
