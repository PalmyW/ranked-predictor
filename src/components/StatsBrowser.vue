<template>
  <Teleport to="body">
    <template v-if="playerOverlay">
      <div class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" @click="playerOverlay = null" />
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div class="pointer-events-auto w-full max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xl">
          <!-- Header -->
          <div class="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <svg class="size-8 shrink-0">
              <use :href="`${BASE_URL}icons.svg#${playerOverlay.iconId}`" />
            </svg>
            <div class="min-w-0">
              <div class="font-bold text-gray-900 dark:text-gray-100 text-base">{{ playerOverlay.name }}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500">{{ playerOverlay.team }}</div>
            </div>
            <button
              class="ml-auto shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              @click="playerOverlay = null"
            >
              <svg class="size-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>
          <!-- Stat list -->
          <div class="overflow-y-auto flex-1">
            <div v-for="cat in playerOverlayCats" :key="cat.label">
              <div class="px-5 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                {{ cat.label }}
              </div>
              <dl>
                <div
                  v-for="stat in cat.stats"
                  :key="stat.key"
                  class="flex items-center justify-between px-5 py-2 border-b border-gray-100 dark:border-gray-800/60 last:border-0 odd:bg-gray-50/60 dark:odd:bg-gray-800/20"
                >
                  <dt class="text-sm text-gray-600 dark:text-gray-400">{{ stat.fullName }}</dt>
                  <dd class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ stat.value }}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </template>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="tooltip.text"
      class="fixed z-50 pointer-events-none px-2 py-1 rounded bg-gray-900 dark:bg-gray-700 text-white text-xs whitespace-nowrap shadow-lg -translate-x-1/2"
      :style="{ top: tooltip.y + 'px', left: tooltip.x + 'px' }"
    >{{ tooltip.text }}</div>
  </Teleport>

  <Teleport to="body">
    <template v-if="columnsOpen">
      <div class="fixed inset-0 z-30" @click="columnsOpen = false" />
      <div
        data-tour="stats-columns-panel"
        class="fixed z-40 w-72 max-h-[70vh] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl"
        :style="columnsPanelStyle"
      >
        <div class="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between">
          <span class="text-xs font-semibold text-gray-700 dark:text-gray-300">Columns</span>
          <div class="flex gap-3">
            <button class="text-xs text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 font-medium" @click="showAllColumns">Show all</button>
            <button class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 font-medium" @click="hideAllColumns">Hide all</button>
          </div>
        </div>
        <div v-for="cat in categorizedColumns" :key="cat.label" class="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
          <div class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">{{ cat.label }}</div>
          <div class="flex flex-col gap-1.5">
            <label
              v-for="col in cat.columns"
              :key="col.key"
              class="flex items-center gap-1.5 cursor-pointer group"
            >
              <input
                type="checkbox"
                :checked="col.visible"
                class="shrink-0 rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 bg-white dark:bg-gray-800"
                @change="toggleColumn(col.key)"
              />
              <span class="text-xs text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">{{ col.fullName }}</span>
            </label>
          </div>
        </div>
      </div>
    </template>
  </Teleport>

  <div class="max-w-6xl mx-auto px-4 py-6">
    <div class="flex flex-col lg:flex-row gap-6">
      <!-- Left: Round/match browser -->
      <aside data-tour="stats-match-browser" class="lg:w-72 shrink-0">
        <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-sm font-bold text-gray-800 dark:text-gray-100">Concluded Matches</h2>
          </div>

          <div v-if="groupedRounds.length === 0" class="px-4 py-6 text-sm text-gray-400 dark:text-gray-500 text-center">
            No concluded matches yet.
          </div>

          <div v-else class="overflow-y-auto max-h-[calc(100vh-220px)]">
            <div v-for="group in groupedRounds" :key="group.roundNumber">
              <!-- Round header -->
              <button
                class="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                @click="toggleRound(group.roundNumber)"
              >
                <span>{{ group.roundName }}</span>
                <span class="text-gray-400">{{ expandedRounds.has(group.roundNumber) ? '▲' : '▼' }}</span>
              </button>

              <!-- Matches in this round -->
              <div v-if="expandedRounds.has(group.roundNumber)">
                <button
                  v-for="match in group.matches"
                  :key="match.id"
                  class="w-full text-left py-2.5 border-b border-gray-100 dark:border-gray-800 transition-colors text-sm border-l-2"
                  :class="
                    selectedMatch?.id === match.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-l-blue-500 pl-3.5 pr-4'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-transparent px-4'
                  "
                  @click="selectMatch(match)"
                >
                  <div
                    class="font-medium truncate"
                    :class="selectedMatch?.id === match.id ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-100'"
                  >
                    {{ match.homeTeamName }} v {{ match.awayTeamName }}
                  </div>
                  <div v-if="match.homeScore && match.awayScore" class="text-xs mt-0.5"
                    :class="selectedMatch?.id === match.id ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'"
                  >
                    {{ match.homeScore.totalScore }} – {{ match.awayScore.totalScore }}
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Right: Stats table -->
      <section data-tour="stats-panel" class="flex-1 min-w-0">
        <!-- No match selected -->
        <div
          v-if="!selectedMatch"
          class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center py-24 text-gray-400 dark:text-gray-500 text-sm"
        >
          Select a match to view player stats
        </div>

        <!-- Loading -->
        <div
          v-else-if="isLoadingStats"
          class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center py-24 text-gray-400 dark:text-gray-500 text-sm"
        >
          Loading stats…
        </div>

        <!-- Stats not yet fetched -->
        <div
          v-else-if="statsError"
          class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center py-24 text-center px-8"
        >
          <div>
            <p class="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">Stats not yet available</p>
            <p class="text-gray-400 dark:text-gray-500 text-xs">Check back after the next data fetch runs.</p>
          </div>
        </div>

        <!-- Stats table -->
        <div v-else-if="sortedRows.length > 0" class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div data-tour="stats-toolbar" class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 flex-wrap">
            <h2 class="text-sm font-bold text-gray-800 dark:text-gray-100">
              {{ selectedMatch.homeTeamName }} v {{ selectedMatch.awayTeamName }}
              <span class="font-normal text-gray-400 dark:text-gray-500 ml-1">— {{ selectedMatch.roundName }}</span>
            </h2>
            <div class="flex items-center gap-3 flex-wrap">
              <div class="flex gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <button
                  v-for="option in teamFilterOptions"
                  :key="option.value"
                  class="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors"
                  :class="teamFilter === option.value
                    ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
                  @click="teamFilter = option.value"
                >
                  <svg v-if="option.iconId" class="size-4 shrink-0">
                    <use :href="`${BASE_URL}icons.svg#${option.iconId}`" />
                  </svg>
                  {{ option.label }}
                </button>
              </div>
              <button
                ref="columnsButtonEl"
                data-tour="stats-columns-btn"
                class="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded border transition-colors"
                :class="columnsOpen
                  ? 'bg-blue-50 border-blue-300 text-blue-600 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-200'"
                @click="toggleColumnsPanel"
              >
                Columns{{ hiddenColumns.size > 0 ? ` (${hiddenColumns.size} hidden)` : '' }}
              </button>
              <span class="text-xs text-gray-400 dark:text-gray-500">{{ sortedRows.length }} players · click columns to sort</span>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="text-sm border-collapse">
              <thead>
                <tr class="bg-gray-50 dark:bg-gray-800">
                  <th class="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 py-2 pl-4 pr-3 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    Player
                  </th>
                  <th
                    v-for="col in statColumns"
                    :key="col.key"
                    class="py-2 px-3 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    :class="sortKey === col.key ? 'text-blue-600 dark:text-blue-400' : ''"
                    @click="setSort(col.key)"
                    @mouseenter="showTooltip($event, col.fullName)"
                    @mouseleave="tooltip.text = ''"
                  >
                    {{ col.label }}
                    <span v-if="sortKey === col.key" class="ml-0.5 text-xs">{{ sortDir === 'desc' ? '▼' : '▲' }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, i) in sortedRows"
                  :key="i"
                  class="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  :class="row.teamSide === 'home' ? '' : 'bg-gray-50/50 dark:bg-gray-800/20'"
                >
                  <td class="sticky left-0 z-10 py-1.5 pl-4 pr-3 font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap"
                    :class="row.teamSide === 'home' ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/80 dark:bg-gray-800/40'">
                    <button class="flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" @click="openPlayerOverlay(row)">
                      <svg class="size-5 shrink-0">
                        <use :href="`${BASE_URL}icons.svg#${row.iconId}`" />
                      </svg>
                      {{ row.name }}
                    </button>
                  </td>
                  <td
                    v-for="col in statColumns"
                    :key="col.key"
                    class="py-1.5 px-3 text-right tabular-nums text-gray-700 dark:text-gray-300"
                    :class="sortKey === col.key ? 'font-semibold text-blue-600 dark:text-blue-400' : ''"
                  >
                    {{ row[col.key] ?? 0 }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import type { AflMatch } from '../types/afl'
import { TEAMS } from '../composables/useAFLData'
import { getActiveSeasonYear } from '../config/seasons'
import { DATA_BASE, LEAGUE_CONFIG } from '../config/league'

// BASE_URL (app root, e.g. icons.svg) is intentionally NOT league-prefixed —
// only DATA_BASE (public/data/[aflw/]) is.
const BASE_URL = import.meta.env.BASE_URL
const SEASON = getActiveSeasonYear()
const teamIconMap = new Map(TEAMS.map((t) => [t.id, t.iconId]))
const teamAbbrMap = new Map(TEAMS.map((t) => [t.id, t.abbreviation]))

function deCamelCase(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^[a-z]/, (c) => c.toUpperCase())
}

