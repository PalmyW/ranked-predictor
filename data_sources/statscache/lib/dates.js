/**
 * Date parsing for footywire pages → UTC ISO timestamps matching the CD format
 * (e.g. "2012-03-24T08:20:00.000+0000").
 *
 * Footywire prints local Australian Eastern times. We convert to UTC using the
 * AEST/AEDT rule (AEDT = UTC+11 during DST: first Sunday of October → first
 * Sunday of April; otherwise AEST = UTC+10).
 */

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
}

function firstSundayUTC(year, month1) {
  const d = new Date(Date.UTC(year, month1 - 1, 1))
  const dow = d.getUTCDay()
  return 1 + ((7 - dow) % 7)
}

/** Returns 11 (AEDT) or 10 (AEST) for a given Australian Eastern calendar date. */
export function easternOffset(year, month1, day) {
  const octStart = firstSundayUTC(year, 10)
  const aprEnd = firstSundayUTC(year, 4)
  const inDst =
    month1 > 10 || month1 < 4 ||
    (month1 === 10 && day >= octStart) ||
    (month1 === 4 && day < aprEnd)
  return inDst ? 11 : 10
}

export function toUtcIso(year, month1, day, hour, minute, offsetHours) {
  const localMs = Date.UTC(year, month1 - 1, day, hour, minute, 0)
  const utc = new Date(localMs - offsetHours * 3600_000)
  return utc.toISOString().replace('Z', '+0000')
}

function hour24(h, ampm) {
  h = Number(h)
  if (!ampm) return h
  const isPm = /pm/i.test(ampm)
  if (isPm && h !== 12) h += 12
  if (!isPm && h === 12) h = 0
  return h
}

/**
 * Parse a full footywire match-page date, e.g.
 * "Saturday, 24th March 2012, 7:20 PM AEDT". Returns UTC ISO or null.
 */
export function parseFullDate(text) {
  if (!text) return null
  const m = text.match(
    /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4}),?\s*(?:(\d{1,2}):(\d{2})\s*(AM|PM)?)?\s*(AEDT|AEST)?/i,
  )
  if (!m) return null
  const day = Number(m[1])
  const month1 = MONTHS[m[2].toLowerCase()]
  const year = Number(m[3])
  if (!month1) return null
  const hour = m[4] != null ? hour24(m[4], m[6]) : 0
  const minute = m[5] != null ? Number(m[5]) : 0
  const offset = m[7] ? (m[7].toUpperCase() === 'AEDT' ? 11 : 10) : easternOffset(year, month1, day)
  return toUtcIso(year, month1, day, hour, minute, offset)
}

/**
 * Parse a footywire fixture-list date, e.g. "Sat 24 Mar 7:20pm", with the season
 * year supplied separately. Returns UTC ISO or null.
 */
export function parseShortDate(text, year) {
  if (!text) return null
  const m = text.match(/(\d{1,2})\s+([A-Za-z]{3,})\.?\s*(?:(\d{1,2}):(\d{2})\s*(am|pm)?)?/i)
  if (!m) return null
  const day = Number(m[1])
  const month1 = MONTHS[m[2].toLowerCase().slice(0, 3)]
  if (!month1) return null
  const hour = m[3] != null ? hour24(m[3], m[5]) : 0
  const minute = m[4] != null ? Number(m[4]) : 0
  const offset = easternOffset(year, month1, day)
  return toUtcIso(year, month1, day, hour, minute, offset)
}
