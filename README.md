# Don't Call Me A Champ, Mate! — AFL 2026 Season Predictor

An interactive AFL 2026 season prediction tool. Drag your 18 teams into strength tiers, and the app simulates every remaining game to predict the final ladder. Share your prediction with a URL.

**[Live site →](https://palmyw.github.io/ranked-predictor/)**

---

## Features

- **Tier-based ranking** — Drag teams between 7 tiers (S through F). Higher tier always wins.
- **Three ladder views** — Current standings, predicted (deterministic), and randomised simulation
- **Schedule difficulty** — Each team's remaining draw rated 1–18 with home/away breakdown; team popup shows last 6 W/L results and double-up opponents
- **Live data sync** — Fixture polled every 15s; header shows time since last data sync
- **Shareable URLs** — Ranking encoded in the URL, restores on load
- **Persistent state** — Saves to localStorage, with controls to switch between live/shared/saved rankings
- **Dark mode** — Follows system preference, toggleable

---

## Stack

- [Vue 3](https://vuejs.org/) + TypeScript + Vite
- [Tailwind CSS](https://tailwindcss.com/) (class-based dark mode)
- [vuedraggable](https://github.com/SortableJS/vue.draggable.next)
- [Big Shoulders](https://fonts.google.com/specimen/Big+Shoulders+Display) (Google Fonts)
- GitHub Actions + GitHub Pages

---

## Local development

```bash
npm install
npm run dev
```

```bash
npm run build     # production build
npm run preview   # preview production build locally
npm run fetch-data  # pull latest fixture from AFL API into public/data/fixture.json
```

---

## Data

Fixture data is fetched from the AFL API and stored as `public/data/fixture.json`. A companion file `public/data/last-updated.json` records the UTC timestamp of the last fetch. The app polls `last-updated.json` every 15s and re-fetches the fixture if the timestamp changes.

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

Rankings are encoded as a hyphen-separated string of team letters grouped by tier:

```
?r=A-BC-DEF-GHI-JKL-MNO-PQR
```

Each letter maps to a team (A = Adelaide, B = Brisbane Lions, … R = Western Bulldogs). The 7 segments correspond to tiers S through F.

---

## Simulation model

- **Predicted ladder** — Higher-ranked team wins every remaining game deterministically
- **Simulated ladder** — Win probability scales linearly from 60% (1 rank apart) to 95% (17 ranks apart), with a +5% home ground advantage applied on top
