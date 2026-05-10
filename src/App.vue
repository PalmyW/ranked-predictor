<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
    <div>
      <AppHeader
        :isLoading="isLoading"
        :syncedAt="syncedAt"
        :isDark="isDark"
        :currentView="currentView"
        @toggle-dark="toggleDark"
        @navigate="currentView = $event"
      />
      <RoundBanner v-if="currentView === 'predictor' && !isLoading && matches.length > 0" :matches="matches" :ranking="ranking" :simulatedMatchWinners="simulatedMatchWinners" />
    </div>

    <StatsBrowser
      v-if="currentView === 'stats'"
      :matches="matches"
      :initialProviderId="statsMatchId"
      @match-changed="statsMatchId = $event"
    />

    <main v-if="currentView === 'predictor'" class="max-w-6xl mx-auto px-4 py-6">
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
import { ref, watch, provide, computed } from 'vue'
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
import StatsBrowser from './components/StatsBrowser.vue'

const urlParams = new URLSearchParams(location.search)
const currentView = ref<'predictor' | 'stats'>(
  urlParams.get('view') === 'stats' ? 'stats' : 'predictor',
)
const statsMatchId = ref<string | null>(urlParams.get('match'))

const { isDark, toggle: toggleDark } = useDarkMode()
const { matches, teams, isLoading, error, syncedAt } = useAFLData()
const { ranking, tierSizes, shareUrl, rankedFromUrl, rankedFromStorage, ladderSource, savedState, rankingHistory, setRanking, setTierSizes, resetToLadder, loadSavedRanking, saveToMyLadder, seedHistoryFromSavedRanking, snapshotRoundRanking, updateRoundSnapshot } = useRanking()
const { actualLadder, predictedLadder, simulatedLadder, simulatedMatchWinners, simulate, getSimulationFrames } = useSimulation(ranking, matches)
const analytics = useAnalytics()

provide('matches', matches)
provide('ranking', ranking)

// The round to snapshot against: the highest round where at least one match has started.
// As soon as the first match of round N goes live, all ranking changes are saved under round N.
const currentRoundNumber = computed(() => {
  if (matches.value.length === 0) return null
  let max: number | null = null
  for (const m of matches.value) {
    if (m.status === 'LIVE' || m.status === 'CONCLUDED') {
      if (max === null || m.roundNumber > max) max = m.roundNumber
    }
  }
  return max
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
  if (round !== null) {
    seedHistoryFromSavedRanking(round)
    snapshotRoundRanking(round)
  }
})

// Handle round advancing while the app is already open (after initialisation)
watch(currentRoundNumber, (roundNum) => {
  if (roundNum !== null && initialized) snapshotRoundRanking(roundNum)
})

// Keep the current round's history entry in sync with every ranking change
watch(ranking, () => {
  if (!initialized) return
  const round = currentRoundNumber.value
  if (round !== null) updateRoundSnapshot(round)
}, { deep: true })

watch([currentView, statsMatchId, shareUrl], () => {
  if (currentView.value === 'predictor') {
    history.replaceState(null, '', shareUrl.value)
  } else {
    const params = new URLSearchParams()
    params.set('view', 'stats')
    if (statsMatchId.value) params.set('match', statsMatchId.value)
    history.replaceState(null, '', `?${params}`)
  }
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
