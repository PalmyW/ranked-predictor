# Footywire historical-season scraper

Backfills **pre-2012 AFL seasons** by scraping [footywire.com](https://www.footywire.com)
into the same on-disk format as the official 2012+ ChampionData data
(`public/data/{year}/` with `fixture.json`, `stats/`, `match-details/`, `team-stats/`
and shared `players/`), so the predictor app, `aggregate-team-stats` and the
`local-db` import all consume it unchanged.

The system already has 2012–2026 from the official AFL API. This scraper covers the
years footywire exposes before that.

## IDs

Footywire has no ChampionData ids, so:

- **Teams** map by slug to existing `CD_T*` ids (continuing clubs, incl. historical
  names like Footscray → Western Bulldogs). Defunct clubs (Fitzroy, Brisbane Bears,
  University) get stable `PW_T*` ids. See `lib/teams.js`.
- **Players** are matched to an existing `CD_I*` id by **name + team** against the
  current dataset (the same data the local-db app serves) — see `lib/cd-index.js`.
  A footywire date of birth is fetched (from the player's profile page) only to break
  ambiguity or to enrich a genuinely new player. Unmatched players get stable `PW_I*`
  ids. Assignments persist in `id-map.json`.
- **Matches** get `PW_M{footywire-mid}` ids; **seasons** get a synthetic
  `compSeasonId` (`9000 + (year-1900)`) registered in `src/config/seasons.ts`.

## Usage

```bash
# One season (writes to public/data/{year}/ and registers it in seasons.ts)
npm run scrape-footywire -- --year=2011

# A range (newest first)
npm run scrape-footywire -- --from=1965 --to=2010

# Options
#   --out=<dir>      write under scripts/footywire/<dir>/ instead of the live data path
#   --no-register    don't touch src/config/seasons.ts
#   --limit=N        only the first N matches (debugging)
#   FW_DELAY_MS=...  throttle between live requests (default 1200ms)
```

Raw HTML is cached under `scripts/footywire/.cache/` (gitignored), so re-runs and
re-parses don't re-hit the network. The scrape is idempotent — existing output files
are skipped.

## Player bio backfill (date of birth, height)

`scrape-season.js` only fetches a player's own profile page when a CD-id match
is ambiguous and needs a DOB tie-break (`lib/ids.js`) — the common case for this
era is a brand-new player with zero CD candidates, which mints a `PW_I` id
immediately without ever fetching the profile page (there's nothing to
disambiguate). So most `PW_I` players never had their `Born:`/`Playing Height:`
line pulled, even though the page has it and `lib/parse-profile.js` already
parses it — 90.4% of `PW_I` profiles (3744 of 4141) were missing one or both
before this script existed. The pre-1965 counterpart is
`../afltables/backfill-player-bio.js`.

```bash
# Every PW_I player missing dateOfBirth or heightCm
npm run backfill-statscache-player-bio

# Debugging
npm run backfill-statscache-player-bio -- --limit=100

# Re-fetch even players who already have both fields
npm run backfill-statscache-player-bio -- --force
```

Not a rescrape — a separate pass over the existing output. For each profile
missing a field, it looks up that player's `pp-` slug from `id-map.json` (the
reverse of the persistent slug→id map the base scraper already maintains) and
fetches just that one page. Coach-minted profiles (`role: "coach"`, from
`../coach-attendance/import-coaches.js`) are skipped — they came from a `cp-`
page, which has no `Born:`/`Playing Height:` line to fetch in the first place.

## Accuracy harness (2012)

2012 exists in both sources, so it's the ground-truth check:

```bash
npm run scrape-footywire -- --year=2012 --out=staging --no-register
npm run verify-footywire-2012
```

`verify-2012.js` diffs the staged scrape against `public/data/2012/`: match coverage
& scores, player-id match rate (should be ~100% since all of 2012 is in the system),
and per-field stat accuracy. Tune `lib/parse-match.js` / the matcher until clean
before trusting pre-2012 output.

## Verify before importing

The scraper writes data files but **never imports into the DB**. After scraping a
season, verify it in the predictor app (`npm run dev`, `?season=YYYY`), then — only
once it looks right — import manually:

```bash
npm run db:import -- --year=YYYY
```

## Caveats

- Footywire stat coverage thins for older years (full basic+advanced ~2010–2011,
  basic-only ~1998–2009, results-only earlier). Missing fields are left absent; the
  aggregator treats them as 0.
- Seasons with defunct clubs (pre-1997 Fitzroy/Brisbane Bears, etc.) won't fully
  render in the predictor's team ranker (its `TEAMS` list is the current 18) — verify
  those via raw JSON or in local-db after import.
- No score-worm / scoring-event timeline exists for scraped matches, so those
  local-db features stay empty for pre-2012 (the importer already tolerates this).
