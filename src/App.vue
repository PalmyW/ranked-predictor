<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">AFL 2026 Season Predictor</h1>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Rank teams 1–18 to predict the final ladder
          </p>
        </div>
        <div class="flex items-center gap-3">
          <div class="text-xs text-gray-400 dark:text-gray-500 text-right hidden sm:block">
            <span v-if="isLoading">Loading fixture...</span>
            <span v-else-if="matches.length > 0">{{ matches.length }} matches loaded</span>
          </div>
          <!-- Dark mode toggle -->
          <button
            @click="toggleDark"
            class="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          >
            <span v-if="isDark">☀️</span>
            <span v-else>🌙</span>
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-6xl mx-auto px-4 py-6">
      <!-- Error banner -->
      <div v-if="error" class="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
        Failed to load fixture data: {{ error }}. Rankings still work but ladder data may be incomplete.
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Left: Team Ranker -->
        <section class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
          <h2 class="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">Your Team Ranking</h2>
          <p class="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Higher-ranked team always wins remaining games
          </p>
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
          <!-- Tab switcher -->
          <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            <!-- Tab bar -->
            <div class="flex border-b border-gray-200 dark:border-gray-700">
              <button
                v-for="tab in tabs"
                :key="tab.id"
                @click="activeTab = tab.id"
                class="flex-1 py-2.5 text-sm font-semibold transition-colors"
                :class="activeTab === tab.id
                  ? 'text-blue-500 border-b-2 border-blue-500 -mb-px'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
              >
                {{ tab.label }}
              </button>
            </div>

            <!-- Tab content -->
            <div class="p-4">
              <!-- Predicted -->
              <div v-if="activeTab === 'predicted'">
                <div class="flex items-center justify-between mb-3">
                  <div>
                    <h2 class="text-lg font-bold text-gray-800 dark:text-gray-100">Predicted Final Ladder</h2>
                    <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Higher-ranked team wins every remaining game</p>
                  </div>
                </div>
                <LadderTable :ladder="predictedLadder" :isLoading="isLoading" :baselineRanking="ranking" />
              </div>

              <!-- Simulated -->
              <div v-else-if="activeTab === 'simulated'">
                <div class="flex items-center justify-between mb-3">
                  <div>
                    <div class="flex items-center gap-1">
                      <h2 class="text-lg font-bold text-gray-800 dark:text-gray-100">Simulated Ladder</h2>
                      <HtmlTooltip placement="below">
                        <template #trigger="{ toggle }">
                          <button @click.stop="toggle" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm leading-none">ⓘ</button>
                        </template>
                        <template #content>
                          <div class="p-3 max-w-[240px]">
                            <p class="font-semibold mb-1 text-gray-800 dark:text-gray-100">Simulated Ladder</p>
                            <p class="text-gray-600 dark:text-gray-300 leading-relaxed">Each unplayed game is decided by probability based on your team ranking.</p>
                            <ul class="mt-2 space-y-1 text-gray-600 dark:text-gray-300">
                              <li>· <span class="font-semibold">1 place apart</span> → 60% win chance</li>
                              <li>· <span class="font-semibold">17 places apart</span> → 95% win chance</li>
                            </ul>
                            <p class="mt-2 text-gray-400 dark:text-gray-500">Click Simulate to run a new randomised season.</p>
                          </div>
                        </template>
                      </HtmlTooltip>
                    </div>
                    <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Win chance scales from 60% (1 place apart) to 95% (17 places apart)</p>
                  </div>
                  <button
                    @click="handleSimulate"
                    :disabled="simulating || isLoading || !matches.length"
                    class="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-[90px]"
                  >
                    {{ simulating ? 'Running...' : 'Simulate' }}
                  </button>
                </div>

                <!-- Progress bar -->
                <div v-if="simulating" class="mb-4">
                  <div class="flex justify-between text-xs text-gray-400 dark:text-gray-500 mb-1">
                    <span>{{ simStage }}</span>
                    <span>{{ Math.round(simProgress) }}%</span>
                  </div>
                  <div class="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-blue-500 rounded-full transition-none"
                      :style="{ width: simProgress + '%' }"
                    />
                  </div>
                </div>

                <div v-if="!simulating && !simulatedLadder" class="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                  Press Simulate to run a randomised season
                </div>
                <LadderTable v-if="!simulating && simulatedLadder" :ladder="simulatedLadder" :isLoading="false" :baselineRanking="predictedLadder.map(r => r.teamId)" />
              </div>

              <!-- Current -->
              <div v-else-if="activeTab === 'current'">
                <div class="flex items-center justify-between mb-3">
                  <div>
                    <h2 class="text-lg font-bold text-gray-800 dark:text-gray-100">Current Ladder</h2>
                    <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Based on concluded matches this season</p>
                  </div>
                </div>
                <LadderTable :ladder="actualLadder" :isLoading="isLoading" />
              </div>
            </div>
          </div>

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
import { ref, watch } from 'vue'
import { useAFLData } from './composables/useAFLData'
import { useRanking } from './composables/useRanking'
import { useSimulation } from './composables/useSimulation'
import { useDarkMode } from './composables/useDarkMode'
import TeamRanker from './components/TeamRanker.vue'
import LadderTable from './components/LadderTable.vue'
import ShareBar from './components/ShareBar.vue'
import MatchList from './components/MatchList.vue'
import HtmlTooltip from './components/HtmlTooltip.vue'

const { isDark, toggle: toggleDark } = useDarkMode()
const { matches, teams, isLoading, error } = useAFLData()
const {
  ranking,
  tierSizes,
  shareUrl,
  rankedFromUrl,
  rankedFromStorage,
  setRanking,
  setTierSizes,
  resetToLadder,
} = useRanking()
const { actualLadder, predictedLadder, simulatedLadder, simulatedMatchWinners, simulate } = useSimulation(ranking, matches)

const tabs = [
  { id: 'predicted', label: 'Predicted' },
  { id: 'simulated', label: 'Simulated' },
  { id: 'current',   label: 'Current' },
]
const activeTab = ref('predicted')

const simulating = ref(false)
const simProgress = ref(0)
const simStage = ref('')

const SIM_STAGES = [
  { label: 'Analysing fixture data...', to: 30, duration: 350 },
  { label: 'Running match simulations...', to: 70, duration: 600 },
  { label: 'Calculating final standings...', to: 92, duration: 500 },
  { label: 'Finalising results...', to: 100, duration: 250 },
]

function animateProgress(from: number, to: number, duration: number): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now()
    function step(now: number) {
      const t = Math.min((now - start) / duration, 1)
      simProgress.value = from + (to - from) * easeOut(t)
      if (t < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 2)
}

async function handleSimulate() {
  if (simulating.value || isLoading.value || !matches.value.length) return
  simulating.value = true
  simProgress.value = 0

  let from = 0
  for (const stage of SIM_STAGES) {
    simStage.value = stage.label
    // Run actual simulation at the start of the last stage
    if (stage === SIM_STAGES[SIM_STAGES.length - 1]) simulate()
    await animateProgress(from, stage.to, stage.duration)
    from = stage.to
  }

  await new Promise((r) => setTimeout(r, 150))
  simulating.value = false
  simProgress.value = 0
}

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
