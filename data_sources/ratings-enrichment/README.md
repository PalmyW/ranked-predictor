# Advanced-stats ratings enrichment

Enriches the existing `public/data/{year}/stats/` and `match-details/` files with
a third-party AFL stats source's additional stats — their own player rating
system, an xScore/xWins expected-score model, "equity" ball-use metrics, and team
scoring-source breakdowns (goals from stoppage/turnover/kick-in/centre-bounce,
from forward vs defensive half) — none of which the official ChampionData feed
provides.

The source URL is configured in `lib/config.js` (overridable via the
`RATINGS_BASE_URL` env var), not hardcoded in the scraper logic.

## Why no Chromium

The site *looks* JS-rendered (the tables and the "Download as CSV" button are
populated client-side), but it's static: an R Markdown/Quarto build hosted on
GitHub Pages. The page's own JS just fetches plain JSON and renders it — so this
scraper hits those same JSON files directly:

```
{BASE_URL}{seasonId}.json   # → RoundId list for that season
{BASE_URL}{roundId}.json    # → every match in that round: Data (players), TeamData (teams), Matches
```

(`BASE_URL` is `lib/config.js`'s `BASE_URL`, currently
`https://www.wheeloratings.com/src/match_stats/table_data/`.)

`roundId` is `{season}{roundNumber, 2-digit}`, e.g. `202618` = 2026 round 18
(0-indexed: `00` = Opening Round). No auth, no session, `Access-Control-Allow-Origin: *`,
`robots.txt` allows everything. The source covers 2012–present — the same span
already fully covered by the official AFL API — so this is a pure enrichment
layer, not a new source of matches/players.

## What gets merged, and where

No new ids are minted. A source match is resolved to its existing `CD_M*`
providerId by **round number + home/away team**; a source player row is resolved
to its existing entry **within that specific match's own roster** (by name + team)
— not against the whole season, so there's no cross-player ambiguity to resolve.

- Player rows → `stats/{CD_M*}.json`, added as `playerStats.stats.wheelo` (sibling
  to the existing `extendedStats`)
- Team rows → `match-details/{CD_M*}.json`, added as a top-level
  `wheelo: { fetchedAt, home, away }`

(The `wheelo` field name in the written JSON is the on-disk data schema and is
unchanged by this directory's own naming — renaming it would mean migrating every
already-written file.)

Everything the source returns for that row is kept (minus pure identity columns
like `MatchId`/`Player`/`Team`/`Image`) — namespaced under `wheelo` rather than
cherry-picked, so a field name colliding with an existing CD stat (e.g. both
systems have their own notion of `RatingPoints`) never matters, and the merge
doesn't need updating if the source adds columns later.

## Usage

```bash
# One season
npm run import-ratings -- --year=2026

# A range
npm run import-ratings -- --from=2020 --to=2025

# No args = every covered season, newest first (the backfill/"crawler" mode)
npm run import-ratings

# Re-merge even matches that already have a `wheelo` block
npm run import-ratings -- --force
```

Idempotent and re-run-safe: a match already carrying `wheelo` in its
match-details file is skipped, and if every match in a round is already done the
round file isn't even re-fetched. Running with no args is safe to schedule
alongside `npm run fetch-stats` — it'll pick up newly-completed matches in the
current round and do nothing for everything else.

Raw round/season JSON is cached under `.cache/` (gitignored, like the other
`data_sources/` scrapers) — re-runs never re-hit the network for a file already
fetched. Delete `.cache/{roundId}.json` to force a re-fetch of just that round
(e.g. once a partially-played round finishes).

## Caveats

- Match resolution (round + team) was validated at **zero** unmatched matches
  across a full 2012–2026 backfill (~2,800 matches). Player-row resolution missed
  ~60 rows out of ~135,000 (~0.04%), all in one of two buckets, both printed to the
  console rather than silently dropped:
  - a genuine name variant CD and the source disagree on (a suffix like "Davey
    Jnr", a middle initial like "Callum L. Brown", a nickname like
    "Tim"/"Timothy") — fixable by special-casing that player if it matters to you
  - a player the source lists (e.g. an unused interchange/sub during the
    2011–2015 substitute-rule era) who simply has no entry in the CD stats file
    at all — not a matching bug, there's nothing to merge into
- If a future season introduces a new club, add it to `lib/teams.js`.
- `stats/` and `match-details/` files must already exist for a match (i.e.
  `npm run fetch-stats` has run) before ratings data can be merged into them —
  this scraper never creates those files itself.
