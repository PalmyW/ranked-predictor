/**
 * Fetch each season's *full club squad lists* (team ↔ player ↔ year), including
 * players who never took the field that season, and bio profiles for any of
 * those players not already on disk.
 *
 * fetch-stats.js only discovers player ids by scanning played matches
 * (homeTeamPlayerStats/awayTeamPlayerStats), so a debutant, delisted free agent,
 * or injured recruit who hasn't played has no CD_I profile anywhere in
 * public/data/players/, and no team/year association anywhere at all. AFL.com.au's
 * team pages (e.g. https://www.afl.com.au/teams/adelaide-crows) render from a
 * squad endpoint that lists the full roster regardless of games played, and
 * — unlike the page itself — it's addressable by *season* too, so it can answer
 * "who was on team X's list in year Y" retrospectively, not just for the
 * current season:
 *   GET https://aflapi.afl.com.au/afl/v2/squads?compSeasonId={id}&teamId={id}
 *
 * For each requested season this writes public/data/{year}/squads.json (team →
 * player → jumper number/position), the season-level complement to fixture.json.
 * It then fetches the same rich profile fetch-stats.js uses
 * (https://api.afl.com.au/statspro/playerProfile/{id}) for any squad member,
 * from any season, not already on disk — so the output schema is identical to
 * existing CD_I*.json files.
 *
 * Usage:
 *   node scripts/fetch-squad-players.js                    # every AFL Premiership season (2012–latest)
 *   node scripts/fetch-squad-players.js --season=2026       # a single season
 *   node scripts/fetch-squad-players.js --from=2020 --to=2026
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=')[1] : undefined
}

const PLAYERS_DIR = join(ROOT, 'public/data/players')
mkdirSync(PLAYERS_DIR, { recursive: true })

let TOKEN = process.env.AFL_STATS_TOKEN
if (!TOKEN) {
  const tokRes = execSync(
    `curl -fsSL -X POST` +
      ` -H 'accept: */*'` +
      ` -H 'content-length: 0'` +
      ` -H 'origin: https://www.afl.com.au'` +
      ` -H 'referer: https://www.afl.com.au/'` +
      ` -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'` +
      ` 'https://api.afl.com.au/cfs/afl/WMCTok'`,
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  TOKEN = JSON.parse(tokRes).token
  console.log('Fetched fresh token.')
}

function fetchJson(url) {
  const body = execSync(`curl -fsSL -A 'Mozilla/5.0' '${url}'`, { stdio: ['ignore', 'pipe', 'pipe'] })
  return JSON.parse(body)
}

// --- Resolve which AFL Premiership seasons to process ---
const compSeasons = fetchJson('https://aflapi.afl.com.au/afl/v2/compseasons?pageSize=200').compSeasons
const premierships = compSeasons
  .filter((cs) => cs.competition.providerId === 'CD_C014')
  .sort((a, b) => a.season.year - b.season.year)

const seasonArg = arg('season')
const fromArg = Number(arg('from')) || premierships[0].season.year
const toArg = Number(arg('to')) || premierships[premierships.length - 1].season.year

const targetCompSeasons = seasonArg
  ? premierships.filter((cs) => cs.season.year === Number(seasonArg))
  : premierships.filter((cs) => cs.season.year >= fromArg && cs.season.year <= toArg)

if (targetCompSeasons.length === 0) {
  console.error('No matching AFL Premiership compSeason(s) found for the given range.')
  process.exit(1)
}
console.log(`Processing ${targetCompSeasons.length} season(s): ${targetCompSeasons.map((cs) => cs.season.year).join(', ')}`)

// --- Resolve the 18 AFL men's team ids (stable across seasons) ---
const teams = fetchJson('https://aflapi.afl.com.au/afl/v2/teams?pageSize=50').teams.filter(
  (t) => t.teamType === 'MEN',
)
console.log(`Found ${teams.length} AFL men's teams.\n`)

// --- Pull every season × team squad, write squads.json, collect unique CD_I ids ---
const allSquadPlayers = new Map() // playerId → { firstName, surname, teamName } (last-seen label, for logging only)

