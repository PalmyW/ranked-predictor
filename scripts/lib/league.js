// Shared league config for the Node fetch/data-pipeline scripts under
// scripts/ — the AFL-vs-AFLW knob every fetch script takes as --league=.
// Defaults to 'afl' everywhere, so every pre-existing script invocation
// (no --league= flag) is byte-identical to before AFLW support existed.
import { readFileSync } from 'fs'
import { join } from 'path'

export const LEAGUES = {
  afl: {
    key: 'afl',
    competitionId: 1,
    compProviderId: 'CD_C014',
    teamType: 'MEN',
    subdir: '',
    registryConst: 'SEASON_REGISTRY',
    seasonsConst: 'SEASONS',
    currentConst: 'CURRENT_SEASON_YEAR',
    // Plain 4-digit year directories.
    keyPattern: /^\d{4}$/,
  },
  aflw: {
    key: 'aflw',
    competitionId: 3,
    compProviderId: 'CD_C264',
    teamType: 'WOMEN',
    subdir: 'aflw',
    registryConst: 'AFLW_SEASON_REGISTRY',
    seasonsConst: 'AFLW_SEASONS',
    currentConst: 'AFLW_CURRENT_SEASON_YEAR',
    // 2022 has two seasons ('2022a'/'2022b') alongside plain years.
    keyPattern: /^\d{4}[ab]?$/,
  },
};

export function leagueFromArgv(argv = process.argv) {
  const a = argv.find((x) => x.startsWith('--league='));
  const key = a ? a.split('=')[1] : 'afl';
  const cfg = LEAGUES[key];
  if (!cfg) {
    console.error(`Unknown --league=${key}. Valid: ${Object.keys(LEAGUES).join(', ')}`);
    process.exit(1);
  }
  return cfg;
}

export function dataRoot(root, league) {
  return league.subdir ? join(root, 'public/data', league.subdir) : join(root, 'public/data');
}

export function dataDir(root, league, seasonKey) {
  return join(dataRoot(root, league), String(seasonKey));
}

export function playersDir(root, league) {
  return join(dataRoot(root, league), 'players');
}

// Regex-scrapes src/config/seasons.ts for a league's registry — mirrors the
// pattern already used inline by fetch-historical-season.js/health-check.js/
// prune-deploy-data.js, anchored to `export const <Name>` so the AFLW consts
// (which contain the men's const names as substrings, e.g.
// "AFLW_SEASON_REGISTRY" contains "SEASON_REGISTRY") can never cross-match.
export function loadSeasonRegistry(root, league) {
  const src = readFileSync(join(root, 'src/config/seasons.ts'), 'utf8');
  const re = new RegExp(`export const ${league.registryConst}[^=]*=\\s*\\{([^}]*)\\}`);
  const match = src.match(re);
  const registry = {};
  if (match) {
    for (const m of match[1].matchAll(/'(\d{4}[ab]?)':\s*(\d+)/g)) {
      registry[m[1]] = Number(m[2]);
    }
  }
  return registry;
}

export function loadCurrentSeasonYear(root, league) {
  const src = readFileSync(join(root, 'src/config/seasons.ts'), 'utf8');
  const re = new RegExp(`export const ${league.currentConst}\\s*=\\s*'(\\d{4}[ab]?)'`);
  return src.match(re)?.[1];
}

// Maps a live compSeasonId (from /afl/v2/compseasons) to this league's season
// key via registry inversion — NEVER derive the year from a providerId or a
// compSeason's own name/year field: AFLW Season 7's provider IDs fake year
// "2101", and a merged "2022" would blend two real seasons together. Returns
// null (caller should skip/warn) if the compSeasonId isn't in the registry
// yet — i.e. seasons.ts needs a manual entry for a brand-new season before
// this script will touch it, same as the existing --compSeasonId= fallback
// in fetch-historical-season.js already requires for unknown years.
export function seasonKeyForCompSeason(compSeasonId, registry) {
  for (const [key, id] of Object.entries(registry)) {
    if (id === compSeasonId) return key;
  }
  return null;
}

// Sorts season keys chronologically: plain years numerically, with 'a'
// before 'b' for same-year suffixed keys (2022 < 2022a < 2022b < 2023).
export function compareSeasonKeys(a, b) {
  return a.localeCompare(b, undefined, { numeric: true });
}
