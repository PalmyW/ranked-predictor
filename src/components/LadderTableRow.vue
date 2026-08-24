<template>
  <tr
    class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
    :class="{
      'border-b-2 border-red-400': index === FINALS_BOUNDARY_INDEXES[0],
      'border-b-2 border-blue-400': index === FINALS_BOUNDARY_INDEXES[1],
      'border-b border-gray-100 dark:border-gray-800': !FINALS_BOUNDARY_INDEXES.includes(index),
    }"
  >
    <td class="py-1.5 text-center text-gray-500 dark:text-gray-500 text-xs">{{ index + 1 }}</td>
    <td class="py-1.5 pl-2 font-medium text-gray-800 dark:text-gray-200">
      <span class="flex items-center gap-1.5">
        <svg class="size-7 shrink-0"><use :href="`/ranked-predictor/icons.svg#${row.iconId}`" /></svg>
        <TeamFixtureSummaryPopup :teamId="row.teamId" :teamName="row.teamName" />
      </span>
    </td>
    <td class="py-1.5 text-center text-gray-600 dark:text-gray-400 hidden sm:table-cell">{{ row.played }}</td>
    <td class="py-1.5 text-center text-gray-600 dark:text-gray-400 hidden sm:table-cell">{{ row.wins }}</td>
    <td class="py-1.5 text-center text-gray-600 dark:text-gray-400 hidden sm:table-cell">{{ row.losses }}</td>
    <td class="py-1.5 text-center text-gray-600 dark:text-gray-400 hidden sm:table-cell">{{ row.draws }}</td>
    <td class="py-1.5 text-center font-bold text-gray-700 dark:text-gray-200">{{ row.pts }}</td>
    <td class="py-1.5 text-center text-gray-600 dark:text-gray-400 text-xs">{{ row.percentage.toFixed(1) }}</td>

    <!-- Secondary delta (Tier) -->
    <td v-if="showSecondaryDelta" class="py-1.5 text-center text-xs font-bold tabular-nums hidden sm:table-cell">
      <span v-if="deltaDir(secondaryBaselineMap, row.teamId, index + 1) === 'up'" class="text-green-500">▲{{ deltaAbs(secondaryBaselineMap, row.teamId, index + 1) }}</span>
      <span v-else-if="deltaDir(secondaryBaselineMap, row.teamId, index + 1) === 'down'" class="text-red-500">▼{{ deltaAbs(secondaryBaselineMap, row.teamId, index + 1) }}</span>
      <span v-else-if="deltaDir(secondaryBaselineMap, row.teamId, index + 1) === 'same'" class="text-gray-300 dark:text-gray-600">—</span>
    </td>

    <!-- Primary delta (Now) -->
    <td v-if="showPrimaryDelta" class="py-1.5 text-center text-xs font-bold tabular-nums hidden sm:table-cell">
      <span v-if="deltaDir(baselineMap, row.teamId, index + 1) === 'up'" class="text-green-500">▲{{ deltaAbs(baselineMap, row.teamId, index + 1) }}</span>
      <span v-else-if="deltaDir(baselineMap, row.teamId, index + 1) === 'down'" class="text-red-500">▼{{ deltaAbs(baselineMap, row.teamId, index + 1) }}</span>
      <span v-else-if="deltaDir(baselineMap, row.teamId, index + 1) === 'same'" class="text-gray-300 dark:text-gray-600">—</span>
    </td>

    <!-- Difficulty cell -->
    <td class="py-1.5 text-center text-xs font-semibold" :class="normalizedDiffClass">
      <HtmlTooltip v-if="!simple && row.remainingOpponents && row.remainingOpponents.length > 0" placement="above">
        <template #trigger="{ toggle }">
          <button @click.stop="toggle" class="hover:underline underline-offset-2 cursor-pointer">
            {{ normalizedDiffValue }}
          </button>
        </template>
        <template #content>
          <div class="p-3 min-w-[200px]">
            <p class="font-semibold text-gray-800 dark:text-gray-100 mb-0.5">Schedule Difficulty</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {{ normalizedDiffValue }} hardest of 18
            </p>
            <div class="text-xs space-y-0.5 mb-2">
              <p class="text-gray-500 dark:text-gray-400">
                Avg opponent rank:
                <span class="font-semibold text-gray-700 dark:text-gray-200">{{ row.difficulty !== null ? row.difficulty.toFixed(1) : '—' }}</span>
              </p>
              <p v-if="diffStats" class="text-gray-400 dark:text-gray-500">
                Competition range:
                <span class="font-semibold text-red-500">{{ diffStats.minRaw.toFixed(1) }}</span>
                (hardest) –
                <span class="font-semibold text-green-600">{{ diffStats.maxRaw.toFixed(1) }}</span>
                (easiest)
              </p>
            </div>
            <!-- XY scatter: x = round, y = opponent rank (1 top = hardest) -->
            <svg :width="SVG_W" :height="SVG_H" :viewBox="`0 0 ${SVG_W} ${SVG_H}`" class="overflow-visible mb-0.5"
              @mousemove="onChartMouseMove" @mouseleave="hoveredOpp = null">
              <!-- axes -->
              <line :x1="PAD_L" :y1="PAD_T" :x2="PAD_L" :y2="PAD_T + CHART_H" stroke="#6b7280" stroke-width="0.75" />
              <line :x1="PAD_L" :y1="PAD_T + CHART_H" :x2="SVG_W - PAD_R" :y2="PAD_T + CHART_H" stroke="#6b7280" stroke-width="0.75" />
              <!-- y labels -->
              <text :x="PAD_L - 3" :y="PAD_T + 4" font-size="8" fill="#9ca3af" text-anchor="end">1</text>
              <text :x="PAD_L - 3" :y="PAD_T + CHART_H + 1" font-size="8" fill="#9ca3af" text-anchor="end">18</text>
              <!-- x labels: first and last round -->
              <text :x="roundX(minRound)" :y="PAD_T + CHART_H + 11" font-size="8" fill="#9ca3af" text-anchor="middle">R{{ minRound }}</text>
              <text v-if="maxRound !== minRound" :x="roundX(maxRound)" :y="PAD_T + CHART_H + 11" font-size="8" fill="#9ca3af" text-anchor="middle">R{{ maxRound }}</text>
              <!-- dots -->
              <circle
                v-for="opp in row.remainingOpponents"
                :key="opp.matchId"
                :cx="roundX(opp.roundNumber)"
                :cy="rankY(opp.rank)"
                r="4"
                :fill="opp.isHome ? oppColor(opp.rank) : 'none'"
                :stroke="oppColor(opp.rank)"
                stroke-width="1.5"
              />
            </svg>
            <p class="text-[9px] h-3 mb-1">
              <span v-if="hoveredOpp" class="text-gray-700 dark:text-gray-200">
                {{ hoveredOpp.isHome ? 'H' : 'A' }} vs {{ hoveredOpp.name }} &middot; Rd {{ hoveredOpp.roundNumber }} &middot; #{{ hoveredOpp.rank }}
              </span>
            </p>
            <p class="text-[9px] text-gray-400 dark:text-gray-500 mb-2">● home &nbsp;○ away</p>

            <div class="border-t border-gray-100 dark:border-gray-700 pt-2 space-y-1">
              <div
                v-for="opp in row.remainingOpponents"
                :key="opp.matchId"
                class="flex items-center gap-2"
              >
                <span
                  class="shrink-0 w-4 text-center text-xs font-bold rounded px-0.5"
                  :class="opp.isHome ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'"
                >{{ opp.isHome ? 'H' : 'A' }}</span>
                <span class="flex-1 text-gray-700 dark:text-gray-200">{{ opp.name }}</span>
                <span v-if="simulatedMatchWinners !== undefined" class="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                  {{ Math.round(opp.winPct * 100) }}%
                </span>
                <span
                  v-if="simulatedMatchWinners && opp.matchId in simulatedMatchWinners"
                  class="shrink-0 w-4 text-center text-xs font-bold rounded"
                  :class="simulatedMatchWinners[opp.matchId] === row.teamId
                    ? 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400'
                    : simulatedMatchWinners[opp.matchId] === DRAW_RESULT
                      ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400'
                      : 'bg-red-100 text-red-500 dark:bg-red-900/40 dark:text-red-400'"
                >{{ simulatedMatchWinners[opp.matchId] === row.teamId ? 'W' : simulatedMatchWinners[opp.matchId] === DRAW_RESULT ? 'D' : 'L' }}</span>
                <span
                  v-else-if="simulatedMatchWinners === undefined"
                  class="shrink-0 w-4 text-center text-xs font-bold rounded"
                  :class="opp.predictedWin ? 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400' : 'bg-red-100 text-red-500 dark:bg-red-900/40 dark:text-red-400'"
                >{{ opp.predictedWin ? 'W' : 'L' }}</span>
                <span class="shrink-0 text-gray-400 dark:text-gray-500">#{{ opp.rank }}</span>
              </div>
            </div>
          </div>
        </template>
      </HtmlTooltip>
      <span v-else>{{ normalizedDiffValue }}</span>
    </td>
  </tr>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { LadderRow } from '../types/afl'
