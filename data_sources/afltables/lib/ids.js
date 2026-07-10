/**
 * ID resolution + the persistent id-map for the afltables scraper.
 *
 * Forked from ../../statscache/lib/ids.js (not shared) so this scraper's minted ids
 * are collision-proof by construction: a distinct prefix (`AT_I` for players, `AT_T`
 * for the (expected-unused) unknown-team fallback) backed by its own `id-map.json`,
 * with its own counters starting from 1 — no coordination with the footywire
 * scraper's live `id-map.json` is needed or possible.
 *
 * Teams: afltables slug → identity via teams.js — all 12 slugs that appear in
 * 1897–1964 already resolve to an existing CD_T or PW_T90x id (see teams.js), so
 * the unknown-slug mint path below is a defensive fallback that should never trigger.
 *
 * Players: resolved against the existing ChampionData dataset by NAME + TEAM, with
 * DOB as a tie-breaker — identical matching logic to the footywire scraper (see its
 * ids.js for the detailed resolution-order rationale). In practice, expect almost
 * every 1897–1964 player to mint a fresh AT_I id without ever needing a DOB fetch,
 * since pre-1965 players essentially never recur in 2012+ CD data.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { TEAM_TABLE, nameFromSlug } from './teams.js'
import { normalizeName } from '../../statscache/lib/normalize.js'
import { buildCdIndex } from '../../statscache/lib/cd-index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ID_MAP_PATH = join(HERE, '..', 'id-map.json')

const PLAYER_ID_START = 1
const TEAM_ID_START = 9500 // far outside footywire's PW_T9001-Txxx and the CD range

function emptyMap() {
  return {
    players: {}, // persistent key → { playerId, matched, givenName, surname, dob }
    teams: {}, // slug → minted team identity (fallback only)
    counters: { player: PLAYER_ID_START, team: TEAM_ID_START },
  }
}

export function createIdResolver() {
  const map = existsSync(ID_MAP_PATH)
    ? { ...emptyMap(), ...JSON.parse(readFileSync(ID_MAP_PATH, 'utf8')) }
    : emptyMap()

  const cd = buildCdIndex()
  const stats = { matched: 0, minted: 0 }

  function resolveTeam(slug) {
    if (TEAM_TABLE[slug]) return TEAM_TABLE[slug]
    if (map.teams[slug]) return map.teams[slug]
    const numericId = map.counters.team++
    const minted = {
      providerId: `AT_T${numericId}`,
      numericId,
      name: nameFromSlug(slug),
      abbreviation: nameFromSlug(slug).slice(0, 4).toUpperCase(),
      nickname: nameFromSlug(slug),
    }
    map.teams[slug] = minted
    return minted
  }

  function persist(key, record) {
    map.players[key] = record
    return { playerId: record.playerId, matched: record.matched, decided: true }
  }

  /**
   * Resolve an afltables player to an existing CD_I id, or mint an AT_I id.
   * @param {{name:string, teamProviderId:string, permalink:string, dob?:string|null}} p
   * @param {{final?:boolean}} opts
   * @returns {{playerId?:string, matched?:boolean, decided:boolean}}
   */
  function resolvePlayer(p, opts = {}) {
    const final = opts.final ?? false
    const dob = p.dob ?? null

    // afltables player names are "Surname, Given" — flip to given/surname so the
    // normalized full name matches cd-index's "given surname" key order.
    const [surnamePart, givenPart] = (p.name || '').split(',').map((s) => s.trim())
    const givenName = givenPart ?? ''
    const surname = surnamePart ?? ''
    const norm = normalizeName(`${givenName} ${surname}`)
    const surnameNorm = normalizeName(surname)

    // Key by the afltables player permalink — the site's own stable identity for
    // that player, used unchanged across every club they played for.
    const memoKey = p.permalink || `${norm}|${dob ?? p.teamProviderId}`
    if (map.players[memoKey]) {
      const r = map.players[memoKey]
      return { playerId: r.playerId, matched: r.matched, decided: true }
    }

    const record = (playerId, matched) => ({ playerId, matched, givenName, surname, dob })
    const mint = () => {
      stats.minted++
      return persist(memoKey, record(`AT_I${map.counters.player++}`, false))
    }

    const cands =
      cd.nameTeam.get(`${norm}|${p.teamProviderId}`) ||
      (surnameNorm && cd.surnameTeam.get(`${surnameNorm}|${p.teamProviderId}`)) ||
      cd.byName.get(norm) ||
      null

    if (!cands || cands.size === 0) return mint()

    if (!dob) {
      if (!final) return { decided: false }
      return mint()
    }
    const hit = [...cands].find((id) => cd.dobById.get(id) === dob)
    if (hit) { stats.matched++; return persist(memoKey, record(hit, true)) }
    return mint()
  }

  function save() {
    writeFileSync(ID_MAP_PATH, JSON.stringify(map, null, 2))
  }

  return { resolveTeam, resolvePlayer, save, map, stats, cdPlayers: cd.teamRosterPlayers, ID_MAP_PATH }
}