const tooltip = reactive({ text: '', x: 0, y: 0 })

function showTooltip(e: MouseEvent, text: string) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  tooltip.text = text
  tooltip.x = rect.left + rect.width / 2
  tooltip.y = rect.bottom + 6
}

const props = defineProps<{
  matches: readonly AflMatch[]
  providerId?: string | null
}>()

const emit = defineEmits<{
  (e: 'select', providerId: string | null): void
}>()

// --- Round/match browser state ---

const selectedMatch = ref<AflMatch | null>(null)
const expandedRounds = ref<Set<number>>(new Set())

const concludedMatches = computed(() =>
  props.matches.filter((m) => m.status === 'CONCLUDED'),
)

const groupedRounds = computed(() => {
  const map = new Map<number, { roundNumber: number; roundName: string; matches: AflMatch[] }>()
  for (const m of concludedMatches.value) {
    if (!map.has(m.roundNumber)) {
      map.set(m.roundNumber, { roundNumber: m.roundNumber, roundName: m.roundName, matches: [] })
    }
    map.get(m.roundNumber)!.matches.push(m)
  }
  return [...map.values()].sort((a, b) => b.roundNumber - a.roundNumber)
})

// Auto-expand the most recent round on load (skipped if an initial match is being restored)
watch(
  groupedRounds,
  (groups) => {
    if (groups.length > 0 && expandedRounds.value.size === 0 && !props.providerId) {
      expandedRounds.value = new Set([groups[0].roundNumber])
    }
  },
  { immediate: true },
)


