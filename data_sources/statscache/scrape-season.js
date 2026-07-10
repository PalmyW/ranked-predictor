/**
 * Scrape one or more historical AFL seasons from footywire.com into the existing
 * public/data/{year}/ layout (fixture.json, stats/, match-details/, team-stats/,
 * and shared players/). Generated entities use PW_ ids; players are matched to
 * existing CD_I* ids by name + DOB where possible.
 *
 * Usage:
 *   node scripts/footywire/scrape-season.js --year=2011
 *   node scripts/footywire/scrape-season.js --from=1965 --to=2010
 *   node scripts/footywire/scrape-season.js --year=2012 --out=staging --no-register   (accuracy harness)
 *
 * Does NOT import into the DB — that stays a manual `npm run db:import` step run
 * only after you verify the generated files in the app.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { fetchPage } from './lib/http.js'
import { parseFixtureList } from './lib/parse-fixture.js'
import { parseMatchPage } from './lib/parse-match.js'
import { parseProfile } from './lib/parse-profile.js'
import { createIdResolver } from './lib/ids.js'
import {
  buildPlayerEntry, buildStatsFile, buildFixture, buildMatchDetails,
  buildPlayerProfile, aggregateTeamStats,
} from './lib/build-files.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=').slice(1).join('=') : undefined
}
const hasFlag = (name) => process.argv.includes(`--${name}`)

function splitName(name) {
  const [given, ...rest] = (name || '').trim().split(/\s+/)
  return { givenName: given ?? '', surname: rest.join(' ') }
}

async function scrapeSeason(year, { outRoot, register, ids }) {
  const compSeasonId = Number(arg('compSeasonId')) || 9000 + (year - 1900)
  const dataDir = join(outRoot, 'public', 'data', String(year))
  const statsDir = join(dataDir, 'stats')
  const detailsDir = join(dataDir, 'match-details')
  const teamStatsDir = join(dataDir, 'team-stats')
  const playersDir = join(outRoot, 'public', 'data', 'players')
  for (const d of [statsDir, detailsDir, teamStatsDir, playersDir]) mkdirSync(d, { recursive: true })

  console.log(`\n═══ ${year} (compSeasonId=${compSeasonId}) ═══`)
  const listHtml = await fetchPage(`ft_match_list?year=${year}`)
  let { matches: rows } = parseFixtureList(listHtml, year)
  const limit = Number(arg('limit')) || 0
  if (limit) rows = rows.slice(0, limit)
  console.log(`Fixture: ${rows.length} matches${limit ? ` (limited to ${limit})` : ''}`)

  const slugCache = new Map() // footywire pp- slug → { resolved, profile }
  const statsFilesForAgg = []
  const fixtureMatches = []

  async function resolveBySlug(slug, name, teamProviderId) {
    // The slug is the player's stable identity (same across every club), so memoize
    // and key the id-map by it — players who changed clubs resolve to one id.
    if (slugCache.has(slug)) return slugCache.get(slug)
    const { givenName, surname } = splitName(name)

    // Phase A: resolve by name + team against the existing CD dataset (no fetch).
    let r = ids.resolvePlayer({ name, teamProviderId, slug })
    let profile = null
    if (!r.decided) {
      // Ambiguous or genuinely new — fetch the statscache profile for a DOB, then
      // resolve definitively (DOB tie-break, or mint with bio).
      try {
        profile = parseProfile(await fetchPage(slug))
      } catch {
        /* profile fetch failed — mint with no DOB */
      }
      r = ids.resolvePlayer({ name, teamProviderId, slug, dob: profile?.dob ?? null }, { final: true })
    }

    const record = {
      resolved: { playerId: r.playerId, matched: r.matched, givenName, surname, dob: profile?.dob ?? null },
      profile,
    }
    slugCache.set(slug, record)
    return record
  }

  let done = 0
  for (const row of rows) {
    const homeTeam = ids.resolveTeam(row.homeSlug)
    const awayTeam = ids.resolveTeam(row.awaySlug)
    const statsPath = join(statsDir, `PW_M${row.mid}.json`)

    // Always parse the match page (cheap once the raw HTML is cached) so a re-run
    // still rebuilds correct fixture scores / period breakdowns / match-details.
    let matchPage = null
    let basic = null
    let adv = null
    try {
      basic = await fetchPage(`ft_match_statistics?mid=${row.mid}`)
      adv = await fetchPage(`ft_match_statistics?mid=${row.mid}&advv=Y`).catch(() => null)
    } catch (e) {
      console.warn(`  mid=${row.mid}: stats page failed (${e.message}) — fixture-only`)
    }
    if (basic) matchPage = parseMatchPage(basic, adv)

    // Align the two stats-page sides (players + score + periods) to the fixture's
    // home/away by TEAM IDENTITY — the stats page order does not always match the
    // fixture, so position alone would attribute players to the wrong club.
    let homeSide = null
    let awaySide = null
    if (matchPage) {
      const sides = matchPage.teams.map((tbl, i) => ({
        team: matchPage.teamSlugs?.[i] ? ids.resolveTeam(matchPage.teamSlugs[i]) : null,
        players: tbl?.players ?? [],
        score: i === 0 ? matchPage.totals?.home : matchPage.totals?.away,
        periods: i === 0 ? matchPage.periods?.home : matchPage.periods?.away,
      }))
      homeSide = sides.find((s) => s.team?.providerId === homeTeam.providerId) ?? sides[0]
      awaySide = sides.find((s) => s !== homeSide) ?? sides[1]
    }

    // Resolve players + write the stats file only if it's missing (this is the
    // expensive part — profile lookups). Re-runs skip it but keep the parsed page.
    if (homeSide && awaySide && !existsSync(statsPath)) {
      const homeEntries = []
      const awayEntries = []
      for (const p of homeSide.players) {
        const { resolved, profile } = await resolveBySlug(p.slug, p.name, homeTeam.providerId)
        homeEntries.push(buildPlayerEntry(p, homeTeam, resolved, profile))
        maybeWriteProfile(resolved, profile, playersDir)
      }
      for (const p of awaySide.players) {
        const { resolved, profile } = await resolveBySlug(p.slug, p.name, awayTeam.providerId)
        awayEntries.push(buildPlayerEntry(p, awayTeam, resolved, profile))
        maybeWriteProfile(resolved, profile, playersDir)
      }
      writeFileSync(statsPath, JSON.stringify(buildStatsFile(homeEntries, awayEntries), null, 2))
    }
    // Load stats file for aggregation (whether just-written or pre-existing).
    if (existsSync(statsPath)) {
      statsFilesForAgg.push(JSON.parse(readFileSync(statsPath, 'utf8')))
    }

    // Scores/periods aligned to fixture home/away; fall back to fixture-list totals.
    const homeScore = homeSide?.score ?? { goals: null, behinds: null, totalScore: row.homeTotal }
    const awayScore = awaySide?.score ?? { goals: null, behinds: null, totalScore: row.awayTotal }
    const periods = homeSide?.periods && awaySide?.periods
      ? { home: homeSide.periods, away: awaySide.periods }
      : null

    const matchMeta = {
      mid: row.mid, year, roundNumber: row.roundNumber, roundName: row.roundName,
      utcStartTime: matchPage?.meta?.utcStartTime ?? row.utcStartTime,
      venue: matchPage?.meta?.venue ?? row.venue,
      attendance: matchPage?.meta?.attendance ?? row.crowd,
      homeTeam, awayTeam, homeScore, awayScore,
      periods,
    }
    fixtureMatches.push(matchMeta)
    writeFileSync(join(detailsDir, `PW_M${row.mid}.json`), JSON.stringify(buildMatchDetails(matchMeta), null, 2))

    done++
    if (done % 20 === 0) process.stdout.write(`  ${done}/${rows.length} matches\r`)
  }

  // fixture.json
  writeFileSync(join(dataDir, 'fixture.json'), JSON.stringify(buildFixture(year, compSeasonId, fixtureMatches), null, 2))

  // team-stats/
  const teamStats = aggregateTeamStats(statsFilesForAgg)
  for (const [teamId, file] of teamStats) {
    writeFileSync(join(teamStatsDir, `${teamId}.json`), JSON.stringify(file, null, 2))
  }

  console.log(`\n  ✓ ${year}: ${fixtureMatches.length} matches, ${teamStats.size} team-stats files`)
  if (register) registerSeason(year, compSeasonId)
  return { year, compSeasonId, matches: fixtureMatches.length }
}

