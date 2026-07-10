/**
 * Source configuration for the ratings-enrichment scraper — overridable via
 * environment variable so the source can change without touching code.
 */
export const BASE_URL = process.env.RATINGS_BASE_URL ?? 'https://www.wheeloratings.com/src/match_stats/table_data/'
export const REQUEST_DELAY_MS = Number(process.env.RATINGS_DELAY_MS ?? 400)
