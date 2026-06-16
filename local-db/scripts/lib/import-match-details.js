import { readFileSync, statSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { runTransaction } from './db.js';

function periodScore(periodScores, q) {
  return periodScores?.find((p) => p.periodNumber === q)?.score ?? {};
}

function cumScore(periodScores, upToQ) {
  let t = 0;
  for (let q = 1; q <= upToQ; q++) t += periodScores.find(p => p.periodNumber === q)?.score?.totalScore ?? 0;
  return t;
}

function computeWormStats(data) {
  const home   = data.score?.homeTeamScore ?? {};
  const away   = data.score?.awayTeamScore ?? {};
  const homeP  = home.periodScore ?? [];
  const awayP  = away.periodScore ?? [];
  const events = data.score?.scoreWorm?.scoringEvents ?? [];

  const finalMargin    = (home.matchScore?.totalScore ?? 0) - (away.matchScore?.totalScore ?? 0);
  const halftimeMargin = cumScore(homeP, 2) - cumScore(awayP, 2);
  const threeQtrMargin = cumScore(homeP, 3) - cumScore(awayP, 3);

  if (!events.length) {
    return {
      final_margin: finalMargin, halftime_margin: halftimeMargin, three_quarter_margin: threeQtrMargin,
      max_margin_q1: null, max_margin_q2: null, max_margin_q3: null, max_margin_q4: null,
      max_margin: null, lead_changes: null, largest_deficit_recovered: null,
    };
  }

  // Per-quarter and overall peak margins
  const qPeaks = { 1: null, 2: null, 3: null, 4: null };
  let overallPeak = null;

  const margins = [];
  for (const ev of events) {
    const m = ev.aggregateHomeScore - ev.aggregateAwayScore;
    margins.push(m);
    const absM = Math.abs(m);
    const team = m > 0 ? 'H' : m < 0 ? 'A' : null;
    const q = ev.periodNumber;
    if (q >= 1 && q <= 4) {
      if (!qPeaks[q] || absM > qPeaks[q].absM) {
        qPeaks[q] = { absM, team, secs: ev.periodSeconds };
      }
    }
    if (!overallPeak || absM > overallPeak.absM) {
      overallPeak = { absM, team, secs: ev.periodSeconds, period: ev.periodNumber };
    }
  }

  let leadChanges = 0, prevSign = 0;
  for (const m of margins) {
    const s = m > 0 ? 1 : m < 0 ? -1 : 0;
    if (s !== 0 && prevSign !== 0 && s !== prevSign) leadChanges++;
    if (s !== 0) prevSign = s;
  }

  let largestDeficit = 0;
  if (finalMargin > 0) {
    const minM = Math.min(...margins);
    if (minM < 0) largestDeficit = Math.abs(minM);
  } else if (finalMargin < 0) {
    const maxM = Math.max(...margins);
    if (maxM > 0) largestDeficit = maxM;
  }

  return {
    final_margin: finalMargin,
    halftime_margin: halftimeMargin,
    three_quarter_margin: threeQtrMargin,
    max_margin_q1:      qPeaks[1]?.absM  ?? null,
    max_margin_q1_team: qPeaks[1]?.team  ?? null,
    max_margin_q1_secs: qPeaks[1]?.secs  ?? null,
    max_margin_q2:      qPeaks[2]?.absM  ?? null,
    max_margin_q2_team: qPeaks[2]?.team  ?? null,
    max_margin_q2_secs: qPeaks[2]?.secs  ?? null,
    max_margin_q3:      qPeaks[3]?.absM  ?? null,
    max_margin_q3_team: qPeaks[3]?.team  ?? null,
    max_margin_q3_secs: qPeaks[3]?.secs  ?? null,
    max_margin_q4:      qPeaks[4]?.absM  ?? null,
    max_margin_q4_team: qPeaks[4]?.team  ?? null,
    max_margin_q4_secs: qPeaks[4]?.secs  ?? null,
    max_margin:        overallPeak?.absM   ?? null,
    max_margin_team:   overallPeak?.team   ?? null,
    max_margin_secs:   overallPeak?.secs   ?? null,
    max_margin_period: overallPeak?.period ?? null,
    lead_changes: leadChanges,
    largest_deficit_recovered: largestDeficit,
  };
}

export function importMatchDetails(db, year, dataDir) {
  const detailsDir = join(dataDir, String(year), 'match-details');
  if (!existsSync(detailsDir)) return { skipped: true };

  const files = readdirSync(detailsDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) return { skipped: true };

  const deleteEvents = db.prepare(`DELETE FROM score_events WHERE match_id = ?`);

  const insertEvent = db.prepare(`
    INSERT OR REPLACE INTO score_events
      (match_id, seq, player_id, team_id, period_number, period_seconds,
       score_type, score_value, home_or_away, aggregate_home, aggregate_away)
    VALUES
      (@match_id, @seq, @player_id, @team_id, @period_number, @period_seconds,
       @score_type, @score_value, @home_or_away, @aggregate_home, @aggregate_away)
  `);

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO match_details (
      match_id,
      weather_description, weather_temp_celsius, weather_type,
      home_q1_goals, home_q1_behinds, home_q1_score,
      home_q2_goals, home_q2_behinds, home_q2_score,
      home_q3_goals, home_q3_behinds, home_q3_score,
      home_q4_goals, home_q4_behinds, home_q4_score,
      away_q1_goals, away_q1_behinds, away_q1_score,
      away_q2_goals, away_q2_behinds, away_q2_score,
      away_q3_goals, away_q3_behinds, away_q3_score,
      away_q4_goals, away_q4_behinds, away_q4_score,
      home_rushed_behinds, away_rushed_behinds,
      home_minutes_in_front, away_minutes_in_front,
      score_worm_json, last_updated,
      final_margin, halftime_margin, three_quarter_margin,
      max_margin_q1, max_margin_q1_team, max_margin_q1_secs,
      max_margin_q2, max_margin_q2_team, max_margin_q2_secs,
      max_margin_q3, max_margin_q3_team, max_margin_q3_secs,
      max_margin_q4, max_margin_q4_team, max_margin_q4_secs,
      max_margin, max_margin_team, max_margin_secs, max_margin_period,
      lead_changes, largest_deficit_recovered
    ) VALUES (
      @match_id,
      @weather_description, @weather_temp_celsius, @weather_type,
      @home_q1_goals, @home_q1_behinds, @home_q1_score,
      @home_q2_goals, @home_q2_behinds, @home_q2_score,
      @home_q3_goals, @home_q3_behinds, @home_q3_score,
      @home_q4_goals, @home_q4_behinds, @home_q4_score,
      @away_q1_goals, @away_q1_behinds, @away_q1_score,
      @away_q2_goals, @away_q2_behinds, @away_q2_score,
      @away_q3_goals, @away_q3_behinds, @away_q3_score,
      @away_q4_goals, @away_q4_behinds, @away_q4_score,
      @home_rushed_behinds, @away_rushed_behinds,
      @home_minutes_in_front, @away_minutes_in_front,
      @score_worm_json, @last_updated,
      @final_margin, @halftime_margin, @three_quarter_margin,
      @max_margin_q1, @max_margin_q1_team, @max_margin_q1_secs,
      @max_margin_q2, @max_margin_q2_team, @max_margin_q2_secs,
      @max_margin_q3, @max_margin_q3_team, @max_margin_q3_secs,
      @max_margin_q4, @max_margin_q4_team, @max_margin_q4_secs,
      @max_margin, @max_margin_team, @max_margin_secs, @max_margin_period,
      @lead_changes, @largest_deficit_recovered
    )
  `);

  const upsertLog = db.prepare(`
    INSERT OR REPLACE INTO import_log (file_path, file_size, file_mtime, imported_at)
    VALUES (@file_path, @file_size, @file_mtime, @imported_at)
  `);

  let rows = 0, skippedFiles = 0;

  runTransaction(db, () => {
    for (const file of files) {
      const filePath = join(detailsDir, file);
      const relPath  = `${year}/match-details/${file}`;
      const stat     = statSync(filePath);
      const log      = db.prepare('SELECT file_size, file_mtime FROM import_log WHERE file_path = ?').get(relPath);
      if (log && log.file_size === stat.size && log.file_mtime === stat.mtimeMs) {
        skippedFiles++;
        continue;
      }

      const data    = JSON.parse(readFileSync(filePath, 'utf8'));
      const score   = data.score ?? {};
      const weather = score.weather ?? {};
      const home    = score.homeTeamScore ?? {};
      const away    = score.awayTeamScore ?? {};
      const homeP   = home.periodScore ?? [];
      const awayP   = away.periodScore ?? [];
      const matchId = file.replace(/\.json$/, '');

      const hq = (q) => periodScore(homeP, q);
      const aq = (q) => periodScore(awayP, q);
      const worm = computeWormStats(data);

      upsert.run({
        match_id: matchId,
        weather_description: weather.description ?? null,
        weather_temp_celsius: weather.tempInCelsius ?? null,
        weather_type: weather.weatherType ?? null,
        home_q1_goals: hq(1).goals ?? null, home_q1_behinds: hq(1).behinds ?? null, home_q1_score: hq(1).totalScore ?? null,
        home_q2_goals: hq(2).goals ?? null, home_q2_behinds: hq(2).behinds ?? null, home_q2_score: hq(2).totalScore ?? null,
        home_q3_goals: hq(3).goals ?? null, home_q3_behinds: hq(3).behinds ?? null, home_q3_score: hq(3).totalScore ?? null,
        home_q4_goals: hq(4).goals ?? null, home_q4_behinds: hq(4).behinds ?? null, home_q4_score: hq(4).totalScore ?? null,
        away_q1_goals: aq(1).goals ?? null, away_q1_behinds: aq(1).behinds ?? null, away_q1_score: aq(1).totalScore ?? null,
        away_q2_goals: aq(2).goals ?? null, away_q2_behinds: aq(2).behinds ?? null, away_q2_score: aq(2).totalScore ?? null,
        away_q3_goals: aq(3).goals ?? null, away_q3_behinds: aq(3).behinds ?? null, away_q3_score: aq(3).totalScore ?? null,
        away_q4_goals: aq(4).goals ?? null, away_q4_behinds: aq(4).behinds ?? null, away_q4_score: aq(4).totalScore ?? null,
        home_rushed_behinds: home.rushedBehinds ?? null,
        away_rushed_behinds: away.rushedBehinds ?? null,
        home_minutes_in_front: home.minutesInFront ?? null,
        away_minutes_in_front: away.minutesInFront ?? null,
        score_worm_json: score.scoreWorm ? JSON.stringify(score.scoreWorm) : null,
        last_updated: score.lastUpdated ?? null,
        ...worm,
      });

      // Score events
      const scoringEvents = score.scoreWorm?.scoringEvents ?? [];
      deleteEvents.run(matchId);
      for (let seq = 0; seq < scoringEvents.length; seq++) {
        const ev = scoringEvents[seq];
        insertEvent.run({
          match_id:       matchId,
          seq,
          player_id:      ev.playerScore?.player?.playerId ?? null,
          team_id:        ev.teamId,
          period_number:  ev.periodNumber,
          period_seconds: ev.periodSeconds,
          score_type:     ev.scoreType,
          score_value:    ev.scoreValue,
          home_or_away:   ev.homeOrAway,
          aggregate_home: ev.aggregateHomeScore,
          aggregate_away: ev.aggregateAwayScore,
        });
      }

      upsertLog.run({
        file_path: relPath,
        file_size: stat.size,
        file_mtime: stat.mtimeMs,
        imported_at: new Date().toISOString(),
      });

      rows++;
    }
  });

  return { skipped: false, files: files.length, rows, skippedFiles };
}
