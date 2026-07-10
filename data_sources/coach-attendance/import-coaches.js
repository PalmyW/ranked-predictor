/**
 * Enrich existing public/data/{year}/match-details/ files with each match's
 * head coaches and attendance, scraped from footywire.com match-statistics
 * pages — covers every season footywire has that data for (1965–present),
 * including 2012+ matches that already exist as official-API CD_M data (whose
 * `score` object never carries attendance — the official AFL feed just doesn't
 * include it — so this is the only source for it there).
 *
 * This does NOT create new matches — it resolves a footywire match id (mid) to
 * an EXISTING match-details file two different ways:
 *   - 1965–2011: that file already *is* footywire data (`PW_M{mid}.json`), so
 *     the mid is read straight off the filename — no discovery needed.
 *   - 2012+: the file is official-API `CD_M*` data, so footywire's own mid is
 *     found by matching round number + home/away team against footywire's
 *     `ft_match_list?year=YYYY` — the same technique
 *     `../ratings-enrichment/import-season.js` uses for the same problem.
 *
 * Coach → player id resolution (see `resolveCoach` below) has no independent
 * verification signal available (footywire's coach pages carry no DOB, unlike
 * player profile pages) — it's a best-effort NAME match against every existing
 * player id in the system (any provider, any era), narrowed by playing-career
 * plausibility only when the name alone is ambiguous. A coach who was never a
 * recorded player, or who can't be disambiguated, gets a freshly minted PW_I id
 * (from the same counter/id-map as the footywire *player* scraper — a coach
 * with no prior id is exactly the same kind of entity a footywire player scrape
 * mints one for, just discovered from a different page).
 *
 * Usage:
 *   node data_sources/coach-attendance/import-coaches.js --year=2024
 *   node data_sources/coach-attendance/import-coaches.js --from=1965 --to=2011
 *   node data_sources/coach-attendance/import-coaches.js                    # backfill: every
 *                                                                            # year 1965–current
 *   node data_sources/coach-attendance/import-coaches.js --force            # re-resolve even
 *                                                                            # already-enriched matches
 *   node data_sources/coach-attendance/import-coaches.js --year=2024 --limit=5   # debugging
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { fetchPage } from '../statscache/lib/http.js'
import { parseFixtureList } from '../statscache/lib/parse-fixture.js'
import { parseMatchPage } from '../statscache/lib/parse-match.js'
import { TEAM_TABLE } from '../statscache/lib/teams.js'
import { createIdResolver } from '../statscache/lib/ids.js'
import { buildPlayerIndex } from './lib/player-index.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PLAYERS_DIR = join(ROOT, 'public', 'data', 'players')
const FIRST_YEAR = 1965

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=').slice(1).join('=') : undefined
}
const hasFlag = (name) => process.argv.includes(`--${name}`)

function splitName(name) {
  const [given, ...rest] = (name || '').trim().split(/\s+/)
  return { givenName: given ?? '', surname: rest.join(' ') }
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

function hasAttendance(detailsPath) {
  if (!existsSync(detailsPath)) return false
  try {
    const a = JSON.parse(readFileSync(detailsPath, 'utf8')).score?.attendance
    return typeof a === 'number' && a > 0
  } catch {
    return false
  }
}

const needsEnrichment = (detailsPath, force) => force || !hasCoaches(detailsPath) || !hasAttendance(detailsPath)

/**
 * Known-identity overrides for coaches the name + playing-career-plausibility
 * heuristic can't confidently resolve on its own — confirmed by hand, keyed by
 * footywire's own stable per-coach slug (`cp-{name}--{id}`, see resolveCoach's
 * doc comment). Checked before both the id-map cache and the automatic
 * matcher, so it also self-heals a previously wrong/placeholder mint already
 * sitting in the cache from an earlier ambiguous run.
 */
const KNOWN_COACHES = {
  // Mark Williams (Port Adelaide coach 1999–2010) — 4 same-name candidates in
  // the player index; confirmed to be PW_I901789 (Collingwood 1981–86, per
  // public/data/1981..1986/team-stats/CD_T40.json — exact year match).
  'cp-mark-williams--11': 'PW_I901789',
}

