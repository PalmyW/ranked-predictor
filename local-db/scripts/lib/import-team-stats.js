import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { flattenSeasonStats, STAT_COLS, runTransaction } from './db.js';

const TOT_COLS = STAT_COLS.map(([, base]) => `tot_${base}`);
const AVG_COLS = STAT_COLS.map(([, base]) => `avg_${base}`);

function buildInsertStmt(db) {
  const cols = [
    'year', 'team_id', 'player_id', 'given_name', 'surname',
    'position', 'jumper_number', 'games_played',
    ...TOT_COLS,
    ...AVG_COLS,
  ];
  const placeholders = cols.map(c => `@${c}`).join(', ');
  return db.prepare(`
    INSERT OR REPLACE INTO player_season_stats (${cols.join(', ')})
    VALUES (${placeholders})
  `);
}

export function importTeamStats(db, year, dataDir) {
  const teamStatsDir = join(dataDir, String(year), 'team-stats');
  if (!existsSync(teamStatsDir)) return { skipped: true, files: 0, rows: 0 };

  const files = readdirSync(teamStatsDir).filter(f => f.endsWith('.json'));
  if (files.length === 0) return { skipped: false, files: 0, rows: 0 };

  const checkLog = db.prepare(
    'SELECT file_size, file_mtime FROM import_log WHERE file_path = ?'
  );
  const upsertLog = db.prepare(`
    INSERT OR REPLACE INTO import_log (file_path, file_size, file_mtime, imported_at)
    VALUES (@file_path, @file_size, @file_mtime, @imported_at)
  `);

  const upsertTeam = db.prepare(`
    INSERT OR IGNORE INTO teams (team_id, name, abbreviation, nickname)
    VALUES (@team_id, @name, @abbreviation, @nickname)
  `);

  const insert = buildInsertStmt(db);

  let totalFiles = 0;
  let totalRows = 0;
  let skippedFiles = 0;

  for (const file of files) {
    const fullPath = join(teamStatsDir, file);
    const relPath = `${year}/team-stats/${file}`;
    const fstat = statSync(fullPath);
    const log = checkLog.get(relPath);

    if (log && log.file_size === fstat.size && log.file_mtime === fstat.mtimeMs) {
      skippedFiles++;
      continue;
    }

    const data = JSON.parse(readFileSync(fullPath, 'utf8'));
    const teamId = data.teamId;
    if (!teamId || !Array.isArray(data.players)) continue;

    const runFile = () => runTransaction(db, () => {
      // Ensure team row exists (team-stats may exist before fixture for a year)
      upsertTeam.run({
        team_id: teamId,
        name: teamId,
        abbreviation: teamId,
        nickname: teamId,
      });

      let rows = 0;
      for (const player of data.players) {
        if (!player.playerId) continue;
        const stats = flattenSeasonStats(player.totals ?? {}, player.averages ?? {});

        insert.run({
          year,
          team_id: teamId,
          player_id: player.playerId,
          given_name: player.givenName ?? '',
          surname: player.surname ?? '',
          position: player.position ?? null,
          jumper_number: player.jumperNumber ?? null,
          games_played: player.gamesPlayed ?? 0,
          ...stats,
        });
        rows++;
      }

      upsertLog.run({
        file_path: relPath,
        file_size: fstat.size,
        file_mtime: fstat.mtimeMs,
        imported_at: new Date().toISOString(),
      });

      return rows;
    });

    totalRows += runFile();
    totalFiles++;
  }

  return { skipped: false, files: totalFiles, rows: totalRows, skippedFiles };
}
