<template>
  <div ref="captureEl" class="mt-4">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-sm font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap">Finishing Position Range</h3>
      <div class="flex items-center gap-2">
        <p class="text-xs text-gray-400 dark:text-gray-500">{{ total.toLocaleString() }} simulations</p>
        <!-- Stats button -->
        <button
          v-if="stats"
          @click="showStats = true"
          title="Simulation statistics"
          class="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
        </button>
        <!-- Download button -->
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
              :title="`${ordinal(i + 1)}: ${count} (${((count / total) * 100).toFixed(1)}%)`"
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

  <!-- Team detail popup -->
  <Teleport to="body">
    <div
      v-if="selectedEntry"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      @click.self="selectedEntry = null"
    >
      <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-5 w-[28rem] max-w-[90vw]">
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

        <!-- Conditional sub-header: deltas vs baseline for next game outcome -->
        <p
          v-if="selectedEntry.nextMatchId !== null && selectedEntry.nextOpponentName"
          class="text-xs text-gray-500 dark:text-gray-400 mb-3 -mt-1"
        >
          Next: {{ selectedEntry.nextIsHome ? 'vs' : '@' }} {{ selectedEntry.nextOpponentName }}.
          <span class="font-semibold text-emerald-600 dark:text-emerald-400">W</span> /
          <span class="font-semibold text-rose-600 dark:text-rose-400">L</span>
          = change if they win / lose
        </p>

        <!-- Milestone rows -->
        <div class="space-y-2">
          <div
            v-for="m in milestones(selectedEntry)"
            :key="m.label"
            class="flex items-center justify-between"
          >
            <span class="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{{ m.label }}</span>
            <div class="flex items-center gap-2">
              <div class="relative w-24 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <!-- Conditional bar (faded) behind the baseline bar -->
                <div
                  v-if="m.cond !== null"
                  class="absolute inset-y-0 left-0 rounded-full opacity-40"
                  :style="{ width: `${m.cond}%`, background: m.color }"
                ></div>
                <div
                  class="absolute inset-y-0 left-0 rounded-full"
                  :style="{ width: `${m.pct}%`, background: m.color }"
                ></div>
              </div>
              <span class="text-sm font-bold tabular-nums w-12 text-right" :style="{ color: m.color }">
                {{ m.pct.toFixed(1) }}%
              </span>
              <span
                v-if="m.delta !== null"
                class="text-[11px] font-bold tabular-nums w-14 text-right"
                :style="{ color: m.delta >= 0 ? '#16a34a' : '#dc2626' }"
                :title="`If they win next: ${(m.cond ?? 0).toFixed(1)}%`"
              >
                <span class="text-gray-400 dark:text-gray-500 font-normal">W</span>
                {{ m.delta >= 0 ? '+' : '' }}{{ m.delta.toFixed(1) }}
              </span>
              <span
                v-if="m.lossDelta !== null"
                class="text-[11px] font-bold tabular-nums w-14 text-right"
                :style="{ color: m.lossDelta >= 0 ? '#16a34a' : '#dc2626' }"
                :title="`If they lose next: ${(m.lossCond ?? 0).toFixed(1)}%`"
              >
                <span class="text-gray-400 dark:text-gray-500 font-normal">L</span>
                {{ m.lossDelta >= 0 ? '+' : '' }}{{ m.lossDelta.toFixed(1) }}
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

  <!-- Simulation stats modal -->
  <Teleport to="body">
    <div
      v-if="showStats && stats"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="showStats = false"
    >
      <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h4 class="font-bold text-gray-800 dark:text-gray-100 text-base">Simulation Statistics</h4>
          <button
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
            @click="showStats = false"
          >&times;</button>
        </div>

        <!-- Summary chips -->
        <div class="flex flex-wrap gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <span class="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300">
            {{ total.toLocaleString() }} runs
          </span>
          <span class="px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-xs font-semibold text-purple-700 dark:text-purple-300">
            {{ stats.uniqueCount.toLocaleString() }} unique ladders
          </span>
          <span class="px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-xs font-semibold text-blue-700 dark:text-blue-300">
            Most common: {{ stats.mostCommonCount }}× ({{ ((stats.mostCommonCount / total) * 100).toFixed(2) }}%)
          </span>
        </div>

        <!-- Ladder columns -->
        <div class="grid grid-cols-2 gap-0 overflow-y-auto flex-1 divide-x divide-gray-100 dark:divide-gray-800">
          <!-- Most Common Ladder -->
          <div class="px-4 py-3">
            <p class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Most Common Ladder</p>
            <div class="space-y-0.5">
              <div
                v-for="(teamId, pos) in stats.mostCommonLadder"
                :key="teamId"
                class="flex items-center gap-2 py-1 rounded"
                :class="pos === 5 ? 'border-b border-orange-300 dark:border-orange-700 mb-0.5 pb-1.5' : pos === 9 ? 'border-b border-blue-300 dark:border-blue-700 mb-0.5 pb-1.5' : ''"
              >
                <span class="w-5 text-right text-xs tabular-nums text-gray-400 dark:text-gray-500 shrink-0">{{ pos + 1 }}</span>
                <svg class="size-5 shrink-0"><use :href="`/ranked-predictor/icons.svg#${teamMap.get(teamId)?.iconId ?? ''}`" /></svg>
                <span class="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{{ teamMap.get(teamId)?.teamName ?? teamId }}</span>
              </div>
            </div>
          </div>

          <!-- Consensus Ladder -->
          <div class="px-4 py-3">
            <p class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Consensus Ladder</p>
            <div class="space-y-0.5">
              <div
                v-for="(teamId, pos) in stats.consensusLadder"
                :key="teamId"
                class="flex items-center gap-2 py-1 rounded"
                :class="pos === 5 ? 'border-b border-orange-300 dark:border-orange-700 mb-0.5 pb-1.5' : pos === 9 ? 'border-b border-blue-300 dark:border-blue-700 mb-0.5 pb-1.5' : ''"
              >
                <span class="w-5 text-right text-xs tabular-nums text-gray-400 dark:text-gray-500 shrink-0">{{ pos + 1 }}</span>
                <svg class="size-5 shrink-0"><use :href="`/ranked-predictor/icons.svg#${teamMap.get(teamId)?.iconId ?? ''}`" /></svg>
                <span class="flex-1 text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{{ teamMap.get(teamId)?.teamName ?? teamId }}</span>
                <span class="text-[10px] tabular-nums text-gray-400 dark:text-gray-500 shrink-0">
                  {{ consensusPct(teamId, pos) }}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <p class="text-[10px] text-gray-400 dark:text-gray-500 text-center px-5 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
          Consensus places each team at their most likely position (no repeats) · % = how often that team finished there
        </p>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { toPng } from 'html-to-image'
