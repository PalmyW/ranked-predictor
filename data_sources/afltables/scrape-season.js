/**
 * Scrape one or more historical AFL/VFL seasons from afltables.com into the existing
 * public/data/{year}/ layout (fixture.json, stats/, match-details/, team-stats/,
 * and shared players/), so the predictor app and aggregate-team-stats consume it
 * unchanged. Covers 1897–1964 — the years before the existing footywire scraper's
 * 1965+ coverage (see ../statscache/).
 *
 * Player stats for this entire era are goals-only (confirmed by an automated column
 * scan across 1897/1920/1940/1964 samples) — every other stat column is genuinely
 * never recorded by afltables for this era, not a parsing gap.
 *
 * Usage:
 *   node data_sources/afltables/scrape-season.js --year=1964
 *   node data_sources/afltables/scrape-season.js --from=1897 --to=1964
 *   node data_sources/afltables/scrape-season.js --year=1964 --out=staging --no-register
 *
 * Does NOT import into any database — that stays a separate, manual step outside
 * this repo (see ../statscache/README.md's equivalent note).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { fetchPage } from './lib/http.js'
import { parseSeasonPage } from './lib/parse-season.js'
import { parseMatchPage } from './lib/parse-match.js'
import { parsePlayerPage } from './lib/player-page.js'
import { createIdResolver } from './lib/ids.js'
import {
  buildPlayerEntry, buildStatsFile, buildFixture, buildMatchDetails,
  buildPlayerProfile, aggregateTeamStats,
} from './lib/build-files.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BASE_URL = 'https://afltables.com/afl/'

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=').slice(1).join('=') : undefined
}
const hasFlag = (name) => process.argv.includes(`--${name}`)

// afltables' own stat-column abbreviations that footywire's buildPlayerEntry
// STAT_MAP already understands — only GL/BH ever have real data in this era, but the
// full remap is here for completeness/robustness.
const COLUMN_REMAP = { GL: 'G', BH: 'B', KI: 'K', MK: 'M', HB: 'HB', DI: 'D', TK: 'T', HO: 'HO' }
function remapStats(stats) {
  const out = {}
  for (const [label, val] of Object.entries(stats)) {
    const mapped = COLUMN_REMAP[label]
    if (mapped) out[mapped] = val
  }
  return out
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
  const seasonHtml = await fetchPage(`seas/${year}.html`)
  let { matches: rows } = parseSeasonPage(seasonHtml, year)
  const limit = Number(arg('limit')) || 0
  if (limit) rows = rows.slice(0, limit)
  console.log(`Fixture: ${rows.length} matches${limit ? ` (limited to ${limit})` : ''}`)

  const permalinkCache = new Map() // afltables player permalink → { resolved, profile }
  const statsFilesForAgg = []
  const fixtureMatches = []

  async function resolveByPermalink(permalink, name, teamProviderId) {
    if (permalinkCache.has(permalink)) return permalinkCache.get(permalink)

    let r = ids.resolvePlayer({ name, teamProviderId, permalink })
    let profile = null
    if (!r.decided) {
      try {
        const url = new URL(permalink, `${BASE_URL}stats/games/${year}/x.html`).href
        profile = parsePlayerPage(await fetchPage(url))
      } catch {
        /* profile fetch failed — mint with no DOB */
      }
      r = ids.resolvePlayer({ name, teamProviderId, permalink, dob: profile?.dob ?? null }, { final: true })
    }

    const [surnamePart, givenPart] = (name || '').split(',').map((s) => s.trim())
    const record = {
      resolved: { playerId: r.playerId, matched: r.matched, givenName: givenPart ?? '', surname: surnamePart ?? '', dob: profile?.dob ?? null },
      profile,
    }
    permalinkCache.set(permalink, record)
    return record
  }

  let done = 0
  for (const row of rows) {
    const homeTeam = ids.resolveTeam(row.homeSlug)
    const awayTeam = ids.resolveTeam(row.awaySlug)
    const statsPath = join(statsDir, `AT_M${row.matchId}.json`)

    let matchPage = null
    try {
      const matchUrl = `stats/games/${year}/${row.matchId}.html`
      matchPage = parseMatchPage(await fetchPage(matchUrl))
    } catch (e) {
      console.warn(`  ${row.matchId}: stats page failed (${e.message}) — fixture-only`)
    }

    // Align the two player tables to the fixture's home/away by team-slug identity
    // (table order on the page doesn't always match the fixture's home/away order).
    let homeSide = null
    let awaySide = null
    if (matchPage) {
      homeSide = matchPage.teams.find((t) => t.slug === row.homeSlug) ?? matchPage.teams[0]
      awaySide = matchPage.teams.find((t) => t !== homeSide) ?? matchPage.teams[1]
    }

    if (homeSide && awaySide && !existsSync(statsPath)) {
      const homeEntries = []
      const awayEntries = []
      for (const p of homeSide.players) {
        const { resolved, profile } = await resolveByPermalink(p.permalink, p.name, homeTeam.providerId)
        homeEntries.push(buildPlayerEntry({ stats: remapStats(p.stats) }, homeTeam, resolved, profile))
        maybeWriteProfile(resolved, profile, playersDir)
      }
      for (const p of awaySide.players) {
        const { resolved, profile } = await resolveByPermalink(p.permalink, p.name, awayTeam.providerId)
        awayEntries.push(buildPlayerEntry({ stats: remapStats(p.stats) }, awayTeam, resolved, profile))
        maybeWriteProfile(resolved, profile, playersDir)
      }
      writeFileSync(statsPath, JSON.stringify(buildStatsFile(homeEntries, awayEntries), null, 2))
    }
    if (existsSync(statsPath)) {
      statsFilesForAgg.push(JSON.parse(readFileSync(statsPath, 'utf8')))
    }

    const sumScore = (periods, fallbackTotal) => {
      if (!periods) return { goals: null, behinds: null, totalScore: fallbackTotal }
      const goals = periods.reduce((s, p) => s + p.goals, 0)
      const behinds = periods.reduce((s, p) => s + p.behinds, 0)
      return { goals, behinds, totalScore: goals * 6 + behinds }
    }
    const homeScore = sumScore(row.homePeriods, row.homeTotal)
    const awayScore = sumScore(row.awayPeriods, row.awayTotal)
    const periods = row.homePeriods && row.awayPeriods
      ? { home: row.homePeriods, away: row.awayPeriods }
      : null

    const matchMeta = {
      mid: row.matchId, year, roundNumber: row.roundNumber, roundName: row.roundName,
      utcStartTime: matchPage?.meta?.utcStartTime ?? row.utcStartTime,
      venue: matchPage?.meta?.venue ?? row.venue,
      attendance: matchPage?.meta?.attendance ?? row.attendance,
      homeTeam, awayTeam, homeScore, awayScore,
      periods,
    }
    fixtureMatches.push(matchMeta)
    writeFileSync(
      join(detailsDir, `AT_M${row.matchId}.json`),
      JSON.stringify(buildMatchDetails(matchMeta), null, 2),
    )

    done++
    if (done % 20 === 0) process.stdout.write(`  ${done}/${rows.length} matches\r`)
  }

  writeFileSync(
    join(dataDir, 'fixture.json'),
    JSON.stringify(buildFixture(year, compSeasonId, fixtureMatches), null, 2),
  )

  const teamStats = aggregateTeamStats(statsFilesForAgg)
  for (const [teamId, file] of teamStats) {
    writeFileSync(join(teamStatsDir, `${teamId}.json`), JSON.stringify(file, null, 2))
  }

  console.log(`\n  ✓ ${year}: ${fixtureMatches.length} matches, ${teamStats.size} team-stats files`)
  if (register) registerSeason(year, compSeasonId)
  return { year, compSeasonId, matches: fixtureMatches.length }
}

