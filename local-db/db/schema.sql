-- AFL Stats Local Database Schema

CREATE TABLE IF NOT EXISTS seasons (
  year             INTEGER PRIMARY KEY,
  comp_season_id   INTEGER NOT NULL,
  comp_season_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  team_id      TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  nickname     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS venues (
  venue_id     TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  abbreviation TEXT,
  location     TEXT,
  state        TEXT,
  timezone     TEXT,
  land_owner   TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  match_id           TEXT PRIMARY KEY,
  year               INTEGER NOT NULL REFERENCES seasons(year),
  comp_season_id     INTEGER NOT NULL,
  round_number       INTEGER NOT NULL,
  round_name         TEXT NOT NULL,
  round_abbreviation TEXT NOT NULL,
  home_team_id       TEXT NOT NULL REFERENCES teams(team_id),
  away_team_id       TEXT NOT NULL REFERENCES teams(team_id),
  venue_id           TEXT REFERENCES venues(venue_id),
  utc_start_time     TEXT,
  status             TEXT NOT NULL,
  home_goals         INTEGER,
  home_behinds       INTEGER,
  home_score         INTEGER,
  away_goals         INTEGER,
  away_behinds       INTEGER,
  away_score         INTEGER
);

CREATE INDEX IF NOT EXISTS idx_matches_year      ON matches(year);
CREATE INDEX IF NOT EXISTS idx_matches_round     ON matches(year, round_number);
CREATE INDEX IF NOT EXISTS idx_matches_home_team ON matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_team ON matches(away_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_status    ON matches(status);

CREATE TABLE IF NOT EXISTS player_match_stats (
  id                               INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id                         TEXT NOT NULL REFERENCES matches(match_id),
  year                             INTEGER NOT NULL,
  round_number                     INTEGER NOT NULL,
  player_id                        TEXT NOT NULL,
  given_name                       TEXT NOT NULL,
  surname                          TEXT NOT NULL,
  team_id                          TEXT NOT NULL REFERENCES teams(team_id),
  position                         TEXT,
  jumper_number                    INTEGER,
  -- Direct stats
  stat_goals                       REAL,
  stat_behinds                     REAL,
  stat_super_goals                 REAL,
  stat_kicks                       REAL,
  stat_handballs                   REAL,
  stat_disposals                   REAL,
  stat_marks                       REAL,
  stat_bounces                     REAL,
  stat_tackles                     REAL,
  stat_contested_possessions       REAL,
  stat_uncontested_possessions     REAL,
  stat_total_possessions           REAL,
  stat_inside50s                   REAL,
  stat_marks_inside50              REAL,
  stat_contested_marks             REAL,
  stat_hitouts                     REAL,
  stat_one_percenters              REAL,
  stat_disposal_efficiency         REAL,
  stat_clangers                    REAL,
  stat_frees_for                   REAL,
  stat_frees_against               REAL,
  stat_dream_team_points           REAL,
  stat_rebound50s                  REAL,
  stat_goal_assists                REAL,
  stat_goal_accuracy               REAL,
  stat_rating_points               REAL,
  stat_turnovers                   REAL,
  stat_intercepts                  REAL,
  stat_tackles_inside50            REAL,
  stat_shots_at_goal               REAL,
  stat_score_involvements          REAL,
  stat_metres_gained               REAL,
  -- Clearances
  stat_centre_clearances           REAL,
  stat_stoppage_clearances         REAL,
  stat_total_clearances            REAL,
  -- Extended stats
  stat_effective_kicks             REAL,
  stat_kick_efficiency             REAL,
  stat_kick_to_handball_ratio      REAL,
  stat_effective_disposals         REAL,
  stat_marks_on_lead               REAL,
  stat_intercept_marks             REAL,
  stat_contested_possession_rate   REAL,
  stat_hitouts_to_advantage        REAL,
  stat_hitout_win_percentage       REAL,
  stat_hitout_to_advantage_rate    REAL,
  stat_ground_ball_gets            REAL,
  stat_f50_ground_ball_gets        REAL,
  stat_score_launches              REAL,
  stat_pressure_acts               REAL,
  stat_def_half_pressure_acts      REAL,
  stat_spoils                      REAL,
  stat_ruck_contests               REAL,
  stat_contest_def_one_on_ones     REAL,
  stat_contest_def_losses          REAL,
  stat_contest_def_loss_percentage REAL,
  stat_contest_off_one_on_ones     REAL,
  stat_contest_off_wins            REAL,
  stat_contest_off_wins_percentage REAL,
  stat_centre_bounce_attendances   REAL,
  stat_kickins                     REAL,
  stat_kickins_playon              REAL,
  -- Time on ground
  stat_time_on_ground_percentage   REAL,
  UNIQUE(match_id, player_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_pms_player ON player_match_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_pms_team   ON player_match_stats(team_id);
CREATE INDEX IF NOT EXISTS idx_pms_year   ON player_match_stats(year);
CREATE INDEX IF NOT EXISTS idx_pms_match  ON player_match_stats(match_id);
CREATE INDEX IF NOT EXISTS idx_pms_round  ON player_match_stats(year, round_number);

-- player_season_stats removed: aggregates now computed dynamically from player_match_stats
-- v_player_season_stats view is created programmatically in db.js (openDb)

CREATE TABLE IF NOT EXISTS import_log (
  file_path   TEXT PRIMARY KEY,
  file_size   INTEGER NOT NULL,
  file_mtime  REAL NOT NULL,
  imported_at TEXT NOT NULL
);

-- ── Convenience views (team_id auto-resolved to team name) ────────────────────

CREATE VIEW IF NOT EXISTS v_matches AS
SELECT
  m.*,
  ht.name         AS home_team_name,
  ht.abbreviation AS home_abbr,
  at.name         AS away_team_name,
  at.abbreviation AS away_abbr,
  v.name          AS venue_name
FROM matches m
JOIN  teams  ht ON m.home_team_id = ht.team_id
JOIN  teams  at ON m.away_team_id = at.team_id
LEFT JOIN venues v ON m.venue_id = v.venue_id;

CREATE VIEW IF NOT EXISTS v_player_match_stats AS
SELECT p.*, t.name AS team_name, t.abbreviation AS team_abbr
FROM player_match_stats p
JOIN teams t ON p.team_id = t.team_id;

