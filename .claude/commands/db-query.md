You are helping write SQL queries against the AFL Stats local SQLite database served at http://localhost:3737.

## Task
$ARGUMENTS

---

## Database schema

### Tables

**seasons** — one row per competition year
- `year` INTEGER PK
- `comp_season_id` INTEGER
- `comp_season_name` TEXT  *(e.g. "2026 Toyota AFL Premiership Season")*

**teams** — 18 clubs
- `team_id` TEXT PK  *(see IDs below)*
- `name` TEXT, `abbreviation` TEXT, `nickname` TEXT

**venues**
- `venue_id` TEXT PK, `name`, `abbreviation`, `location`, `state`, `timezone`

**matches** — every match 2012–2026
- `match_id` TEXT PK  *(e.g. "CD_M202601400")*
- `year`, `comp_season_id`, `round_number` INTEGER, `round_name`, `round_abbreviation`
- `home_team_id`, `away_team_id` → teams.team_id
- `venue_id` → venues.venue_id
- `utc_start_time` TEXT, `status` TEXT  *("CONCLUDED" | "SCHEDULED" | "LIVE")*
- `home_goals`, `home_behinds`, `home_score`, `away_goals`, `away_behinds`, `away_score` INTEGER

**player_match_stats** — one row per player per match
- `id` AUTOINCREMENT PK
- `match_id`, `year`, `round_number`
- `player_id`, `given_name`, `surname`, `team_id`, `position`, `jumper_number`
- 62 `stat_*` REAL columns  *(see stat columns below)*
- UNIQUE(match_id, player_id, team_id)

**player_season_stats** — one row per player per season
- `id` AUTOINCREMENT PK
- `year`, `team_id`, `player_id`, `given_name`, `surname`, `position`, `jumper_number`, `games_played`
- 62 `tot_*` REAL columns  *(season totals)*
- 62 `avg_*` REAL columns  *(per-game averages)*
- UNIQUE(year, team_id, player_id)

---

### Convenience views (team names pre-joined — prefer these)

**v_player_season_stats** — player_season_stats + `team_name`, `team_abbr`
**v_player_match_stats** — player_match_stats + `team_name`, `team_abbr`
**v_matches** — matches + `home_team_name`, `home_abbr`, `away_team_name`, `away_abbr`, `venue_name`

---

### Stat columns (62 total)

Use prefix `stat_` for match stats, `tot_` for season totals, `avg_` for season averages.

**Core (32):**
goals, behinds, super_goals, kicks, handballs, disposals, marks, bounces, tackles,
contested_possessions, uncontested_possessions, total_possessions, inside50s, marks_inside50,
contested_marks, hitouts, one_percenters, disposal_efficiency, clangers, frees_for, frees_against,
dream_team_points, rebound50s, goal_assists, goal_accuracy, rating_points, turnovers, intercepts,
tackles_inside50, shots_at_goal, score_involvements, metres_gained

**Clearances (3):**
centre_clearances, stoppage_clearances, total_clearances

**Extended (26):**
effective_kicks, kick_efficiency, kick_to_handball_ratio, effective_disposals, marks_on_lead,
intercept_marks, contested_possession_rate, hitouts_to_advantage, hitout_win_percentage,
hitout_to_advantage_rate, ground_ball_gets, f50_ground_ball_gets, score_launches, pressure_acts,
def_half_pressure_acts, spoils, ruck_contests, contest_def_one_on_ones, contest_def_losses,
contest_def_loss_percentage, contest_off_one_on_ones, contest_off_wins, contest_off_wins_percentage,
centre_bounce_attendances, kickins, kickins_playon

**TOG (1):**
time_on_ground_percentage

---

### Team IDs

