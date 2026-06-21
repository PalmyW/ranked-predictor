// Export PalmyScore win-probability calibration for the web app's simulator.
// For each 1-point predicted margin, computes the historical % of the time the
// PalmyScore favourite actually won, from v_match_predictions. Writes a dense
// lookup array (index = absolute predicted margin) per variant to the pages app.
//
//   node scripts/export-win-prob.js

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../afl-stats.db');
const OUT_PATH = join(__dirname, '../../src/data/palmyWinProb.json');

const MAX_MARGIN = 80;   // cap the curve; predicted margins above this reuse the last value

const db = new DatabaseSync(DB_PATH);

// Per absolute predicted margin: games and favourite win fraction.
function curveFor(marginCol) {
  const rows = db.prepare(`
    SELECT ABS(${marginCol}) AS m,
           COUNT(*) AS games,
           AVG(CASE WHEN (${marginCol} > 0) = (actual_margin > 0) THEN 1.0 ELSE 0 END) AS fav
    FROM v_match_predictions
    WHERE status = 'CONCLUDED' AND ${marginCol} IS NOT NULL
      AND ${marginCol} <> 0 AND actual_margin <> 0
    GROUP BY m
  `).all();

  const byMargin = new Map(rows.map((r) => [r.m, r]));

  // Dense array 0..MAX_MARGIN. Index 0 (predicted tie) = 0.5. Gaps carry the
  // previous value forward so the simulator always has a probability to read.
  const probs = [];
  const games = [];
  let last = 0.5;
  for (let m = 0; m <= MAX_MARGIN; m++) {
    const row = byMargin.get(m);
    if (m === 0) {
      probs.push(0.5);
      games.push(row?.games ?? 0);
      continue;
    }
    if (row && row.games > 0) {
      last = row.fav;   // true per-point rate, no clamping
    }
    probs.push(Number(last.toFixed(3)));
    games.push(row?.games ?? 0);
  }
  return { probs, games };
}

const ha = curveFor('pred_margin_ha');
const all = curveFor('pred_margin_all');

const out = {
  // index = absolute predicted margin (points); value = probability the
  // PalmyScore favourite wins. Beyond maxMargin, clamp to the last entry.
  maxMargin: MAX_MARGIN,
  ha: ha.probs,
  all: all.probs,
  // sample sizes per margin, for transparency (not used at runtime)
  _gamesHa: ha.games,
  _gamesAll: all.games,
  _generatedAt: new Date().toISOString().slice(0, 10),
};

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(out, null, 0) + '\n');
db.close();

console.log(`Wrote ${OUT_PATH}`);
console.log(`  ha:  ${ha.probs.slice(0, 11).join(', ')} … (0–10 pts)`);
console.log(`  all: ${all.probs.slice(0, 11).join(', ')} … (0–10 pts)`);
