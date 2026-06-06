import { ref, computed } from 'vue'

const STORAGE_KEY = 'afl-tour-v1'

export interface TourStep {
  id: string
  title: string
  description: string
  target: string | null
  route?: string
}

const STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to PalmyData!',
    description: 'Predict how the 2026 AFL season will finish. Rank teams your way and see where each side lands. This quick tour shows you around.',
    target: null,
  },
  {
    id: 'team-ranker',
    title: 'Your Team Ranking',
    description: 'Drag teams between tiers to set your power ranking. Higher-ranked teams always beat lower-ranked teams in predictions.',
    target: '[data-tour="team-ranker"]',
    route: '/',
  },
  {
    id: 'fixture-icon',
    title: 'Team Fixture',
    description: 'Tap the calendar icon on any team to see their remaining schedule with your predicted and simulated results for each game.',
    target: '[data-tour="team-fixture-icon"]',
    route: '/',
  },
  {
    id: 'ladder-source',
    title: 'Ladder Source',
    description: 'Switch between the live AFL ladder, your saved My Ladder, or a shared ranking loaded from a URL.',
    target: '[data-tour="ladder-source"]',
    route: '/',
  },
  {
    id: 'ranking-actions',
    title: 'Save & Reset',
    description: 'Save your current ranking as "My Ladder" or reset back to the live AFL standings at any time.',
    target: '[data-tour="ranking-actions"]',
    route: '/',
  },
  {
    id: 'predicted-tab',
    title: 'Predicted Ladder',
    description: 'See where every team finishes if your higher-ranked team wins every remaining game — no randomness, pure ranking.',
    target: '[data-tour="predicted-tab"]',
    route: '/',
  },
  {
    id: 'simulated-tab',
    title: 'Simulated Season',
    description: 'Run a randomised season where upsets can happen. Win probability scales by rank gap, with a home-ground boost.',
    target: '[data-tour="simulated-tab"]',
    route: '/',
  },
  {
    id: 'power-tab',
    title: 'Power Rankings',
    description: 'Track how your ranking of each team has changed week by week throughout the season. Export as an image to share.',
    target: '[data-tour="power-rankings-tab"]',
    route: '/',
  },
  {
    id: 'parity-tab',
    title: 'Circle of Parity',
    description: 'Visualise the win/loss loops between teams — who beats who in a circular chain of season results.',
    target: '[data-tour="parity-tab"]',
    route: '/',
  },
  {
    id: 'round-banner',
    title: 'Round Match Cards',
    description: 'Browse match cards round by round. See predicted winners, live scores, and simulated results at a glance.',
    target: '[data-tour="round-banner"]',
    route: '/',
  },
  {
    id: 'share-bar',
    title: 'Share Your Prediction',
    description: "Copy this link to share your exact team ranking with anyone. They'll load your ladder automatically.",
    target: '[data-tour="share-bar"]',
    route: '/',
  },
  {
    id: 'stats-nav',
    title: 'Stats Page',
    description: "Next up is the Stats page — detailed player statistics for every concluded match. Let's take a look.",
    target: '[data-tour="stats-nav"]',
    route: '/',
  },
  {
    id: 'stats-match-browser',
    title: 'Concluded Matches',
    description: 'Browse concluded matches by round in this sidebar. Expand a round and click any match to load its player statistics.',
    target: '[data-tour="stats-match-browser"]',
    route: '/stats',
  },
  {
    id: 'stats-panel',
    title: 'Player Stats Table',
    description: 'Select a match and a full player stats table loads here with disposals, kicks, marks, tackles, and 40+ more stats. Click any player name to see their complete breakdown.',
    target: '[data-tour="stats-panel"]',
    route: '/stats',
  },
  {
    id: 'stats-toolbar',
    title: 'Filter & Sort',
    description: 'Filter stats by home or away team using the team switcher, and click any column header to sort by that stat.',
    target: '[data-tour="stats-toolbar"]',
    route: '/stats',
  },
  {
    id: 'stats-columns',
    title: 'Toggle Columns',
    description: 'Use the checkboxes to show or hide any stat column. Simplify the table to focus on the basics, or expand to see every advanced metric.',
    target: '[data-tour="stats-columns-panel"]',
    route: '/stats',
  },
  {
    id: 'season-stats-nav',
    title: 'Season Stats',
    description: "The Season Stats page shows cumulative player stats for the whole season — every player across all rounds. Let's take a look.",
    target: '[data-tour="season-stats-nav"]',
    route: '/stats',
  },
  {
    id: 'season-team-browser',
    title: 'Choose a Team',
    description: 'Select any team from this list to load their season stats — every player who has taken the field this year, sorted by disposals.',
    target: '[data-tour="season-team-browser"]',
    route: '/season-stats',
  },
  {
    id: 'season-stats-table',
    title: 'Player Season Stats',
    description: 'Each row is a player. Click any column header to sort by that stat, or click a player name to see their full season breakdown across all categories.',
    target: '[data-tour="season-stats-table"]',
    route: '/season-stats',
  },
  {
    id: 'season-mode-toggle',
    title: 'Totals vs Averages',
    description: "Toggle between season totals and per-game averages. Averages use each player's own games played — so a player who missed rounds isn't penalised.",
    target: '[data-tour="season-mode-toggle"]',
    route: '/season-stats',
  },
  {
    id: 'rankings-nav',
    title: 'Over complicated Ladders',
    description: 'The Over complicated Ladders page ranks all 18 teams using statistical methods that account for uneven schedules — something a simple ladder can\'t do.',
    target: '[data-tour="rankings-nav"]',
    route: '/season-stats',
  },
  {
    id: 'rankings-algo-selector',
    title: 'Switch Algorithms',
    description: 'Pick from seven different ranking methods: Win %, SRS, Colley Matrix, Massey, Win Flow, Palmy, and XPalmy. Each uses a different mathematical approach to weigh results.',
    target: '[data-tour="rankings-algo-selector"]',
    route: '/rankings',
  },
  {
    id: 'rankings-table',
    title: 'Ranking Table',
    description: 'Teams are ordered by the algorithm\'s rating. The "vs AFL" column shows where this algorithm agrees or disagrees with the official points-based ladder.',
    target: '[data-tour="rankings-table"]',
    route: '/rankings',
  },
  {
    id: 'score-predictor-nav',
    title: 'PalmyScore™',
    description: "The PalmyScore™ page predicts upcoming match scores using each team's attack and defence ratings. Let's take a look.",
    target: '[data-tour="score-predictor-nav"]',
    route: '/rankings',
  },
  {
    id: 'score-predictor-predictions',
    title: 'Match Predictions',
    description: 'Predicted scores for every upcoming match, calculated from each team\'s season attack average adjusted by their opponent\'s defence rating. Toggle between All Games and Home/Away to factor in venue history.',
    target: '[data-tour="score-predictor-predictions"]',
    route: '/score-predictor',
  },
  {
    id: 'score-predictor-strength',
    title: 'Attack & Defence Ratings',
    description: "Every team's average score, average conceded, and defence adjustment — how many extra points opponents tend to score above their own average when facing that team. Sort by Attack or Defence rank.",
    target: '[data-tour="score-predictor-strength"]',
    route: '/score-predictor',
  },
  {
    id: 'dark-mode',
    title: 'Dark Mode',
    description: 'Toggle between light and dark themes. Your preference is saved automatically.',
    target: '[data-tour="dark-mode-toggle"]',
  },
  {
    id: 'done',
    title: "You're all set!",
    description: 'Start dragging teams around and see where your ranking takes the ladder. Hit the ? button any time to replay this tour.',
    target: null,
  },
]

const isActive = ref(false)
const currentStep = ref(0)

export function useTour() {
  const step = computed(() => STEPS[currentStep.value])
  const stepNumber = computed(() => currentStep.value + 1)
  const totalSteps = computed(() => STEPS.length)
  const isFirst = computed(() => currentStep.value === 0)
  const isLast = computed(() => currentStep.value === STEPS.length - 1)

  function startTour() {
    currentStep.value = 0
    isActive.value = true
  }

  function closeTour() {
    isActive.value = false
    localStorage.setItem(STORAGE_KEY, 'seen')
  }

  function nextStep() {
    if (isLast.value) {
      closeTour()
    } else {
      currentStep.value++
    }
  }

  function prevStep() {
    if (!isFirst.value) currentStep.value--
  }

  function skipTour() {
    closeTour()
  }

  function initTour() {
    if (localStorage.getItem(STORAGE_KEY) !== 'seen') {
      startTour()
    }
  }

  return { isActive, currentStep, step, stepNumber, totalSteps, isFirst, isLast, startTour, nextStep, prevStep, skipTour, initTour }
}
