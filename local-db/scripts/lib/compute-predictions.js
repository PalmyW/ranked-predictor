import { runTransaction } from './db.js';

// Retrospective PalmyScore predictions, ported from the web app's score predictor
// + tipping backtest. For each round R, team ratings are built only from matches
// concluded BEFORE R (walk-forward), supplemented per-team with the most recent
// previous-season games so every team has at least MIN_FORM matches of form.
// Two variants are produced: all-games ratings and home/away (venue-adjusted).

const MIN_FORM = 5;

function isConcluded(m) {
  return m.status === 'CONCLUDED' && m.home_score != null && m.away_score != null;
}

// Per-team for/against/played over a match list. mode: 'both' | 'home' | 'away'.
function buildBasicStats(matches, mode) {
  const s = {};
  const ensure = (t) => (s[t] ??= { for: 0, against: 0, played: 0 });
  for (const m of matches) {
    if (!isConcluded(m)) continue;
    const h = m.home_team_id, a = m.away_team_id;
    const hs = m.home_score, as = m.away_score;
    if (mode !== 'away') { const e = ensure(h); e.for += hs; e.against += as; e.played++; }
    if (mode !== 'home') { const e = ensure(a); e.for += as; e.against += hs; e.played++; }
  }
  return s;
}

// Attack averages + defence adjustments (all / home / away) keyed by team id.
function buildStrengthRows(matches, teamIds) {
  const statsAll = buildBasicStats(matches, 'both');
  const statsHome = buildBasicStats(matches, 'home');
  const statsAway = buildBasicStats(matches, 'away');

  const avgFor = {}, avgForHome = {}, avgForAway = {};
  for (const t of teamIds) {
    const sA = statsAll[t], sH = statsHome[t], sAw = statsAway[t];
    avgFor[t]     = sA?.played  ? sA.for  / sA.played  : 0;
    avgForHome[t] = sH?.played  ? sH.for  / sH.played  : 0;
    avgForAway[t] = sAw?.played ? sAw.for / sAw.played : 0;
  }

  // Defence adjustment = opponent score vs opponent's all-games attack average.
  const adjAllS = {}, adjAllN = {}, adjHomeS = {}, adjHomeN = {}, adjAwayS = {}, adjAwayN = {};
  for (const t of teamIds) {
    adjAllS[t] = 0; adjAllN[t] = 0;
    adjHomeS[t] = 0; adjHomeN[t] = 0;
    adjAwayS[t] = 0; adjAwayN[t] = 0;
  }
  for (const m of matches) {
    if (!isConcluded(m)) continue;
    const h = m.home_team_id, a = m.away_team_id;
    if (adjAllS[h] === undefined || adjAllS[a] === undefined) continue;
    const hs = m.home_score, as = m.away_score;
    adjAllS[h] += as - avgFor[a]; adjAllN[h]++;   // visitor vs their all-avg
    adjAllS[a] += hs - avgFor[h]; adjAllN[a]++;    // home vs their all-avg
    adjHomeS[h] += as - avgFor[a]; adjHomeN[h]++;  // when h is home
    adjAwayS[a] += hs - avgFor[h]; adjAwayN[a]++;  // when a is away
  }

  const rows = {};
  for (const t of teamIds) {
    rows[t] = {
      played:     statsAll[t]?.played  ?? 0,
      playedHome: statsHome[t]?.played ?? 0,
      playedAway: statsAway[t]?.played ?? 0,
      avgFor: avgFor[t], avgForHome: avgForHome[t], avgForAway: avgForAway[t],
      defAll:  adjAllN[t]  > 0 ? adjAllS[t]  / adjAllN[t]  : 0,
      defHome: adjHomeN[t] > 0 ? adjHomeS[t] / adjHomeN[t] : 0,
      defAway: adjAwayN[t] > 0 ? adjAwayS[t] / adjAwayN[t] : 0,
    };
  }
  return rows;
}

// Predict one match's scores. venue=false → all-games ratings, true → home/away.
// Returns nulls when either team lacks the relevant form.
function predict(m, rows, venue) {
  const home = rows[m.home_team_id], away = rows[m.away_team_id];
  if (!home || !away) return { h: null, a: null };
  if (venue) {
    if (!(home.playedHome > 0 && away.playedAway > 0)) return { h: null, a: null };
    return {
      h: Math.round(home.avgForHome + away.defAway),
      a: Math.round(away.avgForAway + home.defHome),
    };
  }
  if (!(home.played > 0 && away.played > 0)) return { h: null, a: null };
  return {
    h: Math.round(home.avgFor + away.defAll),
    a: Math.round(away.avgFor + home.defAll),
  };
}

export function computePredictions(db) {
  const all = db.prepare(`
    SELECT match_id, year, round_number, home_team_id, away_team_id,
           home_score, away_score, status, utc_start_time
    FROM matches
  `).all();

  const teamIds = [...new Set(all.flatMap((m) => [m.home_team_id, m.away_team_id]))];

  const byYear = new Map();
  for (const m of all) {
    if (!byYear.has(m.year)) byYear.set(m.year, []);
    byYear.get(m.year).push(m);
  }

  // Previous-season concluded matches per team, most-recent-first.
  function prevByTeam(year) {
    const prev = (byYear.get(year - 1) ?? [])
      .filter(isConcluded)
      .sort((a, b) => (a.utc_start_time < b.utc_start_time ? 1 : -1));
    const map = new Map();
    for (const m of prev) {
      for (const t of [m.home_team_id, m.away_team_id]) {
        if (map.has(t)) map.get(t).push(m);
        else map.set(t, [m]);
      }
    }
    return map;
  }

  const out = [];
  for (const [year, matches] of byYear) {
    const concluded = matches.filter(isConcluded);
    const prevIdx = prevByTeam(year);
    const rounds = [...new Set(matches.map((m) => m.round_number))].sort((a, b) => a - b);

    for (const R of rounds) {
      const before = concluded.filter((m) => m.round_number < R);

      const count = {};
      for (const m of before) {
        count[m.home_team_id] = (count[m.home_team_id] ?? 0) + 1;
        count[m.away_team_id] = (count[m.away_team_id] ?? 0) + 1;
      }

      // Form pool: current-before + per-team top-up from previous season to MIN_FORM
      const pool = new Map();
      for (const m of before) pool.set(m.match_id, m);
      for (const t of teamIds) {
        const need = MIN_FORM - (count[t] ?? 0);
        if (need <= 0) continue;
        for (const m of (prevIdx.get(t) ?? []).slice(0, need)) pool.set(m.match_id, m);
      }

      const rows = buildStrengthRows([...pool.values()], teamIds);
      for (const m of matches) {
        if (m.round_number !== R) continue;
        const allP = predict(m, rows, false);
        const haP = predict(m, rows, true);
        out.push({
          match_id: m.match_id,
          pred_home_all: allP.h, pred_away_all: allP.a,
          pred_home_ha: haP.h,   pred_away_ha: haP.a,
        });
      }
    }
  }

  runTransaction(db, () => {
    db.exec('DELETE FROM match_predictions');
    const ins = db.prepare(`
      INSERT INTO match_predictions
        (match_id, pred_home_all, pred_away_all, pred_home_ha, pred_away_ha)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const r of out) {
      ins.run(r.match_id, r.pred_home_all, r.pred_away_all, r.pred_home_ha, r.pred_away_ha);
    }
  });

  const withPred = out.filter((r) => r.pred_home_all != null || r.pred_home_ha != null).length;
  return { total: out.length, withPred };
}
