import { execSync } from 'child_process'
import { readFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = join(ROOT, 'public/data/fixture.json')
const STATS_DIR = join(ROOT, 'public/data/stats')
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

mkdirSync(STATS_DIR, { recursive: true })

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))
const concluded = (fixture.matches ?? []).filter(
  (m) => m.status === 'CONCLUDED' || m.status === 'POSTGAME',
)

const missing = concluded.filter(
  (m) => m.providerId && !existsSync(join(STATS_DIR, `${m.providerId}.json`)),
)

console.log(`${concluded.length} concluded matches, ${concluded.length - missing.length} already fetched, ${missing.length} to fetch.`)

if (missing.length === 0) {
  console.log('Nothing to do.')
  process.exit(0)
}

let ok = 0
let failed = 0

for (const match of missing) {
  const id = match.providerId
  const outFile = join(STATS_DIR, `${id}.json`)
  const label = `${match.home?.team?.name ?? '?'} v ${match.away?.team?.name ?? '?'} (${id})`
  process.stdout.write(`Fetching ${label}... `)
  try {
    execSync(
      `curl -fsSL` +
        ` -H 'accept: */*'` +
        ` -H 'origin: https://www.afl.com.au'` +
        ` -H 'referer: https://www.afl.com.au/'` +
        ` -H 'user-agent: Mozilla/5.0 (compatible; ranked-predictor-ci/1.0)'` +
        ` -H 'x-media-mis-token: ${TOKEN}'` +
        ` 'https://api.afl.com.au/cfs/afl/playerStats/match/${id}'` +
        ` -o '${outFile}'`,
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )
    console.log('done')
    ok++
  } catch (e) {
    console.log('FAILED')
    if (existsSync(outFile)) unlinkSync(outFile)
    failed++
  }
}

console.log(`\nDone. ${ok} fetched, ${failed} failed.`)
if (failed > 0) process.exit(1)
