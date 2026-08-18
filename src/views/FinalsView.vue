<template>
  <main class="max-w-6xl mx-auto px-4 py-6">
    <div v-if="error" class="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
      Failed to load fixture data: {{ error }}.
    </div>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-bold text-gray-800 dark:text-gray-100">Finals</h1>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Seeded from your last simulated season</p>
      </div>
      <button
        v-if="simulatedLadder"
        @click="rerollTick++"
        class="px-3 py-1.5 text-xs font-semibold rounded bg-purple-600 text-white hover:bg-purple-700 transition-colors"
      >Re-roll Finals</button>
    </div>

    <div v-if="isLoading" class="text-sm text-gray-400 dark:text-gray-500">Loading fixture...</div>
    <div v-else-if="!simulatedLadder" class="text-sm text-gray-400 dark:text-gray-500">
      No simulation yet — head to the
      <RouterLink to="/" class="text-purple-600 dark:text-purple-400 font-semibold hover:underline">Predictor page's Simulated tab</RouterLink>
      and click Simulate to seed the finals bracket.
    </div>
    <div v-else-if="columns.length === 0" class="text-sm text-gray-400 dark:text-gray-500">
      No finals matches found for this season.
    </div>

    <div v-else class="flex gap-6 overflow-x-auto pb-4">
      <div v-for="col in columns" :key="col.code" class="flex flex-col gap-4">
        <h2 class="text-sm font-bold text-gray-700 dark:text-gray-200">{{ col.title }}</h2>
        <div class="flex flex-1 flex-col justify-around gap-6">
          <FinalsBracketCard v-for="m in col.matches" :key="m.matchId" :match="m" />
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAFLData } from '../composables/useAFLData'
import { useRanking } from '../composables/useRanking'
import { useSimulation } from '../composables/useSimulation'
import { buildFinalsBracket, groupFinalsColumns } from '../composables/useFinals'
import FinalsBracketCard from '../components/FinalsBracketCard.vue'

const { matches, isLoading, error } = useAFLData()
const { ranking } = useRanking()
// simulatedLadder is a module-level singleton (see useSimulation.ts) shared
// with the Predictor page's Simulated tab, so this reflects whatever season
// was last simulated there rather than running an independent simulation.
const { simulatedLadder } = useSimulation(ranking, matches)

const rankMap = computed<Record<number, number>>(() => {
  const map: Record<number, number> = {}
  ranking.value.forEach((id, i) => { map[id] = i + 1 })
  return map
})

// Bumped by "Re-roll Finals" to re-randomise just the finals matches against
// the same simulated ladder, without re-running the whole season.
const rerollTick = ref(0)

const bracket = computed(() => {
  void rerollTick.value
  const ladder = simulatedLadder.value
  if (!ladder || ladder.length === 0) return []
  return buildFinalsBracket(matches.value, ladder, rankMap.value, null, false, 'ha', true)
})

const columns = computed(() => groupFinalsColumns(bracket.value))
</script>
