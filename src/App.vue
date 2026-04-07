<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
    <div>
      <AppHeader
        :isLoading="isLoading"
        :matchCount="matches.length"
        :isDark="isDark"
        @toggle-dark="toggleDark"
      />
      <RoundBanner v-if="!isLoading && matches.length > 0" :matches="matches" :ranking="ranking" :simulatedMatchWinners="simulatedMatchWinners" />
    </div>

    <main class="max-w-6xl mx-auto px-4 py-6">
      <!-- Error banner -->
      <div v-if="error" class="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
        Failed to load fixture data: {{ error }}. Rankings still work but ladder data may be incomplete.
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
        <!-- Left: Team Ranker -->
        <section class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">

          <!-- Ladder source controls -->
          <div class="mb-3 p-2.5 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2">
            <span class="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
              Viewing:
              <span
                class="px-1.5 py-0.5 rounded text-xs font-semibold"
                :class="{
                  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400': ladderSource === 'live',
                  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400': ladderSource === 'shared',
                  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400': ladderSource === 'mine',
                }"
              >{{ ladderSource === 'live' ? 'Live ladder' : ladderSource === 'shared' ? 'Shared ladder' : 'My ladder' }}</span>
            </span>
            <div class="flex gap-1.5">
              <button
                v-if="savedState && ladderSource !== 'mine'"
                @click="handleLoadSaved"
                class="px-2 py-1 text-xs font-semibold rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >My ladder</button>
              <button
                v-if="ladderSource !== 'mine'"
                @click="handleSave"
                class="px-2 py-1 text-xs font-semibold rounded border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
              >Save</button>
              <button
                @click="handleReset"
                :disabled="isLoading"
                class="px-2 py-1 text-xs font-semibold rounded border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >Live ladder</button>
            </div>
          </div>

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
            :rankingHistory="rankingHistory"
            :isLoading="isLoading"
            :hasMatches="matches.length > 0"
            :simulate="simulate"
            :getSimulationFrames="getSimulationFrames"
            :simulatedMatchWinners="simulatedMatchWinners"
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
import { watch, provide, computed } from 'vue'
import { useAFLData } from './composables/useAFLData'
import { useRanking } from './composables/useRanking'
import { useSimulation } from './composables/useSimulation'
import { useDarkMode } from './composables/useDarkMode'
import { useAnalytics } from './composables/useAnalytics'
import AppHeader from './components/AppHeader.vue'
import RoundBanner from './components/RoundBanner.vue'
import LadderTabs from './components/LadderTabs.vue'
import TeamRanker from './components/TeamRanker.vue'
import ShareBar from './components/ShareBar.vue'
import MatchList from './components/MatchList.vue'

const { isDark, toggle: toggleDark } = useDarkMode()
const { matches, teams, isLoading, error } = useAFLData()
const { ranking, tierSizes, shareUrl, rankedFromUrl, rankedFromStorage, ladderSource, savedState, rankingHistory, setRanking, setTierSizes, resetToLadder, loadSavedRanking, saveToMyLadder, snapshotRoundRanking } = useRanking()
const { actualLadder, predictedLadder, simulatedLadder, simulatedMatchWinners, simulate, getSimulationFrames } = useSimulation(ranking, matches)
const analytics = useAnalytics()

provide('matches', matches)
provide('ranking', ranking)

const currentRoundNumber = computed(() => {
  if (matches.value.length === 0) return null
  const roundMap = new Map<number, { concluded: number; total: number; hasLive: boolean }>()
  for (const m of matches.value) {
    if (!roundMap.has(m.roundNumber)) roundMap.set(m.roundNumber, { concluded: 0, total: 0, hasLive: false })
    const r = roundMap.get(m.roundNumber)!
    r.total++
    if (m.status === 'CONCLUDED') r.concluded++
    if (m.status === 'LIVE') r.hasLive = true
  }
  const rounds = Array.from(roundMap.entries()).sort(([a], [b]) => a - b)
  const inProgress = rounds.find(([, r]) => r.concluded > 0 && r.concluded < r.total)
  if (inProgress) return inProgress[0]
  const live = rounds.find(([, r]) => r.hasLive)
  if (live) return live[0]
  const upcoming = rounds.find(([, r]) => r.concluded === 0)
  return upcoming?.[0] ?? rounds[rounds.length - 1]?.[0] ?? null
})

let initialized = false
watch(actualLadder, (ladder) => {
  if (initialized) return
  if (ladder.length === 0) return
  initialized = true
  // Reset ranking first so snapshot captures the correct starting state
  if (!rankedFromUrl && !rankedFromStorage) resetToLadder(ladder)
  if (rankedFromUrl) analytics.trackSharedRankingLoaded()
  // Snapshot after ranking is finalised for this session
  const round = currentRoundNumber.value
  if (round !== null) snapshotRoundRanking(round)
})

// Handle round advancing while the app is already open (after initialisation)
watch(currentRoundNumber, (roundNum) => {
  if (roundNum !== null && initialized) snapshotRoundRanking(roundNum)
})

watch(shareUrl, (url) => {
  history.replaceState(null, '', url)
}, { immediate: true })

function handleReset() {
  if (actualLadder.value.length > 0) {
    analytics.trackLadderSourceChange('live')
    resetToLadder(actualLadder.value)
  }
}

function handleLoadSaved() {
  analytics.trackLadderSourceChange('saved')
  loadSavedRanking()
}

function handleSave() {
  analytics.trackSaveRanking()
  analytics.trackLadderSourceChange('saved_from_shared')
  saveToMyLadder()
}
</script>
