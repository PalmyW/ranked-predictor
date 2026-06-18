<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <!-- Header -->
    <div class="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-sm font-bold text-gray-800 dark:text-gray-100">Tipping Accuracy</h2>
          <p class="text-xs text-gray-400 dark:text-gray-500">
            Each round predicted from data available beforehand
            ({{ venueAdjusted ? 'Home/Away' : 'All Games' }} ratings)
          </p>
        </div>
        <!-- Tally -->
        <div v-if="!loading && tally.total > 0" class="text-right">
          <div class="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
            {{ tally.correct }}<span class="text-gray-400 dark:text-gray-500">/{{ tally.total }}</span>
            <span class="ml-1 text-sm font-semibold" :class="pctClass(tally.pct)">{{ tally.pct }}%</span>
          </div>
          <div class="text-xs text-gray-400 dark:text-gray-500">correct tips</div>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-px p-2">
      <div v-for="n in 4" :key="n" class="h-10 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
    </div>

    <!-- Empty -->
    <div
      v-else-if="tally.total === 0"
      class="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500"
    >
      No tips yet — predictions appear once the season has concluded matches.
    </div>

    <!-- Rounds (most recent first) -->
    <template v-else>
      <div
        v-for="round in displayRounds"
        :key="round.roundNumber"
        class="border-b border-gray-100 last:border-0 dark:border-gray-800"
      >
        <!-- Round header -->
        <button
          class="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
          @click="toggle(round.roundNumber)"
        >
          <span class="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            <svg
              class="size-3.5 shrink-0 text-gray-400 transition-transform"
              :class="expanded.has(round.roundNumber) ? 'rotate-90' : ''"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {{ round.roundName }}
          </span>
          <span class="text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {{ round.correct }}/{{ round.total }}
          </span>
        </button>

        <!-- Match rows -->
        <div v-if="expanded.has(round.roundNumber)" class="pb-1">
          <div
            v-for="m in round.matches"
            :key="m.matchId"
            class="flex items-center gap-2 px-4 py-1.5 text-sm"
          >
            <!-- Result mark -->
            <span class="w-4 shrink-0 text-center font-bold" :class="markClass(m)">{{ mark(m) }}</span>

            <!-- Home -->
            <div class="flex flex-1 items-center justify-end gap-1.5">
              <span
                class="tabular-nums"
                :class="m.actualWinnerId === m.homeTeamId ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'"
              >{{ m.homeAbbr }}</span>
              <svg class="size-5 shrink-0"><use :href="`${BASE_URL}icons.svg#${m.homeIconId}`" /></svg>
            </div>

            <!-- Scores: actual (bold) + predicted (muted) -->
            <div class="w-24 shrink-0 text-center leading-tight">
              <div class="tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                {{ m.actualHomeScore }}–{{ m.actualAwayScore }}
              </div>
              <div class="tabular-nums text-xs text-gray-400 dark:text-gray-500">
                <template v-if="m.hasPrediction">pred {{ m.predictedHomeScore }}–{{ m.predictedAwayScore }}</template>
                <template v-else>no tip</template>
              </div>
            </div>

            <!-- Away -->
            <div class="flex flex-1 items-center justify-start gap-1.5">
              <svg class="size-5 shrink-0"><use :href="`${BASE_URL}icons.svg#${m.awayIconId}`" /></svg>
              <span
                class="tabular-nums"
                :class="m.actualWinnerId === m.awayTeamId ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'"
              >{{ m.awayAbbr }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TipRound, TipTally, TipResult } from '../composables/useTipsBacktest'

const BASE_URL = import.meta.env.BASE_URL

const props = defineProps<{
  roundResults: TipRound[]
  tally: TipTally
  loading: boolean
  venueAdjusted: boolean
}>()

// Most recent round first
const displayRounds = computed(() => [...props.roundResults].slice().reverse())

const expanded = ref<Set<number>>(new Set())

function toggle(roundNumber: number) {
  const next = new Set(expanded.value)
  next.has(roundNumber) ? next.delete(roundNumber) : next.add(roundNumber)
  expanded.value = next
}

// Auto-expand the latest round once data is available
watch(
  displayRounds,
  (rounds) => {
    if (rounds.length && expanded.value.size === 0) {
      expanded.value = new Set([rounds[0].roundNumber])
    }
  },
  { immediate: true },
)

function mark(m: TipResult): string {
  if (!m.hasPrediction) return '–'
  return m.correct ? '✓' : '✗'
}

function markClass(m: TipResult): string {
  if (!m.hasPrediction) return 'text-gray-300 dark:text-gray-600'
  return m.correct ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
}

function pctClass(pct: number): string {
  if (pct >= 65) return 'text-green-600 dark:text-green-400'
  if (pct >= 50) return 'text-amber-500 dark:text-amber-400'
  return 'text-red-500 dark:text-red-400'
}
</script>
