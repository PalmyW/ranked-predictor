<template>
  <!-- Palmy hover popup -->
  <Teleport to="body">
    <div
      v-if="hoveredTeamId !== null && selectedId === 'palmy'"
      class="fixed z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl text-xs overflow-hidden"
      :style="popupStyle"
      @mouseenter="cancelHoverClear"
      @mouseleave="scheduleHoverClear"
    >
      <!-- Header -->
      <div class="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60">
        <div class="font-bold text-gray-800 dark:text-gray-100 text-sm mb-2">{{ hoveredTeamName }}</div>
        <!-- Tabs -->
        <div class="flex gap-1">
          <button
            v-for="tab in POPUP_TABS"
            :key="tab.id"
            @click="popupTab = tab.id"
            class="px-2.5 py-1 rounded-md font-semibold transition-colors"
            :class="popupTab === tab.id
              ? 'bg-blue-600 text-white'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
          >{{ tab.label }}</button>
        </div>
      </div>

      <!-- Tab: Opponent Ladder -->
      <template v-if="popupTab === 'own'">
        <div class="px-3 py-1.5 text-gray-400 dark:text-gray-500 border-b border-gray-50 dark:border-gray-800">
          Opponents ranked by their margin vs {{ hoveredTeamName }}
        </div>
        <div class="overflow-y-auto" style="max-height: 380px">
          <div v-if="hoveredLadder.length === 0" class="px-3 py-4 text-gray-400 dark:text-gray-500 text-center">
            No concluded matches
          </div>
          <div
            v-for="entry in hoveredLadder"
            :key="`${entry.teamId}-${entry.roundNumber}`"
            class="flex items-center gap-2 px-3 py-1.5 border-b border-gray-50 dark:border-gray-800/60 last:border-0"
          >
            <span class="w-5 text-right text-gray-400 dark:text-gray-500 shrink-0 tabular-nums">{{ entry.rank }}</span>
            <svg class="size-5 shrink-0"><use :href="`${BASE_URL}icons.svg#${entry.iconId}`" /></svg>
            <span class="flex-1 text-gray-800 dark:text-gray-100 font-medium truncate">{{ entry.teamName }}</span>
            <span
              class="shrink-0 tabular-nums font-semibold w-10 text-right"
              :class="entry.differential > 0 ? 'text-red-500 dark:text-red-400' : entry.differential < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400'"
            >{{ entry.differential > 0 ? '+' : '' }}{{ entry.differential }}</span>
            <span class="shrink-0 text-gray-400 dark:text-gray-500 w-7 text-right">R{{ entry.roundNumber }}</span>
          </div>
        </div>
        <div class="px-3 py-1.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 text-gray-400 dark:text-gray-500">
          <span class="text-red-500">+</span> = opponent won &nbsp;·&nbsp; <span class="text-green-600">−</span> = {{ hoveredTeamName }} won
        </div>
      </template>

      <!-- Tab: League Positions -->
      <template v-else>
        <div class="px-3 py-1.5 border-b border-gray-50 dark:border-gray-800 text-gray-400 dark:text-gray-500">
          <span v-if="hoveredTeamPositions.length > 0">
            Avg position:
            <span class="font-bold text-gray-700 dark:text-gray-200">{{ hoveredAvgPosition }}</span>
            across {{ hoveredTeamPositions.length }} appearance{{ hoveredTeamPositions.length === 1 ? '' : 's' }}
          </span>
          <span v-else>No appearances yet</span>
        </div>
        <div class="overflow-y-auto" style="max-height: 380px">
          <div v-if="hoveredTeamPositions.length === 0" class="px-3 py-4 text-gray-400 dark:text-gray-500 text-center">
            No concluded matches
          </div>
          <div
            v-for="(pos, i) in hoveredTeamPositions"
            :key="i"
            class="flex items-center gap-2 px-3 py-1.5 border-b border-gray-50 dark:border-gray-800/60 last:border-0"
          >
            <!-- Rank in that team's ladder -->
            <span
              class="w-12 text-right tabular-nums font-bold shrink-0"
              :class="positionClass(pos.rank, pos.ladderSize)"
            >#{{ pos.rank }}<span class="font-normal text-gray-300 dark:text-gray-600">/{{ pos.ladderSize }}</span></span>
            <svg class="size-5 shrink-0"><use :href="`${BASE_URL}icons.svg#${pos.ownerIconId}`" /></svg>
            <span class="flex-1 text-gray-800 dark:text-gray-100 font-medium truncate">{{ pos.ownerName }}</span>
            <!-- Y's margin in that match -->
            <span
              class="shrink-0 tabular-nums font-semibold w-10 text-right"
              :class="pos.differential > 0 ? 'text-green-600 dark:text-green-400' : pos.differential < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'"
            >{{ pos.differential > 0 ? '+' : '' }}{{ pos.differential }}</span>
            <span class="shrink-0 text-gray-400 dark:text-gray-500 w-7 text-right">R{{ pos.roundNumber }}</span>
          </div>
        </div>
        <div class="px-3 py-1.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 text-gray-400 dark:text-gray-500">
          #rank/size in that team's ladder &nbsp;·&nbsp; <span class="text-green-600">+</span> = {{ hoveredTeamName }} won
        </div>
      </template>
    </div>
  </Teleport>

  <main class="max-w-4xl mx-auto px-4 py-6">
    <div class="mb-6">
      <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Algorithm Rankings</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Different statistical methods for ranking teams when schedules are uneven. Each algorithm uses only concluded match results.
      </p>
    </div>

    <!-- Algorithm selector -->
    <div data-tour="rankings-algo-selector" class="flex flex-wrap gap-2 mb-4">
      <button
        v-for="algo in ALGORITHMS"
        :key="algo.id"
        @click="selectedId = algo.id"
        class="px-3 py-1.5 rounded-full text-sm font-semibold transition-colors border"
        :class="selectedId === algo.id
          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
          : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400'"
      >
        {{ algo.name }}
      </button>
    </div>

    <!-- Algorithm description + view toggle -->
    <div class="flex items-start gap-3 mb-5">
      <div class="flex-1 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-300">
        {{ selectedAlgo.description }}
      </div>
      <!-- Table / Graph toggle -->
      <div class="shrink-0 flex overflow-hidden rounded border border-gray-300 dark:border-gray-600 self-center">
        <button
          @click="activeView = 'table'"
          class="px-3 py-1.5 text-xs font-semibold transition-colors"
          :class="activeView === 'table'
            ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900'
            : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
        >Table</button>
        <button
          @click="activeView = 'graph'"
          class="border-l border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-semibold transition-colors"
          :class="activeView === 'graph'
            ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900'
            : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
        >Graph</button>
      </div>
    </div>

    <!-- Ranking table -->
    <div v-if="activeView === 'table'" data-tour="rankings-table" class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div v-if="isLoading" class="space-y-px p-1">
        <div v-for="n in 18" :key="n" class="h-9 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      </div>

      <table v-else class="w-full text-sm table-fixed border-collapse">
        <thead>
          <tr class="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">
            <th class="w-8 py-2 text-center font-semibold">#</th>
            <th class="py-2 text-left pl-3 font-semibold">Team</th>
            <th class="w-8 py-2 text-center font-semibold hidden sm:table-cell">W</th>
            <th class="w-8 py-2 text-center font-semibold hidden sm:table-cell">L</th>
            <th class="w-8 py-2 text-center font-semibold hidden sm:table-cell">D</th>
            <th class="w-20 py-2 text-center font-semibold">{{ selectedAlgo.ratingLabel }}</th>
            <th class="w-14 py-2 text-center font-semibold text-gray-400 dark:text-gray-500" title="vs official AFL ladder">vs AFL</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in currentRanking"
            :key="row.teamId"
            class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            :class="{
              'border-b-2 border-blue-400': i === 7,
              'border-b border-gray-100 dark:border-gray-800': i !== 7,
            }"
            @mouseenter="selectedId === 'palmy' ? onRowEnter(row.teamId, $event) : undefined"
            @mouseleave="selectedId === 'palmy' ? scheduleHoverClear() : undefined"
          >
            <td class="py-2 text-center text-gray-500 dark:text-gray-500 text-xs">{{ row.rank }}</td>
            <td class="py-2 pl-3 font-medium text-gray-800 dark:text-gray-200">
              <span class="flex items-center gap-1.5">
                <svg class="size-6 shrink-0">
                  <use :href="`${BASE_URL}icons.svg#${row.iconId}`" />
                </svg>
                <span class="hidden sm:inline">{{ row.teamName }}</span>
                <span class="sm:hidden">{{ row.abbreviation }}</span>
              </span>
            </td>
            <td class="py-2 text-center text-gray-600 dark:text-gray-400 hidden sm:table-cell">{{ row.wins }}</td>
            <td class="py-2 text-center text-gray-600 dark:text-gray-400 hidden sm:table-cell">{{ row.losses }}</td>
            <td class="py-2 text-center text-gray-600 dark:text-gray-400 hidden sm:table-cell">{{ row.draws }}</td>
            <td class="py-2 text-center font-semibold tabular-nums text-gray-800 dark:text-gray-200 text-xs">
              {{ formatRating(row.rating) }}
            </td>
            <td class="py-2 text-center text-xs font-bold tabular-nums">
              <span v-if="vsAflDelta(row) > 0" class="text-green-600 dark:text-green-400">▲{{ vsAflDelta(row) }}</span>
              <span v-else-if="vsAflDelta(row) < 0" class="text-red-500 dark:text-red-400">▼{{ Math.abs(vsAflDelta(row)) }}</span>
              <span v-else class="text-gray-300 dark:text-gray-600">—</span>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="!isLoading && currentRanking.length === 0" class="text-gray-400 dark:text-gray-600 text-sm text-center py-10">
        No concluded matches yet
      </p>
    </div>

    <!-- Graph view -->
    <div
      v-else
      data-tour="rankings-table"
      class="rounded-lg overflow-hidden select-none"
      style="background: #0a0d14"
    >
      <div v-if="concludedRounds.length < 2" class="py-12 text-center text-sm text-gray-500">
        Need at least 2 rounds of concluded matches to show the graph
      </div>

      <svg
        v-else
        viewBox="0 0 600 450"
        class="w-full"
        style="overflow: visible"
        aria-label="Algorithm rankings worm chart"
      >
        <!-- Top 4 reference line -->
        <line
          :x1="CHART.x0" :y1="yRef4" :x2="CHART.x1" :y2="yRef4"
          stroke="rgba(239,68,68,0.3)" stroke-width="1" stroke-dasharray="4,3"
        />
        <!-- Top 8 reference line -->
        <line
          :x1="CHART.x0" :y1="yRef8" :x2="CHART.x1" :y2="yRef8"
          stroke="rgba(59,130,246,0.3)" stroke-width="1" stroke-dasharray="4,3"
        />

        <!-- Y-axis position labels -->
        <text
          v-for="pos in [1, 4, 5, 8, 9, 14, 18]"
          :key="pos"
          :x="CHART.x0 - 4"
          :y="yScale(pos) + 3.5"
          text-anchor="end"
          font-size="8"
          font-family="system-ui,sans-serif"
          fill="rgba(255,255,255,0.3)"
        >{{ pos }}</text>

        <!-- X-axis gridlines + round labels -->
        <g v-for="(r, idx) in concludedRounds" :key="`xcol-${r}`">
          <line
            :x1="xScale(idx)" :y1="CHART.y0"
            :x2="xScale(idx)" :y2="CHART.y1"
            stroke="rgba(255,255,255,0.05)" stroke-width="1"
          />
          <text
            :x="xScale(idx)"
            :y="CHART.y1 + 5"
            text-anchor="end"
            font-size="8"
            font-family="system-ui,sans-serif"
            fill="rgba(255,255,255,0.3)"
            :transform="`rotate(-45, ${xScale(idx)}, ${CHART.y1 + 5})`"
          >Rd {{ r }}</text>
        </g>

        <!-- Team worm lines -->
        <path
          v-for="d in wormData"
          :key="`line-${d.team.id}`"
          :d="buildWormPath(d.points)"
          fill="none"
          :stroke="d.color"
          stroke-width="2"
          stroke-opacity="0.85"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- Team logos at final position -->
        <g v-for="d in wormData" :key="`logo-${d.team.id}`">
          <template v-if="d.points.length">
            <circle
              :cx="CHART.x1 + 16"
              :cy="d.points[d.points.length - 1].y"
              r="13"
              fill="#0a0d14"
            />
            <circle
              :cx="CHART.x1 + 16"
              :cy="d.points[d.points.length - 1].y"
              r="12"
              fill="none"
              :stroke="d.color"
              stroke-width="1"
              stroke-opacity="0.5"
            />
            <svg
              :x="CHART.x1 + 4"
              :y="d.points[d.points.length - 1].y - 12"
              width="24"
              height="24"
              overflow="visible"
            >
              <use :href="`${BASE_URL}icons.svg#${d.team.iconId}`" />
            </svg>
          </template>
        </g>
      </svg>
    </div>

    <!-- Legend -->
    <div class="mt-3 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
      <span class="flex items-center gap-1.5">
        <span class="inline-block w-4 border-b-2 border-blue-400"></span>
        Finals cut-off (top 8)
      </span>
      <span v-if="activeView === 'table'">vs AFL = difference from the official points-based ladder position</span>
      <span v-if="selectedId === 'palmy' && activeView === 'table'">Hover a team to see their Palmy data</span>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAFLData, TEAMS } from '../composables/useAFLData'