/**
 * Resolve one footywire coach ({slug, name}) to a playerId. Memoized by the
 * coach's own footywire slug (stable across every match/team they've coached —
 * footywire's `cp-{name}--{numericId}` is a per-person identity, same idea as
 * the `pp-` player slugs the footywire player scraper already memoizes by), so
 * each coach is only decided once and every later match reuses the answer.
 */
function resolveCoach({ slug, name }, matchYear, { ids, playerIndex, unmatched }) {
  if (KNOWN_COACHES[slug]) {
    const playerId = KNOWN_COACHES[slug]
    const record = { playerId, matched: true, ...splitName(name) }
    ids.map.players[slug] = record
    return { playerId, matched: true }
  }

  if (ids.map.players[slug]) {
    const r = ids.map.players[slug]
    return { playerId: r.playerId, matched: r.matched }
  }

  const { givenName, surname } = splitName(name)
  const cands = playerIndex.candidates(name)

  let hit = null
  if (cands.length === 1) {
    hit = cands[0]
  } else if (cands.length > 1) {
    // Ambiguous by name alone — narrow by playing-career plausibility: a coach
    // must have stopped playing at or before the season they're coaching.
    const plausible = cands.filter((c) => c.maxYear <= matchYear)
    if (plausible.length === 1) hit = plausible[0]
    else unmatched.push(`${name} (${slug}) — ${cands.length} same-name candidate(s), none uniquely plausible for ${matchYear}`)
  }

  let record
  if (hit) {
    record = { playerId: hit.playerId, matched: true, givenName: hit.givenName, surname: hit.surname }
  } else {
    const playerId = `PW_I${ids.map.counters.player++}`
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
            role: 'coach', source: 'coach-attendance',
          },
          null,
          2,
        ),
      )
    }
  }

  ids.map.players[slug] = record
  return { playerId: record.playerId, matched: record.matched }
}

