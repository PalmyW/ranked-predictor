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
          <th v-if="secondaryBaselineRanking" class="w-10 py-2 text-center font-semibold text-gray-400 dark:text-gray-500" title="vs your tier ranking">Tier</th>
          <th v-if="baselineRanking" class="w-10 py-2 text-center font-semibold text-gray-400 dark:text-gray-500" title="vs current ladder">Now</th>
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
      <TransitionGroup v-if="animated" tag="tbody" name="ladder-row">
        <LadderTableRow
          v-for="(row, i) in ladder"
          :key="row.teamId"
          :row="row"
          :index="i"
          :show-secondary-delta="!!secondaryBaselineRanking"
          :show-primary-delta="!!baselineRanking"
          :secondary-baseline-map="secondaryBaselineMap"
          :baseline-map="baselineMap"
          :simulated-match-winners="simulatedMatchWinners"
          :normalized-diff-value="normalizedDiff(row.teamId)"
          :normalized-diff-class="normalizedDiffClass(row.teamId)"
          :simple="true"
        />
      </TransitionGroup>

      <tbody v-else>
        <LadderTableRow
          v-for="(row, i) in ladder"
          :key="row.teamId"
          :row="row"
          :index="i"
          :show-secondary-delta="!!secondaryBaselineRanking"
          :show-primary-delta="!!baselineRanking"
          :secondary-baseline-map="secondaryBaselineMap"
          :baseline-map="baselineMap"
          :simulated-match-winners="simulatedMatchWinners"
          :normalized-diff-value="normalizedDiff(row.teamId)"
          :normalized-diff-class="normalizedDiffClass(row.teamId)"
        />
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
import LadderTableRow from './LadderTableRow.vue'

function makeBaselineMap(ranking: number[] | undefined): Map<number, number> {
  const map = new Map<number, number>()
  ranking?.forEach((id, i) => map.set(id, i + 1))
  return map
}

const baselineMap = computed(() => makeBaselineMap(props.baselineRanking))
const secondaryBaselineMap = computed(() => makeBaselineMap(props.secondaryBaselineRanking))


const props = defineProps<{
  ladder: LadderRow[]
  title?: string
  isLoading?: boolean
  baselineRanking?: number[]           // primary ± column
  secondaryBaselineRanking?: number[]  // secondary ± column
  simulatedMatchWinners?: Record<number, number> | null
  animated?: boolean
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

<style scoped>
.ladder-row-move {
  transition: transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
</style>
