<template>
  <div class="mt-4">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-sm font-bold text-gray-700 dark:text-gray-300">Finishing Position Range</h3>
      <p class="text-xs text-gray-400 dark:text-gray-500">{{ total.toLocaleString() }} simulations</p>
    </div>

    <!-- Position legend -->
    <div class="flex flex-wrap gap-x-2 gap-y-1 mb-3">
      <div v-for="i in 18" :key="i" class="flex items-center gap-0.5">
        <div class="w-3 h-3 rounded-sm shrink-0" :style="{ background: POS_COLORS[i - 1] }"></div>
        <span class="text-[10px] text-gray-500 dark:text-gray-400">{{ i }}</span>
      </div>
    </div>

    <!-- Rows -->
    <div class="space-y-1">
      <div v-for="(entry, i) in sortedResults" :key="entry.teamId" class="flex items-center gap-2">
        <!-- Team abbreviation -->
        <div class="w-8 text-xs text-right font-bold text-gray-600 dark:text-gray-300 shrink-0 tabular-nums">
          {{ entry.abbreviation }}
        </div>

        <!-- Stacked bar -->
        <div class="flex-1 flex h-6 rounded overflow-hidden">
          <template v-for="(count, i) in entry.counts" :key="i">
            <div
              v-if="count > 0"
              :style="{ width: `${(count / total) * 100}%`, background: POS_COLORS[i] }"
              class="relative flex items-center justify-center overflow-hidden shrink-0"
              :title="`${i + 1}th: ${count} (${((count / total) * 100).toFixed(1)}%)`"
            >
              <span
                v-if="count / total >= 0.04"
                class="text-[9px] font-bold leading-none select-none"
                style="color: rgba(255,255,255,0.9); text-shadow: 0 0 3px rgba(0,0,0,0.6)"
              >{{ i + 1 }}</span>
            </div>
          </template>
        </div>

        <!-- Rank -->
        <div class="w-5 text-[10px] text-gray-400 dark:text-gray-500 shrink-0 tabular-nums text-right">
          {{ i + 1 }}
        </div>
      </div>
    </div>

    <!-- Axis labels -->
    <div class="flex gap-2 mt-1">
      <div class="w-8 shrink-0"></div>
      <div class="flex-1 flex justify-between text-[9px] text-gray-400 dark:text-gray-500">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
      <div class="w-5 shrink-0"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RangeEntry } from '../composables/useSimulation'

const props = defineProps<{
  results: RangeEntry[]
  total: number
}>()

const POS_COLORS = [
  '#16a34a', // 1  — green (1–4)
  '#22c55e', // 2
  '#4ade80', // 3
  '#86efac', // 4
  '#ca8a04', // 5  — yellow (5–6) ← break
  '#eab308', // 6
  '#ea580c', // 7  — orange (7–10) ← break
  '#f97316', // 8
  '#fb923c', // 9
  '#fdba74', // 10
  '#dc2626', // 11 — red (11–18) ← break
  '#b91c1c', // 12
  '#991b1b', // 13
  '#7f1d1d', // 14
  '#78350f', // 15
  '#92400e', // 16
  '#57534e', // 17
  '#292524', // 18 — near-black
]

function medianPosition(entry: RangeEntry): number {
  const half = props.total / 2
  let cumulative = 0
  for (let i = 0; i < 18; i++) {
    cumulative += entry.counts[i]
    if (cumulative >= half) return i + 1
  }
  return 18
}

const sortedResults = computed(() =>
  [...props.results].sort((a, b) => medianPosition(a) - medianPosition(b)),
)
</script>
