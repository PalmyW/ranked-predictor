# afltables historical-season scraper

Backfills **pre-1965 VFL/AFL seasons (1897–1964)** by scraping
[afltables.com](https://afltables.com) into the same on-disk format used by the
official 2012+ ChampionData data and the 1965–2011 footywire backfill
(`public/data/{year}/` with `fixture.json`, `stats/`, `match-details/`, `team-stats/`
and shared `players/`), so the predictor app, `aggregate-team-stats` and the
(separate, out-of-scope) SQLite import all consume it unchanged.

The system already has 1965–2026 (see `../statscache/` for 1965–2011, footywire;
2012+ is the live AFL API). This scraper covers everything afltables has before that
— the VFL's first season, 1897, through 1964.

## IDs

afltables has no ChampionData ids, so:

- **Teams** map by slug to existing `CD_T*`/`PW_T90x` ids — the exact same identities
  `../statscache/lib/teams.js` already defines. Only 12 team slugs appear across the
  whole 1897–1964 span, and **every one of them already has a canonical id** in that
  table (including `university`, the one club that folded — 1908–1914 — before
  footywire's own coverage begins; it's `PW_T903`, already reserved). No new team ids
  are minted by this scraper.
- **Players** get a fresh `AT_I*` id, or match an existing `CD_I*` id by name + team +
  DOB against the existing dataset (the same matching logic and data the footywire
  scraper uses — see `lib/ids.js`). In practice expect the CD-match rate to be close
  to 0%, since pre-1965 players essentially never recur in 2012+ data.
- **Matches** get `AT_M{afltables-match-id}` ids (afltables' own match id, embedded
  in its "Match stats" link, is already globally unique — no minting needed).
  **Seasons** get a synthetic `compSeasonId` (`9000 + (year - 1900)`), registered in
  `src/config/seasons.ts` — the same formula footywire's scraper uses, and confirmed
  collision-free (1897→8997 … 1964→9064, all below footywire's 9065 floor).
- Assignments persist in this directory's own `id-map.json`, entirely separate from
  footywire's — different prefix, different file, no coordination needed or possible.

## Usage

```bash
# One season (writes to public/data/{year}/ and registers it in seasons.ts)
npm run scrape-afltables -- --year=1964

# A range (newest first)
npm run scrape-afltables -- --from=1897 --to=1964

# Options
#   --out=<dir>      write under data_sources/afltables/<dir>/ instead of the live data path
#   --no-register    don't touch src/config/seasons.ts
#   --limit=N        only the first N matches (debugging)
#   AT_DELAY_MS=...  throttle between live requests (default 1200ms)
```

Raw HTML is cached under `data_sources/afltables/.cache/` (gitignored), so re-runs
and re-parses don't re-hit the network. The scrape is idempotent — existing output
files are skipped.

## Sanity check

There is **no overlap year** between afltables (1897–1964) and the rest of the
system (1965+), so — unlike `../statscache/verify-2012.js`, which diffs a staged
scrape against authoritative 2012 data — there's no independent ground truth to
diff against. `sanity-check.js` instead verifies internal consistency:

```bash
npm run scrape-afltables -- --year=1964
npm run sanity-check-afltables -- --year=1964
```

It checks: quarter scores sum to recorded totals; a ladder recomputed from the
scraped results matches afltables' own published end-of-home-and-away ladder table,
position-by-position (a same-source self-consistency check, not independent
verification — a mismatch means a parsing bug, not necessarily a real inaccuracy); a
couple of independently-known Grand Final results; and the CD player-match rate
(expect ~0% — a high rate would indicate false-positive name collisions).

## Verify before trusting a new range

After scraping, spot-check it in the predictor app (`npm run dev`, `?season=YYYY`)
before treating it as done — same discipline as the footywire scraper's README.

## Caveats

- **Player stats for 1897–1964 are goals-only.** Confirmed by an automated scan of
  every stat column across 1897/1920/1940/1964 samples: kicks, marks, handballs,
  disposals, hitouts, tackles, and every other column are blank for every player,
  every match — genuinely never recorded by afltables for this era, not a parsing
  gap. A blank GL (goals) cell is a real zero (per-player goals reconcile exactly to
  the team's recorded total); every other blank column is left absent, not
  defaulted to 0, so `aggregateTeamStats` correctly reports `null` averages for
  those fields.
- No score-worm/scoring-event timeline exists for scraped matches (same limitation
  the footywire scraper already has for pre-2012 data).
- Finals-round semantics are **not** mapped to a modern "week number" — pre-1931 VFL
  finals systems varied too much (e.g. 1897's finals are six round-robin `Semi
  Final` blocks with no `Grand Final` that year) for that mapping to be reliable.
  Rounds are numbered sequentially in page order instead, with the raw round-name
  text kept verbatim.
- Seasons with defunct clubs (Fitzroy, University) won't fully render in the
  predictor's team ranker (its `TEAMS` list is the current 18) — same limitation the
  footywire scraper already documents; verify those via raw JSON instead.
