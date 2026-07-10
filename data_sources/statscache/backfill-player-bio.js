/**
 * Backfill missing dateOfBirth/heightCm for already-scraped footywire players.
 * The 1965–2011 counterpart to ../afltables/backfill-player-bio.js — same gap,
 * same fix, different source.
 *
 * scrape-season.js only fetches a player's own profile page (`pp-{slug}`) when
 * a CD-id match is ambiguous and needs a DOB tie-break (see lib/ids.js's
 * resolvePlayer) — the common case for this era is a brand-new player with zero
 * CD candidates, which mints a `PW_I` id immediately without ever fetching the
 * profile page (there's nothing to disambiguate). So most `PW_I` players never
 * had their `Born:`/`Playing Height:` line pulled, even though the page has it
 * and lib/parse-profile.js already parses it — confirmed 90.4% of PW_I profiles
 * (3744 of 4141) are missing one or both as of this script's introduction.
 *
 * Not a rescrape — a separate pass over the existing output: for every PW_I
 * profile missing dateOfBirth or heightCm, look up that player's `pp-` slug from
 * id-map.json (the reverse of the persistent slug→id map the base scraper
 * already maintains) and fetch just that one page.
 *
 * Usage:
 *   node data_sources/statscache/backfill-player-bio.js
 *   node data_sources/statscache/backfill-player-bio.js --limit=100   # debugging
 *   node data_sources/statscache/backfill-player-bio.js --force        # re-fetch even players who already have both fields
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { fetchPage } from './lib/http.js'
import { parseProfile } from './lib/parse-profile.js'
import { dobToCd } from './lib/normalize.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const PLAYERS_DIR = join(ROOT, 'public', 'data', 'players')
const ID_MAP_PATH = join(HERE, 'id-map.json')

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=').slice(1).join('=') : undefined
}
const hasFlag = (name) => process.argv.includes(`--${name}`)

async function main() {
  const force = hasFlag('force')
  const limit = Number(arg('limit')) || 0

  const idMap = JSON.parse(readFileSync(ID_MAP_PATH, 'utf8'))
  const slugByPlayerId = new Map()
  for (const [slug, rec] of Object.entries(idMap.players ?? {})) {
    if (rec.playerId?.startsWith('PW_I')) slugByPlayerId.set(rec.playerId, slug)
  }
  console.log(`Indexed ${slugByPlayerId.size} PW_I slug(s) from id-map.json.`)

  const files = readdirSync(PLAYERS_DIR).filter((f) => f.startsWith('PW_I') && f.endsWith('.json'))
  const targets = []
  let noSlug = 0
  for (const file of files) {
    const playerId = file.replace('.json', '')
    const path = join(PLAYERS_DIR, file)
    const profile = JSON.parse(readFileSync(path, 'utf8'))
    if (profile.role === 'coach') continue // minted from a cp- coach page, which has no Born:/Height: line at all
    if (!force && profile.dateOfBirth && profile.heightCm) continue

    const slug = slugByPlayerId.get(playerId)
    if (!slug) {
      noSlug++
      continue
    }
    targets.push({ playerId, path, profile, slug })
  }
  if (noSlug > 0) console.log(`${noSlug} player(s) missing bio but have no slug in id-map.json — skipped.`)

  const capped = limit ? targets.slice(0, limit) : targets
  console.log(`${capped.length}/${targets.length} player(s) to check${capped.length < targets.length ? ' (capped by --limit)' : ''}.`)

  let fetched = 0
  let failed = 0
  let updatedDob = 0
  let updatedHeight = 0

  for (const t of capped) {
    let html
    try {
      html = await fetchPage(t.slug)
    } catch (e) {
      console.log(`  ${t.playerId}: fetch failed — ${e.message}`)
      failed++
      continue
    }
    fetched++

    const { dob, heightCm } = parseProfile(html)
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
