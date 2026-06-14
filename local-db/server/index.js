import express from 'express';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { openDb, STAT_COLS } from '../scripts/lib/db.js';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 3737;
const DB_PATH = join(__dirname, '../afl-stats.db');

if (!existsSync(DB_PATH)) {
  console.error('Database not found. Run: npm run db:import');
  process.exit(1);
}

const db = openDb();
const app = express();
app.use(express.json());

const isProd = process.env.NODE_ENV === 'production';
app.use(express.static(join(__dirname, isProd ? '../dist' : '../public')));
if (isProd) {
  app.get('*', (_, res) => res.sendFile(join(__dirname, '../dist/index.html')));
}

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
  const statBases = STAT_COLS.map(([, base]) => base).join(', ');
  const teamLines = teams.map(t => `  ${t.team_id}: ${t.name}`).join('\n');

  return `You are a SQLite query generator for an AFL (Australian Football League) statistics database.
Start your response with a TITLE: line (3–6 words summarising the query result), then provide the SQL wrapped in a \`\`\`sql … \`\`\` code block. No trailing semicolon. No other explanation.
CRITICAL: Only use columns that are explicitly listed for the table/view you are querying. Never assume a column exists.

## Base tables

seasons: year, comp_season_id, comp_season_name
teams: team_id, name, abbreviation, nickname
venues: venue_id, name, abbreviation, location, state, timezone, land_owner
matches: match_id, year, comp_season_id, round_number, round_name, round_abbreviation, home_team_id, away_team_id, venue_id, utc_start_time, status, home_goals, home_behinds, home_score, away_goals, away_behinds, away_score
player_match_stats: id, match_id, year, round_number, player_id, given_name, surname, team_id, position, jumper_number, [stat_{base} × 62 — see stat bases below]

## Views — use these in preference to base tables

### v_matches
Columns: match_id, year, comp_season_id, round_number, round_name, round_abbreviation, home_team_id, away_team_id, venue_id, utc_start_time, status, home_goals, home_behinds, home_score, away_goals, away_behinds, away_score, home_team_name, home_abbr, away_team_name, away_abbr, venue_name
Note: home_team_name / away_team_name ONLY exist here.

### v_player_match_stats
Columns: id, match_id, year, round_number, player_id, given_name, surname, team_id, team_name, team_abbr, position, jumper_number, [stat_{base} × 62]
Note: has team_name for the player's own team only. Does NOT have home_team_name or away_team_name.
To get home/away context, JOIN ON match_id with v_matches.

### v_player_season_stats
Columns: year, player_id, team_id, team_name, team_abbr, given_name, surname, position, jumper_number, games_played, [tot_{base} for countable stats], [avg_{base} for all stats]
Note: aggregated per player per year per team. Does NOT have match_id or round_number.
IMPORTANT: percentage/rate/efficiency/accuracy/ratio columns do NOT have a tot_{base} column — only avg_{base}. Examples: disposal_efficiency, goal_accuracy, kick_efficiency, kick_to_handball_ratio, contested_possession_rate, hitout_win_percentage, hitout_to_advantage_rate, contest_def_loss_percentage, contest_off_wins_percentage, time_on_ground_percentage.
Never reference tot_disposal_efficiency, tot_time_on_ground_percentage, etc. — those columns do not exist.

## Stat column bases (62 total)

${statBases}

- In player_match_stats / v_player_match_stats: stat_{base}  (e.g. stat_disposals)
- In v_player_season_stats: tot_{base} (season total, countable stats only) or avg_{base} (season average, all stats)

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

app.post('/api/ai/query', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY environment variable is not set. Start the server with ANTHROPIC_API_KEY=sk-ant-... npm run start' });
  }
  const { prompt } = req.body ?? {};
  if (!prompt?.trim()) return res.status(400).json({ error: 'Missing prompt' });
  try {
    const client = new Anthropic();
    const { data: msg, response: httpRes } = await client.messages.create({
      model: aiStats.model,
      max_tokens: 1024,
      system: AI_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt.trim() }],
    }).withResponse();

    aiStats.requestCount += 1;
    aiStats.inputTokens  += msg.usage?.input_tokens  ?? 0;
    aiStats.outputTokens += msg.usage?.output_tokens ?? 0;

    const h = httpRes.headers;
    aiStats.rateLimit = {
      tokensLimit:         Number(h.get('anthropic-ratelimit-tokens-limit'))      || null,
      tokensRemaining:     Number(h.get('anthropic-ratelimit-tokens-remaining'))   || null,
      tokensReset:         h.get('anthropic-ratelimit-tokens-reset')               || null,
      requestsLimit:       Number(h.get('anthropic-ratelimit-requests-limit'))     || null,
      requestsRemaining:   Number(h.get('anthropic-ratelimit-requests-remaining')) || null,
      requestsReset:       h.get('anthropic-ratelimit-requests-reset')             || null,
    };

    const raw = msg.content[0].text.trim();
    const titleMatch = raw.match(/^TITLE:\s*(.+)/mi);
    const title = titleMatch?.[1]?.trim();
    const codeMatch = raw.match(/```(?:sql)?\s*([\s\S]+?)```/i);
    let sql, note;
    if (codeMatch) {
      sql = codeMatch[1].replace(/;$/, '').trim();
      const stripped = raw
        .replace(/^TITLE:.*$/mi, '')
        .replace(/```(?:sql)?[\s\S]+?```/gi, '')
        .trim();
      note = stripped || undefined;
    } else {
      sql = raw.replace(/^TITLE:.*$/mi, '').replace(/;$/, '').trim();
    }
    res.json({ sql, ...(title && { title }), ...(note && { note }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SQL Query ─────────────────────────────────────────────────────────────────

app.post('/api/query', (req, res) => {
  const { sql, params = [] } = req.body ?? {};
  if (!sql || typeof sql !== 'string') {
    return res.status(400).json({ error: 'Missing sql field' });
  }
  if (!/^\s*(SELECT|WITH)\b/i.test(sql)) {
    return res.status(400).json({ error: 'Only SELECT statements are allowed' });
  }
  if (sql.includes(';')) {
    return res.status(400).json({ error: 'Multiple statements are not allowed' });
  }

  const start = Date.now();
  try {
    const stmt = db.prepare(sql);
    const rows = stmt.all(...(Array.isArray(params) ? params : []));
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const limited = rows.slice(0, 10000);
    res.json({
      columns,
      rows: limited,
      rowCount: limited.length,
      executionMs: Date.now() - start,
    });
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
    WITH latest AS (
      SELECT player_id, given_name, surname, team_name, position,
             ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY year DESC) AS rn
      FROM v_player_season_stats
      WHERE given_name || ' ' || surname LIKE ? OR surname LIKE ?
    )
    SELECT player_id, given_name, surname, team_name, position,
           given_name || ' ' || surname AS name
    FROM latest WHERE rn = 1
    ORDER BY surname, given_name
    LIMIT 25
  `).all(like, like)
  res.json(rows)
})

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

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`AFL Stats DB running at http://localhost:${PORT}`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error(`Kill the existing process with: lsof -ti :${PORT} | xargs kill`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
