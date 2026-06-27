import express from 'express';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { openDb, STAT_COLS } from '../scripts/lib/db.js';
import Anthropic from '@anthropic-ai/sdk';
import { Agent, fetch as undiciFetch } from 'undici';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Force outbound HTTPS over IPv4. DNS returns an AAAA record for
// api.anthropic.com, but some Docker networks (e.g. on the NAS) have no IPv6
// route, so the default fetch tries IPv6 and hangs. family:4 pins IPv4.
// Use undici's own fetch with the dispatcher: a dispatcher from the installed
// undici is incompatible with Node's built-in fetch (different undici version).
const ipv4Dispatcher = new Agent({ connect: { family: 4 } });
const PORT = process.env.PORT ?? 3737;
const DB_PATH = join(__dirname, '../afl-stats.db');

if (!existsSync(DB_PATH)) {
  console.error('Database not found. Run: npm run db:import');
  process.exit(1);
}

const db = openDb();

// The Ask page's debug log and durable chat context live in their own SQLite DB,
// separate from afl-stats.db which is baked into the image and reseeded on every
// build. Point ASK_DB_PATH at a mounted volume in production so chat history and
// context survive rebuilds; it defaults alongside the app for local dev.
const ASK_DB_PATH = process.env.ASK_DB_PATH ?? join(__dirname, '../ask.db');
mkdirSync(dirname(ASK_DB_PATH), { recursive: true });
const askDb = new DatabaseSync(ASK_DB_PATH);
askDb.exec('PRAGMA journal_mode = WAL');
askDb.exec(`
  CREATE TABLE IF NOT EXISTS ask_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts            INTEGER NOT NULL,
    chat_id       TEXT,
    prompt        TEXT NOT NULL,
    attempt       INTEGER NOT NULL,
    sql           TEXT,
    success       INTEGER NOT NULL,
    error         TEXT,
    row_count     INTEGER,
    input_tokens  INTEGER,
    output_tokens INTEGER
  );
  CREATE TABLE IF NOT EXISTS ask_chat (
    chat_id    TEXT PRIMARY KEY,
    messages   TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

const app = express();
app.use(express.json());

app.use(express.static(join(__dirname, '../dist')));

// Percentage/rate/efficiency/ratio columns — avg only, never totaled
const PCT_KW = ['percentage', 'efficiency', 'accuracy', 'rate', 'ratio']
const isPct = base => PCT_KW.some(k => base.includes(k))

// Allowlist of sortable columns for player-season-stats (all are computed aliases)
const SEASON_SORT_COLS = new Set([
  'games_played', 'year',
  ...STAT_COLS.filter(([, b]) => !isPct(b)).map(([, base]) => `tot_${base}`),
  ...STAT_COLS.map(([, base]) => `avg_${base}`),
]);

// Pre-built aggregate SELECT for season stats (computed from match stats)
// Percentage-like columns only get avg_, not tot_
const SEASON_AGG = STAT_COLS.map(([, base]) =>
  isPct(base)
    ? `  ROUND(AVG(p.stat_${base}), 2) AS avg_${base}`
    : `  SUM(p.stat_${base}) AS tot_${base}, ROUND(AVG(p.stat_${base}), 2) AS avg_${base}`
).join(',\n');

const SEASON_BASE = `
  SELECT
    p.year, p.player_id, p.team_id,
    t.name AS team_name, t.abbreviation AS team_abbr,
    MIN(p.given_name) AS given_name, MIN(p.surname) AS surname,
    MIN(p.position) AS position, MIN(p.jumper_number) AS jumper_number,
    COUNT(*) AS games_played,
${SEASON_AGG}
  FROM player_match_stats p
  JOIN teams t ON p.team_id = t.team_id
`;

const MATCH_SORT_COLS = new Set([
  'year', 'round_number', 'given_name', 'surname',
  ...STAT_COLS.map(([, base]) => `stat_${base}`),
]);

// ── Meta ──────────────────────────────────────────────────────────────────────

app.get('/api/seasons', (req, res) => {
  res.json(db.prepare('SELECT * FROM seasons ORDER BY year DESC').all());
});

app.get('/api/teams', (req, res) => {
  res.json(db.prepare('SELECT * FROM teams ORDER BY name').all());
});

app.get('/api/venues', (req, res) => {
  res.json(db.prepare('SELECT * FROM venues ORDER BY name').all());
});

app.get('/api/import-status', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM import_log').get();
  const last = db.prepare(
    'SELECT MAX(imported_at) AS ts FROM import_log'
  ).get();
  res.json({ files_tracked: count.n, last_import: last.ts ?? null });
});

// ── Matches ───────────────────────────────────────────────────────────────────

app.get('/api/matches', (req, res) => {
  const { year, round, team, status } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;

  const where = [];
  const params = [];

  if (year)   { where.push('m.year = ?');   params.push(Number(year)); }
  if (round)  { where.push('m.round_number = ?'); params.push(Number(round)); }
  if (team)   { where.push('(m.home_team_id = ? OR m.away_team_id = ?)'); params.push(team, team); }
  if (status) { where.push('m.status = ?'); params.push(status); }

  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT m.*,
      ht.name AS home_team_name, ht.abbreviation AS home_abbr,
      at.name AS away_team_name, at.abbreviation AS away_abbr,
      v.name  AS venue_name
    FROM matches m
    JOIN teams ht ON m.home_team_id = ht.team_id
    JOIN teams at ON m.away_team_id = at.team_id
    LEFT JOIN venues v ON m.venue_id = v.venue_id
    ${whereSQL}
    ORDER BY m.utc_start_time DESC NULLS LAST
    LIMIT ? OFFSET ?
  `;
  res.json(db.prepare(sql).all(...params, limit, offset));
});

