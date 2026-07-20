# PalmyData — AFL 2026 Season Predictor

An interactive AFL 2026 tool with four pages: a tier-based season predictor, per-match player stats, cumulative season stats, and algorithm-driven team rankings. Share any view via URL.

**[Live site →](https://palmyw.github.io/ranked-predictor/)**

---

## Pages

### Predictor

- **Tier-based ranking** — Drag teams between 7 tiers (S through F). Higher tier always wins in predictions.
- **Three ladder views** — Live AFL standings, deterministic predicted ladder, and randomised simulation
- **Team fixture popup** — Calendar icon on each team shows remaining schedule with predicted/simulated results for every game
- **Ladder source switcher** — Toggle between the live AFL ladder, your saved "My Ladder", or a shared ranking from a URL
- **Save & reset** — Persist your ranking as "My Ladder" or revert to live AFL standings at any time
- **Power Rankings** — Worm chart tracking how your team ranking has changed week by week; export as an image
- **Circle of Parity** — Visualises circular win/loss chains from actual season results
- **Round match cards** — Browse every round's matches with predicted winners, live scores, and simulated outcomes
- **Shareable URLs** — Ranking encoded in `?r=` query param; restores on load

### Match Stats (`/stats`)

- Browse all concluded matches by round in the sidebar
- Full player stats table with 40+ columns (disposals, kicks, marks, tackles, and more)
- Click a player name for their complete stat breakdown
- Filter by home/away team; click any column header to sort
- Toggle columns on/off to focus on specific metrics

### Season Stats (`/season-stats`)

- Select any team to load every player who has taken the field this season
- Toggle between season **totals** and per-game **averages** (averages account for each player's own games played)
- Click any column header to sort; click a player name for their full breakdown

### Algorithm Rankings (`/rankings`)

Six ranking algorithms that account for uneven schedules, each with a **Table** and **Graph** view:

| Algorithm | What it measures |
|---|---|
| **SRS** | Average margin + average opponent rating, iterated to convergence |
| **Colley Matrix** | 18 simultaneous equations encoding every head-to-head record (wins/losses only) |
| **Massey** | Least-squares system fitting score margins to team ratings |
| **Win Flow** | PageRank-style — losing donates your rating to whoever beat you |
| **Palmy** | Custom: each team gets a ranked opponent ladder sorted by match margin; your score is your average fractional position across all ladders you appear in |

- **Graph view** — Worm chart showing how each algorithm's ranking evolved round by round
- **Nerd stuff** — Expandable panel with formula illustrations for each algorithm
- **Palmy popup** — Click a team to see their full opponent ladder and their position in every other team's ladder
- **vs AFL column** — Shows agreement/disagreement with the official points-based ladder
- **URL sync** — Algorithm and view are reflected in `?algo=` and `?view=` query params (bookmarkable and shareable)
- Finals zones: orange line after 6th (finals qualified), blue line after 10th (wildcard cut-off)

### Guided tour

Hit the **?** button at any time to replay the interactive guided tour covering every feature across all four pages.

---

## AFL Stats Explorer (palmy-data)

The local-only SQLite stats explorer / Claude-powered "Ask" app now lives in its own
repo, **[palmy-data](https://github.com/PalmyW/palmy-data)**. It consumes this project's
`public/data/` as a git submodule, so this repo remains the single source of truth for
the season data.

---

## Stack

- [Vue 3](https://vuejs.org/) + TypeScript + Vite
- [Vue Router 4](https://router.vuejs.org/)
- [Tailwind CSS](https://tailwindcss.com/) (class-based dark mode)
- [vuedraggable](https://github.com/SortableJS/vue.draggable.next)
- [html-to-image](https://github.com/bubkoo/html-to-image) (Power Rankings screenshot export)
- [Big Shoulders Display](https://fonts.google.com/specimen/Big+Shoulders+Display) (Google Fonts)
- GitHub Actions + GitHub Pages

---

## Local development

```bash
npm install
npm run dev
```

```bash
npm run build        # production build
npm run preview      # preview production build locally
npm run fetch-data   # pull latest fixture from AFL API into public/data/fixture.json
```

---

## Data

Fixture data is fetched from the AFL API and stored as `public/data/fixture.json`. A companion file `public/data/last-updated.json` records the UTC timestamp of the last fetch. The app polls `last-updated.json` every 15s and re-fetches the fixture if the timestamp changes.

Player statistics are fetched on demand from the AFL API per match and cached in memory for the session.

---

## Data attribution & legal

All AFL fixture and player statistics data is sourced from the AFL API (api.afl.com.au) and is subject to the following notice as required by the API terms:

> All data and statistical content sourced from the AFL API is protected by copyright owned by or licensed to Telstra. Unauthorised reproduction, publishing, transmission, distribution, copying or other use of this data is prohibited.

The AFL and related marks are trademarks of the Australian Football League. Player statistics, fixture data, and related content are the intellectual property of the AFL and/or their respective licensors. This project is unofficial and is not affiliated with, endorsed by, or associated with the Australian Football League or Telstra.

Data is used solely for non-commercial, personal, and informational purposes. No warranties are made as to the accuracy or completeness of the data. If you are the rights holder and believe this use is not permitted, please open an issue.

---

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `sync-deploy.yml` | Push to `main` | Fetches fresh fixture, builds, deploys to `gh-pages` |
| `fetch-data.yml` | Scheduled | Fetches fixture, writes timestamp, builds, deploys, commits data to `main` |
| `deploy.yml` | Manual (`workflow_dispatch`) | Builds from current `main` and deploys to `gh-pages` |

`fetch-data.yml` schedule:
- **Every 5 minutes** on Thu–Sun, 01:00–13:00 UTC (11am–11pm AEST game window)
- **Hourly** on Mon–Wed
- **Hourly** on Thu–Sun outside game hours

---

## URL encoding

### Predictor ranking

Rankings are encoded as a hyphen-separated string of team letters grouped by tier:

```
?r=A-BC-DEF-GHI-JKL-MNO-PQR
```

Each letter maps to a team (A = Adelaide, B = Brisbane Lions, … R = Western Bulldogs). The 7 segments correspond to tiers S through F.

### Algorithm Rankings

```
/rankings?algo=srs&view=table
/rankings?algo=palmy&view=graph
```

Valid `algo` values: `srs`, `colley`, `massey`, `winflow`, `palmy`. Valid `view` values: `table`, `graph`. Both default to `srs` / `table` if absent.

---

## Simulation model

- **Predicted ladder** — Higher-ranked team wins every remaining game deterministically
- **Simulated ladder** — Win probability scales linearly from 60% (1 rank apart) to 95% (17 ranks apart), with a +5% home ground advantage applied on top
