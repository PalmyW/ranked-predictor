import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { flattenMatchStats, STAT_COLS, runTransaction } from './db.js';

const STAT_COLS_NAMES = STAT_COLS.map(([, base]) => `stat_${base}`);

function buildInsertStmt(db) {
  const cols = [
    'match_id', 'year', 'round_number',
    'player_id', 'given_name', 'surname',
    'team_id', 'position', 'jumper_number',
    ...STAT_COLS_NAMES,
  ];
  const placeholders = cols.map(c => `@${c}`).join(', ');
  return db.prepare(`
    INSERT OR REPLACE INTO player_match_stats (${cols.join(', ')})
    VALUES (${placeholders})
  `);
}

export function importMatchStats(db, year, dataDir) {
  const statsDir = join(dataDir, String(year), 'stats');
  if (!existsSync(statsDir)) return { skipped: true, files: 0, rows: 0 };

  const files = readdirSync(statsDir).filter(f => f.endsWith('.json'));
  if (files.length === 0) return { skipped: false, files: 0, rows: 0 };

  const checkLog = db.prepare(
    'SELECT file_size, file_mtime FROM import_log WHERE file_path = ?'
  );
  const upsertLog = db.prepare(`
    INSERT OR REPLACE INTO import_log (file_path, file_size, file_mtime, imported_at)
    VALUES (@file_path, @file_size, @file_mtime, @imported_at)
  `);

  const getMatch = db.prepare(
    'SELECT match_id, round_number FROM matches WHERE match_id = ?'
  );

  const insert = buildInsertStmt(db);

  let totalFiles = 0;
  let totalRows = 0;
  let skippedFiles = 0;

  for (const file of files) {
    const fullPath = join(statsDir, file);
    const relPath = `${year}/stats/${file}`;
    const fstat = statSync(fullPath);
    const log = checkLog.get(relPath);

    if (log && log.file_size === fstat.size && log.file_mtime === fstat.mtimeMs) {
      skippedFiles++;
      continue;
    }

    const matchId = file.replace('.json', '');
    const matchRow = getMatch.get(matchId);
    if (!matchRow) {
      // Match not in fixtures yet — skip silently
      continue;
    }

    const data = JSON.parse(readFileSync(fullPath, 'utf8'));
    const allPlayers = [
      ...(data.homeTeamPlayerStats ?? []),
      ...(data.awayTeamPlayerStats ?? []),
    ];

    const runFile = () => runTransaction(db, () => {
      let rows = 0;
      for (const entry of allPlayers) {
        const playerInfo = entry.player?.player?.player;
        if (!playerInfo?.playerId) continue;

        const stats = flattenMatchStats(entry.playerStats);

        insert.run({
          match_id: matchId,
          year,
          round_number: matchRow.round_number,
          player_id: playerInfo.playerId,
          given_name: playerInfo.playerName?.givenName ?? '',
          surname: playerInfo.playerName?.surname ?? '',
          team_id: entry.teamId,
          position: entry.player?.player?.position ?? null,
          jumper_number: playerInfo.playerJumperNumber ?? null,
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
