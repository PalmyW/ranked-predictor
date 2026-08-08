<template>
  <Teleport to="body">
    <template v-if="playerOverlay">
      <div class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" @click="playerOverlay = null" />
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div class="pointer-events-auto w-full max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xl">
          <div class="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <svg class="size-8 shrink-0">
              <use :href="`${BASE_URL}icons.svg#${playerOverlay.iconId}`" />
            </svg>
            <div class="min-w-0">
              <div class="font-bold text-gray-900 dark:text-gray-100 text-base">{{ playerOverlay.name }}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500">
                {{ playerOverlay.position }} · {{ playerOverlay.gamesPlayed }} game{{ playerOverlay.gamesPlayed === 1 ? '' : 's' }} · {{ mode === 'totals' ? 'Season totals' : 'Per-game averages' }}
              </div>
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
                  <dd class="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ stat.value ?? '—' }}</dd>
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
      <!-- Left: Team browser -->
      <aside data-tour="season-team-browser" class="lg:w-72 shrink-0">
        <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-sm font-bold text-gray-800 dark:text-gray-100">Teams</h2>
          </div>
          <div>
            <button
              v-for="team in sortedTeams"
              :key="team.id"
              class="w-full flex items-center gap-3 py-2.5 border-b border-gray-100 dark:border-gray-800 transition-colors text-sm border-l-2"
              :class="selectedTeam?.id === team.id
                ? 'bg-blue-50 dark:bg-blue-900/20 border-l-blue-500 pl-3.5 pr-4'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-transparent px-4'"
              @click="selectTeam(team)"
            >
              <svg class="size-6 shrink-0">
                <use :href="`${BASE_URL}icons.svg#${team.iconId}`" />
              </svg>
              <span
                class="text-left"
                :class="selectedTeam?.id === team.id ? 'text-blue-700 dark:text-blue-300 font-medium' : 'text-gray-800 dark:text-gray-100'"
              >
                {{ team.name }}
              </span>
            </button>
          </div>
        </div>
      </aside>

      <!-- Right: Stats panel -->
      <section class="flex-1 min-w-0">
        <div
          v-if="!selectedTeam"
          class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center py-24 text-gray-400 dark:text-gray-500 text-sm"
        >
          Select a team to view season stats
        </div>

        <div
          v-else-if="isLoadingStats"
          class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center py-24 text-gray-400 dark:text-gray-500 text-sm"
        >
          Loading stats…
        </div>

        <div
          v-else-if="statsError"
          class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center py-24 text-center px-8"
        >
          <div>
            <p class="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">Stats not yet available</p>
            <p class="text-gray-400 dark:text-gray-500 text-xs">Check back after the next data fetch runs.</p>
          </div>
        </div>

        <div v-else-if="sortedRows.length > 0" data-tour="season-stats-table" class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-2.5">
              <svg class="size-7 shrink-0">
                <use :href="`${BASE_URL}icons.svg#${selectedTeam.iconId}`" />
              </svg>
              <h2 class="text-sm font-bold text-gray-800 dark:text-gray-100">
                {{ selectedTeam.name }}
                <span class="font-normal text-gray-400 dark:text-gray-500 ml-1">— 2026 Season</span>
              </h2>
            </div>
            <div class="flex items-center gap-3 flex-wrap">
              <!-- Totals / Averages toggle -->
              <div data-tour="season-mode-toggle" class="flex gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <button
                  v-for="opt in MODE_OPTIONS"
                  :key="opt.value"
                  class="px-3 py-1 text-xs font-semibold rounded-md transition-colors"
                  :class="mode === opt.value
                    ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
                  @click="mode = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
              <button
                ref="columnsButtonEl"
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
                >
                  <td class="sticky left-0 z-10 py-1.5 pl-4 pr-3 font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap bg-white dark:bg-gray-900">
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
                    {{ row[col.key] ?? '—' }}
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
import { ref, reactive, computed, watch } from 'vue'
import type { AflTeam } from '../types/afl'
import { TEAMS } from '../composables/useAFLData'
import { getActiveSeasonYear } from '../config/seasons'
import { DATA_BASE, LEAGUE_CONFIG } from '../config/league'

// BASE_URL (app root, e.g. icons.svg) is intentionally NOT league-prefixed —
// only DATA_BASE (public/data/[aflw/]) is.
const BASE_URL = import.meta.env.BASE_URL
const SEASON = getActiveSeasonYear()

const MODE_OPTIONS = [
  { value: 'averages' as const, label: 'Averages' },
  { value: 'totals' as const, label: 'Totals' },
]

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

