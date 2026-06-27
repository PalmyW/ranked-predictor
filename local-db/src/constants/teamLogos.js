// Team provider id → club logo (the same SVG sprite the pages app uses, copied to
// local-db/public/icons.svg) plus name/abbreviation for tooltips and fallbacks.
//
// Used to render a club logo wherever a team id (CD_T… / PW_T…) would otherwise be
// shown in a table or chart. Self-contained on purpose — no dependency on the live
// /api/teams data — so it works in any component including raw query results.

export const TEAMS = {
  CD_T10:   { iconId: 'icn-aflc-adel', name: 'Adelaide Crows',    abbr: 'ADEL' },
  CD_T20:   { iconId: 'icn-aflc-bl',   name: 'Brisbane Lions',    abbr: 'BL' },
  CD_T30:   { iconId: 'icn-aflc-carl', name: 'Carlton',           abbr: 'CARL' },
  CD_T40:   { iconId: 'icn-aflc-coll', name: 'Collingwood',       abbr: 'COLL' },
  CD_T50:   { iconId: 'icn-aflc-ess',  name: 'Essendon',          abbr: 'ESS' },
  CD_T60:   { iconId: 'icn-aflc-fre',  name: 'Fremantle',         abbr: 'FRE' },
  CD_T70:   { iconId: 'icn-aflc-geel', name: 'Geelong Cats',      abbr: 'GEEL' },
  CD_T1000: { iconId: 'icn-aflc-gcs',  name: 'Gold Coast SUNS',   abbr: 'GCS' },
  CD_T1010: { iconId: 'icn-aflc-gws',  name: 'GWS GIANTS',        abbr: 'GWS' },
  CD_T80:   { iconId: 'icn-aflc-haw',  name: 'Hawthorn',          abbr: 'HAW' },
  CD_T90:   { iconId: 'icn-aflc-melb', name: 'Melbourne',         abbr: 'MELB' },
  CD_T100:  { iconId: 'icn-aflc-nmfc', name: 'North Melbourne',   abbr: 'NMFC' },
  CD_T110:  { iconId: 'icn-aflc-port', name: 'Port Adelaide',     abbr: 'PORT' },
  CD_T120:  { iconId: 'icn-aflc-rich', name: 'Richmond',          abbr: 'RICH' },
  CD_T130:  { iconId: 'icn-aflc-stk',  name: 'St Kilda',          abbr: 'STK' },
  CD_T160:  { iconId: 'icn-aflc-syd',  name: 'Sydney Swans',      abbr: 'SYD' },
  CD_T150:  { iconId: 'icn-aflc-wce',  name: 'West Coast Eagles', abbr: 'WCE' },
  CD_T140:  { iconId: 'icn-aflc-wb',   name: 'Western Bulldogs',  abbr: 'WB' },
  // Defunct/scraped clubs have no logo in the sprite — fall back to abbreviation.
  PW_T901:  { name: 'Fitzroy',        abbr: 'FITZ' },
  PW_T902:  { name: 'Brisbane Bears', abbr: 'BB' },
  PW_T903:  { name: 'University',     abbr: 'UNI' },
}

const TEAM_ID_RE = /^(?:CD|PW)_T\d+$/

// Normalized team-name → entry, for rendering crests on team-name columns too.
const NAME_INDEX = Object.fromEntries(
  Object.values(TEAMS).map((t) => [t.name.toLowerCase(), t]),
)

/** True when a value is a team provider id (e.g. "CD_T10", "PW_T901"). */
export function isTeamId(v) {
  return typeof v === 'string' && TEAM_ID_RE.test(v)
}

/** The team entry for an exact (case-insensitive) team name, or null. */
export function teamByName(v) {
  return (typeof v === 'string' && NAME_INDEX[v.toLowerCase()]) || null
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/**
 * Inline HTML for a team's logo, suitable for v-html. Renders the club crest from
 * the sprite when available; otherwise a small abbreviation chip. Falls back to the
 * raw id for unknown teams so nothing is ever lost.
 */
export function teamLogoHtml(id, { size = 24 } = {}) {
  const team = TEAMS[id]
  const title = escapeAttr(team?.name ?? id)
  if (team?.iconId) {
    return (
      `<span class="team-logo" title="${title}">` +
      `<svg width="${size}" height="${size}" style="display:inline-block;vertical-align:middle" role="img" aria-label="${title}">` +
      `<title>${title}</title><use href="/icons.svg#${team.iconId}"></use></svg>` +
      `</span>`
    )
  }
  const label = escapeAttr(team?.abbr ?? id)
  return `<span class="team-logo team-logo--text" title="${title}">${label}</span>`
}

/** Inline crest SVG for a known team entry (no wrapper), or '' if no logo. */
function crestSvg(team, size) {
  if (!team?.iconId) return ''
  const title = escapeAttr(team.name)
  return (
    `<svg width="${size}" height="${size}" style="display:inline-block;vertical-align:middle;margin-right:6px;flex:none" role="img" aria-label="${title}">` +
    `<use href="/icons.svg#${team.iconId}"></use></svg>`
  )
}

/**
 * Inline HTML for a team-name cell: the club crest followed by the name. Returns
 * '' when the value isn't a recognised team name (caller falls back to default).
 */
export function teamNameHtml(value, { size = 20 } = {}) {
  const team = teamByName(value)
  if (!team) return ''
  return `<span class="team-name" style="display:inline-flex;align-items:center">${crestSvg(team, size)}${escapeAttr(value)}</span>`
}
