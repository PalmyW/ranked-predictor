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
  db.exec('PRAGMA foreign_keys = OFF');
  // Migration: player_season_stats is now computed from player_match_stats
  db.exec('DROP TABLE IF EXISTS player_season_stats');
  db.exec('DROP VIEW IF EXISTS v_player_season_stats');
  // Migration: add star_sign column to players
  const hasStarSign = db.prepare("SELECT 1 FROM pragma_table_info('players') WHERE name='star_sign'").get();
  if (!hasStarSign) {
    db.exec('ALTER TABLE players ADD COLUMN star_sign TEXT');
    db.exec(`UPDATE players SET star_sign = (
      SELECT CASE
        WHEN m=3 AND d>=21 OR m=4 AND d<=19 THEN 'Aries'
        WHEN m=4 AND d>=20 OR m=5 AND d<=20 THEN 'Taurus'
        WHEN m=5 AND d>=21 OR m=6 AND d<=20 THEN 'Gemini'
        WHEN m=6 AND d>=21 OR m=7 AND d<=22 THEN 'Cancer'
        WHEN m=7 AND d>=23 OR m=8 AND d<=22 THEN 'Leo'
        WHEN m=8 AND d>=23 OR m=9 AND d<=22 THEN 'Virgo'
        WHEN m=9 AND d>=23 OR m=10 AND d<=22 THEN 'Libra'
        WHEN m=10 AND d>=23 OR m=11 AND d<=21 THEN 'Scorpio'
        WHEN m=11 AND d>=22 OR m=12 AND d<=21 THEN 'Sagittarius'
        WHEN m=12 AND d>=22 OR m=1 AND d<=19 THEN 'Capricorn'
        WHEN m=1 AND d>=20 OR m=2 AND d<=18 THEN 'Aquarius'
        WHEN m=2 AND d>=19 OR m=3 AND d<=20 THEN 'Pisces'
      END
      FROM (SELECT
        CAST(substr(players.date_of_birth,1,2) AS INT) AS d,
        CAST(substr(players.date_of_birth,4,2) AS INT) AS m
      )
    ) WHERE date_of_birth IS NOT NULL`);
  }
  // Migration: remove age column from players (computed from date_of_birth instead)
  const hasAge = db.prepare("SELECT 1 FROM pragma_table_info('players') WHERE name='age'").get();
  if (hasAge) {
    db.exec('ALTER TABLE players RENAME TO players_old');
    db.exec(`CREATE TABLE players (
      player_id TEXT PRIMARY KEY, given_name TEXT, surname TEXT, date_of_birth TEXT,
      height_cm INTEGER, weight_kg INTEGER, kicking_foot TEXT, state_of_origin TEXT,
      position TEXT, draft_year TEXT, draft_position INTEGER, draft_type TEXT,
      debut_year TEXT, recruited_from TEXT, photo_url TEXT, bio TEXT
    )`);
    db.exec(`INSERT INTO players SELECT player_id, given_name, surname, date_of_birth,
      height_cm, weight_kg, kicking_foot, state_of_origin, position, draft_year,
      draft_position, draft_type, debut_year, recruited_from, photo_url, bio FROM players_old`);
    db.exec('DROP TABLE players_old');
  }
  // Migration: add worm metric columns to match_details
  const hasMatchDetails = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='match_details'").get();
  if (hasMatchDetails) {
    const intCols = [
      'final_margin', 'halftime_margin', 'three_quarter_margin',
      'max_margin_q1', 'max_margin_q2', 'max_margin_q3', 'max_margin_q4',
      'max_margin', 'lead_changes', 'largest_deficit_recovered',
      'max_margin_q1_secs', 'max_margin_q2_secs', 'max_margin_q3_secs', 'max_margin_q4_secs',
      'max_margin_secs', 'max_margin_period',
    ];
    const textCols = [
      'max_margin_q1_team', 'max_margin_q2_team', 'max_margin_q3_team', 'max_margin_q4_team',
      'max_margin_team',
    ];
    for (const col of intCols) {
      if (!db.prepare(`SELECT 1 FROM pragma_table_info('match_details') WHERE name='${col}'`).get())
        db.exec(`ALTER TABLE match_details ADD COLUMN ${col} INTEGER`);
    }
    for (const col of textCols) {
      if (!db.prepare(`SELECT 1 FROM pragma_table_info('match_details') WHERE name='${col}'`).get())
        db.exec(`ALTER TABLE match_details ADD COLUMN ${col} TEXT`);
    }
  }
  db.exec('PRAGMA foreign_keys = ON');
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
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