// --- Team list ---

const sortedTeams = computed(() =>
  [...TEAMS].sort((a, b) => a.name.localeCompare(b.name)),
)

const selectedTeam = ref<AflTeam | null>(null)

async function selectTeam(team: AflTeam) {
  if (selectedTeam.value?.id === team.id) return
  selectedTeam.value = team
  playerOverlay.value = null
  sortKey.value = 'disposals'
  sortDir.value = 'desc'
  await loadTeamStats(team)
}

// --- Stats loading ---

interface SeasonPlayer {
  playerId: string
  givenName: string
  surname: string
  position: string
  jumperNumber: number | null
  photoURL: string
  gamesPlayed: number
  totals: Record<string, number>
  averages: Record<string, number>
}

interface SeasonRow {
  name: string
  position: string
  gamesPlayed: number
  iconId: string
  [key: string]: string | number | null
}

const isLoadingStats = ref(false)
const statsError = ref(false)
const teamPlayers = ref<SeasonPlayer[]>([])

async function loadTeamStats(team: AflTeam) {
  isLoadingStats.value = true
  statsError.value = false
  teamPlayers.value = []

  try {
    const url = `${DATA_BASE}${SEASON}/team-stats/${team.teamProviderId}.json`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    teamPlayers.value = data.players ?? []
  } catch {
    statsError.value = true
  } finally {
    isLoadingStats.value = false
  }
}

// --- Mode toggle ---

const mode = ref<'totals' | 'averages'>('averages')

// --- Row computation ---

const rows = computed<SeasonRow[]>(() => {
  if (!selectedTeam.value || teamPlayers.value.length === 0) return []
  const iconId = selectedTeam.value.iconId
  return teamPlayers.value.map((player) => {
    const stats = mode.value === 'totals' ? player.totals : player.averages
    const row: SeasonRow = {
      name: `${player.givenName} ${player.surname}`.trim(),
      position: player.position,
      gamesPlayed: player.gamesPlayed,
      iconId,
    }
    for (const key of STAT_COLUMN_KEYS) {
      const isPercentage = (STAT_LABELS[key] ?? '').includes('%')
      // Preserve null ("not recorded") rather than coercing to 0 — older seasons
      // legitimately lack advanced stats, and that's distinct from a real zero.
      row[key] = (isPercentage ? player.averages : stats)[key] ?? null
    }
    row['gamesPlayed'] = player.gamesPlayed
    return row
  })
})

const playerOverlay = ref<SeasonRow | null>(null)

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

function openPlayerOverlay(row: SeasonRow) {
  playerOverlay.value = row
}

// Close overlay when mode changes so values stay accurate
watch(mode, () => {
  playerOverlay.value = null
})

// --- Column definitions ---