function toggleRound(roundNumber: number) {
  const next = new Set(expandedRounds.value)
  if (next.has(roundNumber)) {
    next.delete(roundNumber)
  } else {
    next.add(roundNumber)
  }
  expandedRounds.value = next
}

// --- Stats loading ---

interface StatRow {
  name: string
  team: string
  teamSide: 'home' | 'away'
  iconId: string
  [key: string]: string | number
}

const isLoadingStats = ref(false)
const statsError = ref<string | null>(null)
const rows = ref<StatRow[]>([])

const playerOverlay = ref<StatRow | null>(null)

const playerOverlayCats = computed(() => {
  const row = playerOverlay.value
  if (!row) return []
  return COLUMN_CATEGORIES.map((cat) => ({
    label: cat.label,
    stats: cat.keys
      .filter((k) => k in row && row[k] !== undefined)
      .map((k) => ({ key: k, fullName: deCamelCase(k), value: row[k] })),
  })).filter((cat) => cat.stats.length > 0)
})

function openPlayerOverlay(row: StatRow) {
  playerOverlay.value = row
}

// Ordered stat column keys to display (subset of what the API returns)
const STAT_COLUMN_KEYS = [
  // Core
  'disposals', 'kicks', 'handballs', 'marks', 'tackles', 'hitouts',
  'goals', 'behinds', 'goalAssists', 'clangers',
  'freesFor', 'freesAgainst', 'contestedPossessions', 'uncontestedPossessions',
  'inside50s', 'rebound50s', 'turnovers', 'intercepts', 'timeOnGroundPercentage',
  'metresGained', 'scoreInvolvements', 'onePercenters',
  'bounces', 'marksInside50', 'contestedMarks', 'shotsAtGoal',
  'totalPossessions', 'tacklesInside50', 'goalAccuracy', 'goalEfficiency',
  'shotEfficiency', 'interchangeCounts', 'dreamTeamPoints', 'ratingPoints',
  // Clearances (flattened from clearances sub-object)
  'totalClearances', 'centreClearances', 'stoppageClearances',
  // Extended stats (flattened from extendedStats sub-object)
  'effectiveKicks', 'kickEfficiency', 'effectiveDisposals', 'disposalEfficiency',
  'kickToHandballRatio', 'contestedPossessionRate',
  'groundBallGets', 'f50GroundBallGets', 'pressureActs', 'defHalfPressureActs',
  'scoreLaunches', 'spoils', 'interceptMarks', 'marksOnLead',
  'hitoutsToAdvantage', 'hitoutToAdvantageRate', 'hitoutWinPercentage',
  'ruckContests', 'centreBounceAttendances',
  'contestDefOneOnOnes', 'contestDefLosses', 'contestDefLossPercentage',
  'contestOffOneOnOnes', 'contestOffWins', 'contestOffWinsPercentage',
  'kickins', 'kickinsPlayon',
]

