/**
 * Name + date-of-birth normalization, shared by the player matcher and parsers.
 * The matching key is `normalizedName|isoDob`, stable across team changes.
 */

const MONTHS = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', aug: '08',
  sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
}

/** Lowercase, strip accents/punctuation/whitespace → a compact comparable key. */
export function normalizeName(name) {
  if (!name) return ''
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

/** Footywire DOB ("June 28, 1987") → ISO "1987-06-28", or null. */
export function dobFromFootywire(text) {
  if (!text) return null
  const m = text.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/)
  if (!m) return null
  const mm = MONTHS[m[1].toLowerCase()]
  if (!mm) return null
  return `${m[3]}-${mm}-${String(m[2]).padStart(2, '0')}`
}

/** CD DOB ("13/06/1999", DD/MM/YYYY) → ISO "1999-06-13", or null. */
export function dobFromCd(text) {
  if (!text) return null
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
}

/** ISO "1987-06-28" → CD-style "28/06/1987", or null. */
export function dobToCd(iso) {
  if (!iso) return null
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** Build the canonical player key used for matching + the persistent id-map. */
export function playerKey(name, isoDob) {
  return `${normalizeName(name)}|${isoDob ?? ''}`
}