import { DRAW_RESULT } from '../composables/useSimulation'
import { FINALS_BOUNDARY_INDEXES } from '../composables/useFinalsBoundary'
import HtmlTooltip from './HtmlTooltip.vue'
import TeamFixtureSummaryPopup from './TeamFixtureSummaryPopup.vue'

const props = defineProps<{
  row: LadderRow
  index: number
  showSecondaryDelta: boolean
  showPrimaryDelta: boolean
  secondaryBaselineMap: Map<number, number>
  baselineMap: Map<number, number>
  simulatedMatchWinners: Record<number, number> | null | undefined
  normalizedDiffValue: string
  normalizedDiffClass: string
  diffStats?: { minRaw: number; maxRaw: number }
  simple?: boolean  // skip tooltip during animation
}>()


const hoveredOpp = ref<typeof props.row.remainingOpponents[0] | null>(null)

// Chart layout
const SVG_W = 176, SVG_H = 86
const PAD_L = 20, PAD_R = 8, PAD_T = 8, PAD_B = 16
const CHART_W = SVG_W - PAD_L - PAD_R
const CHART_H = SVG_H - PAD_T - PAD_B

const minRound = computed(() =>
  props.row.remainingOpponents.length
    ? Math.min(...props.row.remainingOpponents.map((o) => o.roundNumber))
    : 1,
)
const maxRound = computed(() =>
  props.row.remainingOpponents.length
    ? Math.max(...props.row.remainingOpponents.map((o) => o.roundNumber))
    : 1,
)

