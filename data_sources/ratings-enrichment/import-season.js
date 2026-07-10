/**
 * Enrich existing public/data/{year}/ match files with the ratings source's
 * additional stats (their own player rating system, xScore/xWins expected-score
 * model, equity metrics, and team scoring-source breakdowns — none of which the
 * official ChampionData feed provides).
 *
 * This does NOT create new matches/players/ids — the ratings source only covers
 * 2012+, the same span already fully covered by the official AFL API, so every
 * match and player it has already exists in this dataset. The whole job is:
 *   1. resolve a source match to its CD_M providerId (by round number + teams)
 *   2. resolve each source player row to its CD_I entry within that match's own
 *      roster (by name + team — no cross-season identity resolution needed)
 *   3. merge the source-exclusive fields in as a nested `wheelo` object,
 *      namespaced so field-name collisions with existing CD stats never matter
 *
 * Usage:
 *   node data_sources/ratings-enrichment/import-season.js --year=2026
 *   node data_sources/ratings-enrichment/import-season.js --from=2012 --to=2025
 *   node data_sources/ratings-enrichment/import-season.js                    # backfill: every
 *                                                                            # season 2012–current
 *   node data_sources/ratings-enrichment/import-season.js --force            # re-merge even
 *                                                                            # already-enriched matches
 *
 * Base URL is configurable via lib/config.js (RATINGS_BASE_URL env var).
 *
 * Idempotent and re-run-safe: a match already carrying a `wheelo` block in its
 * match-details file is skipped (and if every match in a round is already done,
 * the round file isn't even re-fetched) — so running with no args is the
 * "crawler" that backfills whatever's missing, cheaply, on every run.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { fetchTableData } from './lib/http.js'
import { cdTeamIdForRatingsName } from './lib/teams.js'
import { normalizeName } from '../statscache/lib/normalize.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=').slice(1).join('=') : undefined
}
const hasFlag = (name) => process.argv.includes(`--${name}`)

const MATCH_IDENTITY_FIELDS = new Set(['MatchId', 'HomeTeam', 'HomeAbbreviation', 'HomeImage', 'AwayTeam', 'AwayAbbreviation', 'AwayImage', 'MatchDate'])
const PLAYER_IDENTITY_FIELDS = new Set(['MatchId', 'Player', 'WebsiteId', 'Team', 'Abbreviation', 'Image'])
const TEAM_IDENTITY_FIELDS = new Set(['MatchId', 'Team', 'Abbreviation', 'Image'])

function pick(row, exclude) {
  const out = {}
  for (const [k, v] of Object.entries(row)) if (!exclude.has(k)) out[k] = v
  return out
}

/** The source's column-oriented row-groups (Data[0], TeamData[0], Matches[0])
 *  degrade every field to a scalar when the group has exactly one row — expand
 *  back out. */
function rowsOf(group) {
  const keys = Object.keys(group)
  if (keys.length === 0) return []
  const g = Array.isArray(group[keys[0]]) ? group : Object.fromEntries(keys.map((k) => [k, [group[k]]]))
  const n = g[keys[0]].length
  const rows = []
  for (let i = 0; i < n; i++) rows.push(Object.fromEntries(keys.map((k) => [k, g[k][i]])))
  return rows
}

function add(map, key, val) {
  if (!map.has(key)) map.set(key, [])
  map.get(key).push(val)
}

function hasRatingsDetails(detailsPath) {
  if (!existsSync(detailsPath)) return false
  try {
    return !!JSON.parse(readFileSync(detailsPath, 'utf8')).wheelo
  } catch {
    return false
  }
}

function mergeMatch({ dataDir, cdMatch, playerRows, teamRows, unmatched }) {
  const statsPath = join(dataDir, 'stats', `${cdMatch.providerId}.json`)
  const detailsPath = join(dataDir, 'match-details', `${cdMatch.providerId}.json`)
  let playersUpdated = 0
  let wroteDetails = false

  if (existsSync(statsPath) && playerRows.length > 0) {
    const stats = JSON.parse(readFileSync(statsPath, 'utf8'))
    const entries = [...(stats.homeTeamPlayerStats ?? []), ...(stats.awayTeamPlayerStats ?? [])]

    const byTeamName = new Map()
    const byTeamSurname = new Map()
    for (const e of entries) {
      const p = e.playerStats?.player
      if (!p?.playerName) continue
      const teamId = e.playerStats.teamId
      const full = normalizeName(`${p.playerName.givenName} ${p.playerName.surname}`)
      const sur = normalizeName(p.playerName.surname)
      add(byTeamName, `${teamId}|${full}`, e)
      add(byTeamSurname, `${teamId}|${sur}`, e)
    }

    for (const row of playerRows) {
      const teamId = cdTeamIdForRatingsName(row.Team)
      const full = normalizeName(row.Player)
      const tokens = row.Player.trim().split(/\s+/)
      const sur = normalizeName(tokens[tokens.length - 1])
      let cands = byTeamName.get(`${teamId}|${full}`)
      if (!cands || cands.length !== 1) cands = byTeamSurname.get(`${teamId}|${sur}`)
      if (!cands || cands.length !== 1) {
        unmatched.players.push(`${cdMatch.providerId}: ${row.Player} (${row.Team})`)
        continue
      }
      cands[0].playerStats.stats.wheelo = pick(row, PLAYER_IDENTITY_FIELDS)
      playersUpdated++
    }

    if (playersUpdated > 0) writeFileSync(statsPath, JSON.stringify(stats, null, 2))
  }

  if (existsSync(detailsPath) && teamRows.length === 2) {
    const home = teamRows.find((r) => cdTeamIdForRatingsName(r.Team) === cdMatch.homeTeamId)
    const away = teamRows.find((r) => cdTeamIdForRatingsName(r.Team) === cdMatch.awayTeamId)
    if (home && away) {
      const details = JSON.parse(readFileSync(detailsPath, 'utf8'))
      details.wheelo = {
        fetchedAt: new Date().toISOString(),
        home: pick(home, TEAM_IDENTITY_FIELDS),
        away: pick(away, TEAM_IDENTITY_FIELDS),
      }
      writeFileSync(detailsPath, JSON.stringify(details, null, 2))
      wroteDetails = true
    }
  }

  return { playersUpdated, wroteDetails }
}

