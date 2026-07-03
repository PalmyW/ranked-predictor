import { execSync } from 'child_process'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'
import * as XLSX from 'xlsx'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'public/data')
const XLSX_URL = 'https://www.aussportsbetting.com/historical_data/afl.xlsx'

const CURRENT_SEASON = '2026'

// --- CLI args ---
const args = process.argv.slice(2)
const fileArg = args.find((a) => a.startsWith('--file='))?.split('=')[1]
const seasonArg = args.find((a) => a.startsWith('--season='))?.split('=')[1]
const all = args.includes('--all')
const latest = args.includes('--latest')

// Betting full team name → AFL Champion Data provider team id.
// Mirrors TEAMS in src/composables/useAFLData.ts. aussportsbetting data only
// covers the 18 current clubs (it starts mid-2009), so no historical clubs needed.
const TEAM_PROVIDER_ID = {
  Adelaide: 'CD_T10',
  Brisbane: 'CD_T20',
  Carlton: 'CD_T30',
  Collingwood: 'CD_T40',
  Essendon: 'CD_T50',
  Fremantle: 'CD_T60',
  Geelong: 'CD_T70',
  'Gold Coast': 'CD_T1000',
  'GWS Giants': 'CD_T1010',
  Hawthorn: 'CD_T80',
  Melbourne: 'CD_T90',
  'North Melbourne': 'CD_T100',
  'Port Adelaide': 'CD_T110',
  Richmond: 'CD_T120',
  'St Kilda': 'CD_T130',
  Sydney: 'CD_T160',
  'West Coast': 'CD_T150',
  'Western Bulldogs': 'CD_T140',
}

function providerId(name) {
  return TEAM_PROVIDER_ID[(name ?? '').trim()] ?? null
}

// "CD_T90"+"CD_T120" → stable, order-independent pair key
function pairKey(a, b) {
  return [a, b].sort().join('+')
}

function num(v) {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : null
}

// Excel serial date → 'YYYY-MM-DD'. Excel's epoch is 1899-12-30 (the -30 absorbs
// the 1900 leap-year bug). Computed in UTC so there's no timezone drift.
function serialToDate(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null
  const ms = Math.round(Math.floor(serial)) * 86400000 + Date.UTC(1899, 11, 30)
  return new Date(ms).toISOString().slice(0, 10)
}

// --- Download (or read local) spreadsheet ---
function loadWorkbook() {
  let path = fileArg
  if (!path) {
    path = join(tmpdir(), `afl-betting-${Date.now()}.xlsx`)
    console.log(`Downloading ${XLSX_URL} ...`)
    // aussportsbetting.com's WAF 403s bare `curl/x.x` requests (and, on some
    // hosting-provider IP ranges like GitHub Actions runners, requests without
    // browser-like headers even more aggressively) — send realistic headers
    // and retry transient failures.
    const curlArgs = [
      'curl -fsSL',
      `-A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'`,
      `-H 'Accept: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*'`,
      `-H 'Accept-Language: en-US,en;q=0.9'`,
      `-H 'Referer: https://www.aussportsbetting.com/data/'`,
      '--retry 3 --retry-delay 5 --retry-all-errors',
      `'${XLSX_URL}' -o '${path}'`,
    ].join(' ')
    execSync(curlArgs, { stdio: ['ignore', 'ignore', 'pipe'] })
  }
  return XLSX.read(readFileSync(path), { type: 'buffer' })
}

// --- Parse sheet1 into an index keyed by `${localDate}|${pairKey}` ---
function buildIndex(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]]
  // Array-of-arrays: row 0 is a junk title row, row 1 is the header, data from row 2.
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false })
  const header = rows[1]
  const col = {}
  header.forEach((name, i) => {
    if (typeof name === 'string') col[name.trim()] = i
  })

  const get = (row, name) => row[col[name]]

  const index = new Map()
  let parsed = 0
  let unmapped = 0

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length === 0) continue
    const homeName = get(row, 'Home Team')
    const awayName = get(row, 'Away Team')
    const homeId = providerId(homeName)
    const awayId = providerId(awayName)
    const date = serialToDate(get(row, 'Date'))
    if (!homeId || !awayId || !date) {
      if (homeName && awayName && (!homeId || !awayId)) {
        unmapped++
        if (unmapped <= 5) console.warn(`  Unmapped team: "${homeName}" v "${awayName}" (${date})`)
      }
      continue
    }

    const betting = {
      source: 'aussportsbetting.com',
      playOffGame: String(get(row, 'Play Off Game?') ?? '').trim().toUpperCase() === 'Y',
      bookmakersSurveyed: num(get(row, 'Bookmakers Surveyed')),
      homeOdds: num(get(row, 'Home Odds')),
      awayOdds: num(get(row, 'Away Odds')),
      homeOddsOpen: num(get(row, 'Home Odds Open')),
      homeOddsMin: num(get(row, 'Home Odds Min')),
      homeOddsMax: num(get(row, 'Home Odds Max')),
      homeOddsClose: num(get(row, 'Home Odds Close')),
      awayOddsOpen: num(get(row, 'Away Odds Open')),
      awayOddsMin: num(get(row, 'Away Odds Min')),
      awayOddsMax: num(get(row, 'Away Odds Max')),
      awayOddsClose: num(get(row, 'Away Odds Close')),
      homeLineOpen: num(get(row, 'Home Line Open')),
      homeLineMin: num(get(row, 'Home Line Min')),
      homeLineMax: num(get(row, 'Home Line Max')),
      homeLineClose: num(get(row, 'Home Line Close')),
      awayLineOpen: num(get(row, 'Away Line Open')),
      awayLineMin: num(get(row, 'Away Line Min')),
      awayLineMax: num(get(row, 'Away Line Max')),
      awayLineClose: num(get(row, 'Away Line Close')),
      homeLineOddsOpen: num(get(row, 'Home Line Odds Open')),
      homeLineOddsMin: num(get(row, 'Home Line Odds Min')),
      homeLineOddsMax: num(get(row, 'Home Line Odds Max')),
      homeLineOddsClose: num(get(row, 'Home Line Odds Close')),
      awayLineOddsOpen: num(get(row, 'Away Line Odds Open')),
      awayLineOddsMin: num(get(row, 'Away Line Odds Min')),
      awayLineOddsMax: num(get(row, 'Away Line Odds Max')),
      awayLineOddsClose: num(get(row, 'Away Line Odds Close')),
      totalScoreOpen: num(get(row, 'Total Score Open')),
      totalScoreMin: num(get(row, 'Total Score Min')),
      totalScoreMax: num(get(row, 'Total Score Max')),
      totalScoreClose: num(get(row, 'Total Score Close')),
      totalScoreOverOpen: num(get(row, 'Total Score Over Open')),
      totalScoreOverMin: num(get(row, 'Total Score Over Min')),
      totalScoreOverMax: num(get(row, 'Total Score Over Max')),
      totalScoreOverClose: num(get(row, 'Total Score Over Close')),
      totalScoreUnderOpen: num(get(row, 'Total Score Under Open')),
      totalScoreUnderMin: num(get(row, 'Total Score Under Min')),
      totalScoreUnderMax: num(get(row, 'Total Score Under Max')),
      totalScoreUnderClose: num(get(row, 'Total Score Under Close')),
      notes: (get(row, 'Notes') ?? null) || null,
    }

    index.set(`${date}|${pairKey(homeId, awayId)}`, { homeId, awayId, betting })
    parsed++
  }

  console.log(`Parsed ${parsed} betting rows (${unmapped} with unmapped teams skipped).`)
  return index
}

