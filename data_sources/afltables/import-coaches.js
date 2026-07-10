/**
 * Enrich existing public/data/{year}/match-details/ files (1897–1964) with each
 * match's head coaches, scraped from afltables.com match-stats pages — the
 * pre-1965 counterpart to ../coach-attendance/ (which covers 1965–present via
 * footywire). Also opportunistically backfills `score.attendance` wherever the
 * page has it and the existing file doesn't — though in practice attendance is
 * already populated for nearly every match by ../afltables/scrape-season.js
 * itself (see lib/parse-match.js's `parseMeta`), so this is a defensive top-up
 * rather than this script's main job.
 *
 * No match/team discovery needed: every file in this era already *is* afltables
 * data (`AT_M{matchId}.json`), so the matchId — and the page URL it fetches,
 * `stats/games/{year}/{matchId}.html` — is read straight off the filename, the
 * same as ../coach-attendance/'s 1965–2011 case.
 *
 * Coach → player id resolution has no independent verification signal (afltables'
 * coach entries carry no DOB) — same best-effort NAME + playing-career-plausibility
 * heuristic as ../coach-attendance/'s resolveCoach, against the same all-provider,
 * all-era player index (../coach-attendance/lib/player-index.js). A coach who
 * can't be matched gets a freshly minted `AT_I` id (this era's own id-map/counter
 * — see lib/ids.js — kept separate from every other source's, same as the base
 * afltables player scraper already does).
 *
 * Usage:
 *   node data_sources/afltables/import-coaches.js --year=1955
 *   node data_sources/afltables/import-coaches.js --from=1897 --to=1964
 *   node data_sources/afltables/import-coaches.js                    # backfill: every
 *                                                                    # year 1897–1964
 *   node data_sources/afltables/import-coaches.js --force            # re-resolve even
 *                                                                    # already-enriched matches
 *   node data_sources/afltables/import-coaches.js --year=1955 --limit=5   # debugging
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { fetchPage } from './lib/http.js'
import { parseMatchPage } from './lib/parse-match.js'
import { TEAM_TABLE } from './lib/teams.js'
import { createIdResolver } from './lib/ids.js'
import { buildPlayerIndex } from '../coach-attendance/lib/player-index.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PLAYERS_DIR = join(ROOT, 'public', 'data', 'players')
const FIRST_YEAR = 1897
const LAST_YEAR = 1964

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=').slice(1).join('=') : undefined
}
const hasFlag = (name) => process.argv.includes(`--${name}`)

/** afltables names are "Surname, Given" — flip to given/surname order so the
 *  normalized full name matches the player index's "given surname" key order
 *  (team-stats files store `${givenName} ${surname}`). */
function splitAfltablesName(name) {
  const [surnamePart, givenPart] = (name || '').split(',').map((s) => s.trim())
  return { givenName: givenPart ?? '', surname: surnamePart ?? '' }
}

const slugToProviderId = (slug) => TEAM_TABLE[slug]?.providerId ?? null

function hasCoaches(detailsPath) {
  if (!existsSync(detailsPath)) return false
  try {
    return !!JSON.parse(readFileSync(detailsPath, 'utf8')).coaches
  } catch {
    return false
  }
}

/**
 * Known-identity overrides for coaches the automatic matcher can't confidently
 * resolve — confirmed by hand, keyed by afltables' own stable coach permalink.
 * Same mechanism as ../coach-attendance/import-coaches.js's KNOWN_COACHES.
 */
const KNOWN_COACHES = {}

function resolveCoach({ permalink, name }, matchYear, { ids, playerIndex, unmatched }) {
  if (KNOWN_COACHES[permalink]) {
    const playerId = KNOWN_COACHES[permalink]
    const record = { playerId, matched: true, ...splitAfltablesName(name) }
    ids.map.players[permalink] = record
    return { playerId, matched: true }
  }

  if (ids.map.players[permalink]) {
    const r = ids.map.players[permalink]
    return { playerId: r.playerId, matched: r.matched }
  }

  const { givenName, surname } = splitAfltablesName(name)
  const cands = playerIndex.candidates(`${givenName} ${surname}`.trim())

  let hit = null
  if (cands.length === 1) {
    hit = cands[0]
  } else if (cands.length > 1) {
    const plausible = cands.filter((c) => c.maxYear <= matchYear)
    if (plausible.length === 1) hit = plausible[0]
    else unmatched.push(`${name} (${permalink}) — ${cands.length} same-name candidate(s), none uniquely plausible for ${matchYear}`)
  }

  let record
  if (hit) {
    record = { playerId: hit.playerId, matched: true, givenName: hit.givenName, surname: hit.surname }
  } else {
    const playerId = `AT_I${ids.map.counters.player++}`
    record = { playerId, matched: false, givenName, surname }
    const profilePath = join(PLAYERS_DIR, `${playerId}.json`)
    if (!existsSync(profilePath)) {
      writeFileSync(
        profilePath,
        JSON.stringify(
          {
            givenName, surname, age: null, heightCm: null, weightKg: 0, jumperNumber: null,
            kickingFoot: null, stateOfOrigin: null, draftYear: null, debutYear: null,
            recruitedFrom: null, draftPosition: null, draftType: null, position: null,
            bio: null, aflAwards: null, photoURL: '', dateOfBirth: null,
            role: 'coach', source: 'afltables',
          },
          null,
          2,
        ),
      )
    }
  }

  ids.map.players[permalink] = record
  return { playerId: record.playerId, matched: record.matched }
}

