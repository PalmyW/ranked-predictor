/**
 * Source configuration for the historical-season scraper — overridable via
 * environment variable so the source can change without touching code.
 */
export const BASE_URL = process.env.SOURCE_BASE_URL ?? 'https://www.footywire.com/afl/footy/'
export const REQUEST_DELAY_MS = Number(process.env.FW_DELAY_MS ?? 1200)
