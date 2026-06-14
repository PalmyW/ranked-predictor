import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { runTransaction } from './db.js';

function starSign(dob) {
  if (!dob) return null;
  const [d, m] = dob.split('/').map(Number);
  if (!d || !m) return null;
  if ((m === 3 && d >= 21) || (m === 4 && d <= 19)) return 'Aries';
  if ((m === 4 && d >= 20) || (m === 5 && d <= 20)) return 'Taurus';
  if ((m === 5 && d >= 21) || (m === 6 && d <= 20)) return 'Gemini';
  if ((m === 6 && d >= 21) || (m === 7 && d <= 22)) return 'Cancer';
  if ((m === 7 && d >= 23) || (m === 8 && d <= 22)) return 'Leo';
  if ((m === 8 && d >= 23) || (m === 9 && d <= 22)) return 'Virgo';
  if ((m === 9 && d >= 23) || (m === 10 && d <= 22)) return 'Libra';
  if ((m === 10 && d >= 23) || (m === 11 && d <= 21)) return 'Scorpio';
  if ((m === 11 && d >= 22) || (m === 12 && d <= 21)) return 'Sagittarius';
  if ((m === 12 && d >= 22) || (m === 1 && d <= 19)) return 'Capricorn';
  if ((m === 1 && d >= 20) || (m === 2 && d <= 18)) return 'Aquarius';
  if ((m === 2 && d >= 19) || (m === 3 && d <= 20)) return 'Pisces';
  return null;
}

export function importPlayers(db, dataDir) {
  const playersDir = join(dataDir, 'players');
  if (!existsSync(playersDir)) return { skipped: true, files: 0, rows: 0 };

  const files = readdirSync(playersDir).filter(f => f.endsWith('.json'));
  if (files.length === 0) return { skipped: false, files: 0, rows: 0 };

  const checkLog = db.prepare(
    'SELECT file_size, file_mtime FROM import_log WHERE file_path = ?'
  );
  const upsertLog = db.prepare(`
    INSERT OR REPLACE INTO import_log (file_path, file_size, file_mtime, imported_at)
    VALUES (@file_path, @file_size, @file_mtime, @imported_at)
  `);
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO players
      (player_id, given_name, surname, date_of_birth, height_cm, weight_kg,
       kicking_foot, state_of_origin, position, draft_year, draft_position,
       draft_type, debut_year, recruited_from, photo_url, bio, star_sign)
    VALUES
      (@player_id, @given_name, @surname, @date_of_birth, @height_cm, @weight_kg,
       @kicking_foot, @state_of_origin, @position, @draft_year, @draft_position,
       @draft_type, @debut_year, @recruited_from, @photo_url, @bio, @star_sign)
  `);

  let totalFiles = 0;
  let totalRows = 0;
  let skippedFiles = 0;

  for (const file of files) {
    const fullPath = join(playersDir, file);
    const relPath = `players/${file}`;
    const fstat = statSync(fullPath);
    const log = checkLog.get(relPath);

    if (log && log.file_size === fstat.size && log.file_mtime === fstat.mtimeMs) {
      skippedFiles++;
      continue;
    }

    const raw = JSON.parse(readFileSync(fullPath, 'utf8'));
    // null or {notFound:true} = not in statspro — log it but insert nothing
    if (raw === null || raw?.notFound === true) {
      upsertLog.run({
        file_path: relPath,
        file_size: fstat.size,
        file_mtime: fstat.mtimeMs,
        imported_at: new Date().toISOString(),
      });
      totalFiles++;
      continue;
    }

    runTransaction(db, () => {
      const playerId = file.replace('.json', '');
      upsert.run({
        player_id: playerId,
        given_name: raw.givenName ?? null,
        surname: raw.surname ?? null,
        date_of_birth: raw.dateOfBirth ?? null,
        height_cm: raw.heightCm ?? null,
        weight_kg: raw.weightKg || null,
        kicking_foot: raw.kickingFoot ?? null,
        state_of_origin: raw.stateOfOrigin ?? null,
        position: raw.position ?? null,
        draft_year: raw.draftYear ?? null,
        draft_position: raw.draftPosition ?? null,
        draft_type: raw.draftType ?? null,
        debut_year: raw.debutYear ?? null,
        recruited_from: raw.recruitedFrom ?? null,
        photo_url: raw.photoURL ?? null,
        bio: raw.bio ?? null,
        star_sign: starSign(raw.dateOfBirth),
      });
      upsertLog.run({
        file_path: relPath,
        file_size: fstat.size,
        file_mtime: fstat.mtimeMs,
        imported_at: new Date().toISOString(),
      });
    });

    totalFiles++;
    totalRows++;
  }

  return { skipped: false, files: totalFiles, rows: totalRows, skippedFiles };
}
