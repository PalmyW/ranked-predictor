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
 *   node scripts/fetch-squad-players.js --league=aflw       # every registered AFLW season
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { leagueFromArgv, dataDir, playersDir, loadSeasonRegistry, seasonKeyForCompSeason, compareSeasonKeys } from './lib/league.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LEAGUE = leagueFromArgv()

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split('=')[1] : undefined
}

const PLAYERS_DIR = playersDir(ROOT, LEAGUE)
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

// --- Resolve which seasons to process ---
// The season key is ALWAYS taken from our own registry (src/config/seasons.ts),
// never from cs.season.year — that field is unreliable for some AFLW
// compSeasons (Season 7's provider IDs fake year "2101"), and a naive year
// comparison would also be unable to express AFLW 2022's two real seasons
// ('2022a'/'2022b'). A compSeason the registry doesn't recognise yet is
// skipped, not guessed at — same "add it to seasons.ts first" contract
// fetch-historical-season.js already has for an unknown --year=.
const compSeasons = fetchJson('https://aflapi.afl.com.au/afl/v2/compseasons?pageSize=200').compSeasons
const registry = loadSeasonRegistry(ROOT, LEAGUE)
const leagueCompSeasons = compSeasons
  .filter((cs) => cs.competition.providerId === LEAGUE.compProviderId)
  .map((cs) => ({ cs, key: seasonKeyForCompSeason(cs.id, registry) }))
  .filter((x) => x.key != null)
  .sort((a, b) => compareSeasonKeys(a.key, b.key))

if (leagueCompSeasons.length === 0) {
  console.error(`No ${LEAGUE.key} compSeason(s) matched src/config/seasons.ts's ${LEAGUE.registryConst}.`)
  process.exit(1)
}

const seasonArg = arg('season')
const fromArg = arg('from') ?? leagueCompSeasons[0].key
const toArg = arg('to') ?? leagueCompSeasons[leagueCompSeasons.length - 1].key

const targets = seasonArg
  ? leagueCompSeasons.filter((x) => x.key === seasonArg)
  : leagueCompSeasons.filter((x) => compareSeasonKeys(x.key, fromArg) >= 0 && compareSeasonKeys(x.key, toArg) <= 0)

if (targets.length === 0) {
  console.error('No matching compSeason(s) found for the given range.')
  process.exit(1)
}
console.log(`Processing ${targets.length} season(s): ${targets.map((x) => x.key).join(', ')}`)

// --- Resolve the league's team ids (stable across seasons) ---
const teams = fetchJson('https://aflapi.afl.com.au/afl/v2/teams?pageSize=50').teams.filter(
  (t) => t.teamType === LEAGUE.teamType,
)
console.log(`Found ${teams.length} ${LEAGUE.key} teams.\n`)

// --- Pull every season × team squad, write squads.json, collect unique CD_I ids ---
const allSquadPlayers = new Map() // playerId → { firstName, surname, teamName } (last-seen label, for logging only)

for (const { cs: compSeason, key } of targets) {
  console.log(`[${key}] compSeason ${compSeason.id} (${compSeason.name})`)

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

  const outDir = dataDir(ROOT, LEAGUE, key)
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
            `https://api.afl.com.au/statspro/playerProfile/${pid}?competitionCode=${LEAGUE.compProviderId}`,
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
