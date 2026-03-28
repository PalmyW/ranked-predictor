<template>
  <div>
    <h2 v-if="title" class="text-lg font-bold mb-3 text-gray-800 dark:text-gray-100">{{ title }}</h2>

    <div v-if="isLoading" class="space-y-1">
      <div v-for="n in 18" :key="n" class="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
    </div>

    <table v-else class="w-full text-sm table-fixed border-collapse">
      <thead>
        <tr class="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">
          <th class="w-8 py-2 text-center font-semibold">#</th>
          <th class="py-2 text-left pl-2 font-semibold">Team</th>
          <th class="w-8 py-2 text-center font-semibold">P</th>
          <th class="w-8 py-2 text-center font-semibold">W</th>
          <th class="w-8 py-2 text-center font-semibold">L</th>
          <th class="w-8 py-2 text-center font-semibold">D</th>
          <th class="w-10 py-2 text-center font-semibold">Pts</th>
          <th class="w-16 py-2 text-center font-semibold">%</th>
<<<<<<< HEAD
          <th v-if="secondaryBaselineRanking" class="w-10 py-2 text-center font-semibold text-gray-400 dark:text-gray-500" title="vs your tier ranking">Tier</th>
          <th v-if="baselineRanking" class="w-10 py-2 text-center font-semibold text-gray-400 dark:text-gray-500" title="vs current ladder">Now</th>
=======
          <th v-if="baselineRanking" class="w-10 py-2 text-center font-semibold">±</th>
>>>>>>> 342d6b20535976b6819a9cabd8af22b57e393db4
          <th class="w-14 py-2 text-center font-semibold">
            <span class="inline-flex items-center justify-center gap-0.5">
              Diff
              <HtmlTooltip placement="below">
                <template #trigger="{ toggle }">
                  <button
                    @click.stop="toggle"
                    class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 leading-none"
                  >ⓘ</button>
                </template>
                <template #content>
                  <div class="p-3 max-w-[220px]">
                    <p class="font-semibold mb-1 text-gray-800 dark:text-gray-100">Schedule Difficulty</p>
                    <p class="text-gray-600 dark:text-gray-300 leading-relaxed">Score 1–18. The average ladder position of each team's remaining opponents, normalised so <span class="font-semibold text-green-600">1 = easiest</span> and <span class="font-semibold text-red-600">18 = hardest</span> draw.</p>
                  </div>
                </template>
              </HtmlTooltip>
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(row, i) in ladder" :key="row.teamId">
          <tr
            class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            :class="{
              'border-b-2 border-red-400': i === 5,
              'border-b-2 border-blue-400': i === 9,
              'border-b border-gray-100 dark:border-gray-800': i !== 5 && i !== 9,
            }"
          >
            <td class="py-1.5 text-center text-gray-500 dark:text-gray-500 text-xs">{{ i + 1 }}</td>
            <td class="py-1.5 pl-2 font-medium text-gray-800 dark:text-gray-200">{{ row.teamName }}</td>
            <td class="py-1.5 text-center text-gray-600 dark:text-gray-400">{{ row.played }}</td>
            <td class="py-1.5 text-center text-gray-600 dark:text-gray-400">{{ row.wins }}</td>
            <td class="py-1.5 text-center text-gray-600 dark:text-gray-400">{{ row.losses }}</td>
            <td class="py-1.5 text-center text-gray-600 dark:text-gray-400">{{ row.draws }}</td>
            <td class="py-1.5 text-center font-bold text-gray-700 dark:text-gray-200">{{ row.pts }}</td>
            <td class="py-1.5 text-center text-gray-600 dark:text-gray-400 text-xs">{{ row.percentage.toFixed(1) }}</td>
<<<<<<< HEAD
            <td v-if="secondaryBaselineRanking" class="py-1.5 text-center text-xs font-bold tabular-nums">
              <span v-if="deltaDir(secondaryBaselineMap, row.teamId, i + 1) === 'up'" class="text-green-500">▲{{ deltaAbs(secondaryBaselineMap, row.teamId, i + 1) }}</span>
              <span v-else-if="deltaDir(secondaryBaselineMap, row.teamId, i + 1) === 'down'" class="text-red-500">▼{{ deltaAbs(secondaryBaselineMap, row.teamId, i + 1) }}</span>
              <span v-else-if="deltaDir(secondaryBaselineMap, row.teamId, i + 1) === 'same'" class="text-gray-300 dark:text-gray-600">—</span>
            </td>
            <td v-if="baselineRanking" class="py-1.5 text-center text-xs font-bold tabular-nums">
              <span v-if="deltaDir(baselineMap, row.teamId, i + 1) === 'up'" class="text-green-500">▲{{ deltaAbs(baselineMap, row.teamId, i + 1) }}</span>
              <span v-else-if="deltaDir(baselineMap, row.teamId, i + 1) === 'down'" class="text-red-500">▼{{ deltaAbs(baselineMap, row.teamId, i + 1) }}</span>
              <span v-else-if="deltaDir(baselineMap, row.teamId, i + 1) === 'same'" class="text-gray-300 dark:text-gray-600">—</span>
=======
            <td v-if="baselineRanking" class="py-1.5 text-center text-xs font-bold tabular-nums">
              <span v-if="deltaDir(row.teamId, i + 1) === 'up'" class="text-green-500">▲{{ deltaAbs(row.teamId, i + 1) }}</span>
              <span v-else-if="deltaDir(row.teamId, i + 1) === 'down'" class="text-red-500">▼{{ deltaAbs(row.teamId, i + 1) }}</span>
              <span v-else-if="deltaDir(row.teamId, i + 1) === 'same'" class="text-gray-300 dark:text-gray-600">—</span>
