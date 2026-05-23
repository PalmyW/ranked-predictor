/**
 * Computes XPalmy ratings for the grand final winner from every historical season
 * and writes public/data/xpalmy-champions.json.
 *
 * Usage: node scripts/compute-xpalmy-champions.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Mirror of TEAMS from useAFLData.ts
const TEAMS = [
  { id: 1,  name: 'Kuwarna',           abbreviation: 'ADEL', iconId: 'icn-aflc-adel', teamProviderId: 'CD_T10'   },
  { id: 2,  name: 'Brisbane Lions',    abbreviation: 'BL',   iconId: 'icn-aflc-bl',   teamProviderId: 'CD_T20'   },
  { id: 5,  name: 'Carlton',           abbreviation: 'CARL', iconId: 'icn-aflc-carl', teamProviderId: 'CD_T30'   },
  { id: 3,  name: 'Collingwood',       abbreviation: 'COLL', iconId: 'icn-aflc-coll', teamProviderId: 'CD_T40'   },
  { id: 12, name: 'Essendon',          abbreviation: 'ESS',  iconId: 'icn-aflc-ess',  teamProviderId: 'CD_T50'   },
  { id: 14, name: 'Walyalup',          abbreviation: 'FRE',  iconId: 'icn-aflc-fre',  teamProviderId: 'CD_T60'   },
  { id: 10, name: 'Geelong Cats',      abbreviation: 'GEEL', iconId: 'icn-aflc-geel', teamProviderId: 'CD_T70'   },
  { id: 4,  name: 'Gold Coast SUNS',   abbreviation: 'GCS',  iconId: 'icn-aflc-gcs',  teamProviderId: 'CD_T1000' },
  { id: 15, name: 'GWS GIANTS',        abbreviation: 'GWS',  iconId: 'icn-aflc-gws',  teamProviderId: 'CD_T1010' },
  { id: 9,  name: 'Hawthorn',          abbreviation: 'HAW',  iconId: 'icn-aflc-haw',  teamProviderId: 'CD_T80'   },
  { id: 17, name: 'Narrm',             abbreviation: 'MELB', iconId: 'icn-aflc-melb', teamProviderId: 'CD_T90'   },
  { id: 6,  name: 'North Melbourne',   abbreviation: 'NMFC', iconId: 'icn-aflc-nmfc', teamProviderId: 'CD_T100'  },
  { id: 7,  name: 'Yartapuulti',       abbreviation: 'PORT', iconId: 'icn-aflc-port', teamProviderId: 'CD_T110'  },
  { id: 16, name: 'Richmond',          abbreviation: 'RICH', iconId: 'icn-aflc-rich', teamProviderId: 'CD_T120'  },
  { id: 11, name: 'Euro-Yroke',        abbreviation: 'STK',  iconId: 'icn-aflc-stk',  teamProviderId: 'CD_T130'  },
  { id: 13, name: 'Sydney Swans',      abbreviation: 'SYD',  iconId: 'icn-aflc-syd',  teamProviderId: 'CD_T160'  },
  { id: 18, name: 'Waalitj Marawar',   abbreviation: 'WCE',  iconId: 'icn-aflc-wce',  teamProviderId: 'CD_T150'  },
  { id: 8,  name: 'Western Bulldogs',  abbreviation: 'WB',   iconId: 'icn-aflc-wb',   teamProviderId: 'CD_T140'  },
]
const TEAM_MAP = Object.fromEntries(TEAMS.map((t) => [t.id, t]))

// Read SEASONS and CURRENT_SEASON_YEAR from seasons.ts
const seasonsSource = readFileSync(join(ROOT, 'src/config/seasons.ts'), 'utf8')
const currentYearMatch = seasonsSource.match(/CURRENT_SEASON_YEAR\s*=\s*'(\d+)'/)
const CURRENT_YEAR = currentYearMatch?.[1] ?? '2026'

const seasonsMatch = seasonsSource.match(/export const SEASONS[^=]*=\s*\[([^\]]*)\]/)
const SEASONS = []
if (seasonsMatch) {
  for (const m of seasonsMatch[1].matchAll(/year:\s*'(\d+)'/g)) {
    SEASONS.push(m[1])
  }
}

// XPalmy algorithm — mirrors runXPalmy from useAlgorithmRankings.ts
// venueFilter: 'both' | 'home' | 'away'
function runXPalmy(concluded, venueFilter = 'both') {
  const xLadders = {}
  const yLadders = {}
  for (const t of TEAMS) { xLadders[t.id] = []; yLadders[t.id] = [] }

  for (const m of concluded) {
    const hScore = m.homeScore?.totalScore
    const aScore = m.awayScore?.totalScore
    if (hScore == null || aScore == null) continue
    const hId = m.homeTeamId
    const aId = m.awayTeamId
    if (!TEAM_MAP[hId] || !TEAM_MAP[aId]) continue

    const base = { roundNumber: m.roundNumber }
    // aId (away team) in hId's ladders; aId was away
    xLadders[hId].push({ ...base, teamId: aId, oppScore: aScore, ownScore: hScore, rank: 0, wasTeamHome: false })
    yLadders[hId].push({ ...base, teamId: aId, oppScore: aScore, ownScore: hScore, rank: 0, wasTeamHome: false })
    // hId (home team) in aId's ladders; hId was home
    xLadders[aId].push({ ...base, teamId: hId, oppScore: hScore, ownScore: aScore, rank: 0, wasTeamHome: true })
    yLadders[aId].push({ ...base, teamId: hId, oppScore: hScore, ownScore: aScore, rank: 0, wasTeamHome: true })
  }

  for (const t of TEAMS) {
    xLadders[t.id].sort((a, b) => b.oppScore - a.oppScore)
    xLadders[t.id].forEach((e, i) => { e.rank = i + 1 })
    yLadders[t.id].sort((a, b) => a.ownScore - b.ownScore)
    yLadders[t.id].forEach((e, i) => { e.rank = i + 1 })
  }

  const avg = (arr) => arr.length === 0 ? 0.5 : arr.reduce((a, b) => a + b, 0) / arr.length

  return TEAMS.map((teamY) => {
    const xFracs = [], yFracs = []
    for (const teamX of TEAMS) {
      if (teamX.id === teamY.id) continue
      const xl = xLadders[teamX.id]
      for (const e of xl) {
        if (e.teamId !== teamY.id) continue
        if (venueFilter === 'home' && !e.wasTeamHome) continue
        if (venueFilter === 'away' && e.wasTeamHome) continue
        xFracs.push((e.rank - 1) / Math.max(xl.length - 1, 1))
      }
      const yl = yLadders[teamX.id]
      for (const e of yl) {
        if (e.teamId !== teamY.id) continue
        if (venueFilter === 'home' && !e.wasTeamHome) continue
        if (venueFilter === 'away' && e.wasTeamHome) continue
        yFracs.push((e.rank - 1) / Math.max(yl.length - 1, 1))
      }
    }
    return { teamId: teamY.id, xRating: avg(xFracs), yRating: avg(yFracs) }
  })
}

// Parse AFL fixture matches (mirrors parseMatch from useAFLData.ts)
function parseMatches(fixtureJson) {
  const VALID = new Set(['CONCLUDED', 'POSTGAME', 'LIVE', 'SCHEDULED', 'PLACEHOLDER', 'UNCONFIRMED_TEAMS', 'CONFIRMED_TEAMS'])
  return (fixtureJson.matches ?? []).flatMap((raw) => {
    const home = raw.home
    const away = raw.away
    const homeId = home?.team?.id
    const awayId = away?.team?.id
    if (!homeId || !awayId) return []
    const rawStatus = raw.status === 'POSTGAME' ? 'CONCLUDED' : raw.status
    if (!VALID.has(rawStatus)) return []
    return [{
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeScore: home.score ?? null,
      awayScore: away.score ?? null,
      status: rawStatus,
      roundNumber: raw.round?.roundNumber ?? 0,
      roundName: raw.round?.name ?? '',
      providerId: raw.providerId,
    }]
  })
}

function findGrandFinalWinner(matches) {
  // Prefer explicit "Grand Final" round name
  let gf = matches.find((m) =>
    m.status === 'CONCLUDED' &&
    m.roundName.toLowerCase().includes('grand final') &&
    m.homeScore && m.awayScore
  )
  // Fall back to the highest-roundNumber concluded match
  if (!gf) {
    const concluded = matches.filter((m) => m.status === 'CONCLUDED' && m.homeScore && m.awayScore)
    if (concluded.length === 0) return null
    const maxRound = Math.max(...concluded.map((m) => m.roundNumber))
    gf = concluded.find((m) => m.roundNumber === maxRound)
  }
  if (!gf) return null
  const homeScore = gf.homeScore.totalScore
  const awayScore = gf.awayScore.totalScore
  return homeScore > awayScore ? gf.homeTeamId : gf.awayTeamId
}

const r4 = (v) => Math.round(v * 10000) / 10000

// Process each historical season
const champions = []

for (const year of SEASONS) {
  if (year === CURRENT_YEAR) continue

  const fixturePath = join(ROOT, `public/data/${year}/fixture.json`)
  if (!existsSync(fixturePath)) {
    console.warn(`  ${year}: fixture.json not found — skipping`)
    continue
  }

  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const matches = parseMatches(fixture)
  const concluded = matches.filter((m) => m.status === 'CONCLUDED' && m.homeScore && m.awayScore)

  const winnerId = findGrandFinalWinner(matches)
  if (!winnerId) {
    console.warn(`  ${year}: could not identify grand final winner — skipping`)
    continue
  }

  const bothPoints = runXPalmy(concluded, 'both')
  const homePoints = runXPalmy(concluded, 'home')
  const awayPoints = runXPalmy(concluded, 'away')

  const winnerBoth = bothPoints.find((p) => p.teamId === winnerId)
  const winnerHome = homePoints.find((p) => p.teamId === winnerId)
  const winnerAway = awayPoints.find((p) => p.teamId === winnerId)

  if (!winnerBoth) {
    console.warn(`  ${year}: winner teamId ${winnerId} not found in TEAMS — skipping`)
    continue
  }

  const team = TEAM_MAP[winnerId]
  const concludedGf = matches.find((m) => {
    if (m.status !== 'CONCLUDED' || !m.homeScore || !m.awayScore) return false
    if (!m.roundName.toLowerCase().includes('grand final')) return false
    return m.homeTeamId === winnerId || m.awayTeamId === winnerId
  }) ?? (() => {
    const c = matches.filter((m) => m.status === 'CONCLUDED' && m.homeScore && m.awayScore)
    const maxRound = Math.max(...c.map((m) => m.roundNumber))
    return c.find((m) => m.roundNumber === maxRound)
  })()

  const loserTeamId = concludedGf
    ? (concludedGf.homeTeamId === winnerId ? concludedGf.awayTeamId : concludedGf.homeTeamId)
    : null
  const loserTeam = loserTeamId ? TEAM_MAP[loserTeamId] : null

  console.log(`  ${year}: ${team?.name ?? winnerId} both(${r4(winnerBoth.xRating)}, ${r4(winnerBoth.yRating)}) home(${r4(winnerHome.xRating)}, ${r4(winnerHome.yRating)}) away(${r4(winnerAway.xRating)}, ${r4(winnerAway.yRating)})${loserTeam ? ` def. ${loserTeam.name}` : ''}`)

  champions.push({
    year,
    teamId: winnerId,
    teamName: team?.name ?? String(winnerId),
    abbreviation: team?.abbreviation ?? String(winnerId),
    iconId: team?.iconId ?? '',
    xRating: r4(winnerBoth.xRating),
    yRating: r4(winnerBoth.yRating),
    homeXRating: r4(winnerHome.xRating),
    homeYRating: r4(winnerHome.yRating),
    awayXRating: r4(winnerAway.xRating),
    awayYRating: r4(winnerAway.yRating),
  })
}

champions.sort((a, b) => a.year.localeCompare(b.year))

const outPath = join(ROOT, 'public/data/xpalmy-champions.json')
writeFileSync(outPath, JSON.stringify(champions, null, 2))
console.log(`\nWrote ${champions.length} champions to public/data/xpalmy-champions.json`)