import { useAlgorithmRankings, ALGORITHMS, computeAlgorithmRanking } from '../composables/useAlgorithmRankings'
import type { AlgorithmId, AlgorithmRankRow } from '../composables/useAlgorithmRankings'

const BASE_URL = import.meta.env.BASE_URL

const { matches, isLoading } = useAFLData()
const { winPctRanking, srsRanking, colleyRanking, masseyRanking, winFlowRanking, palmyRanking, palmyOpponentLadders } = useAlgorithmRankings(matches)

const selectedId = ref<AlgorithmId>('srs')
const activeView = ref<'table' | 'graph'>('table')
const selectedAlgo = computed(() => ALGORITHMS.find((a) => a.id === selectedId.value)!)

const currentRanking = computed<AlgorithmRankRow[]>(() => {
  switch (selectedId.value) {
    case 'winpct':  return winPctRanking.value
    case 'srs':     return srsRanking.value
    case 'colley':  return colleyRanking.value
    case 'massey':  return masseyRanking.value
    case 'winflow': return winFlowRanking.value
    case 'palmy':   return palmyRanking.value
  }
})

function vsAflDelta(row: AlgorithmRankRow): number {
  return row.officialRank - row.rank
}

function formatRating(v: number): string {
  switch (selectedId.value) {
    case 'winpct':  return `${(v * 100).toFixed(1)}%`
    case 'srs':
    case 'massey':  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`
    case 'colley':  return v.toFixed(3)
    case 'winflow': return v.toFixed(4)
    case 'palmy':   return v === -999 ? '—' : ((1 + v) * 100).toFixed(1)
  }
}

// --- Worm chart ---

const TEAM_COLORS: Record<number, string> = {
  1:  '#E6002D', // Adelaide Crows
  2:  '#A52834', // Brisbane Lions
  5:  '#1565C0', // Carlton
  3:  '#C8C8C8', // Collingwood
  12: '#FF4136', // Essendon
  14: '#6A3688', // Fremantle
  10: '#1E6EB5', // Geelong Cats
  4:  '#FFB703', // Gold Coast SUNS
  15: '#F15A22', // GWS GIANTS
  9:  '#C8922A', // Hawthorn
  17: '#CC0000', // Melbourne
  6:  '#1E88E5', // North Melbourne
  7:  '#00B2C8', // Port Adelaide
  16: '#F4C430', // Richmond
  11: '#D50000', // St Kilda
  13: '#E53935', // Sydney Swans
  18: '#EFAB00', // West Coast Eagles
  8:  '#4469DE', // Western Bulldogs
}

const CHART = { x0: 26, x1: 546, y0: 20, y1: 422 } as const

function yScale(pos: number): number {
  return CHART.y0 + ((pos - 1) * (CHART.y1 - CHART.y0)) / 17
}

const yRef4 = yScale(4.5)
const yRef8 = yScale(8.5)

function xScale(idx: number): number {
  const n = concludedRounds.value.length
  if (n <= 1) return (CHART.x0 + CHART.x1) / 2
  return CHART.x0 + (idx * (CHART.x1 - CHART.x0)) / (n - 1)
}

const concludedRounds = computed<number[]>(() => {
  const rounds = new Set<number>()
  for (const m of matches.value) {
    if (m.status === 'CONCLUDED' && m.homeScore && m.awayScore) rounds.add(m.roundNumber)
  }
  return [...rounds].sort((a, b) => a - b)
})

const roundHistory = computed<Map<number, AlgorithmRankRow[]>>(() => {
  if (activeView.value !== 'graph') return new Map()
  const result = new Map<number, AlgorithmRankRow[]>()
  for (const round of concludedRounds.value) {
    const matchesUpTo = matches.value.filter((m) => m.roundNumber <= round)
    result.set(round, computeAlgorithmRanking(selectedId.value, matchesUpTo))
  }
  return result
})

interface WormPoint { x: number; y: number }
interface WormTeamData { team: typeof TEAMS[0]; color: string; points: WormPoint[] }

const wormData = computed<WormTeamData[]>(() => {
  const rounds = concludedRounds.value
  if (rounds.length === 0) return []
  return TEAMS.map((team) => {
    const points: WormPoint[] = []
    rounds.forEach((round, idx) => {
      const ranking = roundHistory.value.get(round)
      const row = ranking?.find((r) => r.teamId === team.id)
      if (!row) return
      points.push({ x: xScale(idx), y: yScale(row.rank) })
    })
    return { team, color: TEAM_COLORS[team.id] ?? '#888888', points }
  }).filter((d) => d.points.length > 0)
})

function buildWormPath(pts: WormPoint[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1]
    const p1 = pts[i]
    const dx = (p1.x - p0.x) / 3
    d += ` C ${p0.x + dx},${p0.y} ${p1.x - dx},${p1.y} ${p1.x},${p1.y}`
  }
  return d
}

// --- Palmy hover popup ---

const POPUP_TABS = [
  { id: 'own' as const, label: 'Opponent Ladder' },
  { id: 'positions' as const, label: 'League Positions' },
]

const hoveredTeamId = ref<number | null>(null)
const popupTab = ref<'own' | 'positions'>('own')
const popupStyle = ref<Record<string, string>>({})
let hoverClearTimer: ReturnType<typeof setTimeout> | null = null

const teamInfoMap = computed(() => {
  const map = new Map<number, { teamName: string; iconId: string }>()
  for (const t of TEAMS) map.set(t.id, { teamName: t.name, iconId: t.iconId })
  return map
})

const hoveredTeamName = computed(() => {
  if (hoveredTeamId.value === null) return ''
  return teamInfoMap.value.get(hoveredTeamId.value)?.teamName ?? ''
})

const hoveredLadder = computed(() =>
  hoveredTeamId.value !== null ? (palmyOpponentLadders.value[hoveredTeamId.value] ?? []) : [],
)

const hoveredTeamPositions = computed(() => {
  if (hoveredTeamId.value === null) return []
  const tid = hoveredTeamId.value
  const result: Array<{
    ownerName: string
    ownerIconId: string
    rank: number
    ladderSize: number
    differential: number
    roundNumber: number
  }> = []

  for (const [ownerIdStr, ladder] of Object.entries(palmyOpponentLadders.value)) {
    const ownerId = Number(ownerIdStr)
    if (ownerId === tid) continue
    const ownerInfo = teamInfoMap.value.get(ownerId)
    for (const entry of ladder) {
      if (entry.teamId === tid) {
        result.push({
          ownerName: ownerInfo?.teamName ?? String(ownerId),
          ownerIconId: ownerInfo?.iconId ?? '',
          rank: entry.rank,
          ladderSize: ladder.length,
          differential: entry.differential,
          roundNumber: entry.roundNumber,
        })
      }
    }
  }

  return result.sort((a, b) => a.rank - b.rank)
})

const hoveredAvgPosition = computed(() => {
  if (hoveredTeamPositions.value.length === 0) return '—'
  const avg = hoveredTeamPositions.value.reduce((s, p) => s + p.rank / p.ladderSize, 0) / hoveredTeamPositions.value.length
  return ((1 - avg) * 100).toFixed(1)
})

function positionClass(rank: number, size: number): string {
  const pct = rank / size
  if (pct <= 0.25) return 'text-green-600 dark:text-green-400'
  if (pct <= 0.5)  return 'text-gray-600 dark:text-gray-300'
  if (pct <= 0.75) return 'text-orange-500 dark:text-orange-400'
  return 'text-red-500 dark:text-red-400'
}

function onRowEnter(teamId: number, event: MouseEvent) {
  if (hoverClearTimer) { clearTimeout(hoverClearTimer); hoverClearTimer = null }
  if (hoveredTeamId.value !== teamId) popupTab.value = 'own'
  hoveredTeamId.value = teamId
  positionPopup(event.currentTarget as HTMLElement)
}

function scheduleHoverClear() {
  hoverClearTimer = setTimeout(() => { hoveredTeamId.value = null }, 150)
}

function cancelHoverClear() {
  if (hoverClearTimer) { clearTimeout(hoverClearTimer); hoverClearTimer = null }
}

function positionPopup(row: HTMLElement) {
  const rect = row.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const POPUP_W = 310
  const POPUP_H = 500

  let left = rect.right + 8
  if (left + POPUP_W > vw - 8) left = rect.left - POPUP_W - 8
  left = Math.max(8, Math.min(left, vw - POPUP_W - 8))

  let top = rect.top
  if (top + POPUP_H > vh - 8) top = vh - POPUP_H - 8
  top = Math.max(8, top)

  popupStyle.value = { left: `${left}px`, top: `${top}px`, width: `${POPUP_W}px` }
}
</script>
