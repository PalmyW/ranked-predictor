# Don't Call Me A Champ, Mate! — AFL 2026 Season Predictor

An interactive AFL 2026 season prediction tool. Drag your 18 teams into strength tiers, and the app simulates every remaining game to predict the final ladder. Share your prediction with a URL.

**[Live site →](https://palmyw.github.io/ranked-predictor/)**

---

## Features

- **Tier-based ranking** — Drag teams between 7 tiers (S through F). Higher tier always wins.
- **Three ladder views** — Current standings, predicted (deterministic), and randomised simulation
- **Schedule difficulty** — Each team's remaining draw rated 1–18 with home/away breakdown
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
```

Fixture data is loaded from `public/data/fixture.json`. To fetch fresh data locally:

```bash
curl -fsSL \
  -H 'account: afl' \
  -H 'origin: https://www.afl.com.au' \
  -H 'referer: https://www.afl.com.au/' \
  -H 'user-agent: Mozilla/5.0' \
  'https://aflapi.afl.com.au/afl/v2/matches?pageSize=300&competitionId=1&compSeasonId=85' \
  -o public/data/fixture.json
```

---

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `sync-deploy.yml` | Push to `main` | Fetches fresh fixture, builds, deploys to `gh-pages` |
| `fetch-data.yml` | Scheduled (Fri–Mon after games) | Fetches fixture, builds, deploys, commits updated fixture to `main` |
| `deploy.yml` | Manual (`workflow_dispatch`) | Build and deploy from `main` |

The scheduled fetch runs after AFL game windows (UTC): 6am, 9am, and noon on Fri/Sat/Sun/Mon.

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
- **Simulated ladder** — Win probability scales linearly from 60% (1 rank apart) to 95% (17 ranks apart)
