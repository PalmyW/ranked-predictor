<template>
  <header
    class="sticky top-0 z-40 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/95"
    @keydown.escape="menuOpen = false"
  >
    <div class="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 xl:gap-4">
      <!-- Tile logo (home link) -->
      <RouterLink :to="linkTo('/')" class="flex shrink-0 flex-col gap-0.5 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500" aria-label="PalmyData — Predictor home">
        <div v-for="(row, ri) in LOGO_ROWS" :key="ri" class="flex gap-0.5">
          <div
            v-for="(char, ci) in row"
            :key="ci"
            class="flex size-5 select-none items-center justify-center font-shoulders text-[11px] font-black leading-none text-white sm:size-6 sm:text-xs"
            :class="
              char === '/'
                ? 'bg-slate-800 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                : 'bg-slate-800 dark:bg-slate-700'
            "
          >
            {{ char }}
          </div>
        </div>
      </RouterLink>

      <!-- Page navigation: inline on wide screens -->
      <nav class="hidden xl:flex xl:gap-0.5" aria-label="Main">
        <RouterLink
          v-for="tab in TABS"
          :key="tab.path"
          :to="linkTo(tab.path)"
          class="whitespace-nowrap rounded px-2.5 py-1.5 text-sm font-semibold transition-colors"
          :class="navClass(tab.path)"
          :aria-current="isActive(tab.path) ? 'page' : undefined"
          :data-tour="tab.tour"
        >
          {{ tab.label }}
        </RouterLink>
      </nav>

      <div class="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        <div class="hidden whitespace-nowrap text-right text-xs text-gray-400 dark:text-gray-500 2xl:block">
          <span v-if="isLoading">Loading fixture...</span>
          <span v-else-if="syncedAt && isCurrentSeason">Synced {{ timeAgo(syncedAt) }}</span>
        </div>
        <div class="hidden overflow-hidden rounded border border-gray-200 text-xs sm:flex dark:border-gray-700">
          <button
            v-for="l in LEAGUE_OPTIONS"
            :key="l"
            @click="onLeagueChange(l)"
            class="px-2 py-1 font-semibold transition-colors"
            :class="leagueClass(l)"
            :aria-pressed="activeLeague === l"
            :title="`Switch to ${l.toUpperCase()}`"
          >{{ l.toUpperCase() }}</button>
        </div>
        <select
          v-if="showSeasonSelect"
          :value="activeSeasonYear"
          @change="onSeasonChange"
          class="hidden rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 transition-colors hover:border-gray-300 sm:block dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
          title="Switch season"
          aria-label="Season"
        >
          <option v-for="s in availableSeasons" :key="s.year" :value="s.year">{{ s.year }}</option>
        </select>
        <button
          @click="$emit('start-tour')"
          class="flex size-8 items-center justify-center rounded-full text-sm font-bold text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          title="Open guided tour"
          aria-label="Open guided tour"
        >?</button>
        <button
          data-tour="dark-mode-toggle"
          @click="$emit('toggle-dark')"
          class="flex size-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        >
          <span v-if="isDark">☀️</span>
          <span v-else>🌙</span>
        </button>
        <!-- Menu toggle: below xl the page tabs live in the menu panel -->
        <button
          @click="menuOpen = !menuOpen"
          class="flex h-8 items-center gap-1.5 rounded border border-gray-200 px-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 xl:hidden dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          :aria-expanded="menuOpen"
          aria-controls="site-menu"
          :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
        >
          <svg class="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true">
            <path v-if="menuOpen" d="M4 4l8 8M12 4l-8 8" />
            <path v-else d="M2.5 4h11M2.5 8h11M2.5 12h11" />
          </svg>
          <span class="hidden max-w-[10rem] truncate sm:inline">{{ activeTabLabel }}</span>
        </button>
      </div>
    </div>

    <!-- Menu panel (below xl) -->
    <div
      v-if="menuOpen"
      id="site-menu"
      class="border-t border-gray-200 xl:hidden dark:border-gray-700"
    >
      <nav class="mx-auto grid max-w-7xl grid-cols-2 gap-1 px-4 py-3 sm:grid-cols-4" aria-label="Main">
        <RouterLink
          v-for="tab in TABS"
          :key="tab.path"
          :to="linkTo(tab.path)"
          class="rounded px-3 py-2 text-sm font-semibold transition-colors"
          :class="navClass(tab.path)"
          :aria-current="isActive(tab.path) ? 'page' : undefined"
        >
          {{ tab.label }}
        </RouterLink>
      </nav>
      <!-- League + season + sync status move in here on phones -->
      <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 pb-3 sm:hidden">
        <div class="flex overflow-hidden rounded border border-gray-200 text-xs dark:border-gray-700">
          <button
            v-for="l in LEAGUE_OPTIONS"
            :key="l"
            @click="onLeagueChange(l)"
            class="px-3 py-1.5 font-semibold transition-colors"
            :class="leagueClass(l)"
            :aria-pressed="activeLeague === l"
          >{{ l.toUpperCase() }}</button>
        </div>
        <select
          v-if="showSeasonSelect"
          :value="activeSeasonYear"
          @change="onSeasonChange"
          class="rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
          aria-label="Season"
        >
          <option v-for="s in availableSeasons" :key="s.year" :value="s.year">{{ s.year }}</option>
        </select>
        <span class="ml-auto text-xs text-gray-400 dark:text-gray-500">
          <template v-if="isLoading">Loading fixture...</template>
          <template v-else-if="syncedAt && isCurrentSeason">Synced {{ timeAgo(syncedAt) }}</template>
        </span>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, type RouteLocationRaw } from 'vue-router'
