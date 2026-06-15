export const STAT_BASES = [
  'behinds','bounces','centre_bounce_attendances','centre_clearances',
  'clangers','contest_def_loss_percentage','contest_def_losses','contest_def_one_on_ones',
  'contest_off_one_on_ones','contest_off_wins','contest_off_wins_percentage',
  'contested_marks','contested_possession_rate','contested_possessions',
  'def_half_pressure_acts','disposal_efficiency','disposals','dream_team_points',
  'effective_disposals','effective_kicks','f50_ground_ball_gets',
  'frees_against','frees_for','goal_accuracy','goal_assists','goals',
  'ground_ball_gets','handballs','hitout_to_advantage_rate','hitout_win_percentage',
  'hitouts','hitouts_to_advantage','inside50s','intercept_marks','intercepts',
  'kick_efficiency','kick_to_handball_ratio','kickins','kickins_playon','kicks',
  'marks','marks_inside50','marks_on_lead','metres_gained','one_percenters',
  'pressure_acts','rating_points','rebound50s','ruck_contests',
  'score_involvements','score_launches','shots_at_goal','spoils',
  'stoppage_clearances','tackles','tackles_inside50','time_on_ground_percentage',
  'total_clearances','total_possessions','turnovers','uncontested_possessions',
]

// Bases that represent rates / percentages — should never be summed into a season total
const PCT_KW = ['percentage', 'efficiency', 'accuracy', 'rate', 'ratio']
export const isPct = base => PCT_KW.some(k => base.includes(k))

export function makeStatSections(filterPct = false) {
  const cols = STAT_BASES
    .filter(f => !filterPct || !isPct(f))
    .map(f => ({ key: f, label: statLabel(f) }))
  return [{ flat: true, cols }]
}

export const STAT_SECTIONS = makeStatSections()

export const MATCH_SECTIONS = [{ flat: true, cols: [
  { key: 'round_number',   label: 'Round' },
  { key: 'utc_start_time', label: 'Date' },
  { key: 'home_team_name', label: 'Home' },
  { key: 'home_score',     label: 'Score' },
  { key: 'away_team_name', label: 'Away' },
  { key: 'venue_name',     label: 'Venue' },
  { key: 'status',         label: 'Status' },
]}]

export function statLabel(base) {
  return base.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export const STAR_SIGN_EMOJI = {
  Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋',
  Leo: '♌', Virgo: '♍', Libra: '♎', Scorpio: '♏',
  Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓',
}

// "Leo" → "♌ Leo" (emoji prefix when the sign is recognised)
export function fmtStarSign(sign) {
  if (sign === null || sign === undefined || sign === '') return '—'
  const emoji = STAR_SIGN_EMOJI[sign]
  return emoji ? `${emoji} ${sign}` : String(sign)
}

export function fmt(v) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return Number.isInteger(v) ? v : v.toFixed(1)
  return v
}

export function numCol(field, title, width = 80) {
  return {
    title,
    field,
    hozAlign: 'right',
    headerHozAlign: 'right',
    width,
    formatter: cell => fmt(cell.getValue()),
    sorter: 'number',
  }
}

export function makeStatCols(prefix) {
  const totMode = prefix === 'tot_'
  return STAT_BASES
    .filter(f => !totMode || !isPct(f))
    .map(f => numCol(`${prefix}${f}`, statLabel(f), 90))
}

export const ROUND_OPTIONS = [
  { value: '', title: 'All rounds' },
  { value: '0', title: 'Opening Round' },
  ...Array.from({ length: 27 }, (_, i) => ({ value: String(i + 1), title: `Round ${i + 1}` })),
]

export const SORT_DIR_OPTIONS = [
  { value: 'desc', title: 'Descending' },
  { value: 'asc',  title: 'Ascending' },
]

export const SAMPLE_QUERY =
  `SELECT MIN(p.given_name) || ' ' || MIN(p.surname) AS player,\n` +
  `  t.name AS team_name, COUNT(*) AS games_played,\n` +
  `  ROUND(AVG(p.stat_disposals), 2) AS avg_disposals,\n` +
  `  ROUND(AVG(p.stat_kicks), 2) AS avg_kicks,\n` +
  `  ROUND(AVG(p.stat_handballs), 2) AS avg_handballs,\n` +
  `  ROUND(AVG(p.stat_marks), 2) AS avg_marks,\n` +
  `  ROUND(AVG(p.stat_tackles), 2) AS avg_tackles\n` +
  `FROM player_match_stats p\n` +
  `JOIN teams t ON p.team_id = t.team_id\n` +
  `WHERE p.year = (SELECT MAX(year) FROM player_match_stats)\n` +
  `GROUP BY p.player_id, p.team_id\n` +
  `HAVING COUNT(*) >= 10\n` +
  `ORDER BY avg_disposals DESC\n` +
  `LIMIT 20`