const EXCLUDED_KEYS = new Set(['name', 'team', 'teamSide', 'iconId'])

const COLUMN_CATEGORIES = [
  { label: 'Core', keys: ['disposals', 'kicks', 'handballs', 'marks', 'tackles', 'hitouts', 'goals', 'behinds', 'goalAssists', 'clangers', 'freesFor', 'freesAgainst', 'contestedPossessions', 'uncontestedPossessions', 'inside50s', 'rebound50s', 'turnovers', 'intercepts', 'timeOnGroundPercentage', 'metresGained', 'scoreInvolvements', 'onePercenters', 'bounces', 'marksInside50', 'contestedMarks', 'shotsAtGoal', 'totalPossessions', 'tacklesInside50', 'goalAccuracy', 'goalEfficiency', 'shotEfficiency', 'interchangeCounts', 'dreamTeamPoints', 'ratingPoints'] },
  { label: 'Clearances', keys: ['totalClearances', 'centreClearances', 'stoppageClearances'] },
  { label: 'Extended', keys: ['effectiveKicks', 'kickEfficiency', 'effectiveDisposals', 'disposalEfficiency', 'kickToHandballRatio', 'contestedPossessionRate', 'groundBallGets', 'f50GroundBallGets', 'pressureActs', 'defHalfPressureActs', 'scoreLaunches', 'spoils', 'interceptMarks', 'marksOnLead', 'hitoutsToAdvantage', 'hitoutToAdvantageRate', 'hitoutWinPercentage', 'ruckContests', 'centreBounceAttendances', 'contestDefOneOnOnes', 'contestDefLosses', 'contestDefLossPercentage', 'contestOffOneOnOnes', 'contestOffWins', 'contestOffWinsPercentage', 'kickins', 'kickinsPlayon'] },
]

const HIDDEN_COLS_KEY = `stats-hidden-columns${LEAGUE_CONFIG.lsSuffix}`
const hiddenColumns = ref<Set<string>>(
  new Set(JSON.parse(localStorage.getItem(HIDDEN_COLS_KEY) ?? '[]') as string[]),
)

const columnsOpen = ref(false)
const columnsButtonEl = ref<HTMLElement | null>(null)
const columnsPanelStyle = ref<Record<string, string>>({})

function toggleColumnsPanel() {
  columnsOpen.value = !columnsOpen.value
  if (columnsOpen.value && columnsButtonEl.value) {
    const rect = columnsButtonEl.value.getBoundingClientRect()
    columnsPanelStyle.value = {
      top: `${rect.bottom + window.scrollY + 4}px`,
      right: `${window.innerWidth - rect.right}px`,
    }
  }
}

function toggleColumn(key: string) {
  const next = new Set(hiddenColumns.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  hiddenColumns.value = next
  localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify([...next]))
}

function showAllColumns() {
  hiddenColumns.value = new Set()
  localStorage.setItem(HIDDEN_COLS_KEY, '[]')
}

