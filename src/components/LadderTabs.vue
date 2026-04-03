<template>
  <div class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
    <!-- Tab bar -->
    <div class="flex border-b border-gray-200 dark:border-gray-700">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        @click="switchTab(tab.id)"
        class="flex-1 flex items-center justify-center gap-1 py-2.5 text-sm font-semibold transition-colors"
        :class="activeTab === tab.id
          ? 'text-blue-500 border-b-2 border-blue-500 -mb-px'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
      >
<span v-if="tab.badge" :class="tab.badgeClass">{{ tab.badge }}</span>{{ tab.label }}
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
        <LadderTable :ladder="predictedLadder" :isLoading="isLoading" :baselineRanking="actualLadder.map(r => r.teamId)" :secondaryBaselineRanking="ranking" />
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
                    <p class="text-gray-600 dark:text-gray-300 leading-relaxed">Each unplayed game is decided by probability based on your team ranking, with a home ground advantage.</p>
                    <ul class="mt-2 space-y-1 text-gray-600 dark:text-gray-300">
                      <li>· Higher-ranked team wins <span class="font-semibold">60–95%</span> of the time</li>
                      <li>· Home team gets a <span class="font-semibold">+5% boost</span></li>
                      <li>· Equal teams: home wins <span class="font-semibold">55%</span></li>
                    </ul>
                    <p class="mt-2 text-gray-400 dark:text-gray-500">Click Simulate to run a new randomised season.</p>
                  </div>
                </template>
              </HtmlTooltip>
            </div>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              <template v-if="simulating">{{ simStage }}</template>
              <template v-else>Win chance scales 60–95% by rank gap, home team +5%</template>
            </p>
          </div>
          <button
            @click="handleSimulate"
            :disabled="simulating || isLoading || !hasMatches"
            class="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-[90px]"
          >
            {{ simulating ? 'Running...' : 'Simulate' }}
          </button>
        </div>

        <div v-if="!simulatedLadder && !simulating" class="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
          Press Simulate to run a randomised season
        </div>

        <!-- Live animated ladder during simulation, or final result -->
        <LadderTable
          v-if="animatingLadder || simulatedLadder"
          :ladder="animatingLadder ?? simulatedLadder ?? []"
          :isLoading="false"
          :baselineRanking="actualLadder.map(r => r.teamId)"
          :secondaryBaselineRanking="ranking"
          :simulatedMatchWinners="simulating ? undefined : simulatedMatchWinners"
          :animated="simulating"
        />
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
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { LadderRow, TeamRanking } from '../types/afl'
import LadderTable from './LadderTable.vue'
import HtmlTooltip from './HtmlTooltip.vue'
import { useAnalytics } from '../composables/useAnalytics'

const props = defineProps<{
  predictedLadder: LadderRow[]
  simulatedLadder: LadderRow[] | null
  actualLadder: LadderRow[]
  ranking: TeamRanking
  isLoading: boolean
  hasMatches: boolean
  simulate: () => void
  getSimulationFrames: () => Array<{ roundNumber: number; roundName: string; ladder: LadderRow[] }>
  simulatedMatchWinners: Record<number, number> | null
}>()

const TABS = [
  { id: 'predicted', badge: 'P', badgeClass: 'px-1 rounded text-[1em] font-bold leading-tight bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400', label: 'redicted' },
  { id: 'simulated', badge: 'S', badgeClass: 'px-1 rounded text-[1em] font-bold leading-tight bg-purple-500 text-white', label: 'imulated' },
  { id: 'current',   badge: null, badgeClass: '', label: 'Current' },
]

const analytics = useAnalytics()

const activeTab = ref('predicted')
const simulating = ref(false)
const simStage = ref('')
const animatingLadder = ref<LadderRow[] | null>(null)

const ROUND_DELAY_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function switchTab(id: string) {
  activeTab.value = id
  analytics.trackTabSwitch(id as 'predicted' | 'simulated' | 'current')
}

async function handleSimulate() {
  if (simulating.value || props.isLoading || !props.hasMatches) return
  analytics.trackSimulate()
  simulating.value = true
  animatingLadder.value = null
  simStage.value = 'Simulating season...'

  // Run the actual simulation (instantaneous)
  props.simulate()

  // Get per-round frames
  const frames = props.getSimulationFrames()

  // Animate round by round
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]
    simStage.value = frame.roundName
    animatingLadder.value = frame.ladder
    await sleep(ROUND_DELAY_MS)
  }

  await sleep(200)
  animatingLadder.value = null
  simulating.value = false
  simStage.value = ''
}
</script>