for (const compSeason of targetCompSeasons) {
  const year = compSeason.season.year
  console.log(`[${year}] compSeason ${compSeason.id} (${compSeason.name})`)

  const seasonTeams = []
  for (const team of teams) {
    const url = `https://aflapi.afl.com.au/afl/v2/squads?compSeasonId=${compSeason.id}&teamId=${team.id}`
    let squad
    try {
      squad = fetchJson(url).squad
    } catch (e) {
      console.log(`  ${team.name}: FAILED to fetch squad`)
      continue
    }
    const players = (squad?.players ?? [])
      .filter((entry) => entry.player?.providerId?.startsWith('CD_I'))
      .map((entry) => ({
        playerId: entry.player.providerId,
        jumperNumber: entry.jumperNumber ?? null,
        position: entry.position ?? null,
      }))
    if (players.length === 0) continue // team didn't exist yet this season (e.g. GWS/GCS pre-2011)

    seasonTeams.push({ teamId: team.providerId, teamName: team.name, players })
    for (const entry of squad.players) {
      const p = entry.player
      if (!p?.providerId?.startsWith('CD_I')) continue
      allSquadPlayers.set(p.providerId, { firstName: p.firstName, surname: p.surname, teamName: team.name })
    }
  }

  const outDir = join(ROOT, `public/data/${year}`)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    join(outDir, 'squads.json'),
    JSON.stringify({ compSeasonId: compSeason.id, generatedAt: new Date().toISOString(), teams: seasonTeams }, null, 2),
  )
  console.log(`  wrote squads.json (${seasonTeams.reduce((n, t) => n + t.players.length, 0)} player-team rows across ${seasonTeams.length} teams)`)
}

console.log(`\n${allSquadPlayers.size} unique squad player id(s) across all processed seasons.`)

// --- Filter to players missing a profile on disk ---
const newPlayers = [...allSquadPlayers.keys()].filter((pid) => {
  const profilePath = join(PLAYERS_DIR, `${pid}.json`)
  if (!existsSync(profilePath)) return true
  try {
    return readFileSync(profilePath, 'utf8').trim() === 'null'
  } catch {
    return false
  }
})

function fetchPlayerProfile(pid, url) {
  const res = execSync(
    `curl -sL -w '\\n%{http_code}'` +
      ` -H 'accept: */*'` +
      ` -H 'origin: https://www.afl.com.au'` +
      ` -H 'referer: https://www.afl.com.au/'` +
      ` -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'` +
      ` -H 'x-media-mis-token: ${TOKEN}'` +
      ` '${url}'`,
    { stdio: ['ignore', 'pipe', 'pipe'] },
  ).toString()
  const lastNewline = res.lastIndexOf('\n')
  return {
    status: parseInt(res.slice(lastNewline + 1).trim(), 10),
    body: res.slice(0, lastNewline),
  }
}

if (newPlayers.length === 0) {
  console.log('No new squad players to fetch profiles for.')
} else {
  console.log(`Fetching profiles for ${newPlayers.length} new squad player(s)...`)
  const BATCH = 5
  let ok = 0
  let failed = 0
  for (let i = 0; i < newPlayers.length; i += BATCH) {
    const batch = newPlayers.slice(i, i + BATCH)
    for (const pid of batch) {
      const label = allSquadPlayers.get(pid)
      process.stdout.write(`  ${pid} (${label.firstName} ${label.surname}, ${label.teamName})... `)
      try {
        let { status, body } = fetchPlayerProfile(pid, `https://api.afl.com.au/statspro/playerProfile/${pid}`)
        if (status === 404) {
          ;({ status, body } = fetchPlayerProfile(
            pid,
            `https://api.afl.com.au/statspro/playerProfile/${pid}?competitionCode=CD_C014`,
          ))
        }
        if (status === 200) {
          const { playerDetails } = JSON.parse(body)
          writeFileSync(join(PLAYERS_DIR, `${pid}.json`), JSON.stringify(playerDetails, null, 2))
          console.log('done')
          ok++
        } else if (status === 404) {
          writeFileSync(join(PLAYERS_DIR, `${pid}.json`), JSON.stringify({ notFound: true }))
          console.log('not found')
          ok++
        } else {
          console.log(`FAILED (${status})`)
          failed++
        }
      } catch {
        console.log('FAILED')
        failed++
      }
    }
    if (i + BATCH < newPlayers.length) {
      execSync('sleep 0.5')
    }
  }
  console.log(`\nDone. ${ok} fetched, ${failed} failed.`)
  if (failed > 0) process.exit(1)
}