| team_id | Name | Abbr |
|---------|------|------|
| CD_T10  | Adelaide Crows | ADEL |
| CD_T20  | Brisbane Lions | BL |
| CD_T30  | Carlton | CARL |
| CD_T40  | Collingwood | COLL |
| CD_T50  | Essendon | ESS |
| CD_T60  | Fremantle | FRE |
| CD_T70  | Geelong Cats | GEEL |
| CD_T1000 | Gold Coast SUNS | GCFC |
| CD_T1010 | GWS GIANTS | GWS |
| CD_T80  | Hawthorn | HAW |
| CD_T90  | Melbourne | MELB |
| CD_T100 | North Melbourne | NMFC |
| CD_T110 | Port Adelaide | PORT |
| CD_T120 | Richmond | RICH |
| CD_T130 | St Kilda | STK |
| CD_T160 | Sydney Swans | SYD |
| CD_T150 | West Coast Eagles | WCE |
| CD_T140 | Western Bulldogs | WB |

---

### Query constraints

- Only SELECT statements are accepted (no INSERT/UPDATE/DELETE)
- No semicolons (single statement only)
- Results capped at 10,000 rows
- Run queries at http://localhost:3737 in the SQL Query tab

---

### Example queries

**Top disposal averages, 2026 (min 10 games):**
```sql
SELECT given_name, surname, team_name, games_played,
  avg_disposals, avg_kicks, avg_handballs, avg_marks
FROM v_player_season_stats
WHERE year = 2026 AND games_played >= 10
ORDER BY avg_disposals DESC
LIMIT 20
```

**Score involvements per disposal, 2026:**
```sql
SELECT
  p.given_name, p.surname, p.team_name, p.games_played,
  ROUND(SUM(p.stat_score_involvements) * 1.0 / NULLIF(SUM(p.stat_disposals), 0), 3) AS si_per_disposal,
  ROUND(AVG(p.stat_score_involvements), 1) AS avg_si,
  ROUND(AVG(p.stat_disposals), 1) AS avg_disp
FROM v_player_match_stats p
WHERE p.year = 2026
GROUP BY p.player_id, p.given_name, p.surname, p.team_name
HAVING SUM(p.stat_disposals) >= 100
ORDER BY si_per_disposal DESC
LIMIT 25
```

**Head-to-head record between two teams:**
```sql
SELECT
  v.year, v.round_number,
  v.home_team_name, v.home_score,
  v.away_team_name, v.away_score,
  CASE WHEN v.home_score > v.away_score THEN v.home_team_name
       WHEN v.away_score > v.home_score THEN v.away_team_name
       ELSE 'Draw' END AS winner
FROM v_matches v
WHERE status = 'CONCLUDED'
  AND ((home_team_id = 'CD_T40' AND away_team_id = 'CD_T70')
    OR (home_team_id = 'CD_T70' AND away_team_id = 'CD_T40'))
ORDER BY year DESC, round_number DESC
```

**Player career stats across all seasons:**
```sql
SELECT year, team_name, games_played,
  avg_disposals, avg_kicks, avg_marks, avg_tackles, avg_goals
FROM v_player_season_stats
WHERE surname = 'Bontempelli' AND given_name = 'Marcus'
ORDER BY year
```

**Team season summary (total goals, wins):**
```sql
SELECT
  t.name AS team,
  COUNT(*) AS matches_played,
  SUM(CASE WHEN (m.home_team_id = t.team_id AND m.home_score > m.away_score)
            OR  (m.away_team_id = t.team_id AND m.away_score > m.home_score)
       THEN 1 ELSE 0 END) AS wins,
  ROUND(AVG(CASE WHEN m.home_team_id = t.team_id THEN m.home_score ELSE m.away_score END), 1) AS avg_score_for,
  ROUND(AVG(CASE WHEN m.home_team_id = t.team_id THEN m.away_score ELSE m.home_score END), 1) AS avg_score_against
FROM matches m
JOIN teams t ON t.team_id IN (m.home_team_id, m.away_team_id)
WHERE m.year = 2026 AND m.status = 'CONCLUDED'
GROUP BY t.team_id, t.name
ORDER BY wins DESC
```

---

Write clean, readable SQL. Prefer the `v_*` views over raw tables for player queries so team names are already resolved. Use `NULLIF(..., 0)` when dividing to avoid division-by-zero. Use `HAVING games_played >= N` or `HAVING SUM(stat_disposals) >= N` to filter small samples. Column values are REAL (nullable) — use `IS NOT NULL` guards where needed.
