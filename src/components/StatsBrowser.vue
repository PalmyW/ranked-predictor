<template>
  <Teleport to="body">
    <div
      v-if="tooltip.text"
      class="fixed z-50 pointer-events-none px-2 py-1 rounded bg-gray-900 dark:bg-gray-700 text-white text-xs whitespace-nowrap shadow-lg -translate-x-1/2"
      :style="{ top: tooltip.y + 'px', left: tooltip.x + 'px' }"
    >{{ tooltip.text }}</div>
  </Teleport>

  <div class="max-w-6xl mx-auto px-4 py-6">
    <div class="flex flex-col lg:flex-row gap-6">
      <!-- Left: Round/match browser -->
      <aside class="lg:w-72 shrink-0">
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
                  class="w-full text-left px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 transition-colors text-sm"
                  :class="
                    selectedMatch?.id === match.id
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  "
                  @click="selectMatch(match)"
                >
                  <div class="font-medium text-gray-800 dark:text-gray-100 truncate">
                    {{ match.homeTeamName }} v {{ match.awayTeamName }}
                  </div>
                  <div v-if="match.homeScore && match.awayScore" class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {{ match.homeScore.totalScore }} – {{ match.awayScore.totalScore }}
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Right: Stats table -->
      <section class="flex-1 min-w-0">
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
          <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 flex-wrap">
            <h2 class="text-sm font-bold text-gray-800 dark:text-gray-100">
              {{ selectedMatch.homeTeamName }} v {{ selectedMatch.awayTeamName }}
              <span class="font-normal text-gray-400 dark:text-gray-500 ml-1">— {{ selectedMatch.roundName }}</span>
            </h2>
            <span class="text-xs text-gray-400 dark:text-gray-500">{{ sortedRows.length }} players · click columns to sort</span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="bg-gray-50 dark:bg-gray-800">
                  <th class="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 py-2 pl-4 pr-3 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    Player
                  </th>
                  <th class="py-2 px-3 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    Team
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
                    {{ row.name }}
                  </td>
                  <td class="py-1.5 px-3 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">{{ row.team }}</td>
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
import { ref, reactive, computed, watch } from 'vue'
import type { AflMatch } from '../types/afl'

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
  initialProviderId?: string | null
}>()

const emit = defineEmits<{
  (e: 'matchChanged', providerId: string | null): void
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
    if (groups.length > 0 && expandedRounds.value.size === 0 && !props.initialProviderId) {
      expandedRounds.value = new Set([groups[0].roundNumber])
    }
  },
  { immediate: true },
)

// Auto-select match from URL on load
watch(
  () => props.matches,
  (matches) => {
    if (!props.initialProviderId || selectedMatch.value || matches.length === 0) return
    const match = matches.find((m) => m.providerId === props.initialProviderId)
    if (match) {
      expandedRounds.value = new Set([match.roundNumber])
      selectMatch(match)
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
  [key: string]: string | number
}

const isLoadingStats = ref(false)
const statsError = ref<string | null>(null)
const rows = ref<StatRow[]>([])

// Ordered stat column keys to display (subset of what the API returns)
const STAT_COLUMN_KEYS = [
  // Core
  'disposals', 'kicks', 'handballs', 'marks', 'tackles', 'hitouts',
  'goals', 'behinds', 'goalAssists', 'clangers',
  'freesFor', 'freesAgainst', 'contestedPossessions', 'uncontestedPossessions',
  'inside50s', 'rebound50s', 'turnovers', 'intercepts', 'timeOnGroundPercentage',
  'metresGained', 'scoreInvolvements', 'onePercenters',
  'bounces', 'marksInside50', 'contestedMarks', 'shotsAtGoal',
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

const statColumns = computed(() => {
  if (rows.value.length === 0) return []
  const presentKeys = new Set(
    Object.keys(rows.value[0]).filter((k) => k !== 'name' && k !== 'team' && k !== 'teamSide'),
  )
  return STAT_COLUMN_KEYS
    .filter((k) => presentKeys.has(k))
    .map((k) => ({ key: k, label: STAT_LABELS[k] ?? k, fullName: deCamelCase(k) }))
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
  contestDefOneOnOnes: 'CD1',
  contestDefLosses: 'CDL',
  contestDefLossPercentage: 'CDL%',
  contestOffOneOnOnes: 'CO1',
  contestOffWins: 'COW',
  contestOffWinsPercentage: 'COW%',
  kickins: 'KI',
  kickinsPlayon: 'KIPO',
}

async function selectMatch(match: AflMatch) {
  selectedMatch.value = match
  emit('matchChanged', match.providerId)
  isLoadingStats.value = true
  statsError.value = null
  rows.value = []
  sortKey.value = 'disposals'
  sortDir.value = 'desc'

  try {
    const url = `${import.meta.env.BASE_URL}data/stats/${match.providerId}.json`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    const d = data as Record<string, unknown>
    const homePlayers = (d.homeTeamPlayerStats ?? []) as Record<string, unknown>[]
    const awayPlayers = (d.awayTeamPlayerStats ?? []) as Record<string, unknown>[]

    rows.value = [
      ...parsePlayerRows(homePlayers, match.homeTeamName, 'home'),
      ...parsePlayerRows(awayPlayers, match.awayTeamName, 'away'),
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

    const row: StatRow = { name, team: teamName, teamSide }
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

const sortedRows = computed(() => {
  const key = sortKey.value
  const dir = sortDir.value
  return [...rows.value].sort((a, b) => {
    const av = (a[key] as number) ?? 0
    const bv = (b[key] as number) ?? 0
    return dir === 'desc' ? bv - av : av - bv
  })
})
</script>