const STAT_COLUMN_KEYS = [
  // Core
  'gamesPlayed', 'disposals', 'kicks', 'handballs', 'marks', 'tackles', 'hitouts',
  'goals', 'behinds', 'goalAssists', 'clangers',
  'freesFor', 'freesAgainst', 'contestedPossessions', 'uncontestedPossessions',
  'inside50s', 'rebound50s', 'turnovers', 'intercepts', 'timeOnGroundPercentage',
  'metresGained', 'scoreInvolvements', 'onePercenters',
  'bounces', 'marksInside50', 'contestedMarks', 'shotsAtGoal',
  'totalPossessions', 'tacklesInside50', 'goalAccuracy', 'dreamTeamPoints', 'ratingPoints',
  // Clearances
  'totalClearances', 'centreClearances', 'stoppageClearances',
  // Extended
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

const COLUMN_CATEGORIES = [
  { label: 'Core', keys: ['gamesPlayed', 'disposals', 'kicks', 'handballs', 'marks', 'tackles', 'hitouts', 'goals', 'behinds', 'goalAssists', 'clangers', 'freesFor', 'freesAgainst', 'contestedPossessions', 'uncontestedPossessions', 'inside50s', 'rebound50s', 'turnovers', 'intercepts', 'timeOnGroundPercentage', 'metresGained', 'scoreInvolvements', 'onePercenters', 'bounces', 'marksInside50', 'contestedMarks', 'shotsAtGoal', 'totalPossessions', 'tacklesInside50', 'goalAccuracy', 'dreamTeamPoints', 'ratingPoints'] },
  { label: 'Clearances', keys: ['totalClearances', 'centreClearances', 'stoppageClearances'] },
  { label: 'Extended', keys: ['effectiveKicks', 'kickEfficiency', 'effectiveDisposals', 'disposalEfficiency', 'kickToHandballRatio', 'contestedPossessionRate', 'groundBallGets', 'f50GroundBallGets', 'pressureActs', 'defHalfPressureActs', 'scoreLaunches', 'spoils', 'interceptMarks', 'marksOnLead', 'hitoutsToAdvantage', 'hitoutToAdvantageRate', 'hitoutWinPercentage', 'ruckContests', 'centreBounceAttendances', 'contestDefOneOnOnes', 'contestDefLosses', 'contestDefLossPercentage', 'contestOffOneOnOnes', 'contestOffWins', 'contestOffWinsPercentage', 'kickins', 'kickinsPlayon'] },
]

const STAT_LABELS: Record<string, string> = {
  gamesPlayed: 'Games',
  disposals: 'DIS', kicks: 'K', handballs: 'HB', marks: 'MK', tackles: 'T',
  hitouts: 'HO', goals: 'G', behinds: 'B', goalAssists: 'GA', clangers: 'CL',
  freesFor: 'FF', freesAgainst: 'FA', contestedPossessions: 'CP', uncontestedPossessions: 'UP',
  inside50s: 'I50', rebound50s: 'R50', turnovers: 'TO', intercepts: 'INT',
  timeOnGroundPercentage: 'TOG%', metresGained: 'MG', scoreInvolvements: 'SI',
  pressureActs: 'PA', onePercenters: '1%', bounces: 'BNC', marksInside50: 'MI50',
  contestedMarks: 'CM', shotsAtGoal: 'SAG', totalPossessions: 'TPOS',
  tacklesInside50: 'TI50', goalAccuracy: 'GA%', dreamTeamPoints: 'DT', ratingPoints: 'RAT',
  totalClearances: 'CLR', centreClearances: 'CC', stoppageClearances: 'SC',
  effectiveKicks: 'EK', kickEfficiency: 'KE%', effectiveDisposals: 'ED',
  disposalEfficiency: 'DE%', kickToHandballRatio: 'K:HB', contestedPossessionRate: 'CPR%',
  groundBallGets: 'GBG', f50GroundBallGets: 'F50G', scoreLaunches: 'SL',
  defHalfPressureActs: 'DPA', spoils: 'SPL', interceptMarks: 'IM', marksOnLead: 'MOL',
  hitoutsToAdvantage: 'HOA', hitoutToAdvantageRate: 'HOAR%', hitoutWinPercentage: 'HOW%',
  ruckContests: 'RC', centreBounceAttendances: 'CBA',
  contestDefOneOnOnes: 'D1O1', contestDefLosses: 'D1O1L', contestDefLossPercentage: 'D1O1L%',
  contestOffOneOnOnes: 'O1O1', contestOffWins: 'O1O1W', contestOffWinsPercentage: 'O1O1W%',
  kickins: 'KI', kickinsPlayon: 'KIPO',
}

const HIDDEN_COLS_KEY = `season-stats-hidden-columns${LEAGUE_CONFIG.lsSuffix}`
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

const allColumns = computed(() => {
  if (rows.value.length === 0) return []
  const presentKeys = new Set(
    Object.keys(rows.value[0]).filter((k) => !['name', 'position', 'iconId'].includes(k)),
  )
  return STAT_COLUMN_KEYS
    .filter((k) => presentKeys.has(k))
    .map((k) => ({ key: k, label: STAT_LABELS[k] ?? k, fullName: deCamelCase(k) }))
})

const statColumns = computed(() =>
  allColumns.value.filter((col) => !hiddenColumns.value.has(col.key)),
)

const categorizedColumns = computed(() => {
  const presentKeys = new Set(allColumns.value.map((c) => c.key))
  return COLUMN_CATEGORIES.map((cat) => ({
    label: cat.label,
    columns: cat.keys
      .filter((k) => presentKeys.has(k))
      .map((k) => ({ key: k, fullName: deCamelCase(k), visible: !hiddenColumns.value.has(k) })),
  })).filter((cat) => cat.columns.length > 0)
})

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

const sortedRows = computed(() => {
  const key = sortKey.value
  const dir = sortDir.value
  return [...rows.value].sort((a, b) => {
    const av = a[key] as number | null | undefined
    const bv = b[key] as number | null | undefined
    // "Not recorded" (null) always sorts to the bottom, regardless of direction.
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return dir === 'desc' ? bv - av : av - bv
  })
})
</script>
