/**
 * Build a lookup index over the existing ChampionData dataset — the same data the
 * local-db app serves — so footywire players can be resolved to CD_I* ids by
 * NAME + TEAM (and DOB as a tie-breaker) instead of scraping profile pages.
 *
 * Sources:
 *   - public/data/{year}/team-stats/CD_T*.json → which player played for which
 *     team in which season (name + teamId + playerId).
 *   - public/data/players/CD_I*.json → date of birth (for ambiguity tie-breaks).
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { normalizeName, dobFromCd } from './normalize.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..')
const DATA_DIR = join(ROOT, 'public', 'data')
const PLAYERS_DIR = join(DATA_DIR, 'players')

export function buildCdIndex() {
  const nameTeam = new Map() // `${normFullName}|${teamProviderId}` → Set<playerId>
  const surnameTeam = new Map() // `${normSurname}|${teamProviderId}` → Set<playerId>
  const byName = new Map() // normFullName → Set<playerId>
  const dobById = new Map() // playerId → isoDob
  const nameById = new Map() // playerId → { givenName, surname }

  const add = (map, key, id) => {
    if (!map.has(key)) map.set(key, new Set())
    map.get(key).add(id)
  }

  // Team rosters across every CD season.
  if (existsSync(DATA_DIR)) {
    for (const year of readdirSync(DATA_DIR)) {
      const teamStatsDir = join(DATA_DIR, year, 'team-stats')
      if (!existsSync(teamStatsDir)) continue
      for (const file of readdirSync(teamStatsDir)) {
        if (!file.startsWith('CD_T') || !file.endsWith('.json')) continue
        let data
        try {
          data = JSON.parse(readFileSync(join(teamStatsDir, file), 'utf8'))
        } catch {
          continue
        }
        const teamId = data.teamId
        for (const p of data.players ?? []) {
          if (!p.playerId || !String(p.playerId).startsWith('CD_I')) continue
          const norm = normalizeName(`${p.givenName} ${p.surname}`)
          add(nameTeam, `${norm}|${teamId}`, p.playerId)
          add(surnameTeam, `${normalizeName(p.surname)}|${teamId}`, p.playerId)
          add(byName, norm, p.playerId)
          if (!nameById.has(p.playerId)) nameById.set(p.playerId, { givenName: p.givenName, surname: p.surname })
        }
      }
    }
  }

  // DOB per player for tie-breaking.
  if (existsSync(PLAYERS_DIR)) {
    for (const file of readdirSync(PLAYERS_DIR)) {
      if (!file.startsWith('CD_I') || !file.endsWith('.json')) continue
      try {
        const p = JSON.parse(readFileSync(join(PLAYERS_DIR, file), 'utf8'))
        const dob = dobFromCd(p.dateOfBirth)
        if (dob) dobById.set(file.replace('.json', ''), dob)
      } catch {
        /* skip */
      }
    }
  }

  return { nameTeam, surnameTeam, byName, dobById, nameById, teamRosterPlayers: byName.size }
}
