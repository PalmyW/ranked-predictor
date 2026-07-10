/**
 * Cached JSON fetcher for the ratings source's match-stats data files.
 *
 * These aren't an API — they're static JSON served straight off GitHub Pages
 * (the "Download as CSV" button and every on-page table are populated client-side
 * from these same files), so no session/auth/headers are needed. Still throttled
 * and cached out of courtesy and to make re-runs free.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { BASE_URL, REQUEST_DELAY_MS } from './config.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(HERE, '..', '.cache')
const BASE = BASE_URL
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'

const DELAY_MS = REQUEST_DELAY_MS
const MAX_RETRIES = 3

mkdirSync(CACHE_DIR, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function cachePath(id) {
  return join(CACHE_DIR, `${id}.json`)
}

let lastFetch = 0

/**
 * Fetch a table_data JSON file by id (a seasonId like "2026" or a roundId like
 * "202618"). Returns the parsed object. Served from cache when available.
 */
export async function fetchTableData(id) {
  const cp = cachePath(id)
  if (existsSync(cp)) return JSON.parse(readFileSync(cp, 'utf8'))

  const url = `${BASE}${id}.json`

  let lastErr
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const wait = DELAY_MS - (Date.now() - lastFetch)
    if (wait > 0) await sleep(wait)
    lastFetch = Date.now()
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      const json = JSON.parse(text)
      writeFileSync(cp, text)
      return json
    } catch (err) {
      lastErr = err
      if (attempt < MAX_RETRIES) await sleep(DELAY_MS * attempt * 2)
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastErr?.message}`)
}

export { CACHE_DIR }