function maybeWriteProfile(resolved, profile, playersDir) {
  // Only write PW_ profiles; never overwrite an existing CD_I* profile.
  if (!resolved.playerId.startsWith('PW_I')) return
  const path = join(playersDir, `${resolved.playerId}.json`)
  if (existsSync(path)) return
  writeFileSync(path, JSON.stringify(buildPlayerProfile(resolved, profile), null, 2))
}

function registerSeason(year, compSeasonId) {
  const file = join(ROOT, 'src', 'config', 'seasons.ts')
  let src = readFileSync(file, 'utf8')
  const y = String(year)

  // 1. Ensure the year is in SEASON_REGISTRY (insert at the top; rebuilt sorted below).
  if (!new RegExp(`'${y}'\\s*:`).test(src)) {
    src = src.replace(/(export const SEASON_REGISTRY[^{]*\{\n)/, `$1  '${y}': ${compSeasonId},\n`)
  }

  // 2. Regenerate the SEASONS array straight from SEASON_REGISTRY, sorted ascending,
  //    so the two can never drift apart (this is what the app's season select reads).
  const regBlock = src.match(/export const SEASON_REGISTRY[^{]*\{([\s\S]*?)\}/)
  const reg = {}
  for (const m of regBlock[1].matchAll(/'(\d+)'\s*:\s*(\d+)/g)) reg[m[1]] = Number(m[2])
  const entries = Object.keys(reg)
    .sort()
    .map((yr) => `  { year: '${yr}', compSeasonId: ${reg[yr]} },`)
    .join('\n')
  src = src.replace(
    /export const SEASONS:\s*SeasonConfig\[\]\s*=\s*\[[\s\S]*?\n\]/,
    `export const SEASONS: SeasonConfig[] = [\n${entries}\n]`,
  )

  writeFileSync(file, src)
  console.log(`  Registered ${y} → compSeasonId ${compSeasonId} (seasons.ts synced)`)
}

async function main() {
  const outArg = arg('out')
  const outRoot = outArg ? join(ROOT, 'data_sources', 'statscache', outArg) : ROOT
  const register = !hasFlag('no-register') && !outArg

  let years = []
  if (arg('year')) years = [Number(arg('year'))]
  else if (arg('from') && arg('to')) {
    const from = Number(arg('from')), to = Number(arg('to'))
    for (let y = to; y >= from; y--) years.push(y) // newest first
  } else {
    console.error('Usage: --year=YYYY | --from=YYYY --to=YYYY  [--out=staging] [--no-register]')
    process.exit(1)
  }

  const ids = createIdResolver()
  console.log(`Indexed ${ids.cdPlayers} existing CD player names (by team) for matching.`)
  if (outArg) console.log(`Staging output → data_sources/statscache/${outArg}/ (not registered, not the live data path)`)

  for (const year of years) {
    await scrapeSeason(year, { outRoot, register, ids })
    ids.save()
  }
  ids.save()

  const s = ids.stats
  console.log(`\nPlayer ids: matched ${s.matched} to CD (DOB-confirmed); minted ${s.minted} PW_I.`)
  console.log(`id-map saved to ${ids.ID_MAP_PATH}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
