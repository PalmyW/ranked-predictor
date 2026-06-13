export const STAT_BASES = [
  'goals','behinds','kicks','handballs','disposals','marks',
  'bounces','tackles','contested_possessions','uncontested_possessions',
  'total_possessions','inside50s','marks_inside50','contested_marks','hitouts',
  'one_percenters','disposal_efficiency','clangers','frees_for','frees_against',
  'dream_team_points','rebound50s','goal_assists','goal_accuracy','rating_points',
  'turnovers','intercepts','tackles_inside50','shots_at_goal','score_involvements',
  'metres_gained','centre_clearances','stoppage_clearances','total_clearances',
  'effective_kicks','kick_efficiency','kick_to_handball_ratio','effective_disposals',
  'marks_on_lead','intercept_marks','contested_possession_rate','hitouts_to_advantage',
  'hitout_win_percentage','hitout_to_advantage_rate','ground_ball_gets',
  'f50_ground_ball_gets','score_launches','pressure_acts','def_half_pressure_acts',
  'spoils','ruck_contests','contest_def_one_on_ones','contest_def_losses',
  'contest_def_loss_percentage','contest_off_one_on_ones','contest_off_wins',
  'contest_off_wins_percentage','centre_bounce_attendances','kickins','kickins_playon',
  'time_on_ground_percentage',
]

export const STAT_GROUPS = [
  {
    title: 'Core',
    fields: [
      'goals','behinds','kicks','handballs','disposals','marks',
      'bounces','tackles','contested_possessions','uncontested_possessions',
      'total_possessions','inside50s','marks_inside50','contested_marks','hitouts',
      'one_percenters','disposal_efficiency','clangers','frees_for','frees_against',
      'dream_team_points','rebound50s','goal_assists','goal_accuracy','rating_points',
      'turnovers','intercepts','tackles_inside50','shots_at_goal','score_involvements',
      'metres_gained',
    ],
  },
  {
    title: 'Clearances',
    fields: ['centre_clearances','stoppage_clearances','total_clearances'],
  },
  {
    title: 'Extended',
    fields: [
      'effective_kicks','kick_efficiency','kick_to_handball_ratio','effective_disposals',
      'marks_on_lead','intercept_marks','contested_possession_rate','hitouts_to_advantage',
      'hitout_win_percentage','hitout_to_advantage_rate','ground_ball_gets',
      'f50_ground_ball_gets','score_launches','pressure_acts','def_half_pressure_acts',
      'spoils','ruck_contests','contest_def_one_on_ones','contest_def_losses',
      'contest_def_loss_percentage','contest_off_one_on_ones','contest_off_wins',
      'contest_off_wins_percentage','centre_bounce_attendances','kickins','kickins_playon',
    ],
  },
  {
    title: 'TOG',
    fields: ['time_on_ground_percentage'],
  },
]

// Bases that represent rates / percentages — should never be summed into a season total
const PCT_KW = ['percentage', 'efficiency', 'accuracy', 'rate', 'ratio']
export const isPct = base => PCT_KW.some(k => base.includes(k))

export function makeStatSections(filterPct = false) {
  return STAT_GROUPS
    .map(g => ({
      title: g.title,
      cols: g.fields
        .filter(f => !filterPct || !isPct(f))
        .map(f => ({ key: f, label: statLabel(f) })),
    }))
    .filter(g => g.cols.length > 0)
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
  return STAT_GROUPS
    .map(g => ({
      title: g.title,
      columns: g.fields
        .filter(f => !totMode || !isPct(f))
        .map(f => numCol(`${prefix}${f}`, statLabel(f), 90)),
    }))
    .filter(g => g.columns.length > 0)
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
  `SELECT given_name || ' ' || surname AS player, team_name, games_played,\n` +
  `  avg_disposals, avg_kicks, avg_handballs, avg_marks, avg_tackles\n` +
  `FROM v_player_season_stats\n` +
  `WHERE year = (SELECT MAX(year) FROM v_player_season_stats)\n` +
  `  AND games_played >= 10\n` +
  `ORDER BY avg_disposals DESC\n` +
  `LIMIT 20`
