import { isPct, STAT_BASES } from '@/constants/stats.js'

// Stats where a lower value is better — rank/sort ascending for these.
export const LOWER_IS_BETTER = new Set([
  'clangers', 'turnovers', 'frees_against',
  'contest_def_losses', 'contest_def_loss_percentage',
])

export { isPct }

// Aggregate expression for a single stat: totals where it makes sense, else avg.
// Goal accuracy (an average) is only counted in matches where the player had a shot.
export function metricExpr(base, metric) {
  if (base === 'goal_accuracy')
    return `ROUND(AVG(CASE WHEN p.stat_shots_at_goal >= 1 THEN p.stat_goal_accuracy END), 2)`
  if (metric === 'tot' && !isPct(base)) return `ROUND(SUM(p.stat_${base}), 2)`
  return `ROUND(AVG(p.stat_${base}), 2)`
}

export function metricAlias(base, metric) {
  const m = metric === 'tot' && !isPct(base) && base !== 'goal_accuracy' ? 'tot' : 'avg'
  return `${m}_${base}`
}

// Normalise a range descriptor. Accepts either a string (legacy: 'season' |
// 'alltime' | 'last4' | 'last8', resolved against the latest season) or an
// object: { kind: 'season', year } | { kind: 'range', from, to } |
// { kind: 'alltime' } | { kind: 'last4' | 'last8' }.
function normaliseRange(range) {
  if (typeof range === 'string') return { kind: range }
  return range ?? { kind: 'alltime' }
}

// A readable single-stat leaderboard: one row per player with the chosen metric,
// over the selected range, filtered by a minimum game count. Used by both the
// player page's rank chips and the Leaderboards page.
export function buildLeaderboardSql(base, range, metric, minGames = 0, dirOverride = null) {
  if (!STAT_BASES.includes(base)) base = 'disposals'
  if (metric !== 'tot' && metric !== 'avg') metric = 'avg'
  const r = normaliseRange(range)
  const min = Number.isFinite(+minGames) ? Math.max(0, Math.floor(+minGames)) : 0
  const alias = metricAlias(base, metric)
  const dir = dirOverride === 'asc' || dirOverride === 'desc'
    ? dirOverride.toUpperCase()
    : (LOWER_IS_BETTER.has(base) ? 'ASC' : 'DESC')
  const having = min > 1 ? `HAVING COUNT(*) >= ${min}\n` : ''

  const select = `p.player_id,
       MIN(p.given_name) || ' ' || MIN(p.surname) AS player,
       MIN(t.name) AS team_name,
       COUNT(*) AS games_played,
       ${metricExpr(base, metric)} AS ${alias}`

  if (r.kind === 'last4' || r.kind === 'last8') {
    const n = r.kind === 'last4' ? 4 : 8
    const recentHaving = min > 1 ? `HAVING COUNT(*) >= ${min}\n` : ''
    return `WITH latest_rounds AS (
  SELECT DISTINCT round_number
  FROM player_match_stats
  WHERE year = (SELECT MAX(year) FROM player_match_stats)
  ORDER BY round_number DESC
  LIMIT ${n}
)
SELECT ${select}
FROM player_match_stats p
JOIN teams t ON p.team_id = t.team_id
WHERE p.year = (SELECT MAX(year) FROM player_match_stats)
  AND p.round_number IN (SELECT round_number FROM latest_rounds)
GROUP BY p.player_id
${recentHaving}ORDER BY ${alias} ${dir}
LIMIT 100`
  }

  let where = ''
  if (r.kind === 'season') {
    const year = +r.year
    where = Number.isFinite(year)
      ? `WHERE p.year = ${year}\n`
      : 'WHERE p.year = (SELECT MAX(year) FROM player_match_stats)\n'
  } else if (r.kind === 'range') {
    const from = +r.from, to = +r.to
    if (Number.isFinite(from) && Number.isFinite(to)) {
      where = `WHERE p.year BETWEEN ${Math.min(from, to)} AND ${Math.max(from, to)}\n`
    }
  }
  // r.kind === 'alltime' → no WHERE

  return `SELECT ${select}
FROM player_match_stats p
JOIN teams t ON p.team_id = t.team_id
${where}GROUP BY p.player_id
${having}ORDER BY ${alias} ${dir}
LIMIT 100`
}
