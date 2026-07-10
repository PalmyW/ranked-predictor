/**
 * Full-history, all-provider player name index for coach matching.
 *
 * Unlike `../../statscache/lib/cd-index.js` (which only indexes CD_I* players,
 * scoped by team, for the footywire *player* scraper), coach matching needs a
 * broader net: a coach may never have played for the club they now coach — or
 * may have played only in the pre-2012 era, where they'd exist solely as a
 * footywire- or afltables-minted id from those backfills, never a CD id. So this
 * indexes every provider's players, by normalized full name only (no team
 * scoping), across every `public/data/{year}/team-stats/*.json` file.
 *
 * Also tracks each player's active year range (first/last season they appear in
 * a team-stats file), so an ambiguous same-name match can be narrowed by
 * plausibility — a coach must have stopped playing at or before the season
 * they're coaching.
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { normalizeName } from '../../statscache/lib/normalize.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')
const DATA_DIR = join(ROOT, 'public', 'data')

export function buildPlayerIndex() {
  const byName = new Map() // normalizedFullName → Map<playerId, {givenName, surname, minYear, maxYear}>

  if (existsSync(DATA_DIR)) {
    for (const year of readdirSync(DATA_DIR)) {
      if (!/^\d{4}$/.test(year)) continue
      const teamStatsDir = join(DATA_DIR, year, 'team-stats')
      if (!existsSync(teamStatsDir)) continue
      const yr = Number(year)
      for (const file of readdirSync(teamStatsDir)) {
        if (!file.endsWith('.json')) continue
        let data
        try {
          data = JSON.parse(readFileSync(join(teamStatsDir, file), 'utf8'))
        } catch {
          continue
        }
        for (const p of data.players ?? []) {
          if (!p.playerId || !p.givenName) continue
          const norm = normalizeName(`${p.givenName} ${p.surname}`)
          if (!norm) continue
          if (!byName.has(norm)) byName.set(norm, new Map())
          const players = byName.get(norm)
          const existing = players.get(p.playerId)
          if (existing) {
            existing.minYear = Math.min(existing.minYear, yr)
            existing.maxYear = Math.max(existing.maxYear, yr)
          } else {
            players.set(p.playerId, { givenName: p.givenName, surname: p.surname, minYear: yr, maxYear: yr })
          }
        }
      }
    }
  }

  /** @returns {Array<{playerId, givenName, surname, minYear, maxYear}>} */
  function candidates(name) {
    const norm = normalizeName(name)
    const players = byName.get(norm)
    return players ? [...players.entries()].map(([playerId, v]) => ({ playerId, ...v })) : []
  }

  return { candidates, size: byName.size }
}
