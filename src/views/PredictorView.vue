<template>
  <div>
    <RoundBanner v-if="!isLoading && matches.length > 0" :matches="matches" :ranking="ranking" :simulatedMatchWinners="simulatedMatchWinners" />

    <main class="max-w-6xl mx-auto px-4 py-6">
      <!-- Error banner -->
      <div v-if="error" class="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
        Failed to load fixture data: {{ error }}. Rankings still work but ladder data may be incomplete.
      </div>

      <!-- View-only banner for historical seasons -->
      <div v-if="!isCurrentSeason" class="mb-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded text-amber-700 dark:text-amber-400 text-sm">
        Viewing {{ activeSeasonYear }} — prediction features are only available for the current season.
      </div>

      <div class="grid gap-6" :class="isCurrentSeason ? 'grid-cols-1 lg:grid-cols-[1fr_2fr]' : 'grid-cols-1'">
        <!-- Left: Team Ranker (current season only) -->
        <section v-if="isCurrentSeason" class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">

          <!-- Ladder source controls -->
          <div data-tour="ladder-source" class="mb-3 p-2.5 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2">
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
            <div data-tour="ranking-actions" class="flex gap-1.5">
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
            :runMany="runMany"
            :rangeResults="rangeResults"
            :rangeTotal="rangeTotal"
            :isRunningRange="isRunningRange"
            :viewOnly="!isCurrentSeason"
          />

          <!-- Share (current season only) -->
          <div v-if="isCurrentSeason" data-tour="share-bar" class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
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
import { computed, watch, provide } from 'vue'
import { useAFLData } from '../composables/useAFLData'
import { useRanking } from '../composables/useRanking'
import { useSimulation } from '../composables/useSimulation'
import { useAnalytics } from '../composables/useAnalytics'
import { useSeason } from '../composables/useSeason'
import RoundBanner from '../components/RoundBanner.vue'
import LadderTabs from '../components/LadderTabs.vue'
import TeamRanker from '../components/TeamRanker.vue'
import ShareBar from '../components/ShareBar.vue'
import MatchList from '../components/MatchList.vue'

const { matches, teams, isLoading, error } = useAFLData()
const { isCurrentSeason, activeSeasonYear } = useSeason()
const { ranking, tierSizes, shareUrl, rankedFromUrl, rankedFromStorage, ladderSource, savedState, rankingHistory, setRanking, setTierSizes, resetToLadder, loadSavedRanking, saveToMyLadder, seedHistoryFromSavedRanking, snapshotRoundRanking, updateRoundSnapshot } = useRanking()
const { actualLadder, predictedLadder, simulatedLadder, simulatedMatchWinners, simulate, getSimulationFrames, rangeResults, rangeTotal, isRunningRange, runMany } = useSimulation(ranking, matches)
const analytics = useAnalytics()

provide('matches', matches)
provide('ranking', ranking)

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
  if (!rankedFromUrl && !rankedFromStorage) resetToLadder(ladder)
  if (rankedFromUrl) analytics.trackSharedRankingLoaded()
  const round = currentRoundNumber.value
  if (round !== null) {
    seedHistoryFromSavedRanking(round)
    snapshotRoundRanking(round)
  }
})

watch(currentRoundNumber, (roundNum) => {
  if (roundNum !== null && initialized) snapshotRoundRanking(roundNum)
})

watch(ranking, () => {
  if (!initialized) return
  const round = currentRoundNumber.value
  if (round !== null) updateRoundSnapshot(round)
}, { deep: true })

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
