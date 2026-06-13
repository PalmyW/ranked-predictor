import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../afl-stats.db');
const SCHEMA_PATH = join(__dirname, '../../db/schema.sql');

export function openDb() {
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = OFF'); // OFF while we drop old table
  // Migration: player_season_stats is now computed from player_match_stats
  db.exec('DROP TABLE IF EXISTS player_season_stats');
  db.exec('DROP VIEW IF EXISTS v_player_season_stats');
  db.exec('PRAGMA foreign_keys = ON');
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
  // Build the computed season-stats view from STAT_COLS so it stays in sync
  const aggCols = STAT_COLS.map(([, base]) =>
    `  SUM(p.stat_${base}) AS tot_${base}, ROUND(AVG(p.stat_${base}), 2) AS avg_${base}`
  ).join(',\n');
  db.exec(`CREATE VIEW IF NOT EXISTS v_player_season_stats AS
    SELECT
      p.year, p.player_id, p.team_id,
      t.name AS team_name, t.abbreviation AS team_abbr,
      MIN(p.given_name) AS given_name, MIN(p.surname) AS surname,
      MIN(p.position) AS position, MIN(p.jumper_number) AS jumper_number,
      COUNT(*) AS games_played,
${aggCols}
    FROM player_match_stats p
    JOIN teams t ON p.team_id = t.team_id
    GROUP BY p.year, p.player_id, p.team_id`);
  return db;
}

// Wraps a function in an explicit SQLite transaction. Returns the function's return value.
export function runTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// [camelCase key in source JSON, base snake_case column name, location in match stats]
// Column names: stat_{base} in player_match_stats; tot_{base}/avg_{base} computed on the fly
// Location: 'direct' = stats[key], 'clearances' = stats.clearances[key],
//           'extended' = stats.extendedStats[key], 'tog' = playerStats.timeOnGroundPercentage
export const STAT_COLS = [
  ['goals',                      'goals',                       'direct'],
  ['behinds',                    'behinds',                     'direct'],
  ['superGoals',                 'super_goals',                 'direct'],
  ['kicks',                      'kicks',                       'direct'],
  ['handballs',                  'handballs',                   'direct'],
  ['disposals',                  'disposals',                   'direct'],
  ['marks',                      'marks',                       'direct'],
  ['bounces',                    'bounces',                     'direct'],
  ['tackles',                    'tackles',                     'direct'],
  ['contestedPossessions',       'contested_possessions',       'direct'],
  ['uncontestedPossessions',     'uncontested_possessions',     'direct'],
  ['totalPossessions',           'total_possessions',           'direct'],
  ['inside50s',                  'inside50s',                   'direct'],
  ['marksInside50',              'marks_inside50',              'direct'],
  ['contestedMarks',             'contested_marks',             'direct'],
  ['hitouts',                    'hitouts',                     'direct'],
  ['onePercenters',              'one_percenters',              'direct'],
  ['disposalEfficiency',         'disposal_efficiency',         'direct'],
  ['clangers',                   'clangers',                    'direct'],
  ['freesFor',                   'frees_for',                   'direct'],
  ['freesAgainst',               'frees_against',               'direct'],
  ['dreamTeamPoints',            'dream_team_points',           'direct'],
  ['rebound50s',                 'rebound50s',                  'direct'],
  ['goalAssists',                'goal_assists',                'direct'],
  ['goalAccuracy',               'goal_accuracy',               'direct'],
  ['ratingPoints',               'rating_points',               'direct'],
  ['turnovers',                  'turnovers',                   'direct'],
  ['intercepts',                 'intercepts',                  'direct'],
  ['tacklesInside50',            'tackles_inside50',            'direct'],
  ['shotsAtGoal',                'shots_at_goal',               'direct'],
  ['scoreInvolvements',          'score_involvements',          'direct'],
  ['metresGained',               'metres_gained',               'direct'],
  ['centreClearances',           'centre_clearances',           'clearances'],
  ['stoppageClearances',         'stoppage_clearances',         'clearances'],
  ['totalClearances',            'total_clearances',            'clearances'],
  ['effectiveKicks',             'effective_kicks',             'extended'],
  ['kickEfficiency',             'kick_efficiency',             'extended'],
  ['kickToHandballRatio',        'kick_to_handball_ratio',      'extended'],
  ['effectiveDisposals',         'effective_disposals',         'extended'],
  ['marksOnLead',                'marks_on_lead',               'extended'],
  ['interceptMarks',             'intercept_marks',             'extended'],
  ['contestedPossessionRate',    'contested_possession_rate',   'extended'],
  ['hitoutsToAdvantage',         'hitouts_to_advantage',        'extended'],
  ['hitoutWinPercentage',        'hitout_win_percentage',       'extended'],
  ['hitoutToAdvantageRate',      'hitout_to_advantage_rate',    'extended'],
  ['groundBallGets',             'ground_ball_gets',            'extended'],
  ['f50GroundBallGets',          'f50_ground_ball_gets',        'extended'],
  ['scoreLaunches',              'score_launches',              'extended'],
  ['pressureActs',               'pressure_acts',               'extended'],
  ['defHalfPressureActs',        'def_half_pressure_acts',      'extended'],
  ['spoils',                     'spoils',                      'extended'],
  ['ruckContests',               'ruck_contests',               'extended'],
  ['contestDefOneOnOnes',        'contest_def_one_on_ones',     'extended'],
  ['contestDefLosses',           'contest_def_losses',          'extended'],
  ['contestDefLossPercentage',   'contest_def_loss_percentage', 'extended'],
  ['contestOffOneOnOnes',        'contest_off_one_on_ones',     'extended'],
  ['contestOffWins',             'contest_off_wins',            'extended'],
  ['contestOffWinsPercentage',   'contest_off_wins_percentage', 'extended'],
  ['centreBounceAttendances',    'centre_bounce_attendances',   'extended'],
  ['kickins',                    'kickins',                     'extended'],
  ['kickinsPlayon',              'kickins_playon',              'extended'],
  ['timeOnGroundPercentage',     'time_on_ground_percentage',   'tog'],
];

export function flattenMatchStats(playerStats) {
  const s = playerStats.stats;
  const result = {};
  for (const [key, base, section] of STAT_COLS) {
    const col = `stat_${base}`;
    if (section === 'direct')          result[col] = s[key] ?? null;
    else if (section === 'clearances') result[col] = s.clearances?.[key] ?? null;
    else if (section === 'extended')   result[col] = s.extendedStats?.[key] ?? null;
    else if (section === 'tog')        result[col] = playerStats.timeOnGroundPercentage ?? null;
  }
  return result;
}

