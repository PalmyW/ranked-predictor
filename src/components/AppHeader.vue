<template>
  <header
    class="border-b border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <div
      class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4"
    >
      <!-- Tile logo -->
      <div class="flex shrink-0 flex-col gap-0.5">
        <div v-for="(row, ri) in LOGO_ROWS" :key="ri" class="flex gap-0.5">
          <div
            v-for="(char, ci) in row"
            :key="ci"
            class="flex size-6 select-none items-center justify-center font-shoulders text-xs font-black leading-none text-white"
            :class="
              char === '/'
                ? 'bg-slate-800 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                : 'bg-slate-800 dark:bg-slate-700'
            "
          >
            {{ char }}
          </div>
        </div>
      </div>

      <!-- Page navigation -->
      <nav class="flex gap-1">
        <button
          v-for="tab in TABS"
          :key="tab.path"
          @click="router.push(tab.path)"
          class="px-3 py-1.5 text-sm font-semibold rounded transition-colors"
          :class="
            isActive(tab.path)
              ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
          "
          :data-tour="tab.path === '/stats' ? 'stats-nav' : tab.path === '/season-stats' ? 'season-stats-nav' : tab.path === '/rankings' ? 'rankings-nav' : tab.path === '/score-predictor' ? 'score-predictor-nav' : undefined"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div class="ml-auto flex shrink-0 items-center gap-3">
        <div
          class="hidden text-right text-xs text-gray-400 dark:text-gray-500 sm:block"
        >
          <span v-if="isLoading">Loading fixture...</span>
          <span v-else-if="syncedAt && isCurrentSeason">Synced {{ timeAgo(syncedAt) }}</span>
        </div>
        <div class="flex overflow-hidden rounded border border-gray-200 text-xs dark:border-gray-700">
          <button
            v-for="l in LEAGUE_OPTIONS"
            :key="l"
            @click="onLeagueChange(l)"
            class="px-2 py-1 font-semibold transition-colors"
            :class="
              activeLeague === l
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            "
            :title="`Switch to ${l.toUpperCase()}`"
          >{{ l.toUpperCase() }}</button>
        </div>
        <select
          v-if="availableSeasons.length > 1 && route.path !== '/'"
          :value="activeSeasonYear"
          @change="onSeasonChange"
          class="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 transition-colors hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
          title="Switch season"
        >
          <option v-for="s in availableSeasons" :key="s.year" :value="s.year">{{ s.year }}</option>
        </select>
        <button
          @click="$emit('start-tour')"
          class="flex size-8 items-center justify-center rounded-full text-sm font-bold text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          title="Open guided tour"
        >?</button>
        <button
          data-tour="dark-mode-toggle"
          @click="$emit('toggle-dark')"
          class="flex size-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        >
          <span v-if="isDark">☀️</span>
          <span v-else>🌙</span>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
const router = useRouter()

const { seasons, activeSeasonYear, isCurrentSeason, switchSeason, currentSeasonYear } = useSeason()
const { activeLeague, switchLeague } = useLeague()

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

function onSeasonChange(e: Event) {
  switchSeason((e.target as HTMLSelectElement).value)
}

function isActive(path: string) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
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

const TABS = [
  { path: '/', label: 'Predictor' },
  { path: '/stats', label: 'Match Stats' },
  { path: '/season-stats', label: 'Season Stats' },
  { path: '/rankings', label: 'Over complicated Ladders' },
  { path: '/score-predictor', label: 'PalmyScore™' },
  { path: '/finals', label: 'Finals' },
]
</script>