async function importYear(year, { ids, playerIndex, force, limit }) {
  const dataDir = join(ROOT, 'public', 'data', String(year))
  const detailsDir = join(dataDir, 'match-details')
  const fixturePath = join(dataDir, 'fixture.json')
  if (!existsSync(fixturePath) || !existsSync(detailsDir)) {
    console.log(`[${year}] no data — skip`)
    return
  }

  const targets = [] // { providerId, mid, detailsPath }
  const unmatchedMatches = []
  const unmatchedCoaches = []

  // Case A: footywire-native matches (1965–2011) — mid is the filename itself.
  for (const file of readdirSync(detailsDir)) {
    const m = file.match(/^PW_M(\d+)\.json$/)
    if (!m) continue
    const detailsPath = join(detailsDir, file)
    if (!needsEnrichment(detailsPath, force)) continue
    targets.push({ providerId: `PW_M${m[1]}`, mid: Number(m[1]), detailsPath })
  }

  // Case B: everything else (2012+ official-API matches) — discover footywire's
  // mid by round + team, same technique as ../ratings-enrichment/import-season.js.
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const nonNativeMatches = (fixture.matches ?? []).filter(
    (m) => (m.status === 'CONCLUDED' || m.status === 'POSTGAME') && m.providerId && !m.providerId.startsWith('PW_M'),
  )
  const needsDiscovery = nonNativeMatches.filter((m) => needsEnrichment(join(detailsDir, `${m.providerId}.json`), force))

  if (needsDiscovery.length > 0) {
    let rows = []
    try {
      rows = parseFixtureList(await fetchPage(`ft_match_list?year=${year}`), year).matches
    } catch (e) {
      console.log(`[${year}] footywire fixture list fetch failed (footywire likely doesn't cover this year): ${e.message}`)
    }
    for (const m of needsDiscovery) {
      const homeId = m.home?.team?.providerId
      const awayId = m.away?.team?.providerId
      const roundNumber = m.round?.roundNumber
      const row = rows.find(
        (r) => r.roundNumber === roundNumber && slugToProviderId(r.homeSlug) === homeId && slugToProviderId(r.awaySlug) === awayId,
      )
      if (!row) {
        unmatchedMatches.push(`round ${roundNumber}: ${homeId} v ${awayId} (${m.providerId})`)
        continue
      }
      const detailsPath = join(detailsDir, `${m.providerId}.json`)
      if (!existsSync(detailsPath)) continue // match-details not fetched yet — nothing to enrich
      targets.push({ providerId: m.providerId, mid: row.mid, detailsPath })
    }
  }

  const capped = limit ? targets.slice(0, limit) : targets

  let updated = 0
  for (const t of capped) {
    let html
    try {
      html = await fetchPage(`ft_match_statistics?mid=${t.mid}`)
    } catch (e) {
      console.log(`  ${t.providerId} (mid=${t.mid}): fetch failed — ${e.message}`)
      continue
    }
    const parsed = parseMatchPage(html, null)
    const details = JSON.parse(readFileSync(t.detailsPath, 'utf8'))
    let changed = false

    // Attendance needs no team alignment — write it whenever footywire has it,
    // independent of whether the coach side below succeeds.
    if (typeof parsed.meta?.attendance === 'number' && parsed.meta.attendance > 0) {
      if (details.score) details.score.attendance = parsed.meta.attendance
      changed = true
    }

    if (parsed.coaches.length < 2 || parsed.teamSlugs.length < 2) {
      console.log(`  ${t.providerId} (mid=${t.mid}): no coach data on page`)
    } else {
      const homeTeamId = details.match?.homeTeamId
      const awayTeamId = details.match?.awayTeamId
      const bySlugProviderId = parsed.teamSlugs.map(slugToProviderId)
      const homeIdx = bySlugProviderId.indexOf(homeTeamId)
      const awayIdx = bySlugProviderId.indexOf(awayTeamId)
      if (homeIdx === -1 || awayIdx === -1) {
        console.log(`  ${t.providerId} (mid=${t.mid}): couldn't align teams (page: ${bySlugProviderId.join(', ')}; expected: ${homeTeamId}/${awayTeamId})`)
      } else {
        const home = resolveCoach(parsed.coaches[homeIdx], year, { ids, playerIndex, unmatched: unmatchedCoaches })
        const away = resolveCoach(parsed.coaches[awayIdx], year, { ids, playerIndex, unmatched: unmatchedCoaches })

        details.coaches = {
          fetchedAt: new Date().toISOString(),
          home: { playerId: home.playerId, name: parsed.coaches[homeIdx].name, matched: home.matched },
          away: { playerId: away.playerId, name: parsed.coaches[awayIdx].name, matched: away.matched },
        }
        changed = true
      }
    }

    if (changed) {
      writeFileSync(t.detailsPath, JSON.stringify(details, null, 2))
      updated++
    }
  }

  console.log(
    `[${year}] ${updated}/${capped.length} match(es) updated with coach data` +
      (capped.length < targets.length ? ` (${targets.length - capped.length} more available, capped by --limit)` : '') +
      `, ${unmatchedMatches.length} unmatched match(es), ${unmatchedCoaches.length} ambiguous coach name(s).`,
  )
  for (const m of unmatchedMatches) console.log(`  ! unmatched match — ${m}`)
  for (const c of unmatchedCoaches) console.log(`  ! ambiguous coach — ${c}`)
}

async function main() {
  const force = hasFlag('force')
  const limit = Number(arg('limit')) || 0

  const seasonsSource = readFileSync(join(ROOT, 'src/config/seasons.ts'), 'utf8')
  const currentYearMatch = seasonsSource.match(/CURRENT_SEASON_YEAR\s*=\s*'(\d+)'/)
  const CURRENT_YEAR = Number(currentYearMatch?.[1] ?? '2026')

  let years = []
  if (arg('year')) years = [Number(arg('year'))]
  else if (arg('from') || arg('to')) {
    const from = Number(arg('from')) || FIRST_YEAR
    const to = Number(arg('to')) || CURRENT_YEAR
    for (let y = to; y >= from; y--) years.push(y) // newest first
  } else {
    for (let y = CURRENT_YEAR; y >= FIRST_YEAR; y--) years.push(y)
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