import type { RangeEntry, SimulationStats } from '../composables/useSimulation'

const props = defineProps<{
  results: RangeEntry[]
  total: number
  stats?: SimulationStats | null
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

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

const captureEl = ref<HTMLElement | null>(null)
const capturing = ref(false)
const selectedEntry = ref<RangeEntry | null>(null)
const showStats = ref(false)

const teamMap = computed(() => {
  const map = new Map<number, RangeEntry>()
  for (const r of props.results) map.set(r.teamId, r)
  return map
})

function consensusPct(teamId: number, pos: number): string {
  const entry = teamMap.value.get(teamId)
  if (!entry || props.total === 0) return '—'
  return ((entry.counts[pos] / props.total) * 100).toFixed(0)
}

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

// Conditional % given the team wins its next game. Null when the team has no
// upcoming game (no sims in which it could win one).
function condPct(entry: RangeEntry, from: number, to: number): number | null {
  if (!entry.nextGameWinTotal) return null
  return (sumCounts(entry.winNextCounts, from, to) / entry.nextGameWinTotal) * 100
}

// Conditional % given the team loses its next game. Simulated matches never
// draw, so loss counts are the baseline minus the win-conditional counts, over
// the sims where the team did not win its next game. Null when no upcoming game.
function condLossPct(entry: RangeEntry, from: number, to: number): number | null {
  if (entry.nextMatchId === null) return null
  const lossTotal = props.total - entry.nextGameWinTotal
  if (lossTotal <= 0) return null
  const lossCount = sumCounts(entry.counts, from, to) - sumCounts(entry.winNextCounts, from, to)
  return (lossCount / lossTotal) * 100
}

function positionRow(entry: RangeEntry, label: string, color: string, from: number, to: number) {
  const base = pct(entry.counts, from, to)
  const cond = condPct(entry, from, to)
  const lossCond = condLossPct(entry, from, to)
  return {
    label,
    color,
    pct: base,
    cond,
    delta: cond === null ? null : cond - base,
    lossCond,
    lossDelta: lossCond === null ? null : lossCond - base,
  }
}

function countRow(label: string, color: string, count: number) {
  return { label, color, pct: (count / props.total) * 100, cond: null, delta: null, lossCond: null, lossDelta: null }
}

function milestones(entry: RangeEntry) {
  const rows = []

  if (props.stats?.hasFinalsData) {
    rows.push(
      countRow('Win Grand Final', '#eab308', entry.premiershipCount),
      countRow('Make Grand Final', '#7c3aed', entry.grandFinalCount),
      countRow('Make Prelim', '#0ea5e9', entry.prelimCount),
    )
  }

  rows.push(
    positionRow(entry, 'Minor Premier', '#16a34a', 0, 1),
    positionRow(entry, 'Top 2', '#22c55e', 0, 2),
    positionRow(entry, 'Top 4', '#86efac', 0, 4),
    positionRow(entry, 'Top 6', '#ca8a04', 0, 6),
    positionRow(entry, 'Top 8', '#ea580c', 0, 8),
    positionRow(entry, 'Top 10', '#fdba74', 0, 10),
    positionRow(entry, 'Bottom 4', '#991b1b', 14, 18),
    positionRow(entry, 'Last', '#292524', 17, 18),
  )

  return rows
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

const sortedResults = computed(() => {
  const consensusLadder = props.stats?.consensusLadder
  if (consensusLadder?.length) {
    const rank = new Map(consensusLadder.map((teamId, i) => [teamId, i]))
    return [...props.results].sort((a, b) => {
      const rankA = rank.get(a.teamId) ?? consensusLadder.length
      const rankB = rank.get(b.teamId) ?? consensusLadder.length
      return rankA - rankB
    })
  }
  return [...props.results].sort((a, b) => medianPosition(a) - medianPosition(b))
})
</script>