async function importSeason(year, { force }) {
  const dataDir = join(ROOT, 'public', 'data', String(year))
  const fixturePath = join(dataDir, 'fixture.json')
  if (!existsSync(fixturePath)) {
    console.log(`[${year}] no fixture.json — skip`)
    return
  }
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))

  const byRound = new Map() // roundNumber -> [{ providerId, homeTeamId, awayTeamId }]
  for (const m of fixture.matches ?? []) {
    if (m.status !== 'CONCLUDED' && m.status !== 'POSTGAME') continue
    const rn = m.round?.roundNumber
    if (rn === undefined) continue
    add(byRound, rn, {
      providerId: m.providerId,
      homeTeamId: m.home.team.providerId,
      awayTeamId: m.away.team.providerId,
    })
  }

  let season
  try {
    season = await fetchTableData(String(year))
  } catch (e) {
    console.log(`[${year}] season file fetch failed (ratings source likely doesn't cover this year): ${e.message}`)
    return
  }
  const roundIds = season.RoundId ?? []

  const unmatched = { matches: [], players: [] }
  let matchesProcessed = 0
  let detailsUpdated = 0
  let playersUpdated = 0

  for (const roundId of roundIds) {
    const roundNumber = Number(String(roundId).slice(4))
    const candidateMatches = byRound.get(roundNumber) ?? []
    if (candidateMatches.length === 0) continue // not played on our side yet

    const detailsPathFor = (id) => join(dataDir, 'match-details', `${id}.json`)
    if (!force && candidateMatches.every((m) => hasRatingsDetails(detailsPathFor(m.providerId)))) continue

    let round
    try {
      round = await fetchTableData(roundId)
    } catch (e) {
      console.log(`  [${year}] round ${roundId} fetch failed: ${e.message}`)
      continue
    }
    if (!round.Matches?.[0]) continue

    const matchRows = rowsOf(round.Matches[0])
    const playerRows = rowsOf(round.Data?.[0] ?? {})
    const teamRows = rowsOf(round.TeamData?.[0] ?? {})

    for (const mrow of matchRows) {
      const homeCd = cdTeamIdForRatingsName(mrow.HomeTeam)
      const awayCd = cdTeamIdForRatingsName(mrow.AwayTeam)
      const cdMatch = candidateMatches.find((m) => m.homeTeamId === homeCd && m.awayTeamId === awayCd)
      if (!cdMatch) {
        unmatched.matches.push(`round ${roundNumber}: ${mrow.HomeTeam} v ${mrow.AwayTeam} (source id ${mrow.MatchId})`)
        continue
      }
      if (!force && hasRatingsDetails(detailsPathFor(cdMatch.providerId))) continue

      const result = mergeMatch({
        dataDir,
        cdMatch,
        playerRows: playerRows.filter((r) => r.MatchId === mrow.MatchId),
        teamRows: teamRows.filter((r) => r.MatchId === mrow.MatchId),
        unmatched,
      })
      matchesProcessed++
      playersUpdated += result.playersUpdated
      if (result.wroteDetails) detailsUpdated++
    }
  }

  console.log(
    `[${year}] ${matchesProcessed} match(es) merged, ${detailsUpdated} match-details updated, ` +
      `${playersUpdated} player row(s) merged, ${unmatched.matches.length} unmatched match(es), ` +
      `${unmatched.players.length} unmatched player row(s)`,
  )
  for (const m of unmatched.matches) console.log(`  ! unmatched match — ${m}`)
  for (const p of unmatched.players) console.log(`  ! unmatched player — ${p}`)
}

async function main() {
  const force = hasFlag('force')
  const limit = Number(arg('limit')) || 0

  let years = []
  if (arg('year')) years = [Number(arg('year'))]
  else if (arg('from') && arg('to')) {
    const from = Number(arg('from'))
    const to = Number(arg('to'))
    for (let y = to; y >= from; y--) years.push(y)
  } else {
    const to = new Date().getFullYear()
    for (let y = to; y >= 2012; y--) years.push(y)
  }
  if (limit) years = years.slice(0, limit)

  for (const year of years) {
    await importSeason(year, { force })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
