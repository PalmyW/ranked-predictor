/**
 * Parse an afltables.com season page (`seas/{year}.html`) into a list of match rows.
 *
 * Layout (verified live across 1897–2026): round blocks appear in page order, each
 * preceded by a `<table border=2>` header whose first cell names the round (`Round
 * N`, or a finals name — pre-1931 finals systems vary a lot, e.g. 1897's finals are
 * six round-robin `Semi Final` blocks with no `Grand Final` that year). We do not try
 * to map finals names to a "week number" the way some modern data models do — finals
 * systems changed too many times across this span for that to be reliable. Instead
 * each round block (including empty divider blocks like a bare "Finals" header) just
 * advances a plain sequential `roundNumber` counter; the raw header text is kept
 * verbatim as `roundName`.
 *
 * Each match is a 2-row `<table border=1>`: row 0 = home team, row 1 = away team.
 * Ladder tables and single-row "Bye" tables also use `border=1` but are filtered out
 * by shape (ladder has >2 rows; a bye has exactly 1).
 */

import { load } from 'cheerio'
import { easternOffset, toUtcIso } from '../../statscache/lib/dates.js'

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/**
 * Parse an afltables date/time cell, e.g. "Sat 18-Apr-1964 2:20 PM" (no explicit
 * AEDT/AEST suffix — afltables always prints local Australian Eastern time).
 * Returns a UTC ISO string, or null if unparseable.
 */
export function parseAflTablesDate(text) {
  if (!text) return null
  const m = text.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m) return null
  const day = Number(m[1])
  const month1 = MONTHS[m[2].toLowerCase()]
  const year = Number(m[3])
  if (!month1) return null
  let hour = Number(m[4])
  const minute = Number(m[5])
  const ampm = m[6]
  if (ampm) {
    const isPm = /pm/i.test(ampm)
    if (isPm && hour !== 12) hour += 12
    if (!isPm && hour === 12) hour = 0
  }
  const offset = easternOffset(year, month1, day)
  return toUtcIso(year, month1, day, hour, minute, offset)
}

function stripTags(html) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse the cumulative `<tt>` quarter-score cell (e.g. "2.2  4.6  7.10 10.16")
 * into per-quarter (non-cumulative) {goals, behinds} entries. */
function parseCumulativePeriods(ttText) {
  const tokens = stripTags(ttText).split(' ').filter(Boolean)
  const cumulative = tokens
    .map((t) => {
      const m = t.match(/^(\d+)\.(\d+)$/)
      return m ? { goals: Number(m[1]), behinds: Number(m[2]) } : null
    })
    .filter(Boolean)
  if (!cumulative.length) return null
  const periods = cumulative.map((c, i) => {
    const prev = cumulative[i - 1] ?? { goals: 0, behinds: 0 }
    return { goals: c.goals - prev.goals, behinds: c.behinds - prev.behinds }
  })
  return periods
}

function parseTeamRow($, tr) {
  const $tr = $(tr)
  const tds = $tr.find('td')
  if (tds.length < 4) return null
  const teamLink = $(tds[0]).find('a[href*="_idx.html"]').first()
  if (!teamLink.length) return null
  const slug = teamLink.attr('href').match(/([a-z]+)_idx\.html/i)?.[1] ?? null
  const periods = parseCumulativePeriods($(tds[1]).html())
  const total = Number(stripTags($(tds[2]).html()).replace(/\D/g, '')) || null
  return { slug, name: teamLink.text().trim(), periods, total, lastCellEl: tds[3] }
}

export function parseSeasonPage(html, year) {
  const $ = load(html)
  const matches = []
  let roundNumber = 0
  let roundName = null

  $('table').each((_, table) => {
    const $table = $(table)
    const border = $table.attr('border')

    if (border === '2') {
      const text = $table.find('td').first().text().replace(/\s+/g, ' ').trim()
      if (text) {
        roundNumber++
        roundName = text
      }
      return
    }

    if (border !== '1') return
    const rows = $table.find('tr')
    if (rows.length !== 2) return // skip ladder tables (>2 rows) and bye tables (1 row)

    const home = parseTeamRow($, rows[0])
    const away = parseTeamRow($, rows[1])
    if (!home || !away) return

    // Row 0's trailing cell carries date/attendance/venue; row 1's carries the
    // "Match stats" link (present for both wins and draws).
    const metaText = stripTags($(home.lastCellEl).html())
    const utcStartTime = parseAflTablesDate(metaText)
    const attendance = Number(metaText.match(/Att:\s*([\d,]+)/i)?.[1]?.replace(/,/g, '') ?? '') || null
    const venue = $(home.lastCellEl).find('a[href*="venues/"]').first().text().trim() || null

    const statsHref = $(away.lastCellEl).find('a[href*="stats/games/"]').first().attr('href') ?? null
    const matchId = statsHref ? statsHref.match(/stats\/games\/\d+\/(\w+)\.html/)?.[1] ?? null : null
    if (!matchId) return // no stats page link — shouldn't happen in 1897-1964, skip defensively

    matches.push({
      matchId,
      year,
      roundNumber,
      roundName: roundName ?? 'Round',
      homeSlug: home.slug,
      awaySlug: away.slug,
      homeTotal: home.total,
      awayTotal: away.total,
      homePeriods: home.periods,
      awayPeriods: away.periods,
      venue,
      attendance,
      utcStartTime,
    })
  })

  return { matches }
}
