import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { openDb } from './lib/db.js';
import { importFixtures } from './lib/import-fixtures.js';
import { importMatchStats } from './lib/import-match-stats.js';
import { importPlayers } from './lib/import-players.js';
import { importMatchDetails } from './lib/import-match-details.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../public/data');

function getAvailableYears() {
  return readdirSync(DATA_DIR)
    .filter(d => /^\d{4}$/.test(d))
    .map(Number)
    .sort();
}

function parseArgs() {
  const yearArg = process.argv.find(a => a.startsWith('--year='));
  if (yearArg) {
    const year = parseInt(yearArg.split('=')[1], 10);
    if (isNaN(year)) {
      console.error('Invalid --year value');
      process.exit(1);
    }
    return [year];
  }
  return getAvailableYears();
}

const years = parseArgs();
const db = openDb();

console.log(`Importing ${years.length} season(s): ${years.join(', ')}`);
console.log('');

let totalMatches = 0;
let totalStatRows = 0;

for (const year of years) {
  process.stdout.write(`[${year}] fixtures... `);
  const fix = importFixtures(db, year, DATA_DIR);
  if (fix.skipped) {
    process.stdout.write('unchanged\n');
  } else {
    process.stdout.write(`${fix.matchCount} matches\n`);
    totalMatches += fix.matchCount ?? 0;
  }

  process.stdout.write(`[${year}] match stats... `);
  const ms = importMatchStats(db, year, DATA_DIR);
  if (ms.skipped) {
    process.stdout.write('no stats directory\n');
  } else {
    process.stdout.write(`${ms.files} files, ${ms.rows} rows (${ms.skippedFiles ?? 0} unchanged)\n`);
    totalStatRows += ms.rows;
  }

  process.stdout.write(`[${year}] match details... `);
  const md = importMatchDetails(db, year, DATA_DIR);
  if (md.skipped) {
    process.stdout.write('no match-details directory\n');
  } else {
    process.stdout.write(`${md.files} files, ${md.rows} rows (${md.skippedFiles ?? 0} unchanged)\n`);
  }

  console.log('');
}

process.stdout.write(`[players] player profiles... `);
const pp = importPlayers(db, DATA_DIR);
if (pp.skipped) {
  process.stdout.write('no players directory\n');
} else {
  process.stdout.write(`${pp.files} files, ${pp.rows} rows (${pp.skippedFiles ?? 0} unchanged)\n`);
}
console.log('');

console.log('Done.');
console.log(`  Matches imported/updated: ${totalMatches}`);
console.log(`  Player match stat rows:   ${totalStatRows}`);
console.log(`  Player profiles:          ${pp.rows ?? 0}`);

db.close();