function roundX(round: number): number {
  const min = minRound.value, max = maxRound.value
  return max === min ? PAD_L + CHART_W / 2 : PAD_L + ((round - min) / (max - min)) * CHART_W
}

function rankY(rank: number): number {
  return PAD_T + ((rank - 1) / 17) * CHART_H
}

function onChartMouseMove(e: MouseEvent) {
  const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  let found: (typeof props.row.remainingOpponents)[number] | null = null
  let minDist = 12
  for (const opp of props.row.remainingOpponents) {
    const d = Math.hypot(x - roundX(opp.roundNumber), y - rankY(opp.rank))
    if (d < minDist) { minDist = d; found = opp }
  }
  hoveredOpp.value = found
}

function oppColor(rank: number): string {
  if (rank <= 5) return '#dc2626'
  if (rank <= 9) return '#f97316'
  if (rank <= 13) return '#6b7280'
  return '#16a34a'
}

function deltaFromMap(map: Map<number, number>, teamId: number, ladderPos: number): number | null {
  const baseline = map.get(teamId)
  if (baseline === undefined) return null
  return baseline - ladderPos
}

function deltaDir(map: Map<number, number>, teamId: number, ladderPos: number): 'up' | 'down' | 'same' | null {
  const d = deltaFromMap(map, teamId, ladderPos)
  if (d === null) return null
  if (d > 0) return 'up'
  if (d < 0) return 'down'
  return 'same'
}

function deltaAbs(map: Map<number, number>, teamId: number, ladderPos: number): number {
  return Math.abs(deltaFromMap(map, teamId, ladderPos) ?? 0)
}
</script>
