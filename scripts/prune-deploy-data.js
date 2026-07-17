/**
 * Trims dist/data/ down to what the live site actually needs, after `vite build`
 * has copied all of public/data/ (130 seasons, ~1.6GB) into dist/ verbatim.
 *
 * public/ itself is never touched — it stays the full history for git and for
 * local dev (`vite dev` serves it directly). This only prunes the transient,
 * gitignored dist/ build output right before it gets published.
 *
 * Kept for every season: fixture.json (and last-updated.json where present) —
 * the head-to-head modal fetches every season's fixture.json for all-time
 * team records.
 *
 * Dropped for every non-current season: match-details/, stats/, team-stats/ —
 * the bulk of the file count, only reachable today via the undocumented
 * ?season= override on the stats browser.
 *
 * Dropped entirely: data/players/ — a data-pipeline artifact (fetch-stats.js,
 * ratings enrichment) that nothing in src/ fetches at runtime.
 *
 * Usage: node scripts/prune-deploy-data.js
 */

import { readFileSync, readdirSync, rmSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const seasonsSource = readFileSync(join(ROOT, 'src/config/seasons.ts'), 'utf8')
const currentYearMatch = seasonsSource.match(/CURRENT_SEASON_YEAR\s*=\s*'(\d+)'/)
const CURRENT_SEASON_YEAR = currentYearMatch?.[1]
if (!CURRENT_SEASON_YEAR) {
  console.error('Could not find CURRENT_SEASON_YEAR in src/config/seasons.ts')
  process.exit(1)
}

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

const playersDir = join(DIST_DATA, 'players')
let playersRemoved = 0
if (existsSync(playersDir)) {
  playersRemoved = countFiles(playersDir)
  rmSync(playersDir, { recursive: true, force: true })
}

let seasonsPruned = 0
let seasonFilesRemoved = 0
for (const entry of readdirSync(DIST_DATA, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^\d{4}$/.test(entry.name)) continue
  if (entry.name === CURRENT_SEASON_YEAR) continue

  const seasonDir = join(DIST_DATA, entry.name)
  for (const sub of ['match-details', 'stats', 'team-stats']) {
    const subDir = join(seasonDir, sub)
    if (!existsSync(subDir)) continue
    seasonFilesRemoved += countFiles(subDir)
    rmSync(subDir, { recursive: true, force: true })
  }
  seasonsPruned++
}

const afterCount = countFiles(DIST_DATA)

console.log(`Pruned dist/data/ for deploy (current season: ${CURRENT_SEASON_YEAR})`)
console.log(`  players/ removed: ${playersRemoved} files`)
console.log(`  ${seasonsPruned} past seasons pruned (match-details/stats/team-stats): ${seasonFilesRemoved} files`)
console.log(`  total: ${beforeCount} -> ${afterCount} files`)
