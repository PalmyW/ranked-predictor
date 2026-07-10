/**
 * Sanity-check harness for the afltables scraper.
 *
 * Unlike ../statscache/verify-2012.js, there is NO ground-truth overlap year between
 * afltables (1897–1964) and the rest of the system (1965+) to diff against, so this
 * cannot be a cross-source accuracy check. Instead it verifies internal consistency:
 *
 *   1. Every match's recorded quarter scores sum to its recorded total (catches
 *      cumulative-to-per-quarter conversion bugs).
 *   2. A ladder recomputed from the scraped home-and-away results is diffed
 *      POSITIONALLY (by ladder rank, not team name — see below) against afltables'
 *      own published end-of-home-and-away ladder table for that season. This is a
 *      same-source self-consistency check (both numbers ultimately come from
 *      afltables), not independent verification — a mismatch signals a parsing bug,
 *      not necessarily a real-world inaccuracy.
 *   3. A couple of hardcoded, independently-known Grand Final results are spot-checked.
 *   4. Reports the CD player-id match rate, which should be ~0% for this era — a
 *      surprisingly high rate would indicate false-positive name collisions with
 *      modern players.
 *
 * Usage: node data_sources/afltables/sanity-check.js --year=1964
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { load } from 'cheerio'
import { fetchPage } from './lib/http.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=').slice(1).join('=') : undefined
}

// A couple of independently-known results (not sourced from afltables) to
// spot-check the scraper isn't systematically wrong.
const KNOWN_RESULTS = {
  1964: { round: 'Grand Final', home: 'Melbourne', homeScore: 64, away: 'Collingwood', awayScore: 60 },
}

async function checkYear(year) {
  const dataDir = join(ROOT, 'public', 'data', String(year))
  const fixturePath = join(dataDir, 'fixture.json')
  if (!existsSync(fixturePath)) {
    console.error(`No scraped data at ${fixturePath}. Run: npm run scrape-afltables -- --year=${year}`)
    process.exit(1)
  }
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const matches = fixture.matches

  console.log(`═══ ${year} sanity check (${matches.length} matches) ═══\n`)

  // 1. Match-detail quarter-score reconciliation.
  let quarterOk = 0
  const detailsDir = join(dataDir, 'match-details')
  for (const m of matches) {
    const detailsPath = join(detailsDir, `${m.providerId}.json`)
    if (!existsSync(detailsPath)) continue
    const d = JSON.parse(readFileSync(detailsPath, 'utf8'))
    const sumSide = (side) => side.periodScore.reduce((s, p) => s + p.score.totalScore, 0)
    const homeOk = !d.score.homeTeamScore.periodScore.length || sumSide(d.score.homeTeamScore) === d.score.homeTeamScore.matchScore.totalScore
    const awayOk = !d.score.awayTeamScore.periodScore.length || sumSide(d.score.awayTeamScore) === d.score.awayTeamScore.matchScore.totalScore
    if (homeOk && awayOk) quarterOk++
    else console.log(`  MISMATCH ${m.providerId}: quarter scores don't sum to total`)
  }
  console.log(`Quarter-score reconciliation: ${quarterOk}/${matches.length} OK`)

  // 2. Ladder cross-check (positional, not by team name — see file header).
  const haMatches = matches.filter((m) => /^Round\s+\d+/.test(m.round.name))
  const standings = new Map()
  for (const m of haMatches) {
    for (const side of ['home', 'away']) {
      const id = m[side].team.providerId
      if (!standings.has(id)) standings.set(id, { played: 0, wins: 0, draws: 0, losses: 0, for: 0, against: 0 })
    }
    const h = standings.get(m.home.team.providerId)
    const a = standings.get(m.away.team.providerId)
    h.played++; a.played++
    h.for += m.home.score.totalScore; h.against += m.away.score.totalScore
    a.for += m.away.score.totalScore; a.against += m.home.score.totalScore
    if (m.home.score.totalScore > m.away.score.totalScore) h.wins++
    else if (m.home.score.totalScore < m.away.score.totalScore) a.wins++
    else { h.draws++; a.draws++ }
  }
  const computed = [...standings.values()]
    .map((s) => ({ ...s, points: s.wins * 4 + s.draws * 2, pct: s.against ? (s.for / s.against) * 100 : 0 }))
    .sort((x, y) => y.points - x.points || y.pct - x.pct)

  const maxRound = Math.max(...haMatches.map((m) => m.round.roundNumber))
  const seasonHtml = await fetchPage(`seas/${year}.html`)
  const publishedLadder = parseFinalLadder(seasonHtml, maxRound)

  if (!publishedLadder) {
    console.log(`Ladder cross-check: could not find "Rd ${maxRound} Ladder" on the season page — skipped`)
  } else if (publishedLadder.length !== computed.length) {
    console.log(`Ladder cross-check: team-count mismatch (computed ${computed.length}, published ${publishedLadder.length})`)
  } else {
    let ladderOk = 0
    for (let i = 0; i < computed.length; i++) {
      const c = computed[i]
      const p = publishedLadder[i]
      const pctOk = Math.abs(c.pct - p.pct) < 0.15 // rounding tolerance
      const ok = c.played === p.played && pctOk
      if (ok) ladderOk++
      else console.log(`  Ladder rank ${i + 1}: computed played=${c.played} pct=${c.pct.toFixed(1)} vs published played=${p.played} pct=${p.pct}`)
    }
    console.log(`Ladder cross-check (Rd ${maxRound}, positional): ${ladderOk}/${computed.length} ranks match`)
  }

  // 3. Known-result spot-check.
  const known = KNOWN_RESULTS[year]
  if (known) {
    const gf = matches.find((m) => m.round.name === known.round)
    if (!gf) {
      console.log(`Known-result check: no "${known.round}" found`)
    } else {
      const homeMatches = gf.home.team.name === known.home && gf.home.score.totalScore === known.homeScore
      const awayMatches = gf.away.team.name === known.away && gf.away.score.totalScore === known.awayScore
      console.log(
        `Known-result check (${known.round}): ${homeMatches && awayMatches ? 'PASS' : 'FAIL'} ` +
        `(scraped: ${gf.home.team.name} ${gf.home.score.totalScore} v ${gf.away.team.name} ${gf.away.score.totalScore})`,
      )
    }
  } else {
    console.log('Known-result check: no hardcoded result for this year — skipped')
  }

  // 4. CD player-id match rate (expect ~0%).
  const idMapPath = join(ROOT, 'data_sources', 'afltables', 'id-map.json')
  if (existsSync(idMapPath)) {
    const idMap = JSON.parse(readFileSync(idMapPath, 'utf8'))
    const records = Object.values(idMap.players ?? {})
    const matchedCount = records.filter((r) => r.matched).length
    const rate = records.length ? (matchedCount / records.length) * 100 : 0
    console.log(`CD player-id match rate: ${matchedCount}/${records.length} (${rate.toFixed(1)}%) — expect ~0% for this era`)
    if (rate > 5) console.log('  ⚠ Unexpectedly high — check for false-positive name collisions with modern players.')
  }
}

/** Parse the `Rd N Ladder` table (2-letter team code, played, points, percentage). */
function parseFinalLadder(html, roundNumber) {
  const $ = load(html)
  let rows = null
  $('table').each((_, table) => {
    const $t = $(table)
    const header = $t.find('tr').first().find('td').first().text().trim()
    if (header === `Rd ${roundNumber} Ladder`) {
      rows = []
      $t.find('tr').slice(1).each((_, tr) => {
        const tds = $(tr).find('td')
        rows.push({
          code: $(tds[0]).text().trim(),
          played: Number($(tds[1]).text().trim()),
          points: Number($(tds[2]).text().trim()),
          pct: Number($(tds[3]).text().trim()),
        })
      })
    }
  })
  return rows ? rows.sort((a, b) => b.points - a.points || b.pct - a.pct) : null
}

async function main() {
  const year = Number(arg('year'))
  if (!year) {
    console.error('Usage: node data_sources/afltables/sanity-check.js --year=YYYY')
    process.exit(1)
  }
  await checkYear(year)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
