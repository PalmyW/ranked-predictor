/**
 * Accuracy harness: compare a footywire scrape of 2012 (in the staging dir)
 * against the authoritative ChampionData 2012 data in public/data/2012/.
 *
 * Run the scrape first:
 *   npm run scrape-footywire -- --year=2012 --out=staging --no-register
 * Then:
 *   npm run verify-footywire-2012
 *
 * Reports: match coverage & score accuracy, player-id match rate (should be ~100%
 * since all of 2012 is in the system), and per-field stat-accuracy rates.
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const STAGE = join(ROOT, 'data_sources', 'statscache', 'staging', 'public', 'data', '2012')
const CD = join(ROOT, 'public', 'data', '2012')

if (!existsSync(join(STAGE, 'fixture.json'))) {
  console.error(`No staging data at ${STAGE}.\nRun: npm run scrape-footywire -- --year=2012 --out=staging --no-register`)
  process.exit(1)
}

const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
const matchKey = (m) => `${m.round.roundNumber}|${m.home.team.providerId}|${m.away.team.providerId}`

const stage = read(join(STAGE, 'fixture.json'))
const cd = read(join(CD, 'fixture.json'))
const cdConcluded = cd.matches.filter((m) => m.status === 'CONCLUDED')

console.log('═══ 2012 FOOTYWIRE vs CHAMPIONDATA ═══\n')

// ── 1. Match coverage & scores ───────────────────────────────────────────────
const cdByKey = new Map(cdConcluded.map((m) => [matchKey(m), m]))
const stageByKey = new Map(stage.matches.map((m) => [matchKey(m), m]))

let paired = 0, scoreOk = 0
const scoreMismatches = []
const unpaired = []
for (const sm of stage.matches) {
  const cm = cdByKey.get(matchKey(sm))
  if (!cm) { unpaired.push(matchKey(sm)); continue }
  paired++
  const ok =
    sm.home.score.totalScore === cm.home.score.totalScore &&
    sm.away.score.totalScore === cm.away.score.totalScore &&
    sm.home.score.goals === cm.home.score.goals &&
    sm.away.score.behinds === cm.away.score.behinds
  if (ok) scoreOk++
  else scoreMismatches.push(
    `R${sm.round.roundNumber} ${sm.home.team.abbreviation} v ${sm.away.team.abbreviation}: ` +
    `FW ${sm.home.score.goals}.${sm.home.score.behinds}/${sm.away.score.goals}.${sm.away.score.behinds} ` +
    `CD ${cm.home.score.goals}.${cm.home.score.behinds}/${cm.away.score.goals}.${cm.away.score.behinds}`,
  )
}
console.log(`Matches: CD concluded ${cdConcluded.length}, staging ${stage.matches.length}, paired ${paired}`)
console.log(`Scores exact: ${scoreOk}/${paired}`)
if (unpaired.length) console.log(`Unpaired staging matches (${unpaired.length}): ${unpaired.slice(0, 8).join(', ')}${unpaired.length > 8 ? '…' : ''}`)
if (scoreMismatches.length) {
  console.log(`Score mismatches (${scoreMismatches.length}):`)
  for (const s of scoreMismatches.slice(0, 15)) console.log('  ' + s)
}

// ── 2. Player-id match rate ──────────────────────────────────────────────────
let totalPlayers = 0, matchedCd = 0, mintedPw = 0
const stageStatsFiles = readdirSync(join(STAGE, 'stats')).filter((f) => f.endsWith('.json'))
const samplePw = []
for (const f of stageStatsFiles) {
  const data = read(join(STAGE, 'stats', f))
  for (const side of ['homeTeamPlayerStats', 'awayTeamPlayerStats']) {
    for (const e of data[side] ?? []) {
      totalPlayers++
      const id = e.playerStats.player.playerId
      if (id.startsWith('CD_I')) matchedCd++
      else { mintedPw++; if (samplePw.length < 20) samplePw.push(`${e.playerStats.player.playerName.givenName} ${e.playerStats.player.playerName.surname}`) }
    }
  }
}
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) : '0') + '%'
console.log(`\nPlayer ids: ${totalPlayers} entries, matched CD ${matchedCd} (${pct(matchedCd, totalPlayers)}), minted PW ${mintedPw} (${pct(mintedPw, totalPlayers)})`)
if (samplePw.length) console.log(`Unmatched (should investigate): ${[...new Set(samplePw)].join(', ')}`)

// ── 3. Per-field stat accuracy (matched players, paired matches) ─────────────
const FIELDS = [
  ['kicks'], ['handballs'], ['disposals'], ['marks'], ['goals'], ['behinds'],
  ['tackles'], ['hitouts'], ['inside50s'], ['clangers'], ['rebound50s'],
  ['freesFor'], ['freesAgainst'], ['goalAssists'], ['contestedPossessions'],
  ['uncontestedPossessions'], ['marksInside50'], ['contestedMarks'],
  ['onePercenters'], ['bounces'], ['disposalEfficiency'],
  ['clearances', 'totalClearances'], ['extendedStats', 'effectiveDisposals'],
]
const dig = (stats, path) => path.reduce((o, k) => (o == null ? o : o[k]), stats)

const field = Object.fromEntries(FIELDS.map((p) => [p.join('.'), { ok: 0, diff: 0, sumAbs: 0 }]))
let togOk = 0, togDiff = 0

// index CD stats by providerId
const cdStatsByProvider = new Map()
for (const f of readdirSync(join(CD, 'stats'))) {
  if (f.endsWith('.json')) cdStatsByProvider.set(f.replace('.json', ''), join(CD, 'stats', f))
}

for (const sm of stage.matches) {
  const cm = cdByKey.get(matchKey(sm))
  if (!cm) continue
  const sp = join(STAGE, 'stats', `${sm.providerId}.json`)
  const cpFile = cdStatsByProvider.get(cm.providerId)
  if (!existsSync(sp) || !cpFile) continue
  const sData = read(sp), cData = read(cpFile)

  const cdByPlayer = new Map()
  for (const side of ['homeTeamPlayerStats', 'awayTeamPlayerStats']) {
    for (const e of cData[side] ?? []) cdByPlayer.set(e.playerStats.player.playerId, e.playerStats)
  }
  for (const side of ['homeTeamPlayerStats', 'awayTeamPlayerStats']) {
    for (const e of sData[side] ?? []) {
      const pid = e.playerStats.player.playerId
      const cdPs = cdByPlayer.get(pid)
      if (!cdPs) continue
      for (const p of FIELDS) {
        const a = dig(e.playerStats.stats, p)
        const b = dig(cdPs.stats, p)
        if (a == null || b == null) continue
        const rec = field[p.join('.')]
        if (Math.abs(a - b) < 0.5) rec.ok++
        else { rec.diff++; rec.sumAbs += Math.abs(a - b) }
      }
      const ta = e.playerStats.timeOnGroundPercentage, tb = cdPs.timeOnGroundPercentage
      if (ta != null && tb != null) (Math.abs(ta - tb) <= 2 ? togOk++ : togDiff++)
    }
  }
}

console.log('\nPer-field stat accuracy (matched players in paired matches):')
for (const [name, r] of Object.entries(field)) {
  const tot = r.ok + r.diff
  if (!tot) continue
  const flag = r.diff / tot > 0.1 ? '  ⚠' : ''
  console.log(`  ${name.padEnd(28)} ${pct(r.ok, tot).padStart(6)} exact  (${r.diff} diff, avg|Δ| ${(r.sumAbs / (r.diff || 1)).toFixed(2)})${flag}`)
}
console.log(`  ${'timeOnGroundPercentage'.padEnd(28)} ${pct(togOk, togOk + togDiff).padStart(6)} within±2  (${togDiff} diff)`)

console.log('\nDone. Investigate any ⚠ fields (systematic mapping issues) and any non-trivial PW mint count.')