// Re-key a betting object so home* always refers to `aflHomeId`. The spreadsheet
// labels its own home/away; swap if they're reversed relative to AFL's designation.
function alignToAfl(entry, aflHomeId) {
  if (entry.homeId === aflHomeId) return entry.betting
  // Reversed: swap every home/away pair of fields.
  const b = entry.betting
  const out = { source: b.source, playOffGame: b.playOffGame, bookmakersSurveyed: b.bookmakersSurveyed, notes: b.notes }
  for (const key of Object.keys(b)) {
    if (key.startsWith('home')) out['away' + key.slice(4)] = b[key]
    else if (key.startsWith('away')) out['home' + key.slice(4)] = b[key]
    else if (key.startsWith('totalScore')) out[key] = b[key]
  }
  return out
}

// Look up a match in the index, tolerating ±1 day of local-date drift.
function lookup(index, localDate, homeId, awayId) {
  const pk = pairKey(homeId, awayId)
  const base = new Date(localDate + 'T00:00:00Z')
  for (const offset of [0, -1, 1]) {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + offset)
    const key = `${d.toISOString().slice(0, 10)}|${pk}`
    if (index.has(key)) return index.get(key)
  }
  return null
}

function seasonsToProcess() {
  if (seasonArg) return [seasonArg]
  if (all) {
    return readdirSync(DATA_DIR)
      .filter((d) => /^\d{4}$/.test(d) && existsSync(join(DATA_DIR, d, 'match-details')))
      .sort()
  }
  return [CURRENT_SEASON]
}

function processSeason(index, season) {
  const dir = join(DATA_DIR, season, 'match-details')
  if (!existsSync(dir)) {
    console.log(`[${season}] no match-details dir, skipping.`)
    return { matched: 0, unmatched: 0, written: 0 }
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  let matched = 0
  let unmatched = 0
  let written = 0
  const unmatchedSamples = []

  for (const file of files) {
    const path = join(dir, file)
    let data
    try {
      data = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      continue
    }
    if (latest && data.betting) continue // weekly mode: only fill missing

    const m = data.match ?? {}
    const localDate = (m.venueLocalStartTime ?? m.utcStartTime ?? m.date ?? '').slice(0, 10)
    const homeId = m.homeTeamId
    const awayId = m.awayTeamId
    if (!localDate || !homeId || !awayId) continue

    const entry = lookup(index, localDate, homeId, awayId)
    if (!entry) {
      unmatched++
      if (unmatchedSamples.length < 5) {
        unmatchedSamples.push(`${m.homeTeam?.name ?? homeId} v ${m.awayTeam?.name ?? awayId} (${localDate})`)
      }
      continue
    }

    matched++
    const betting = alignToAfl(entry, homeId)
    const next = JSON.stringify({ ...data, betting })
    if (next !== JSON.stringify(data)) {
      writeFileSync(path, next)
      written++
    }
  }

  console.log(
    `[${season}] ${files.length} files: ${matched} matched, ${unmatched} unmatched, ${written} written.`,
  )
  if (unmatchedSamples.length) {
    console.log(`         unmatched samples: ${unmatchedSamples.join('; ')}`)
  }
  return { matched, unmatched, written }
}

// --- Main ---
const wb = loadWorkbook()
const index = buildIndex(wb)

const totals = { matched: 0, unmatched: 0, written: 0 }
for (const season of seasonsToProcess()) {
  const r = processSeason(index, season)
  totals.matched += r.matched
  totals.unmatched += r.unmatched
  totals.written += r.written
}

console.log(`\nTotal: ${totals.matched} matched, ${totals.unmatched} unmatched, ${totals.written} written.`)