function hideAllColumns() {
  const all = allColumns.value.map((c) => c.key)
  hiddenColumns.value = new Set(all)
  localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify(all))
}

// All columns present in the current match data (ignoring visibility)
const allColumns = computed(() => {
  if (rows.value.length === 0) return []
  const presentKeys = new Set(Object.keys(rows.value[0]).filter((k) => !EXCLUDED_KEYS.has(k)))
  return STAT_COLUMN_KEYS
    .filter((k) => presentKeys.has(k))
    .map((k) => ({ key: k, label: STAT_LABELS[k] ?? k, fullName: deCamelCase(k) }))
})

// Only columns the user hasn't hidden
const statColumns = computed(() =>
  allColumns.value.filter((col) => !hiddenColumns.value.has(col.key)),
)

// Grouped for the column editor panel
const categorizedColumns = computed(() => {
  const presentKeys = new Set(allColumns.value.map((c) => c.key))
  return COLUMN_CATEGORIES.map((cat) => ({
    label: cat.label,
    columns: cat.keys
      .filter((k) => presentKeys.has(k))
      .map((k) => ({ key: k, fullName: deCamelCase(k), visible: !hiddenColumns.value.has(k) })),
  })).filter((cat) => cat.columns.length > 0)
})

const STAT_LABELS: Record<string, string> = {
  // Core
  disposals: 'DIS',
  kicks: 'K',
  handballs: 'HB',
  marks: 'MK',
  tackles: 'T',
  hitouts: 'HO',
  goals: 'G',
  behinds: 'B',
  goalAssists: 'GA',
  clangers: 'CL',
  freesFor: 'FF',
  freesAgainst: 'FA',
  contestedPossessions: 'CP',
  uncontestedPossessions: 'UP',
  inside50s: 'I50',
  rebound50s: 'R50',
  turnovers: 'TO',
  intercepts: 'INT',
  timeOnGroundPercentage: 'TOG%',
  metresGained: 'MG',
  scoreInvolvements: 'SI',
  pressureActs: 'PA',
  onePercenters: '1%',
  bounces: 'BNC',
  marksInside50: 'MI50',
  contestedMarks: 'CM',
  shotsAtGoal: 'SAG',
  totalPossessions: 'TPOS',
  tacklesInside50: 'TI50',
  goalAccuracy: 'GA%',
  goalEfficiency: 'GE%',
  shotEfficiency: 'SE%',
  interchangeCounts: 'IC',
  dreamTeamPoints: 'DT',
  ratingPoints: 'RAT',
  // Clearances
  totalClearances: 'CLR',
  centreClearances: 'CC',
  stoppageClearances: 'SC',
  // Extended
  effectiveKicks: 'EK',
  kickEfficiency: 'KE%',
  effectiveDisposals: 'ED',
  disposalEfficiency: 'DE%',
  kickToHandballRatio: 'K:HB',
  contestedPossessionRate: 'CPR%',
  groundBallGets: 'GBG',
  f50GroundBallGets: 'F50G',
  scoreLaunches: 'SL',
  defHalfPressureActs: 'DPA',
  spoils: 'SPL',
  interceptMarks: 'IM',
  marksOnLead: 'MOL',
  hitoutsToAdvantage: 'HOA',
  hitoutToAdvantageRate: 'HOAR%',
  hitoutWinPercentage: 'HOW%',
  ruckContests: 'RC',
  centreBounceAttendances: 'CBA',
  contestDefOneOnOnes: 'D1O1',
  contestDefLosses: 'D1O1L',
  contestDefLossPercentage: 'D1O1L%',
  contestOffOneOnOnes: 'O1O1',
  contestOffWins: 'O1O1W',
  contestOffWinsPercentage: 'O1O1W%',
  kickins: 'KI',
  kickinsPlayon: 'KIPO',
}

const teamFilter = ref<'both' | 'home' | 'away'>('both')

const teamFilterOptions = computed(() => {
  if (!selectedMatch.value) return []
  const m = selectedMatch.value
  return [
    { value: 'both' as const, label: 'Both', iconId: null as string | null },
    { value: 'home' as const, label: teamAbbrMap.get(m.homeTeamId) ?? m.homeTeamName, iconId: teamIconMap.get(m.homeTeamId) ?? null },
    { value: 'away' as const, label: teamAbbrMap.get(m.awayTeamId) ?? m.awayTeamName, iconId: teamIconMap.get(m.awayTeamId) ?? null },
  ]
})

