/**
 * Trims dist/data/ down to what the live site actually needs, after `vite build`
 * has copied all of public/data/ (130+ AFL seasons, 11 AFLW seasons, ~1.6GB)
 * into dist/ verbatim.
 *
 * public/ itself is never touched — it stays the full history for git and for
 * local dev (`vite dev` serves it directly). This only prunes the transient,
 * gitignored dist/ build output right before it gets published.
 *
 * Kept for every season, in both leagues: fixture.json (and last-updated.json
 * where present) — the head-to-head modal fetches every season's fixture.json
 * for all-time team records.
 *
 * Dropped for every non-current season, in both leagues: match-details/,
 * stats/, team-stats/ — the bulk of the file count, only reachable today via
 * the undocumented ?season= override on the stats browser.
 *
 * Dropped entirely, in both leagues: players/ — a data-pipeline artifact
 * (fetch-stats.js, ratings enrichment) that nothing in src/ fetches at runtime.
 *
 * Usage: node scripts/prune-deploy-data.js
 */

import { readdirSync, rmSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { LEAGUES, loadCurrentSeasonYear } from './lib/league.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const DIST_DATA = join(ROOT, 'dist/data')
if (!existsSync(DIST_DATA)) {
  console.error(`${DIST_DATA} does not exist — run \`vite build\` first.`)
  process.exit(1)
}

function countFiles(dir) {
  if (!existsSync(dir)) return 0
  let count = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    count += entry.isDirectory() ? countFiles(full) : 1
  }
  return count
}

const beforeCount = countFiles(DIST_DATA)

// Prunes one league's data directory under dist/ (dataRoot() with ROOT
// swapped for the dist tree — the two directory layouts are identical, just
// rooted at dist/ instead of the repo root). No-ops if that league has no
// data in this build (e.g. AFLW before its first fetch).
function pruneLeague(league) {
  const distRoot = league.subdir ? join(DIST_DATA, league.subdir) : DIST_DATA
  if (!existsSync(distRoot)) return { playersRemoved: 0, seasonsPruned: 0, seasonFilesRemoved: 0 }

  const currentYear = loadCurrentSeasonYear(ROOT, league)
  if (!currentYear) {
    console.error(`Could not find ${league.currentConst} in src/config/seasons.ts`)
    process.exit(1)
  }

  const playersDir = join(distRoot, 'players')
  let playersRemoved = 0
  if (existsSync(playersDir)) {
    playersRemoved = countFiles(playersDir)
    rmSync(playersDir, { recursive: true, force: true })
  }

  let seasonsPruned = 0
  let seasonFilesRemoved = 0
  for (const entry of readdirSync(distRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !league.keyPattern.test(entry.name)) continue
    if (entry.name === currentYear) continue

    const seasonDir = join(distRoot, entry.name)
    for (const sub of ['match-details', 'stats', 'team-stats']) {
      const subDir = join(seasonDir, sub)
      if (!existsSync(subDir)) continue
      seasonFilesRemoved += countFiles(subDir)
      rmSync(subDir, { recursive: true, force: true })
    }
    seasonsPruned++
  }

  console.log(`[${league.key}] current season: ${currentYear}`)
  console.log(`  players/ removed: ${playersRemoved} files`)
  console.log(`  ${seasonsPruned} past season(s) pruned (match-details/stats/team-stats): ${seasonFilesRemoved} files`)

  return { playersRemoved, seasonsPruned, seasonFilesRemoved }
}

for (const league of Object.values(LEAGUES)) {
  pruneLeague(league)
}

const afterCount = countFiles(DIST_DATA)

console.log(`Pruned dist/data/ for deploy: ${beforeCount} -> ${afterCount} files`)