app.get('/api/matches/:matchId', (req, res) => {
  const row = db.prepare(`
    SELECT m.*,
      ht.name AS home_team_name, ht.abbreviation AS home_abbr,
      at.name AS away_team_name, at.abbreviation AS away_abbr,
      v.name  AS venue_name
    FROM matches m
    JOIN teams ht ON m.home_team_id = ht.team_id
    JOIN teams at ON m.away_team_id = at.team_id
    LEFT JOIN venues v ON m.venue_id = v.venue_id
    WHERE m.match_id = ?
  `).get(req.params.matchId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.get('/api/match-details/:matchId', (req, res) => {
  const row = db.prepare(`
    SELECT md.*,
      m.home_goals, m.home_behinds, m.home_score,
      m.away_goals, m.away_behinds, m.away_score,
      m.utc_start_time, m.round_number, m.round_name,
      ht.name AS home_team_name, ht.abbreviation AS home_abbr,
      at.name AS away_team_name, at.abbreviation AS away_abbr,
      v.name AS venue_name
    FROM match_details md
    JOIN matches m ON md.match_id = m.match_id
    JOIN teams ht ON m.home_team_id = ht.team_id
    JOIN teams at ON m.away_team_id = at.team_id
    LEFT JOIN venues v ON m.venue_id = v.venue_id
    WHERE md.match_id = ?
  `).get(req.params.matchId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.get('/api/score-events/:matchId', (req, res) => {
  const rows = db.prepare(`
    SELECT se.seq, se.period_number, se.period_seconds,
           se.score_type, se.score_value, se.home_or_away,
           se.aggregate_home, se.aggregate_away,
           se.player_id, p.given_name, p.surname,
           t.abbreviation AS team_abbr
    FROM score_events se
    LEFT JOIN players p ON se.player_id = p.player_id
    JOIN  teams t       ON se.team_id   = t.team_id
    WHERE se.match_id = ?
    ORDER BY se.seq
  `).all(req.params.matchId);
  res.json(rows);
});

// ── Player Match Stats ────────────────────────────────────────────────────────

app.get('/api/player-match-stats', (req, res) => {
  const { year, round, team, player, match } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const offset = parseInt(req.query.offset) || 0;
  const sortCol = MATCH_SORT_COLS.has(req.query.sort) ? req.query.sort : 'stat_disposals';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';

  const where = [];
  const params = [];

  if (year)   { where.push('p.year = ?');         params.push(Number(year)); }
  if (round)  { where.push('p.round_number = ?'); params.push(Number(round)); }
  if (team)   { where.push('p.team_id = ?');      params.push(team); }
  if (player) { where.push('p.player_id = ?');    params.push(player); }
  if (match)  { where.push('p.match_id = ?');     params.push(match); }

  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT p.*, t.name AS team_name, t.abbreviation AS team_abbr
    FROM player_match_stats p
    JOIN teams t ON p.team_id = t.team_id
    ${whereSQL}
    ORDER BY p.${sortCol} ${dir} NULLS LAST
    LIMIT ? OFFSET ?
  `;
  res.json(db.prepare(sql).all(...params, limit, offset));
});

app.get('/api/player-match-stats/by-match/:matchId', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, t.name AS team_name, t.abbreviation AS team_abbr
    FROM player_match_stats p
    JOIN teams t ON p.team_id = t.team_id
    WHERE p.match_id = ?
    ORDER BY p.team_id, p.surname
  `).all(req.params.matchId);
  res.json(rows);
});

// ── Player Season Stats ───────────────────────────────────────────────────────

app.get('/api/player-season-stats', (req, res) => {
  const { year, team, player } = req.query;
  const minGames = parseInt(req.query.min_games) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const offset = parseInt(req.query.offset) || 0;
  const sortCol = SEASON_SORT_COLS.has(req.query.sort) ? req.query.sort : 'avg_disposals';
  const dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';

  const where = [];
  const params = [];

  if (year)   { where.push('p.year = ?');      params.push(Number(year)); }
  if (team)   { where.push('p.team_id = ?');   params.push(team); }
  if (player) { where.push('p.player_id = ?'); params.push(player); }

  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `${SEASON_BASE}
    ${whereSQL}
    GROUP BY p.year, p.player_id, p.team_id
    HAVING COUNT(*) >= ?
    ORDER BY ${sortCol} ${dir} NULLS LAST
    LIMIT ? OFFSET ?`;

  res.json(db.prepare(sql).all(...params, minGames, limit, offset));
});

app.get('/api/player-season-stats/career/:playerId', (req, res) => {
  const sql = `${SEASON_BASE}
    WHERE p.player_id = ?
    GROUP BY p.year, p.player_id, p.team_id
    ORDER BY p.year`;
  res.json(db.prepare(sql).all(req.params.playerId));
});

// ── AI Query (natural language → SQL) ────────────────────────────────────────

function buildAISystemPrompt(db) {
  const teams = db.prepare('SELECT team_id, name FROM teams ORDER BY name').all();
  const teamLines = teams.map(t => `  ${t.team_id}: ${t.name}`).join('\n');

  const countableBases = STAT_COLS.filter(([, b]) => !isPct(b)).map(([, b]) => b);
  const pctBases       = STAT_COLS.filter(([, b]) =>  isPct(b)).map(([, b]) => b);

  return `You are a SQLite query generator for an AFL (Australian Football League) statistics database.
Start your response with a TITLE: line (3–6 words summarising the query result), then provide the SQL wrapped in a \`\`\`sql … \`\`\` code block. No trailing semicolon. No other explanation.
CRITICAL: Only use columns that are explicitly listed for the table/view you are querying. Never assume a column exists.

## Base tables

seasons: year, comp_season_id, comp_season_name
teams: team_id, name, abbreviation, nickname
venues: venue_id, name, abbreviation, location, state, timezone, land_owner
matches: match_id, year, comp_season_id, round_number, round_name, round_abbreviation, home_team_id, away_team_id, venue_id, utc_start_time, status, home_goals, home_behinds, home_score, away_goals, away_behinds, away_score
match_details: match_id (FK→matches), weather_description, weather_temp_celsius, weather_type,
  home_q1_goals, home_q1_behinds, home_q1_score, home_q2_goals, home_q2_behinds, home_q2_score,
  home_q3_goals, home_q3_behinds, home_q3_score, home_q4_goals, home_q4_behinds, home_q4_score,
  away_q1_goals, away_q1_behinds, away_q1_score, away_q2_goals, away_q2_behinds, away_q2_score,
  away_q3_goals, away_q3_behinds, away_q3_score, away_q4_goals, away_q4_behinds, away_q4_score,
  home_rushed_behinds, away_rushed_behinds, home_minutes_in_front, away_minutes_in_front,
  final_margin (home_score - away_score; positive = home won, negative = away won),
  halftime_margin (home - away at end of Q2; positive = home leading),
  three_quarter_margin (home - away at end of Q3; positive = home leading),
  max_margin_q1, max_margin_q1_team ('H'=home/'A'=away), max_margin_q1_secs (periodSeconds when it occurred),
  max_margin_q2, max_margin_q2_team, max_margin_q2_secs,
  max_margin_q3, max_margin_q3_team, max_margin_q3_secs,
  max_margin_q4, max_margin_q4_team, max_margin_q4_secs,
  max_margin (biggest absolute margin in whole game), max_margin_team ('H'/'A'), max_margin_secs, max_margin_period (quarter it occurred in),
  lead_changes (integer: how many times the lead changed hands),
  largest_deficit_recovered (integer: biggest points deficit the eventual winner had to overcome; 0 if they led all game),
  — score_worm_json is raw JSON, do NOT query it directly; use the columns above instead
  — Betting market data (decimal odds, aussportsbetting.com, available 2009 onward; NULL for earlier/unmatched games).
    home_* always refers to the match home team. Prefer the *_close (closing) columns for "the odds".
    betting_source, betting_play_off_game (1=finals), betting_bookmakers_surveyed,
    betting_home_odds, betting_away_odds (head-to-head market average),
    betting_home_odds_open/min/max/close, betting_away_odds_open/min/max/close (head-to-head; favourite has the lower odds),
    betting_home_line_open/min/max/close, betting_away_line_open/min/max/close (handicap points; negative = favoured to win by that many),
    betting_home_line_odds_open/min/max/close, betting_away_line_odds_open/min/max/close (odds on the line bet),
    betting_total_score_open/min/max/close (over/under points line for combined score),
    betting_total_score_over_open/min/max/close, betting_total_score_under_open/min/max/close (odds for over/under),
    betting_notes (text caveat, usually NULL)
score_events: match_id (FK→matches), seq (0-based order within match), player_id (FK→players; NULL for RUSHED_BEHIND),
  team_id (FK→teams), period_number (1–4), period_seconds (seconds into that quarter),
  score_type ('GOAL'|'BEHIND'|'RUSHED_BEHIND'), score_value (6 for goal, 1 for behind/rushed),
  home_or_away ('HOME'|'AWAY'), aggregate_home, aggregate_away (running totals after this score)
  — indexes on player_id and team_id; use for queries like "all goals by X", "most scores in Q4", etc.
match_predictions: match_id (FK→matches), pred_home_all, pred_away_all (PalmyScore predicted scores from all-games team ratings),
  pred_home_ha, pred_away_ha (predicted scores from home/away venue-adjusted ratings). NULL when there wasn't enough form to predict.
  Retrospective walk-forward: each match predicted from data available before its round, supplemented with previous-season form so every team has ≥5 games.
  Prefer the v_match_predictions view, which also exposes the actual result and pre-computed margins.
player_match_stats: id, match_id, year, round_number, player_id, given_name, surname, team_id, position, jumper_number, [stat_{base} for each base listed below]
players: player_id (PK, join to player_match_stats), given_name, surname, date_of_birth (TEXT "DD/MM/YYYY"), height_cm, weight_kg, kicking_foot ("LEFT"|"RIGHT"), state_of_origin, position, draft_year, draft_position, draft_type, debut_year, recruited_from, photo_url, bio, star_sign
  — age is NOT stored; compute it as: CAST((julianday('now') - julianday(substr(date_of_birth,7,4)||'-'||substr(date_of_birth,4,2)||'-'||substr(date_of_birth,1,2))) / 365.25 AS INTEGER)

## Views — use these in preference to base tables

### v_matches
Columns: match_id, year, comp_season_id, round_number, round_name, round_abbreviation, home_team_id, away_team_id, venue_id, utc_start_time, status, home_goals, home_behinds, home_score, away_goals, away_behinds, away_score, home_team_name, home_abbr, away_team_name, away_abbr, venue_name
Note: home_team_name / away_team_name ONLY exist here.

### v_player_match_stats
Columns: id, match_id, year, round_number, player_id, given_name, surname, team_id, team_name, team_abbr, position, jumper_number, [stat_{base} for each base listed below]
Note: has team_name for the player's own team only. Does NOT have home_team_name or away_team_name.
To get home/away context, JOIN ON match_id with v_matches.

### v_match_predictions
Columns: match_id, year, round_number, round_name, status, home_team_id, away_team_id, home_team_name, home_abbr, away_team_name, away_abbr,
  home_score, away_score, actual_margin (home_score - away_score),
  pred_home_all, pred_away_all, pred_margin_all (pred_home_all - pred_away_all),
  pred_home_ha, pred_away_ha, pred_margin_ha (pred_home_ha - pred_away_ha)
Use for prediction-accuracy questions. A predicted margin > 0 favours the home team; the prediction is "correct" when SIGN(pred_margin) = SIGN(actual_margin).
Example "win % by predicted point difference":
  SELECT ROUND(pred_margin_ha) AS predicted_margin, COUNT(*) AS games,
    ROUND(100.0 * AVG(CASE WHEN (pred_margin_ha > 0) = (actual_margin > 0) THEN 1 ELSE 0 END), 1) AS favourite_win_pct
  FROM v_match_predictions
  WHERE status = 'CONCLUDED' AND pred_margin_ha IS NOT NULL
  GROUP BY predicted_margin ORDER BY predicted_margin

## Season stats — no pre-built view, compute via GROUP BY

There is no season stats table or view. To get per-player per-season aggregates, query player_match_stats with GROUP BY:

  SELECT p.year, p.player_id, p.team_id, t.name AS team_name,
    MIN(p.given_name) AS given_name, MIN(p.surname) AS surname,
    MIN(p.position) AS position, COUNT(*) AS games_played,
    SUM(p.stat_disposals) AS tot_disposals, ROUND(AVG(p.stat_disposals), 2) AS avg_disposals,
    ROUND(AVG(p.stat_disposal_efficiency), 2) AS avg_disposal_efficiency
  FROM player_match_stats p
  JOIN teams t ON p.team_id = t.team_id
  GROUP BY p.year, p.player_id, p.team_id

### Countable stat bases — use SUM for totals, AVG for averages (both valid)
${countableBases.join(', ')}

### Percentage / rate stat bases — AVG only, NEVER SUM these
${pctBases.join(', ')}

Column naming in player_match_stats / v_player_match_stats: stat_{base}  (e.g. stat_disposals)
Column naming in season aggregates: tot_{base} for countable totals, avg_{base} for all averages

## Teams

${teamLines}

## Notes

- year range: 2012–2026
- round_number is an integer (1–24 approx)
- match status values: CONCLUDED, SCHEDULED, UNCONFIRMED, CANCELLED
- player_id is a text key like "CD_I123456"
- Use LIMIT to cap results (default 20–100 rows)

## SQL rules — MUST follow

- Always combine player names as \`given_name || ' ' || surname AS player\` unless the user explicitly asks for separate columns.
- NEVER nest aggregate functions. MAX(SUM(...)) and MAX(MAX(...)) are illegal in SQLite and will cause an error.
- When you need to compare or take the maximum of two aggregated values, use a CTE (WITH clause) to compute the aggregates first, then apply MAX/MIN/comparison in the outer query. Prefer CTEs over subqueries for clarity.
- When referencing columns from a subquery or CTE, ONLY use the alias given to that subquery/CTE — never use the table aliases that were used inside it.

Example — WRONG (nested aggregates):
  SELECT MAX(SUM(CASE WHEN ... THEN x ELSE 0 END), SUM(CASE WHEN ... THEN y ELSE 0 END)) ...

Example — WRONG (wrong alias in outer query — inner alias "m" leaks out):
  SELECT m.match_id FROM (SELECT m.match_id FROM v_matches m GROUP BY m.match_id) AS sub

Example — CORRECT (CTE approach, outer query uses CTE name):
  WITH agg AS (
    SELECT m.match_id, m.year,
      SUM(CASE WHEN ... THEN x ELSE 0 END) AS a,
      SUM(CASE WHEN ... THEN y ELSE 0 END) AS b
    FROM v_matches m GROUP BY m.match_id
  )
  SELECT agg.match_id, agg.year, MAX(a, b) AS result FROM agg ORDER BY result DESC LIMIT 1;`;
}

const AI_SYSTEM_PROMPT = buildAISystemPrompt(db);

const aiStats = {
  model: 'claude-haiku-4-5-20251001',
  requestCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  rateLimit: null,
};

app.get('/api/ai/stats', (req, res) => {
  res.json({
    enabled: !!process.env.ANTHROPIC_API_KEY,
    ...aiStats,
  });
});

// Call Claude once with the given conversation and return the raw text plus this
// turn's token usage. Updates the shared `aiStats` (session counts + rate limit)
// so the header usage chip and GET /api/ai/stats stay accurate. Shared by the
// REST endpoint and the Ask subscription loop.
async function callClaude(messages, { system = AI_SYSTEM_PROMPT } = {}) {
  // Cap the request so a blocked outbound connection (e.g. the container can't
  // reach api.anthropic.com) surfaces as a fast error instead of hanging the UI
  // for the SDK's 10-minute default timeout.
  const client = new Anthropic({
    timeout: 30_000,
    maxRetries: 1,
    fetch: undiciFetch,
    fetchOptions: { dispatcher: ipv4Dispatcher },
  });
  const { data: msg, response: httpRes } = await client.messages.create({
    model: aiStats.model,
    max_tokens: 4096,
    system,
    messages,
  }).withResponse();

  const usage = {
    input_tokens:  msg.usage?.input_tokens  ?? 0,
    output_tokens: msg.usage?.output_tokens ?? 0,
  };
  aiStats.requestCount += 1;
  aiStats.inputTokens  += usage.input_tokens;
  aiStats.outputTokens += usage.output_tokens;

  const h = httpRes.headers;
  aiStats.rateLimit = {
    tokensLimit:         Number(h.get('anthropic-ratelimit-tokens-limit'))      || null,
    tokensRemaining:     Number(h.get('anthropic-ratelimit-tokens-remaining'))   || null,
    tokensReset:         h.get('anthropic-ratelimit-tokens-reset')               || null,
    requestsLimit:       Number(h.get('anthropic-ratelimit-requests-limit'))     || null,
    requestsRemaining:   Number(h.get('anthropic-ratelimit-requests-remaining')) || null,
    requestsReset:       h.get('anthropic-ratelimit-requests-reset')             || null,
  };

  return { text: msg.content[0].text.trim(), usage };
}

// Pull a SQL statement (and optional title/note) out of Claude's response, which
// may be a fenced code block, an unclosed fence, or plain text.
function extractSql(raw) {
  const titleMatch = raw.match(/^TITLE:\s*(.+)/mi);
  const title = titleMatch?.[1]?.trim();
  const body = raw.replace(/^TITLE:.*$/mi, '').trim();

  let sql, note;
  const codeMatch = body.match(/```(?:sql)?\s*([\s\S]+?)```/i);
  if (codeMatch) {
    sql = codeMatch[1].replace(/;$/, '').trim();
    note = body.replace(/```(?:sql)?[\s\S]+?```/gi, '').trim() || undefined;
  } else if (body.includes('```')) {
    // Unclosed fence (e.g. response truncated before the closing ```): strip the
    // opening fence and any trailing one so we don't leak ```sql into the output.
    sql = body.replace(/^[\s\S]*?```(?:sql)?\s*/i, '').replace(/```\s*$/, '').replace(/;$/, '').trim();
  } else {
    sql = body.replace(/;$/, '').trim();
  }
  return { sql, title, note };
}

// Validate and run a read-only query. Returns the result set, or throws an Error
// whose message is suitable to show the user / feed back to Claude for fixing.
function runSqlOrThrow(sql, params = []) {
  if (!sql || typeof sql !== 'string') throw new Error('Missing sql field');
  if (!/^\s*(SELECT|WITH)\b/i.test(sql)) throw new Error('Only SELECT statements are allowed');
  if (sql.includes(';')) throw new Error('Multiple statements are not allowed');

  const start = Date.now();
  const stmt = db.prepare(sql);
  const rows = stmt.all(...(Array.isArray(params) ? params : []));
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const limited = rows.slice(0, 10000);
  return {
    columns,
    rows: limited,
    rowCount: limited.length,
    executionMs: Date.now() - start,
  };
}

// Corrective user message handed back to Claude when a generated query fails.
function buildFixMessage(errorMsg) {
  return `That SQLite query returned an error:\n\n${errorMsg}\n\nReturn a corrected query.`;
}

const logAskStmt = askDb.prepare(`
  INSERT INTO ask_log (ts, chat_id, prompt, attempt, sql, success, error, row_count, input_tokens, output_tokens)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function logAsk({ chatId = null, prompt, attempt, sql, success, error = null, rowCount = null, inputTokens = null, outputTokens = null }) {
  try {
    logAskStmt.run(Date.now(), chatId, prompt, attempt, sql ?? null, success ? 1 : 0, error, rowCount, inputTokens, outputTokens);
  } catch (err) {
    console.error('ask_log insert failed:', err.message);
  }
}

app.post('/api/ai/query', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY environment variable is not set. Start the server with ANTHROPIC_API_KEY=sk-ant-... npm run start' });
  }
  const { prompt } = req.body ?? {};
  if (!prompt?.trim()) return res.status(400).json({ error: 'Missing prompt' });
  try {
    const { text } = await callClaude([{ role: 'user', content: prompt.trim() }]);
    const { sql, title, note } = extractSql(text);
    res.json({ sql, ...(title && { title }), ...(note && { note }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SQL Query ─────────────────────────────────────────────────────────────────

app.post('/api/query', (req, res) => {
  const { sql, params = [] } = req.body ?? {};
  try {
    res.json(runSqlOrThrow(sql, params));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Player search ─────────────────────────────────────────────────────────────

app.get('/api/players/search', (req, res) => {
  const q = (req.query.q ?? '').trim()
  if (q.length < 2) return res.json([])
  const like = `%${q}%`
  const rows = db.prepare(`
    WITH seasons AS (
      SELECT p.player_id, MIN(p.given_name) AS given_name, MIN(p.surname) AS surname,
             t.name AS team_name,
             ROW_NUMBER() OVER (PARTITION BY p.player_id ORDER BY p.year DESC) AS rn
      FROM player_match_stats p
      JOIN teams t ON p.team_id = t.team_id
      WHERE p.given_name || ' ' || p.surname LIKE ? OR p.surname LIKE ?
      GROUP BY p.player_id, p.year, p.team_id
    )
    SELECT s.player_id, s.given_name, s.surname, s.team_name,
           COALESCE(pl.position, '') AS position,
           s.given_name || ' ' || s.surname AS name
    FROM seasons s
    LEFT JOIN players pl ON pl.player_id = s.player_id
    WHERE s.rn = 1
    ORDER BY s.surname, s.given_name
    LIMIT 25
  `).all(like, like)
  res.json(rows)
})

// ── Image proxy (same-origin player photos for canvas/image export) ───────────

app.get('/api/image', async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https:\/\//i.test(url)) return res.status(400).send('Invalid url');
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(upstream.status).end();
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.set('Content-Type', upstream.headers.get('content-type') ?? 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (err) {
    res.status(502).send('Image fetch failed');
  }
});

// ── Schema info (for SQL query helper panel) ──────────────────────────────────

app.get('/api/schema', (req, res) => {
  const entries = db.prepare(
    "SELECT type, name FROM sqlite_master WHERE (type='table' OR type='view') AND name NOT LIKE 'sqlite_%' ORDER BY type DESC, name"
  ).all();

  const schema = {};
  for (const { type, name } of entries) {
    const label = type === 'view' ? `${name} (view)` : name;
    if (type === 'view') {
      schema[label] = db.prepare(`SELECT * FROM ${name} LIMIT 0`).columns().map(c => c.name);
    } else {
      schema[label] = db.prepare(`PRAGMA table_info(${name})`).all().map(c => c.name);
    }
  }
  res.json(schema);
});

// ── DB Browser (navigate raw tables/views) ────────────────────────────────────

// Tables & views that may be browsed — rebuilt per request so it always
// reflects the live schema, and used as an allowlist to keep the table name
// (which is interpolated into SQL) safe.
function browsableEntries() {
  return db.prepare(
    "SELECT type, name FROM sqlite_master WHERE (type='table' OR type='view') AND name NOT LIKE 'sqlite_%' ORDER BY type DESC, name"
  ).all();
}

app.get('/api/browse/tables', (req, res) => {
  const out = browsableEntries().map(({ type, name }) => {
    let rowCount = null;
    try { rowCount = db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n; } catch {}
    return { name, type, rowCount };
  });
  res.json(out);
});

app.get('/api/browse/:table', (req, res) => {
  const { table } = req.params;
  if (!browsableEntries().some(e => e.name === table)) {
    return res.status(404).json({ error: 'Unknown table' });
  }

  const columns = db.prepare(`SELECT * FROM "${table}" LIMIT 0`).columns().map(c => c.name);
  const limit  = Math.min(parseInt(req.query.limit) || 100, 1000);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const sort   = columns.includes(req.query.sort) ? req.query.sort : null;
  const dir    = req.query.dir === 'desc' ? 'DESC' : 'ASC';
  const orderSQL = sort ? `ORDER BY "${sort}" ${dir} NULLS LAST` : '';

  try {
    const total = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;
    const rows  = db.prepare(`SELECT * FROM "${table}" ${orderSQL} LIMIT ? OFFSET ?`).all(limit, offset);
    res.json({ columns, rows, total, limit, offset, sort, dir: dir.toLowerCase() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('*', (_, res) => {
  const distIndex = join(__dirname, '../dist/index.html');
  if (existsSync(distIndex)) {
    res.sendFile(distIndex);
  } else {
    res.status(503).send('Run `npm run build` first, or use `npm run dev` to launch the Vite frontend.');
  }
});

// ── GraphQL subscription: the "Ask" page's self-correcting NL→SQL loop ─────────
// A single subscription streams the behind-the-scenes progress to the client:
// building the query, each run attempt, errors, Claude fixes, token usage and the
// final result set. The generated SQL is never sent to the client (only logged to
// ask_log), so the UI can stay query-free.
//
// The page is a chat: follow-up questions refine the previous result. Conversation
// context is held here, server-side, keyed by chatId — the SQL the user never sees
// stays out of the client. A fresh chatId (from "Clear chat") starts from scratch.

const ASK_MAX_ATTEMPTS = 5;

// chatId -> clean conversation [{role, content}]. Only the user prompt and the
// final working SQL of each turn are kept (not the intermediate error/fix
// sub-exchanges) so follow-ups stay cheap. The Map is an in-memory cache; the
// ask_chat table is the durable store so context survives restarts / reloads.
const chatSessions = new Map();
const CHAT_SESSION_CAP = 50;

const loadChatStmt = askDb.prepare('SELECT messages FROM ask_chat WHERE chat_id = ?');
const upsertChatStmt = askDb.prepare(`
  INSERT INTO ask_chat (chat_id, messages, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(chat_id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at
`);

// Return this chat's prior turns, falling back to the durable store (and warming
// the cache) when the chat isn't in memory (server restarted or it was pruned).
function loadChatHistory(chatId) {
  if (chatSessions.has(chatId)) return chatSessions.get(chatId);
  try {
    const row = loadChatStmt.get(chatId);
    if (row) {
      const messages = JSON.parse(row.messages);
      chatSessions.set(chatId, messages);
      return messages;
    }
  } catch (err) {
    console.error('ask_chat load failed:', err.message);
  }
  return [];
}

function commitTurn(chatId, history, userText, finalSql) {
  const next = [
    ...history,
    { role: 'user', content: userText },
    { role: 'assistant', content: finalSql },
  ];
  // delete-then-set so the active chat re-inserts as most-recent (LRU-ish).
  chatSessions.delete(chatId);
  chatSessions.set(chatId, next);
  while (chatSessions.size > CHAT_SESSION_CAP) {
    chatSessions.delete(chatSessions.keys().next().value);
  }
  try {
    upsertChatStmt.run(chatId, JSON.stringify(next), Date.now());
  } catch (err) {
    console.error('ask_chat upsert failed:', err.message);
  }
}

const typeDefs = /* GraphQL */ `
  type Query { _empty: String }

  type AskEvent {
    type: String!          # status | attempt | error | tokens | result | done | failed
    message: String
    attempt: Int
    maxAttempts: Int
    inputTokens: Int
    outputTokens: Int
    rowCount: Int
    executionMs: Int
    columns: [String!]
    rows: String           # JSON-encoded array of row objects (rows are dynamic)
    model: String
    title: String          # Claude's short label for the result table
  }

  type Subscription {
    ask(chatId: String!, prompt: String!): AskEvent!
  }
`;

async function* runAsk(chatId, prompt) {
  if (!process.env.ANTHROPIC_API_KEY) {
    yield { type: 'failed', message: 'ANTHROPIC_API_KEY is not set on the server.' };
    return;
  }
  const text = prompt?.trim();
  if (!text) {
    yield { type: 'failed', message: 'Empty prompt.' };
    return;
  }

  let inputTokens = 0;
  let outputTokens = 0;

  yield { type: 'status', message: 'Asking Claude to build a query…' };

  // Seed the conversation with this chat's prior turns so follow-ups carry context.
  const history = loadChatHistory(chatId);
  const messages = [...history, { role: 'user', content: text }];
  let sql, title;
  try {
    const { text: reply, usage } = await callClaude(messages);
    inputTokens += usage.input_tokens;
    outputTokens += usage.output_tokens;
    const parsed = extractSql(reply);
    sql = parsed.sql;
    if (parsed.title) title = parsed.title;
    yield { type: 'tokens', inputTokens, outputTokens, model: aiStats.model };
  } catch (err) {
    yield { type: 'failed', message: `Claude request failed: ${err.message}` };
    return;
  }

  for (let attempt = 1; attempt <= ASK_MAX_ATTEMPTS; attempt++) {
    yield { type: 'attempt', attempt, maxAttempts: ASK_MAX_ATTEMPTS, message: `Running query (attempt ${attempt} of ${ASK_MAX_ATTEMPTS})…` };
    try {
      const result = runSqlOrThrow(sql);
      logAsk({ chatId, prompt: text, attempt, sql, success: true, rowCount: result.rowCount, inputTokens, outputTokens });
      // Persist a clean turn (user + final working SQL) for follow-up context.
      commitTurn(chatId, history, text, sql);
      yield {
        type: 'result',
        columns: result.columns,
        rows: JSON.stringify(result.rows),
        rowCount: result.rowCount,
        executionMs: result.executionMs,
        title: title ?? null,
      };
      yield { type: 'done', message: `Done · ${result.rowCount.toLocaleString()} rows · ${(inputTokens + outputTokens).toLocaleString()} tokens`, inputTokens, outputTokens, model: aiStats.model };
      return;
    } catch (err) {
      logAsk({ chatId, prompt: text, attempt, sql, success: false, error: err.message, inputTokens, outputTokens });
      yield { type: 'error', message: err.message, attempt, maxAttempts: ASK_MAX_ATTEMPTS };

      if (attempt === ASK_MAX_ATTEMPTS) {
        // Keep the last attempt as context so a "try it differently" follow-up works.
        commitTurn(chatId, history, text, sql);
        yield { type: 'failed', message: `Could not produce a working query after ${ASK_MAX_ATTEMPTS} attempts.` };
        return;
      }

      yield { type: 'status', message: 'Asking Claude to fix the query…' };
      messages.push({ role: 'assistant', content: sql });
      messages.push({ role: 'user', content: buildFixMessage(err.message) });
      try {
        const { text: reply, usage } = await callClaude(messages);
        inputTokens += usage.input_tokens;
        outputTokens += usage.output_tokens;
        const parsed = extractSql(reply);
        sql = parsed.sql;
        if (parsed.title) title = parsed.title;
        yield { type: 'tokens', inputTokens, outputTokens, model: aiStats.model };
      } catch (e) {
        yield { type: 'failed', message: `Claude request failed: ${e.message}` };
        return;
      }
    }
  }
}

const schema = makeExecutableSchema({
  typeDefs,
  resolvers: {
    Query: { _empty: () => null },
    Subscription: {
      ask: {
        subscribe: (_root, { chatId, prompt }) => runAsk(chatId, prompt),
        resolve: (payload) => payload,
      },
    },
  },
});

// Bind to loopback by default; set HOST=0.0.0.0 (e.g. in Docker) to expose it.
const HOST = process.env.HOST ?? '127.0.0.1';
const server = app.listen(PORT, HOST, () => {
  console.log(`PalmyDatabase running at http://${HOST}:${PORT}`);
});

// GraphQL-over-WebSocket endpoint for the Ask page's live progress stream.
const wsServer = new WebSocketServer({ server, path: '/graphql' });
useServer({ schema }, wsServer);

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error(`Kill the existing process with: lsof -ti :${PORT} | xargs kill`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
