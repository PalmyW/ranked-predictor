/**
 * Polite, cached HTTP fetcher for afltables.com.
 *
 * - Caches every raw HTML page under data_sources/afltables/.cache/ keyed by URL, so
 *   re-parsing (and re-runs) never re-hit the network.
 * - Throttles live requests with a configurable delay + small jitter.
 * - Retries transient failures with backoff.
 *
 * afltables is a courtesy scrape; keep DELAY_MS comfortable.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(HERE, '..', '.cache')
const BASE = 'https://afltables.com/afl/'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'

const DELAY_MS = Number(process.env.AT_DELAY_MS ?? 1200)
const MAX_RETRIES = 3

mkdirSync(CACHE_DIR, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function cachePath(path) {
  // Stable, filesystem-safe cache filename derived from the request path.
  const safe = path.replace(/[^a-z0-9]+/gi, '_').slice(0, 80)
  const hash = createHash('sha1').update(path).digest('hex').slice(0, 10)
  return join(CACHE_DIR, `${safe}-${hash}.html`)
}

let lastFetch = 0

/**
 * Fetch an afltables page (relative path, e.g. `seas/1964.html`).
 * Returns the HTML string. Served from cache when available.
 */
export async function fetchPage(path) {
  const cp = cachePath(path)
  if (existsSync(cp)) return readFileSync(cp, 'utf8')

  const url = path.startsWith('http') ? path : BASE + path

  let lastErr
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const wait = DELAY_MS - (Date.now() - lastFetch)
    if (wait > 0) await sleep(wait)
    await sleep(Math.floor(Math.random() * 300)) // jitter
    lastFetch = Date.now()
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      if (html.length < 300) throw new Error(`suspiciously short body (${html.length} bytes)`)
      writeFileSync(cp, html)
      return html
    } catch (err) {
      lastErr = err
      if (attempt < MAX_RETRIES) await sleep(DELAY_MS * attempt * 2)
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastErr?.message}`)
}

export { CACHE_DIR }
