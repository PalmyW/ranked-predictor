/**
 * ID resolution + the persistent id-map.
 *
 * Teams: footywire slug → CD_T / PW_T identity via teams.js (unknown slugs minted).
 *
 * Players: resolved against the existing ChampionData dataset (the local-db app's
 * data) by NAME + TEAM, with DOB only as a tie-breaker. This means the common case
 * needs no footywire profile fetch at all. Resolution order:
 *   1. name + team is unique in CD            → reuse that CD_I id   (high confidence)
 *   2. name is unique in CD (traded player)   → reuse that CD_I id   (cross-era)
 *   3. ambiguous and a DOB is supplied        → pick the CD id whose DOB matches
 *   4. otherwise                              → mint a stable PW_I id
 *
 * When a name resolves ambiguously without a DOB, resolvePlayer returns
 * { decided:false } so the caller can fetch the footywire profile for a DOB and
 * retry. The id↔player assignment is persisted in id-map.json so re-runs and later
 * seasons reuse the same ids.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { TEAM_TABLE, nameFromSlug } from './teams.js'
import { normalizeName } from './normalize.js'
import { buildCdIndex } from './cd-index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ID_MAP_PATH = join(HERE, '..', 'id-map.json')

const PLAYER_ID_START = 900001
const TEAM_ID_START = 9100

function emptyMap() {
  return {
    players: {}, // persistent key → { playerId, matched, givenName, surname, dob }
    teams: {}, // slug → minted team identity
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
      providerId: `PW_T${numericId}`,
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
   * Resolve a footywire player to an existing CD_I id, or mint a PW_I id.
   *
   * A name candidate (full name+team → surname+team → name) is only ACCEPTED when
   * the player's date of birth confirms it — otherwise a pre-CD player who merely
   * shares a surname+club with a modern player would inherit that player's id.
   *
   * @param {{name:string, teamProviderId:string, dob?:string|null}} p
   * @param {{final?:boolean}} opts  final:true forces a decision (mint when a match
   *   can't be DOB-confirmed); final:false returns { decided:false } when a DOB is
   *   needed, so the caller can fetch a profile and retry.
   * @returns {{playerId?:string, matched?:boolean, decided:boolean}}
   */
  function resolvePlayer(p, opts = {}) {
    const final = opts.final ?? false
    const norm = normalizeName(p.name)
    const dob = p.dob ?? null
    // Key by the statscache player slug — it is the player's canonical (final-club)
    // identity, used unchanged across every team they played for, so a player who
    // changed clubs (e.g. Tony Lockett: St Kilda → Sydney) resolves to ONE id.
    const memoKey = p.slug || `${norm}|${dob ?? p.teamProviderId}`
    if (map.players[memoKey]) {
      const r = map.players[memoKey]
      return { playerId: r.playerId, matched: r.matched, decided: true }
    }

    const [givenName, ...rest] = (p.name || '').trim().split(/\s+/)
    const surname = rest.join(' ')
    const surnameNorm = normalizeName(surname)
    const record = (playerId, matched) => ({ playerId, matched, givenName: givenName ?? '', surname, dob })
    const mint = () => {
      stats.minted++
      return persist(memoKey, record(`PW_I${map.counters.player++}`, false))
    }

    // Most-specific non-empty candidate tier.
    const cands =
      cd.nameTeam.get(`${norm}|${p.teamProviderId}`) ||
      (surnameNorm && cd.surnameTeam.get(`${surnameNorm}|${p.teamProviderId}`)) ||
      cd.byName.get(norm) ||
      null

    // No existing CD player by this name → a genuinely new (pre-CD) player.
    if (!cands || cands.size === 0) return mint()

    // A name candidate exists — require a DOB to confirm it's the same person.
    if (!dob) {
      if (!final) return { decided: false } // caller fetches a profile for the DOB and retries
      return mint() // no DOB available to confirm with — don't risk a false match
    }
    const hit = [...cands].find((id) => cd.dobById.get(id) === dob)
    if (hit) { stats.matched++; return persist(memoKey, record(hit, true)) }
    return mint() // DOB doesn't match any candidate → different person
  }

  function save() {
    writeFileSync(ID_MAP_PATH, JSON.stringify(map, null, 2))
  }

  return { resolveTeam, resolvePlayer, save, map, stats, cdPlayers: cd.teamRosterPlayers, ID_MAP_PATH }
}