function maybeWriteProfile(resolved, profile, playersDir) {
  if (!resolved.playerId.startsWith('AT_I')) return
  const path = join(playersDir, `${resolved.playerId}.json`)
  if (existsSync(path)) return
  writeFileSync(path, JSON.stringify(buildPlayerProfile(resolved, profile), null, 2))
}

function registerSeason(year, compSeasonId) {
  const file = join(ROOT, 'src', 'config', 'seasons.ts')
  let src = readFileSync(file, 'utf8')
  const y = String(year)

  if (!new RegExp(`'${y}'\\s*:`).test(src)) {
    src = src.replace(/(export const SEASON_REGISTRY[^{]*\{\n)/, `$1  '${y}': ${compSeasonId},\n`)
  }

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
  const outRoot = outArg ? join(ROOT, 'data_sources', 'afltables', outArg) : ROOT
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
  if (outArg) console.log(`Staging output → data_sources/afltables/${outArg}/ (not registered, not the live data path)`)

  for (const year of years) {
    await scrapeSeason(year, { outRoot, register, ids })
    ids.save()
  }
  ids.save()

  const s = ids.stats
  console.log(`\nPlayer ids: matched ${s.matched} to CD (expect ~0 for this era); minted ${s.minted} AT_I.`)
  console.log(`id-map saved to ${ids.ID_MAP_PATH}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
