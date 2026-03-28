<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
    <AppHeader
      :isLoading="isLoading"
      :matchCount="matches.length"
      :isDark="isDark"
      @toggle-dark="toggleDark"
    />

    <main class="max-w-6xl mx-auto px-4 py-6">
      <!-- Error banner -->
      <div v-if="error" class="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
        Failed to load fixture data: {{ error }}. Rankings still work but ladder data may be incomplete.
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Left: Team Ranker -->
        <section class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
          <h2 class="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">Your Team Ranking</h2>
          <p class="text-xs text-gray-400 dark:text-gray-500 mb-3">Higher-ranked team always wins remaining games</p>
          <TeamRanker
            :teams="teams"
            :ranking="ranking"
            :tierSizes="tierSizes"
            :matches="matches"
            :simulatedMatchWinners="simulatedMatchWinners"
            @update:ranking="setRanking"
            @update:tierSizes="setTierSizes"
            @reset="handleReset"
          />
        </section>

        <!-- Right: Ladders + Share -->
        <section class="space-y-6">
          <LadderTabs
            :predictedLadder="predictedLadder"
            :simulatedLadder="simulatedLadder"
            :actualLadder="actualLadder"
            :ranking="ranking"
            :isLoading="isLoading"
            :hasMatches="matches.length > 0"
            :simulate="simulate"
          />

          <!-- Share -->
          <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
            <h2 class="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Share Your Prediction</h2>
            <ShareBar :shareUrl="shareUrl" />
          </div>
        </section>
      </div>

      <!-- Full Fixture -->
      <section v-if="!isLoading && matches.length > 0" class="mt-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
        <MatchList
          :matches="matches"
          :ranking="ranking"
          :simulated-match-winners="simulatedMatchWinners"
        />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useAFLData } from './composables/useAFLData'
import { useRanking } from './composables/useRanking'
import { useSimulation } from './composables/useSimulation'
import { useDarkMode } from './composables/useDarkMode'
import AppHeader from './components/AppHeader.vue'
import LadderTabs from './components/LadderTabs.vue'
import TeamRanker from './components/TeamRanker.vue'
import ShareBar from './components/ShareBar.vue'
import MatchList from './components/MatchList.vue'

const { isDark, toggle: toggleDark } = useDarkMode()
const { matches, teams, isLoading, error } = useAFLData()
const { ranking, tierSizes, shareUrl, rankedFromUrl, rankedFromStorage, setRanking, setTierSizes, resetToLadder } = useRanking()
const { actualLadder, predictedLadder, simulatedLadder, simulatedMatchWinners, simulate } = useSimulation(ranking, matches)

let initialized = false
watch(actualLadder, (ladder) => {
  if (initialized) return
  if (ladder.length === 0) return
  initialized = true
  if (!rankedFromUrl && !rankedFromStorage) resetToLadder(ladder)
})

watch(shareUrl, (url) => {
  history.replaceState(null, '', url)
}, { immediate: true })

function handleReset() {
  if (actualLadder.value.length > 0) resetToLadder(actualLadder.value)
}
</script>
