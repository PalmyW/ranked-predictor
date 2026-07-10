/**
 * Parse a footywire match statistics page (basic + optional advanced view).
 *
 * Returns:
 *   - meta: { roundName, venue, attendance, utcStartTime }
 *   - periods: { home: [{goals,behinds}], away: [...] }   // per-quarter (non-cumulative)
 *   - totals: { home: {goals,behinds,totalScore}, away: {...} }
 *   - teams: [home, away] each → { players: [{ slug, name, stats: { LABEL: number } }] }
 *   - coaches: [home, away] each → { slug, name } (footywire `cp-{slug}--{id}` link)
 *
 * Player columns are read from the live header legend (labels), not by fixed
 * position, so the parser tolerates the column-set differences between eras.
 * The home team's table appears first on the page, the away team's second.
 */

import { load } from 'cheerio'
import { parseFullDate } from './dates.js'

/** Extract the two per-team player stat tables from a stats page. */
function parsePlayerTables(html) {
  const $ = load(html)
  const teams = [] // each: { columns: [...], players: [...] }
  let cur = null

  $('tr').each((_, tr) => {
    const $tr = $(tr)
    const cells = $tr.children('td, th')
    const firstText = cells.first().text().replace(/\s+/g, ' ').trim()

    if (firstText === 'Player') {
      const columns = []
      cells.each((i, c) => {
        if (i === 0) return
        const label = $(c).text().replace(/\s+/g, ' ').trim()
        if (label) columns.push(label)
      })
      cur = { columns, players: [] }
      teams.push(cur)
      return
    }

    if (!cur) return
    const link = cells.first().find('a[href^="pp-"]').first()
    if (!link.length) return
    const statCells = $tr.find('td.statdata')
    // Real player rows have exactly one statdata cell per header column. Footywire
    // embeds hidden summary/duplicate tables whose rows carry far more statdata
    // cells (e.g. 22×17); reject anything that isn't an exact column-count match.
    if (statCells.length !== cur.columns.length) return

    const stats = {}
    statCells.each((i, td) => {
      const label = cur.columns[i]
      if (!label) return
      const raw = $(td).text().trim().replace('%', '')
      const num = Number(raw)
      stats[label] = Number.isFinite(num) ? num : 0
    })

    cur.players.push({
      slug: link.attr('href'),
      name: (link.attr('title') || link.text()).trim(),
      stats,
    })
  })

  // Keep only the first two tables that actually contain players (home, away).
  return teams.filter((t) => t.players.length > 0).slice(0, 2)
}

function parseMeta(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')

  const summary = text.match(
    /(Round\s+\d+|[A-Za-z]+\s+Final|Grand Final|Elimination Final|Qualifying Final|Semi Final|Preliminary Final)\s*,\s*([^,]+?)\s*,\s*Attendance:\s*([\d,]+)/i,
  )
  const dateMatch = text.match(
    /[A-Za-z]+day,\s*\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4},\s*\d{1,2}:\d{2}\s*[AP]M\s*AE[DS]T/i,
  )

  return {
    roundName: summary ? summary[1].trim() : null,
    venue: summary ? summary[2].trim() : null,
    attendance: summary ? Number(summary[3].replace(/,/g, '')) : null,
    utcStartTime: dateMatch ? parseFullDate(dateMatch[0]) : null,
  }
}

/** Parse the per-quarter scoring breakdown (non-cumulative goals/behinds). */
function parsePeriods(html) {
  const i = html.indexOf('Quarter by Quarter')
  if (i < 0) return null
  const segment = html
    .slice(i, i + 8000)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')

  const home = []
  const away = []
  const re = /(First|Second|Third|Final)\s+Quarter\b.*?(\d+)\.(\d+)\s+\d+\s+Score\s+(\d+)\.(\d+)\s+\d+/gi
  let m
  while ((m = re.exec(segment)) !== null) {
    home.push({ goals: Number(m[2]), behinds: Number(m[3]) })
    away.push({ goals: Number(m[4]), behinds: Number(m[5]) })
    if (home.length === 4) break
  }
  if (!home.length) return null
  return { home, away }
}

function sumScore(periods) {
  const goals = periods.reduce((s, p) => s + p.goals, 0)
  const behinds = periods.reduce((s, p) => s + p.behinds, 0)
  return { goals, behinds, totalScore: goals * 6 + behinds }
}

/**
 * @param {string} basicHtml  ft_match_statistics?mid=NNNN
 * @param {string|null} advHtml  ft_match_statistics?mid=NNNN&advv=Y (optional)
 */
export function parseMatchPage(basicHtml, advHtml) {
  const meta = parseMeta(basicHtml)
  const periodData = parsePeriods(basicHtml)

  const basicTeams = parsePlayerTables(basicHtml)
  const advTeams = advHtml ? parsePlayerTables(advHtml) : []

  // Merge advanced stats into basic players, matched by slug within each team.
  const teams = basicTeams.map((team, ti) => {
    const adv = advTeams[ti]
    const advBySlug = new Map((adv?.players ?? []).map((p) => [p.slug, p.stats]))
    return {
      players: team.players.map((p) => ({
        slug: p.slug,
        name: p.name,
        stats: { ...p.stats, ...(advBySlug.get(p.slug) ?? {}) },
      })),
    }
  })

  const totals = periodData
    ? { home: sumScore(periodData.home), away: sumScore(periodData.away) }
    : null

  // The two team `th-` slugs in document order match the player-table order. The
  // stats page's home/away order does NOT always match the fixture's, so the caller
  // aligns these to the fixture by team identity (not by position).
  const teamSlugs = parseTeamSlugs(basicHtml)

  return {
    meta,
    periods: periodData,
    totals,
    teams, // table order — element i belongs to teamSlugs[i]
    teamSlugs, // [slug0, slug1] — slug i ↔ teams[i] ↔ totals/periods (home=0, away=1)
    coaches: parseCoaches(basicHtml), // [coach0, coach1] — same order as teamSlugs
  }
}

/** The two club `th-` slugs, in the same order the player tables appear. */
function parseTeamSlugs(html) {
  const $ = load(html)
  const slugs = []
  $('a[href^="th-"]').each((_, a) => {
    const h = $(a).attr('href')
    if (h && !slugs.includes(h)) slugs.push(h)
  })
  return slugs.slice(0, 2)
}

/**
 * The two teams' coaches ("Coach: <a href="cp-{slug}--{id}">{Name}</a>", one per
 * team box), in the same document order as `teamSlugs` / `teams` — the `cp-`
 * link only ever appears in this one spot on a match page (no nav-menu noise).
 */
function parseCoaches(html) {
  const $ = load(html)
  const coaches = []
  $('a[href^="cp-"]').each((_, a) => {
    const $a = $(a)
    coaches.push({ slug: $a.attr('href'), name: ($a.attr('title') || $a.text()).trim() })
  })
  return coaches.slice(0, 2)
}