async function importYear(year, { ids, playerIndex, force, limit }) {
  const detailsDir = join(ROOT, 'public', 'data', String(year), 'match-details')
  if (!existsSync(detailsDir)) {
    console.log(`[${year}] no data — skip`)
    return
  }

  const targets = [] // { providerId, matchId, detailsPath }
  for (const file of readdirSync(detailsDir)) {
    const m = file.match(/^AT_M(\d+)\.json$/)
    if (!m) continue
    const detailsPath = join(detailsDir, file)
    if (!force && hasCoaches(detailsPath)) continue
    targets.push({ providerId: `AT_M${m[1]}`, matchId: m[1], detailsPath })
  }

  const capped = limit ? targets.slice(0, limit) : targets
  const unmatchedCoaches = []
  let updated = 0
  let bothRecorded = 0

  for (const t of capped) {
    let html
    try {
      html = await fetchPage(`stats/games/${year}/${t.matchId}.html`)
    } catch (e) {
      console.log(`  ${t.providerId}: fetch failed — ${e.message}`)
      continue
    }
    const parsed = parseMatchPage(html)
    const details = JSON.parse(readFileSync(t.detailsPath, 'utf8'))

    const homeTeamId = details.match?.homeTeamId
    const awayTeamId = details.match?.awayTeamId
    const homeTeamObj = parsed.teams.find((pt) => slugToProviderId(pt.slug) === homeTeamId)
    const awayTeamObj = parsed.teams.find((pt) => pt !== homeTeamObj && slugToProviderId(pt.slug) === awayTeamId)
    if (!homeTeamObj || !awayTeamObj) {
      console.log(`  ${t.providerId}: couldn't align teams (page slugs: ${parsed.teams.map((pt) => pt.slug).join(', ')}; expected: ${homeTeamId}/${awayTeamId}) — skip`)
      continue
    }

    // Attendance needs no team alignment — opportunistic top-up only; the base
    // scraper already writes this for nearly every match.
    if (details.score && !details.score.attendance && typeof parsed.meta?.attendance === 'number' && parsed.meta.attendance > 0) {
      details.score.attendance = parsed.meta.attendance
    }

    const home = homeTeamObj.coach ? resolveCoach(homeTeamObj.coach, year, { ids, playerIndex, unmatched: unmatchedCoaches }) : null
    const away = awayTeamObj.coach ? resolveCoach(awayTeamObj.coach, year, { ids, playerIndex, unmatched: unmatchedCoaches }) : null
    if (home && away) bothRecorded++

    // Written even when afltables has no coach recorded for one or both sides
    // (common before ~1910) — `null` means "checked, genuinely not there", so
    // this match isn't re-fetched forever looking for data that doesn't exist.
    details.coaches = {
      fetchedAt: new Date().toISOString(),
      home: home ? { playerId: home.playerId, name: homeTeamObj.coach.name, matched: home.matched } : null,
      away: away ? { playerId: away.playerId, name: awayTeamObj.coach.name, matched: away.matched } : null,
    }
    writeFileSync(t.detailsPath, JSON.stringify(details, null, 2))
    updated++
  }

  console.log(
    `[${year}] ${updated}/${capped.length} match(es) checked` +
      (capped.length < targets.length ? ` (${targets.length - capped.length} more available, capped by --limit)` : '') +
      `, ${bothRecorded} with both coaches recorded on the source, ${unmatchedCoaches.length} ambiguous coach name(s).`,
  )
  for (const c of unmatchedCoaches) console.log(`  ! ambiguous coach — ${c}`)
}

async function main() {
  const force = hasFlag('force')
  const limit = Number(arg('limit')) || 0

  let years = []
  if (arg('year')) years = [Number(arg('year'))]
  else if (arg('from') || arg('to')) {
    const from = Number(arg('from')) || FIRST_YEAR
    const to = Number(arg('to')) || LAST_YEAR
    for (let y = to; y >= from; y--) years.push(y) // newest first
  } else {
    for (let y = LAST_YEAR; y >= FIRST_YEAR; y--) years.push(y)
  }

  const ids = createIdResolver()
  const playerIndex = buildPlayerIndex()
  console.log(`Indexed ${playerIndex.size} distinct player name(s) across every provider/era for coach matching.`)

  for (const year of years) {
    await importYear(year, { ids, playerIndex, force, limit })
    ids.save()
  }
  ids.save()

  console.log(`\nid-map saved to ${ids.ID_MAP_PATH}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
