import { readFileSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { runTransaction } from './db.js';

export function importFixtures(db, year, dataDir) {
  const filePath = join(dataDir, String(year), 'fixture.json');
  if (!existsSync(filePath)) return { skipped: true };

  const relPath = `${year}/fixture.json`;
  const stat = statSync(filePath);
  const log = db.prepare('SELECT file_size, file_mtime FROM import_log WHERE file_path = ?').get(relPath);
  if (log && log.file_size === stat.size && log.file_mtime === stat.mtimeMs) {
    return { skipped: true };
  }

  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const matches = data.matches ?? [];

  const upsertSeason = db.prepare(`
    INSERT OR REPLACE INTO seasons (year, comp_season_id, comp_season_name)
    VALUES (@year, @comp_season_id, @comp_season_name)
  `);

  const upsertTeam = db.prepare(`
    INSERT OR IGNORE INTO teams (team_id, name, abbreviation, nickname)
    VALUES (@team_id, @name, @abbreviation, @nickname)
  `);

  const upsertVenue = db.prepare(`
    INSERT OR IGNORE INTO venues (venue_id, name, abbreviation, location, state, timezone, land_owner)
    VALUES (@venue_id, @name, @abbreviation, @location, @state, @timezone, @land_owner)
  `);

  const upsertMatch = db.prepare(`
    INSERT OR REPLACE INTO matches (
      match_id, year, comp_season_id, round_number, round_name, round_abbreviation,
      home_team_id, away_team_id, venue_id, utc_start_time, status,
      home_goals, home_behinds, home_score,
      away_goals, away_behinds, away_score
    ) VALUES (
      @match_id, @year, @comp_season_id, @round_number, @round_name, @round_abbreviation,
      @home_team_id, @away_team_id, @venue_id, @utc_start_time, @status,
      @home_goals, @home_behinds, @home_score,
      @away_goals, @away_behinds, @away_score
    )
  `);

  const upsertLog = db.prepare(`
    INSERT OR REPLACE INTO import_log (file_path, file_size, file_mtime, imported_at)
    VALUES (@file_path, @file_size, @file_mtime, @imported_at)
  `);

  const run = () => runTransaction(db, () => {
    if (matches.length > 0) {
      const cs = matches[0].compSeason;
      upsertSeason.run({
        year,
        comp_season_id: cs.id,
        comp_season_name: cs.name,
      });
    }

    let matchCount = 0;
    for (const m of matches) {
      const homeTeam = m.home?.team;
      const awayTeam = m.away?.team;
      if (!homeTeam || !awayTeam) continue;

      upsertTeam.run({
        team_id: homeTeam.providerId,
        name: homeTeam.name,
        abbreviation: homeTeam.abbreviation,
        nickname: homeTeam.nickname ?? homeTeam.name,
      });
      upsertTeam.run({
        team_id: awayTeam.providerId,
        name: awayTeam.name,
        abbreviation: awayTeam.abbreviation,
        nickname: awayTeam.nickname ?? awayTeam.name,
      });

      const venue = m.venue;
      if (venue?.providerId) {
        upsertVenue.run({
          venue_id: venue.providerId,
          name: venue.name,
          abbreviation: venue.abbreviation ?? null,
          location: venue.location ?? null,
          state: venue.state ?? null,
          timezone: venue.timezone ?? null,
          land_owner: venue.landOwner ?? null,
        });
      }

      upsertMatch.run({
        match_id: m.providerId,
        year,
        comp_season_id: m.compSeason?.id ?? null,
        round_number: m.round?.roundNumber ?? 0,
        round_name: m.round?.name ?? '',
        round_abbreviation: m.round?.abbreviation ?? '',
        home_team_id: homeTeam.providerId,
        away_team_id: awayTeam.providerId,
        venue_id: venue?.providerId ?? null,
        utc_start_time: m.utcStartTime ?? null,
        status: m.status ?? 'UNKNOWN',
        home_goals: m.home?.score?.goals ?? null,
        home_behinds: m.home?.score?.behinds ?? null,
        home_score: m.home?.score?.totalScore ?? null,
        away_goals: m.away?.score?.goals ?? null,
        away_behinds: m.away?.score?.behinds ?? null,
        away_score: m.away?.score?.totalScore ?? null,
      });
      matchCount++;
    }

    upsertLog.run({
      file_path: relPath,
      file_size: stat.size,
      file_mtime: stat.mtimeMs,
      imported_at: new Date().toISOString(),
    });

    return matchCount;
  });

  const matchCount = run();
  return { skipped: false, matchCount };
}
