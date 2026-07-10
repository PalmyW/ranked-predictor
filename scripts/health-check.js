/**
 * Health check for the current season's fetched stats data.
 *
 * Scans public/data/{season}/stats/ and match-details/ for every concluded
 * match and looks for two specific failure modes that leave a file present
 * but effectively empty:
 *
 *   1. Missing rating points — the CD stats API sometimes returns a file
 *      before it has finished computing advanced stats, so every player's
 *      `ratingPoints` comes back null. Fix: delete the stats file so the
 *      next `npm run fetch-stats` run re-fetches it from scratch.
 *
 *   2. Missing ratings data — a concluded match whose match-details file
 *      doesn't yet carry the top-level `wheelo` block the ratings-enrichment
 *      importer adds. Fix: run `npm run import-ratings` for the season.
 *
 * These two interact: deleting a stats file for (1) also throws away any
 * ratings data that had been merged into its player rows, but leaves the
 * `wheelo` marker on match-details untouched. Since the ratings importer's own
 * idempotency check only looks at that match-details marker, it would
 * silently skip re-merging the freshly-refetched stats file forever. So
 * whenever a stats file is deleted for missing rating points, this also
 * strips the match-details `wheelo` block for that match.
 *
 * That stripped match is deliberately *not* included in this run's
 * ratings-import trigger, though — its stats file doesn't exist yet, and
 * the ratings importer writes the match-details `wheelo` marker regardless of
 * whether it found a stats file to merge player rows into. Running it now
 * would re-mark the match "done" at the team level only, permanently hiding
 * the still-missing player-level merge from every future run. It's left
 * for the next `npm run health-check` (or `npm run import-ratings`) run,
 * after `npm run fetch-stats` has refetched the file.
 *
 * Usage:
 *   npm run health-check                  # current season (from seasons.ts)
 *   npm run health-check -- --season=2025
 *   npm run health-check -- --dry-run      # report only, no writes/deletes/import
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=').slice(1).join('=') : undefined
}
const DRY_RUN = process.argv.includes('--dry-run')

const seasonsSource = readFileSync(join(ROOT, 'src/config/seasons.ts'), 'utf8')
const currentYearMatch = seasonsSource.match(/CURRENT_SEASON_YEAR\s*=\s*'(\d+)'/)
const SEASON = arg('season') ?? currentYearMatch?.[1] ?? '2026'

const DATA_DIR = join(ROOT, `public/data/${SEASON}`)
const FIXTURE = join(DATA_DIR, 'fixture.json')
const STATS_DIR = join(DATA_DIR, 'stats')
const DETAILS_DIR = join(DATA_DIR, 'match-details')

if (!existsSync(FIXTURE)) {
  console.error(`No fixture.json for season ${SEASON} (${FIXTURE})`)
  process.exit(1)
}

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))
const concluded = (fixture.matches ?? []).filter(
  (m) => (m.status === 'CONCLUDED' || m.status === 'POSTGAME') && m.providerId,
)

console.log(`[${SEASON}] health check: ${concluded.length} concluded match(es)\n`)

let missingStatsFile = 0
let missingDetailsFile = 0
let deletedForRatingPoints = 0
let strippedRatingsMarker = 0
let missingRatings = 0
let missingRatingsBlockedOnStats = 0

for (const match of concluded) {
  const id = match.providerId
  const label = `${match.home?.team?.name ?? '?'} v ${match.away?.team?.name ?? '?'} (${id})`
  const statsPath = join(STATS_DIR, `${id}.json`)
  const detailsPath = join(DETAILS_DIR, `${id}.json`)

  let statsNeedsRefetch = false
  let statsUsable = false

  if (!existsSync(statsPath)) {
    console.log(`  ! missing stats file — ${label}`)
    missingStatsFile++
  } else {
    let players = null
    try {
      const stats = JSON.parse(readFileSync(statsPath, 'utf8'))
      players = [...(stats.homeTeamPlayerStats ?? []), ...(stats.awayTeamPlayerStats ?? [])]
    } catch {
      players = null
    }

    const corrupt = players === null
    const noRatingPoints =
      !corrupt &&
      players.length > 0 &&
      players.every((p) => typeof p.playerStats?.stats?.ratingPoints !== 'number')
    const empty = !corrupt && players.length === 0

    if (corrupt || noRatingPoints || empty) {
      const reason = corrupt ? 'unparseable' : empty ? 'no player rows' : 'missing rating points'
      console.log(`  ! ${reason} — ${label}${DRY_RUN ? ' (dry-run, not deleted)' : ' — deleting for refetch'}`)
      if (!DRY_RUN) unlinkSync(statsPath)
      deletedForRatingPoints++
      statsNeedsRefetch = true
    } else {
      statsUsable = true
    }
  }

  if (!existsSync(detailsPath)) {
    console.log(`  ! missing match-details file — ${label}`)
    missingDetailsFile++
    continue
  }

  let details
  try {
    details = JSON.parse(readFileSync(detailsPath, 'utf8'))
  } catch {
    console.log(`  ! unparseable match-details file — ${label}`)
    missingDetailsFile++
    continue
  }

  if (details.wheelo && statsNeedsRefetch) {
    console.log(`  ! stale ratings marker on match-details — ${label}${DRY_RUN ? ' (dry-run, not stripped)' : ' — stripping, blocked on refetch'}`)
    if (!DRY_RUN) {
      delete details.wheelo
      writeFileSync(detailsPath, JSON.stringify(details, null, 2))
    }
    strippedRatingsMarker++
    missingRatingsBlockedOnStats++
  } else if (!details.wheelo) {
    if (statsUsable) {
      missingRatings++
    } else {
      console.log(`  ! missing ratings data, blocked until stats file is (re)fetched — ${label}`)
      missingRatingsBlockedOnStats++
    }
  }
}

console.log(
  `\nSummary: ${missingStatsFile} missing stats file(s), ${missingDetailsFile} missing match-details file(s), ` +
    `${deletedForRatingPoints} stats file(s) deleted for refetch, ${strippedRatingsMarker} stale ratings marker(s) stripped, ` +
    `${missingRatingsBlockedOnStats} match(es) missing ratings blocked pending stats refetch, ` +
    `${missingRatings} match(es) missing ratings data.`,
)

const RATINGS_IMPORTER = join(ROOT, 'data_sources/ratings-enrichment/import-season.js')

if (missingRatings === 0) {
  console.log('\nNo ratings data missing — nothing to import.')
} else if (!existsSync(RATINGS_IMPORTER)) {
  // data_sources/ is gitignored (local-only tooling, never committed — see
  // data_sources/ratings-enrichment/README.md) so it simply doesn't exist on a fresh
  // CI checkout. That's expected there, not an error — importing ratings data is
  // something to run from a machine that has data_sources/ checked out.
  console.log(`\n${missingRatings} match(es) missing ratings data, but data_sources/ratings-enrichment/ isn't present in this checkout (expected in CI) — skipping.`)
} else if (DRY_RUN) {
  console.log(`\nDry-run: would run \`npm run import-ratings -- --year=${SEASON}\``)
} else {
  console.log(`\nRunning ratings import for season ${SEASON}...`)
  execSync(`npm run import-ratings -- --year=${SEASON}`, { stdio: 'inherit', cwd: ROOT })
}
