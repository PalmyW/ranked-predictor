/**
 * Backfill missing dateOfBirth/heightCm for already-scraped afltables players.
 *
 * scrape-season.js only fetches a player's own profile page when a CD-id match
 * is ambiguous and needs a DOB tie-break (see lib/ids.js's resolvePlayer) — the
 * overwhelmingly common case for this era is a brand-new player with zero CD
 * candidates, which mints an `AT_I` id immediately without ever fetching the
 * profile page at all (there's nothing to disambiguate). So most AT_I players
 * never had their `Born:`/`Height:` line pulled, even though the page has it
 * and lib/player-page.js already knows how to parse it — confirmed 92.8% of
 * AT_I profiles (7098 of 7649) are missing one or both as of this script's
 * introduction.
 *
 * This is a separate pass over the *output*, not a rescrape: for every AT_I
 * profile missing dateOfBirth or heightCm, it looks up that player's permalink
 * from id-map.json (the reverse of the persistent permalink→id map the base
 * scraper already maintains) and fetches just that one page.
 *
 * Usage:
 *   node data_sources/afltables/backfill-player-bio.js
 *   node data_sources/afltables/backfill-player-bio.js --limit=100   # debugging
 *   node data_sources/afltables/backfill-player-bio.js --force        # re-fetch even players who already have both fields
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { fetchPage } from './lib/http.js'
import { parsePlayerPage } from './lib/player-page.js'
import { dobToCd } from '../statscache/lib/normalize.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const PLAYERS_DIR = join(ROOT, 'public', 'data', 'players')
const ID_MAP_PATH = join(HERE, 'id-map.json')
const BASE_URL = 'https://afltables.com/afl/'

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=').slice(1).join('=') : undefined
}
const hasFlag = (name) => process.argv.includes(`--${name}`)

async function main() {
  const force = hasFlag('force')
  const limit = Number(arg('limit')) || 0

  const idMap = JSON.parse(readFileSync(ID_MAP_PATH, 'utf8'))
  const permalinkByPlayerId = new Map()
  for (const [permalink, rec] of Object.entries(idMap.players ?? {})) {
    if (rec.playerId?.startsWith('AT_I')) permalinkByPlayerId.set(rec.playerId, permalink)
  }
  console.log(`Indexed ${permalinkByPlayerId.size} AT_I permalink(s) from id-map.json.`)

  const files = readdirSync(PLAYERS_DIR).filter((f) => f.startsWith('AT_I') && f.endsWith('.json'))
  const targets = []
  let noPermalink = 0
  for (const file of files) {
    const playerId = file.replace('.json', '')
    const path = join(PLAYERS_DIR, file)
    const profile = JSON.parse(readFileSync(path, 'utf8'))
    if (profile.role === 'coach') continue // minted from a coaches/ page, not a players/ one — nothing to fetch
    if (!force && profile.dateOfBirth && profile.heightCm) continue

    const permalink = permalinkByPlayerId.get(playerId)
    if (!permalink) {
      noPermalink++
      continue
    }
    targets.push({ playerId, path, profile, permalink })
  }
  if (noPermalink > 0) console.log(`${noPermalink} player(s) missing bio but have no permalink in id-map.json — skipped.`)

  const capped = limit ? targets.slice(0, limit) : targets
  console.log(`${capped.length}/${targets.length} player(s) to check${capped.length < targets.length ? ' (capped by --limit)' : ''}.`)

  let fetched = 0
  let failed = 0
  let updatedDob = 0
  let updatedHeight = 0

  for (const t of capped) {
    const url = new URL(t.permalink, `${BASE_URL}stats/games/x/x.html`).href
    let html
    try {
      html = await fetchPage(url)
    } catch (e) {
      console.log(`  ${t.playerId}: fetch failed — ${e.message}`)
      failed++
      continue
    }
    fetched++

    const { dob, heightCm } = parsePlayerPage(html)
    let changed = false
    if (dob && (force || !t.profile.dateOfBirth)) {
      t.profile.dateOfBirth = dobToCd(dob)
      updatedDob++
      changed = true
    }
    if (heightCm && (force || !t.profile.heightCm)) {
      t.profile.heightCm = heightCm
      updatedHeight++
      changed = true
    }
    if (changed) writeFileSync(t.path, JSON.stringify(t.profile, null, 2))

    if (fetched % 50 === 0) process.stdout.write(`  ${fetched}/${capped.length} fetched\r`)
  }

  console.log(
    `\nDone. ${fetched} page(s) fetched, ${failed} failed, ${updatedDob} date(s) of birth backfilled, ${updatedHeight} height(s) backfilled.`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
