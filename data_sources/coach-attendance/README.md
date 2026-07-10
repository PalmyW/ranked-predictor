# Coach + attendance enrichment

Enriches existing `public/data/{year}/match-details/` files with each match's
**head coaches** (home + away) and **attendance**, scraped from
[footywire.com](https://www.footywire.com) match-statistics pages — covers every
season footywire has that data for, **1965–present**, including 2012+ matches
that already exist as official-API `CD_M*` data (whose `score` object never
carries attendance at all — the AFL API just doesn't include it — so this is the
only source for it there).

## Why no new matches/ids are minted for matches

- **1965–2011**: the match-details file *is already* footywire data
  (`PW_M{mid}.json`, from `../statscache/scrape-season.js`) — the footywire mid
  is read straight off the filename, no discovery needed.
- **2012+**: the file is official-API `CD_M*` data. footywire's mid for that
  same match is found by matching **round number + home/away team** against
  footywire's own `ft_match_list?year=YYYY`, page — the identical technique
  `../ratings-enrichment/import-season.js` uses to solve the same problem for its
  own enrichment.

Only the basic `ft_match_statistics?mid=` page is fetched (not the `&advv=Y`
advanced view the player scraper also needs) — coach and attendance are both on
the basic page, so this halves the requests per match relative to a full stats
scrape.

## Coach → player id resolution

Every match page has exactly one `Coach: <a href="cp-{name}--{id}">{Name}</a>`
link per team box, in the same document order as the player tables (so it's
aligned to home/away the same way `scrape-season.js` aligns player tables — by
team identity, not position). `cp-{name}--{id}` is footywire's own stable
per-person id, used to memoize a coach's resolution across every match/team
they've coached — decided once, in `../statscache/id-map.json` (the same
id-map, and the same `PW_I*` counter, the footywire *player* scraper mints
from — a coach with no existing id is exactly the same kind of entity that
scraper already mints one for, just found from a different page).

**Unlike player matching, there's no independent verification signal.**
`../statscache/lib/ids.js` only trusts a name match when a date of birth
confirms it — but footywire's coach pages carry no DOB (checked; neither the
`cp-` coach-summary page nor the `ch-` coaching-history page has one), and no
`pp-` link back to the coach's own player-profile page even when they were one.
So resolution is name-only, against a broad index of **every existing player
id from every provider/era** (`lib/player-index.js` — not just `CD_I*`, since a
pre-2012 coach may only exist as a `PW_I*`/`AT_I*` id from the footywire/
afltables backfills):

1. Exactly one existing player shares the coach's full name → use that id.
2. Multiple same-name players → narrow by playing-career plausibility (a coach
   must have stopped playing at or before the season they're coaching — i.e.
   the candidate's last active season is `<=` the match year). If that leaves
   exactly one, use it.
3. Otherwise (zero candidates, or still ambiguous) → mint a fresh `PW_I` id.
   Ambiguous cases are printed to the console rather than guessed.

This is a best-effort heuristic, not a verified match — collisions between two
different people who share a full name are possible in principle, just rare in
practice for AFL coaches (nearly always well-known, distinctively-named
individuals). Spot-check `matched: true` coaches you care about.

Minted coach profiles are written to `public/data/players/PW_I*.json` in the
same shape the footywire player scraper writes, with `role: 'coach'` and
`source: 'coach-attendance'` so they're distinguishable from a minted player
who was actually recorded playing a match.

## What gets written, and where

`match-details/{providerId}.json`:

```jsonc
{
  "score": { "...": "...", "attendance": 40012 },
  "coaches": {
    "fetchedAt": "2026-07-10T10:43:32.875Z",
    "home": { "playerId": "PW_I900966", "name": "John Longmire", "matched": true },
    "away": { "playerId": "PW_I900123", "name": "Simon Goodwin", "matched": true }
  }
}
```

`attendance` is written whenever footywire has it, independent of whether the
coach side resolves — the two are unrelated failure modes (attendance needs no
team alignment at all).

## Usage

```bash
# One season
npm run import-coaches -- --year=2024

# A range
npm run import-coaches -- --from=1965 --to=2011

# No args = every footywire-covered season, newest first (1965–current, the
# backfill/"crawler" mode)
npm run import-coaches

# Re-resolve even matches that already have both coaches and attendance
npm run import-coaches -- --force

# Debugging: cap how many matches per year are actually fetched
npm run import-coaches -- --year=2024 --limit=5
```

Idempotent and re-run-safe: a match already carrying both a `coaches` block
*and* a positive `score.attendance` is skipped (and for 2012+ years, if every
outstanding match in the season already has both, `ft_match_list` isn't even
re-fetched). Running with no args is safe to schedule alongside
`npm run scrape-statscache` / the live 2012+ pipeline — it'll pick up newly-
concluded matches and do nothing for everything already enriched.

Raw HTML is served from the **same** cache as `../statscache/` —
`data_sources/statscache/.cache/` — since this scrapes the exact same footywire
page (`ft_match_statistics?mid=`) the player scraper already fetches for
1965–2011. Live requests are also throttled by the same `FW_DELAY_MS` (default
1200ms) via the shared `../statscache/lib/http.js`.

## Caveats

- A pre-2012 finals-round mismatch, or a 2012+ round-numbering scheme footywire
  disagrees with, means a small number of matches won't resolve a footywire mid
  at all — these print as `! unmatched match` and are simply skipped, same
  caveat `../ratings-enrichment/import-season.js` documents for its own round+team
  matching.
- `--year=YYYY` for a year before 1965 will just report "no data" — footywire's
  own coverage starts in 1965 (pre-1965 is `../afltables/`, which has no coach
  or attendance data to backfill from).
- A full backfill (no args) touches ~60 seasons × ~200 matches ≈ 10,000+ page
  fetches. At the default 1200ms courtesy delay that's several hours — run it
  in `--from`/`--to` chunks, not all at once, and verify a chunk's output
  (spot-check a few `match-details` files, check the console's unmatched/
  ambiguous counts look sane) before moving on to the next.
