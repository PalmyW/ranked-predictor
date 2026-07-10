/**
 * Parse an afltables.com match-stats page (`stats/games/{year}/{matchId}.html`).
 *
 * Structure (verified live across 1897–1964): a header table (round/venue/date/
 * attendance/quarter scores/umpire), then one `<table class="sortable">` per team
 * headed "{Team} Match Statistics" with one row per player (jumper #, permalink,
 * then up to 23 stat columns per the KI/MK/HB/DI/GL/BH/... legend), followed by a
 * "{Team} Player Details" table (career tallies, plus — this is the one row of it
 * this parser reads — a trailing coach row whose "#" cell is the literal letter
 * "C" instead of a jumper number, linking to `../../coaches/{Name}.html` rather
 * than a `players/` permalink).
 *
 * Confirmed by an automated column scan across 1897/1920/1940/1964 samples: **only
 * the GL (goals) column is ever populated** anywhere in this era — every other stat
 * column is blank for every player, every match. Blank cells are left absent (not
 * defaulted to 0) so the aggregator downstream correctly reports them as
 * not-recorded rather than a real zero.
 *
 * The coach row itself is not consistently present across the whole era — spot
 * checks found 0 per team in 1897, 1 in 1910, 2 (both teams) by 1920 onward —
 * afltables simply doesn't have it recorded that far back, not a parsing gap.
 */

import { load } from 'cheerio'

function stripTags(html) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseMeta($) {
  const headerTable = $('table').filter((_, t) => $(t).text().includes('Round:')).first()
  const text = stripTags(headerTable.html())
  const roundName = text.match(/Round:\s*(.*?)\s*Venue:/)?.[1] ?? null
  const venue = headerTable.find('a[href*="venues/"]').first().text().trim() || null
  const dateText = text.match(/Date:\s*(.*?)\s*Attendance:/)?.[1] ?? text.match(/Date:\s*(.*)$/)?.[1] ?? null
  const attendance = Number(text.match(/Attendance:\s*([\d,]+)/i)?.[1]?.replace(/,/g, '') ?? '') || null
  return { roundName, venue, dateText, attendance }
}

/** Extract the two per-team "Match Statistics" player tables (skips "Player
 * Details" tables, which share the same `class="sortable"`). */
function parsePlayerTables($) {
  const teams = []
  $('table.sortable').each((_, table) => {
    const $table = $(table)
    const $headerTh = $table.find('thead th').first()
    const headerText = $headerTh.text().trim()
    const nameMatch = headerText.match(/^(.*?)\s+Match Statistics/)
    if (!nameMatch) return // not a "Match Statistics" table (e.g. "Player Details")
    // The "Game by Game" link (../../teams/{slug}/{year}_gbg.html) carries the same
    // slug used on the season page — use it to align this table to the fixture's
    // home/away by team identity rather than by table order (which does not always
    // match the fixture's home/away order).
    const slug = $headerTh.find('a[href*="/teams/"]').attr('href')?.match(/teams\/([a-z]+)\//)?.[1] ?? null

    const headerCells = $table.find('thead tr').eq(1).find('th')
    const columns = []
    headerCells.each((i, th) => {
      if (i < 2) return // skip "#" and "Player"
      columns.push($(th).text().trim())
    })

    const players = []
    $table.find('tbody tr').each((_, tr) => {
      const tds = $(tr).find('td')
      if (tds.length < 2) return
      const link = $(tds[0]).next().find('a').first()
      if (!link.length) return
      const jumperText = $(tds[0]).text().replace(/&nbsp;/g, '').trim()
      const jumperNumber = jumperText ? Number(jumperText) || null : null
      const stats = {}
      columns.forEach((label, i) => {
        const cellIdx = i + 2
        if (cellIdx >= tds.length) return
        const raw = $(tds[cellIdx]).text().replace(/&nbsp;/g, '').replace('%', '').trim()
        if (raw === '') {
          // GL (goals) is the one column actually tracked per-player in this era —
          // confirmed by reconciling summed player goals against the team's recorded
          // total (see scrape-season.js's sanity check) — so a blank GL cell is a
          // real zero. Every other column is blank for literally every player in
          // every match (confirmed by an automated scan across 1897-1964 samples),
          // i.e. genuinely not recorded at all, so those stay absent, not 0.
          if (label === 'GL') stats[label] = 0
          return
        }
        const num = Number(raw)
        if (Number.isFinite(num)) stats[label] = num
      })
      players.push({
        permalink: link.attr('href'), // e.g. "../../players/G/Graeme_Anderson1.html"
        name: link.text().trim(), // "Surname, Given"
        jumperNumber,
        stats,
      })
    })

    teams.push({ teamName: nameMatch[1].trim(), slug, players })
  })
  return teams.slice(0, 2)
}

/**
 * Extract each team's coach from its "{Team} Player Details" table — the row
 * whose "#" cell is the literal letter "C" (a captain-coach still gets a
 * regular jumper-number row in the Match Statistics table above; this "C" row
 * is the one authoritative coach marker, present once per team when recorded
 * at all). Returns a name→coach map so the caller can align it to the
 * `parsePlayerTables` result by the same team-name string both tables use.
 */
function parsePlayerDetailsTables($) {
  const coachByTeamName = new Map()
  $('table.sortable').each((_, table) => {
    const $table = $(table)
    const headerText = $table.find('thead th').first().text().trim()
    const nameMatch = headerText.match(/^(.*?)\s+Player Details$/)
    if (!nameMatch) return // not a "Player Details" table (e.g. "Match Statistics")

    let coach = null
    // The coach row sits in <tfoot> (alongside an unrelated "Opposition" totals
    // row), not <tbody> where every other row in this table lives.
    $table.find('tbody tr, tfoot tr').each((_, tr) => {
      const tds = $(tr).find('td')
      if (tds.length < 2) return
      const marker = $(tds[0]).text().replace(/&nbsp;/g, '').trim()
      if (marker !== 'C') return
      const link = $(tds[1]).find('a').first()
      if (!link.length) return
      coach = {
        permalink: link.attr('href'), // e.g. "../../coaches/Norm_Smith.html"
        name: link.text().trim(), // "Surname, Given"
      }
    })
    coachByTeamName.set(nameMatch[1].trim(), coach)
  })
  return coachByTeamName
}

export function parseMatchPage(html) {
  const $ = load(html)
  const meta = parseMeta($)
  const teams = parsePlayerTables($)
  const coachByTeamName = parsePlayerDetailsTables($)
  for (const t of teams) t.coach = coachByTeamName.get(t.teamName) ?? null
  return { meta, teams }
}