import { useSeason } from '../composables/useSeason'
import { useLeague } from '../composables/useLeague'
import type { LeagueKey } from '../config/league'

defineProps<{
  isLoading: boolean
  syncedAt: Date | null
  isDark: boolean
}>()

defineEmits<{
  (e: 'toggle-dark'): void
  (e: 'start-tour'): void
}>()

const route = useRoute()

const { seasons, activeSeasonYear, isCurrentSeason, switchSeason, currentSeasonYear } = useSeason()
const { activeLeague, switchLeague } = useLeague()

const menuOpen = ref(false)
watch(() => route.path, () => { menuOpen.value = false })

const LEAGUE_OPTIONS: LeagueKey[] = ['afl', 'aflw']
function onLeagueChange(l: LeagueKey) {
  if (l !== activeLeague.value) switchLeague(l)
}

// The deployed build only ships match-details/stats/team-stats for the current
// season (scripts/prune-deploy-data.js strips them for every other season), so
// the Match Stats and Season Stats pages can only ever show the current season.
const isMatchStatsRoute = computed(
  () => route.path === '/stats' || route.path.startsWith('/stats/') || route.path === '/season-stats',
)
const availableSeasons = computed(() =>
  isMatchStatsRoute.value ? seasons.filter((s) => s.year === currentSeasonYear) : seasons,
)
const showSeasonSelect = computed(() => availableSeasons.value.length > 1 && route.path !== '/')

function onSeasonChange(e: Event) {
  switchSeason((e.target as HTMLSelectElement).value)
}

// League and season live in the query string and are read once per page
// load, so carry them across tab links — otherwise a refresh or shared link
// after navigating silently falls back to AFL / the current season. Pages
// without a season switcher reload themselves back to the current season.
function linkTo(path: string): RouteLocationRaw {
  const query: Record<string, string> = {}
  for (const key of ['league', 'season']) {
    const v = route.query[key]
    if (typeof v === 'string') query[key] = v
  }
  return { path, query }
}

function isActive(path: string) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}

function navClass(path: string): string {
  return isActive(path)
    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
}

function leagueClass(l: LeagueKey): string {
  return activeLeague.value === l
    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
}

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const LOGO_ROWS: string[][] = [
  ['P', 'A', 'L', 'M', 'Y'],
  ['D', 'A', 'T', 'A', '/'],
]

// `tour` is the data-tour id the guided tour spotlights for that nav link.
const TABS: Array<{ path: string; label: string; tour?: string }> = [
  { path: '/', label: 'Predictor' },
  { path: '/stats', label: 'Match Stats', tour: 'stats-nav' },
  { path: '/season-stats', label: 'Season Stats', tour: 'season-stats-nav' },
  { path: '/rankings', label: 'Over complicated Ladders', tour: 'rankings-nav' },
  { path: '/score-predictor', label: 'PalmyScore™', tour: 'score-predictor-nav' },
  { path: '/finals', label: 'Finals', tour: 'finals-nav' },
  { path: '/fixture', label: 'Fixture', tour: 'fixture-nav' },
]

// Shown on the menu button so the current page is visible while the tabs are collapsed.
const activeTabLabel = computed(() => TABS.find((t) => isActive(t.path))?.label ?? 'Menu')
</script>