async function selectMatch(match: AflMatch) {
  selectedMatch.value = match
  emit('select', match.providerId)
  isLoadingStats.value = true
  statsError.value = null
  rows.value = []
  playerOverlay.value = null
  teamFilter.value = 'both'
  sortKey.value = 'disposals'
  sortDir.value = 'desc'

  try {
    const url = `${DATA_BASE}${SEASON}/stats/${match.providerId}.json`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    const d = data as Record<string, unknown>
    const homePlayers = (d.homeTeamPlayerStats ?? []) as Record<string, unknown>[]
    const awayPlayers = (d.awayTeamPlayerStats ?? []) as Record<string, unknown>[]

    const homeIconId = teamIconMap.get(match.homeTeamId) ?? ''
    const awayIconId = teamIconMap.get(match.awayTeamId) ?? ''
    rows.value = [
      ...parsePlayerRows(homePlayers, match.homeTeamName, 'home', homeIconId),
      ...parsePlayerRows(awayPlayers, match.awayTeamName, 'away', awayIconId),
    ]
  } catch {
    statsError.value = 'not-found'
  } finally {
    isLoadingStats.value = false
  }
}

function parsePlayerRows(
  players: Record<string, unknown>[],
  teamName: string,
  teamSide: 'home' | 'away',
  iconId: string,
): StatRow[] {
  return players.map((p) => {
    // Path: p.player.player.player.playerName.{givenName, surname}
    const playerWrapper = p.player as Record<string, unknown> | undefined
    const playerInner = playerWrapper?.player as Record<string, unknown> | undefined
    const playerCore = playerInner?.player as Record<string, unknown> | undefined
    const playerName = playerCore?.playerName as Record<string, string> | undefined
    const name = playerName
      ? `${playerName.givenName ?? ''} ${playerName.surname ?? ''}`.trim()
      : '?'

    // Path: p.playerStats.stats (flat numeric fields) + clearances sub-object
    const statsWrapper = p.playerStats as Record<string, unknown> | undefined
    const stats = statsWrapper?.stats as Record<string, unknown> | undefined
    const tog = statsWrapper?.timeOnGroundPercentage as number | undefined

    const clearances = stats?.clearances as Record<string, number> | undefined
    const extended = stats?.extendedStats as Record<string, number> | undefined

    const row: StatRow = { name, team: teamName, teamSide, iconId }
    for (const key of STAT_COLUMN_KEYS) {
      if (key === 'timeOnGroundPercentage') {
        row[key] = tog != null ? Math.round(tog) : 0
      } else if (clearances && key in clearances) {
        row[key] = clearances[key] ?? 0
      } else if (extended && key in extended) {
        row[key] = extended[key] ?? 0
      } else if (stats && key in stats) {
        row[key] = stats[key] as number
      }
    }
    return row
  })
}

// --- Sorting ---

const sortKey = ref('disposals')
const sortDir = ref<'asc' | 'desc'>('desc')

function setSort(key: string) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}

// --- Match auto-selection (from URL param or click navigation) ---

function trySelectFromProviderId() {
  const id = props.providerId
  if (!id || selectedMatch.value?.providerId === id || props.matches.length === 0) return
  const match = props.matches.find((m) => m.providerId === id)
  if (match) {
    expandedRounds.value = new Set([match.roundNumber])
    selectMatch(match)
  }
}

// Fires when matches load (URL reload) or when providerId prop changes
watch([() => props.matches, () => props.providerId], trySelectFromProviderId, { immediate: true })
// Fires after mount, catching click-navigation where immediate fires before refs are ready
onMounted(trySelectFromProviderId)

const sortedRows = computed(() => {
  const key = sortKey.value
  const dir = sortDir.value
  const source = teamFilter.value === 'both'
    ? rows.value
    : rows.value.filter((r) => r.teamSide === teamFilter.value)
  return [...source].sort((a, b) => {
    const av = (a[key] as number) ?? 0
    const bv = (b[key] as number) ?? 0
    return dir === 'desc' ? bv - av : av - bv
  })
})
</script>
