<template>
  <div ref="captureEl" class="mt-4">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-sm font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap">Finishing Position Range</h3>
      <div class="flex items-center gap-2">
        <p class="text-xs text-gray-400 dark:text-gray-500">{{ total.toLocaleString() }} simulations</p>
        <button
          v-if="!capturing"
          @click="screenshotTable"
          title="Save as image"
          class="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>
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
      <div
        v-for="(entry, i) in sortedResults"
        :key="entry.teamId"
        class="flex items-center gap-2 cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        @click="selectedEntry = entry"
      >
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

  <!-- Popup overlay -->
  <Teleport to="body">
    <div
      v-if="selectedEntry"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      @click.self="selectedEntry = null"
    >
      <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-5 w-72 max-w-[90vw]">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <svg class="size-7 shrink-0"><use :href="`/ranked-predictor/icons.svg#${selectedEntry.iconId}`" /></svg>
            <h4 class="font-bold text-gray-800 dark:text-gray-100 text-base">{{ selectedEntry.teamName }}</h4>
          </div>
          <button
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
            @click="selectedEntry = null"
          >&times;</button>
        </div>

        <!-- Milestone rows -->
        <div class="space-y-2">
          <div
            v-for="m in milestones(selectedEntry)"
            :key="m.label"
            class="flex items-center justify-between"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400">{{ m.label }}</span>
            <div class="flex items-center gap-2">
              <div class="w-24 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  class="h-2 rounded-full"
                  :style="{ width: `${m.pct}%`, background: m.color }"
                ></div>
              </div>
              <span class="text-sm font-bold tabular-nums w-12 text-right" :style="{ color: m.color }">
                {{ m.pct.toFixed(1) }}%
              </span>
            </div>
          </div>
        </div>

        <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-4 text-center">
          Based on {{ total.toLocaleString() }} simulations
        </p>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { toPng } from 'html-to-image'
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

const captureEl = ref<HTMLElement | null>(null)
const capturing = ref(false)
const selectedEntry = ref<RangeEntry | null>(null)

async function screenshotTable() {
  if (!captureEl.value) return
  capturing.value = true
  await new Promise((r) => setTimeout(r, 50))
  const dark = document.documentElement.classList.contains('dark')
  const pad = 16
  try {
    const dataUrl = await toPng(captureEl.value, {
      pixelRatio: 2,
      skipFonts: true,
      width: captureEl.value.offsetWidth + pad * 2,
      height: captureEl.value.offsetHeight + pad * 2,
      style: {
        margin: '0',
        padding: `${pad}px`,
        background: dark ? '#111827' : '#ffffff',
        borderRadius: '8px',
      },
    })
    const link = document.createElement('a')
    link.download = 'finishing-position-range.png'
    link.href = dataUrl
    link.click()
  } finally {
    capturing.value = false
  }
}

function sumCounts(counts: number[], from: number, to: number): number {
  return counts.slice(from, to).reduce((a, b) => a + b, 0)
}

function pct(counts: number[], from: number, to: number): number {
  return (sumCounts(counts, from, to) / props.total) * 100
}

function milestones(entry: RangeEntry) {
  const c = entry.counts
  return [
    { label: 'Minor Premier', pct: pct(c, 0, 1),   color: '#16a34a' },
    { label: 'Top 2',    pct: pct(c, 0, 2),   color: '#22c55e' },
    { label: 'Top 4',    pct: pct(c, 0, 4),   color: '#86efac' },
    { label: 'Top 6',    pct: pct(c, 0, 6),   color: '#ca8a04' },
    { label: 'Top 8',    pct: pct(c, 0, 8),   color: '#ea580c' },
    { label: 'Top 10',   pct: pct(c, 0, 10),  color: '#fdba74' },
    { label: 'Bottom 4', pct: pct(c, 14, 18), color: '#991b1b' },
    { label: 'Last',     pct: pct(c, 17, 18), color: '#292524' },
  ]
}

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