>>>>>>> 342d6b20535976b6819a9cabd8af22b57e393db4
            </td>
            <td class="py-1.5 text-center text-xs font-semibold" :class="normalizedDiffClass(row.teamId)">
              <HtmlTooltip v-if="row.remainingOpponents && row.remainingOpponents.length > 0" placement="above">
                <template #trigger="{ toggle }">
                  <button @click.stop="toggle" class="hover:underline underline-offset-2 cursor-pointer">
                    {{ normalizedDiff(row.teamId) }}
                  </button>
                </template>
                <template #content>
                  <div class="p-3 min-w-[180px]">
                    <p class="text-gray-500 dark:text-gray-400 mb-2">
                      Avg position: <span class="font-semibold text-gray-700 dark:text-gray-200">{{ row.difficulty !== null ? row.difficulty.toFixed(1) : '—' }}</span>
                    </p>
                    <div class="space-y-1">
                      <div
                        v-for="opp in row.remainingOpponents"
                        :key="opp.name"
                        class="flex items-center justify-between gap-3"
                      >
                        <span class="text-gray-700 dark:text-gray-200">{{ opp.name }}</span>
                        <span class="shrink-0 text-gray-400 dark:text-gray-500">#{{ opp.rank }}</span>
                      </div>
                    </div>
                  </div>
                </template>
              </HtmlTooltip>
              <span v-else>{{ normalizedDiff(row.teamId) }}</span>
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <p v-if="!isLoading && ladder.length === 0" class="text-gray-400 dark:text-gray-600 text-sm text-center py-8">
      No data available
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { LadderRow } from '../types/afl'
import HtmlTooltip from './HtmlTooltip.vue'

<<<<<<< HEAD
function makeBaselineMap(ranking: number[] | undefined): Map<number, number> {
  const map = new Map<number, number>()
  ranking?.forEach((id, i) => map.set(id, i + 1))
  return map
}

const baselineMap = computed(() => makeBaselineMap(props.baselineRanking))
const secondaryBaselineMap = computed(() => makeBaselineMap(props.secondaryBaselineRanking))

function deltaFromMap(map: Map<number, number>, teamId: number, ladderPos: number): number | null {
  const baseline = map.get(teamId)
=======
// Map teamId → baseline rank (1-based) from the provided ranking array
const baselineMap = computed<Map<number, number>>(() => {
  const map = new Map<number, number>()
  if (props.baselineRanking) {
    props.baselineRanking.forEach((id, i) => map.set(id, i + 1))
  }
  return map
})

function positionDelta(teamId: number, ladderPos: number): number | null {
  const baseline = baselineMap.value.get(teamId)
>>>>>>> 342d6b20535976b6819a9cabd8af22b57e393db4
  if (baseline === undefined) return null
  return baseline - ladderPos  // positive = moved up, negative = moved down
}

<<<<<<< HEAD
function deltaDir(map: Map<number, number>, teamId: number, ladderPos: number): 'up' | 'down' | 'same' | null {
  const d = deltaFromMap(map, teamId, ladderPos)
=======
function deltaDir(teamId: number, ladderPos: number): 'up' | 'down' | 'same' | null {
  const d = positionDelta(teamId, ladderPos)
>>>>>>> 342d6b20535976b6819a9cabd8af22b57e393db4
  if (d === null) return null
  if (d > 0) return 'up'
  if (d < 0) return 'down'
  return 'same'
}

<<<<<<< HEAD
function deltaAbs(map: Map<number, number>, teamId: number, ladderPos: number): number {
  return Math.abs(deltaFromMap(map, teamId, ladderPos) ?? 0)
=======
function deltaAbs(teamId: number, ladderPos: number): number {
  return Math.abs(positionDelta(teamId, ladderPos) ?? 0)
>>>>>>> 342d6b20535976b6819a9cabd8af22b57e393db4
}

const props = defineProps<{
  ladder: LadderRow[]
  title?: string
  isLoading?: boolean
<<<<<<< HEAD
  baselineRanking?: number[]           // primary ± column
  secondaryBaselineRanking?: number[]  // secondary ± column
=======
  baselineRanking?: number[]  // team IDs in baseline order (index 0 = rank 1)
>>>>>>> 342d6b20535976b6819a9cabd8af22b57e393db4
}>()

const normalizedMap = computed<Map<number, number>>(() => {
  const withDiff = props.ladder.filter((r) => r.difficulty !== null)
  if (withDiff.length < 2) return new Map()

  const raws = withDiff.map((r) => r.difficulty as number)
  const minRaw = Math.min(...raws)
  const maxRaw = Math.max(...raws)
  const range = maxRaw - minRaw

  const map = new Map<number, number>()
  for (const row of withDiff) {
    const raw = row.difficulty as number
    const normalised = range === 0 ? 9.5 : 1 + ((maxRaw - raw) / range) * 17
    map.set(row.teamId, normalised)
  }
  return map
})

function normalizedDiff(teamId: number): string {
  const v = normalizedMap.value.get(teamId)
  return v !== undefined ? v.toFixed(1) : '—'
}

function normalizedDiffClass(teamId: number): string {
  const v = normalizedMap.value.get(teamId)
  if (v === undefined) return 'text-gray-300'
  if (v >= 14) return 'text-red-600'
  if (v >= 10) return 'text-orange-500'
  if (v >= 6)  return 'text-gray-500'
  return 'text-green-600'
}
</script>
