<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 shadow-sm">
      <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-gray-900">AFL 2026 Season Predictor</h1>
          <p class="text-xs text-gray-500 mt-0.5">
            Rank teams 1–18 to predict the final ladder
          </p>
        </div>
        <div class="text-xs text-gray-400 text-right hidden sm:block">
          <span v-if="isLoading">Loading fixture...</span>
          <span v-else-if="matches.length > 0">{{ matches.length }} matches loaded</span>
        </div>
      </div>
    </header>

    <main class="max-w-6xl mx-auto px-4 py-6">
      <!-- Error banner -->
      <div v-if="error" class="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
        Failed to load fixture data: {{ error }}. Rankings still work but ladder data may be incomplete.
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Left: Team Ranker -->
        <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <h2 class="text-base font-bold text-gray-800 mb-1">Your Team Ranking</h2>
          <p class="text-xs text-gray-400 mb-3">
            Higher-ranked team always wins remaining games
          </p>
          <TeamRanker
            :teams="teams"
            :ranking="ranking"
            @update:ranking="setRanking"
            @reset="handleReset"
          />
        </section>

        <!-- Right: Ladders + Share -->
        <section class="space-y-6">
          <!-- Predicted Ladder -->
          <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <LadderTable
              :ladder="predictedLadder"
              title="Predicted Final Ladder"
              :isLoading="isLoading"
            />
          </div>

          <!-- Simulated Ladder -->
          <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <div class="flex items-center justify-between mb-3">
              <div>
                <h2 class="text-lg font-bold text-gray-800">Simulated Ladder</h2>
                <p class="text-xs text-gray-400 mt-0.5">Favourite wins ~67.5% of games</p>
              </div>
              <button
                @click="simulate"
                :disabled="isLoading || !matches.length"
                class="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Simulate
              </button>
            </div>
            <div v-if="!simulatedLadder" class="text-center py-8 text-gray-400 text-sm">
              Press Simulate to run a randomised season
            </div>
            <LadderTable
              v-else
              :ladder="simulatedLadder"
              :isLoading="false"
            />
          </div>

          <!-- Current Actual Ladder -->
          <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <LadderTable
              :ladder="actualLadder"
              title="Current Ladder"
              :isLoading="isLoading"
            />
          </div>

          <!-- Share -->
          <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <h2 class="text-sm font-bold text-gray-700 mb-2">Share Your Prediction</h2>
            <ShareBar :shareUrl="shareUrl" />
            <p class="text-xs text-gray-400 mt-2">
              Code: <span class="font-mono font-bold text-gray-600">{{ encodedRanking }}</span>
            </p>
          </div>
        </section>
      </div>

      <!-- Full Fixture -->
      <section v-if="!isLoading && matches.length > 0" class="mt-6 bg-white rounded-lg border border-gray-200 shadow-sm p-4">
        <MatchList :matches="matches" :ranking="ranking" />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useAFLData } from './composables/useAFLData'
import { useRanking } from './composables/useRanking'
import { useSimulation } from './composables/useSimulation'
import TeamRanker from './components/TeamRanker.vue'
import LadderTable from './components/LadderTable.vue'
import ShareBar from './components/ShareBar.vue'
import MatchList from './components/MatchList.vue'

const { matches, teams, isLoading, error } = useAFLData()
const {
  ranking,
  encodedRanking,
  shareUrl,
  rankedFromUrl,
  rankedFromStorage,
  setRanking,
  resetToLadder,
} = useRanking()
const { actualLadder, predictedLadder, simulatedLadder, simulate } = useSimulation(ranking, matches)

// Once actual ladder loads, use it as default ranking if nothing was saved
let initialized = false
watch(actualLadder, (ladder) => {
  if (initialized) return
  if (ladder.length === 0) return
  initialized = true
  if (!rankedFromUrl && !rankedFromStorage) {
    resetToLadder(ladder)
  }
})

// Sync share URL to browser address bar silently
watch(shareUrl, (url) => {
  history.replaceState(null, '', url)
}, { immediate: true })

function handleReset() {
  if (actualLadder.value.length > 0) {
    resetToLadder(actualLadder.value)
  }
}
</script>
