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
        :data-tour="TAB_TOUR_IDS[tab.id] || undefined"
      >
<span v-if="tab.badge" :class="tab.badgeClass">{{ tab.badge }}</span>{{ tab.label }}
      </button>
    </div>

    <!-- Tab content -->
    <div class="p-4">
      <!-- PalmyScore Predicted -->
      <div v-if="activeTab === 'palmy-predicted'" ref="palmyCaptureEl">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h2 class="text-lg font-bold text-gray-800 dark:text-gray-100">PalmyScore™ Predicted Ladder</h2>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Match winners determined by {{ palmyVenueAdjusted ? 'home/away' : 'all-games' }} PalmyScore™ predicted scores
            </p>
          </div>
          <div v-if="!capturing" class="flex items-center gap-2">
            <!-- All-games / Home-away PalmyScore toggle -->
            <div class="flex overflow-hidden rounded border border-gray-300 text-xs font-semibold dark:border-gray-600">
              <button
                @click="emit('update:palmyVenueAdjusted', false)"
                class="px-3 py-1 transition-colors"
                :class="
                  !palmyVenueAdjusted
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                "
              >All Games</button>
              <button
                @click="emit('update:palmyVenueAdjusted', true)"
                class="px-3 py-1 transition-colors"
                :class="
                  palmyVenueAdjusted
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                "
              >Home/Away</button>
            </div>
            <ScreenshotButton @click="screenshot(palmyCaptureEl, 'palmyscore-predicted-ladder.png')" />
          </div>
        </div>
        <LadderTable :ladder="palmyPredictedLadder" :isLoading="isLoading" :baselineRanking="actualLadder.map(r => r.teamId)" />
      </div>

      <!-- Predicted -->
      <div v-if="activeTab === 'predicted'" ref="predictedCaptureEl">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h2 class="text-lg font-bold text-gray-800 dark:text-gray-100">Predicted Final Ladder</h2>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Higher-ranked team wins every remaining game</p>
          </div>
          <ScreenshotButton v-if="!capturing" @click="screenshot(predictedCaptureEl, 'predicted-final-ladder.png')" />
        </div>
        <LadderTable :ladder="predictedLadder" :isLoading="isLoading" :baselineRanking="actualLadder.map(r => r.teamId)" :secondaryBaselineRanking="ranking" />
      </div>

      <!-- Simulated -->
      <div v-else-if="activeTab === 'simulated'">
       <div ref="simulatedCaptureEl">
        <div class="flex flex-wrap items-center justify-between gap-y-2 mb-3">
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
                    <template v-if="usePalmyProb">
                      <p class="text-gray-600 dark:text-gray-300 leading-relaxed">Each unplayed game is decided by PalmyScore's predicted scoreline.</p>
                      <ul class="mt-2 space-y-1 text-gray-600 dark:text-gray-300">
                        <li>· Win chance = the historical % that a PalmyScore favourite by that predicted margin actually won</li>
                        <li>· Bigger predicted margin → higher win chance</li>
                        <li>· Matches PalmyScore can't rate fall back to team ranking</li>
                      </ul>
                    </template>
                    <template v-else>
                      <p class="text-gray-600 dark:text-gray-300 leading-relaxed">Each unplayed game is decided by probability based on your team ranking, with a home ground advantage.</p>
                      <ul class="mt-2 space-y-1 text-gray-600 dark:text-gray-300">
                        <li>· Higher-ranked team wins <span class="font-semibold">60–95%</span> of the time</li>
                        <li>· Home team gets a <span class="font-semibold">+5% boost</span></li>
                        <li>· Equal teams: home wins <span class="font-semibold">55%</span></li>
                      </ul>
                    </template>
                    <p class="mt-2 text-gray-400 dark:text-gray-500">Click Simulate to run a new randomised season.</p>
                  </div>
                </template>
              </HtmlTooltip>
            </div>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              <template v-if="simulating">{{ simStage }}</template>
              <template v-else-if="usePalmyProb">Win chance from {{ simVenueAdjusted ? 'home/away' : 'all-games' }} PalmyScore's predicted margin (historical calibration)</template>
              <template v-else>Win chance scales 60–95% by rank gap, home team +5%</template>
            </p>
          </div>
          <div v-if="!capturing" class="flex flex-wrap items-center justify-end gap-2">
            <!-- Venue-adjust checkbox (only affects PalmyScore win model) -->
            <label v-if="usePalmyProb" class="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-gray-600 dark:text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                :checked="simVenueAdjusted"
                @change="emit('update:simVenueAdjusted', !simVenueAdjusted)"
                class="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
              />
              Venue adjust
            </label>
            <!-- Win model: team ranking vs PalmyScore predicted-margin calibration -->
            <div class="flex shrink-0 overflow-hidden rounded border border-gray-300 text-xs font-semibold dark:border-gray-600">
              <button
                @click="emit('update:usePalmyProb', false)"
                class="px-2.5 py-1 whitespace-nowrap transition-colors"
                :class="!usePalmyProb
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
              >Ranking</button>
              <button
                @click="emit('update:usePalmyProb', true)"
                class="px-2.5 py-1 whitespace-nowrap transition-colors"
                :class="usePalmyProb
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
              >PalmyScore</button>
            </div>
            <ScreenshotButton
              v-if="simulatedLadder && !simulating"
              class="shrink-0"
              @click="screenshot(simulatedCaptureEl, 'simulated-ladder.png')"
            />
            <button
              v-if="simulatedLadder && !simulating"
              @click="router.push('/finals')"
              class="shrink-0 whitespace-nowrap px-3 py-2 text-sm font-semibold rounded-lg border border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-900/30 transition-colors"
            >View Finals</button>
            <button
              @click="handleSimulate"
              :disabled="simulating || isLoading || !hasMatches"
              class="shrink-0 whitespace-nowrap px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-w-[90px]"
            >
              {{ simulating ? 'Running...' : 'Simulate' }}
            </button>
          </div>
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

        <!-- Simulation Range -->
        <div class="mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between mb-2">
            <div>
              <h3 class="text-sm font-bold text-gray-700 dark:text-gray-300">Simulation Range</h3>
              <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Run many simulations to see position distributions</p>
            </div>
            <div class="flex items-center gap-2">
              <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <button
                  v-for="n in RANGE_COUNTS"
                  :key="n"
                  @click="rangeCount = n"
                  class="px-2 py-1 text-xs font-semibold transition-colors"
                  :class="rangeCount === n
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'"
                >{{ n >= 1000000 ? `${n / 1000000}m` : n >= 1000 ? `${n / 1000}k` : n }}</button>
              </div>
              <label
                v-if="gpuAvailable"
                title="Simulate on the GPU instead of the CPU (experimental)"
                class="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-gray-600 dark:text-gray-300 cursor-pointer"
              >
                <input
                  type="checkbox"
                  v-model="useGpu"
                  :disabled="isRunningRange"
                  class="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
                />
                GPU
              </label>
              <div class="relative">
                <button
                  ref="runBtnEl"
                  @click="handleRunMany"
                  :disabled="isRunningRange || isLoading || !hasMatches"
                  class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 active:bg-purple-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >{{ isRunningRange ? 'Running…' : 'Run' }}</button>
                <Transition name="fire-fade">
                  <div v-if="fireActive" class="fire-wrap" aria-hidden="true">
                    <span class="flame flame-1"></span>
                    <span class="flame flame-2"></span>
                    <span class="flame flame-3"></span>
                  </div>
                </Transition>
              </div>
            </div>
          </div>
          <!-- Progress bar while a (batched) run is in flight; timing summary lingers after -->
          <div v-if="isRunningRange || rangeResults" class="mb-3">
            <div class="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 mb-1">
              <span v-if="isRunningRange">Running {{ rangeCount.toLocaleString() }} simulations…</span>
              <span v-else>{{ rangeTotal.toLocaleString() }} simulations ran in {{ formatElapsed(elapsedMs) }}</span>
              <span v-if="isRunningRange" class="flex items-center gap-2">
                <span class="tabular-nums">{{ formatElapsed(elapsedMs) }}</span>
                <span class="tabular-nums">{{ Math.round(displayProgress * 100) }}%</span>
              </span>
            </div>
            <div v-if="isRunningRange" class="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                class="h-full bg-purple-600 rounded-full"
                :style="{ width: `${displayProgress * 100}%` }"
              ></div>
            </div>
          </div>
          <SimulationRange v-if="rangeResults" :results="rangeResults" :total="rangeTotal" :stats="simStats" />
          <div v-else-if="!isRunningRange" class="text-center py-4 text-xs text-gray-400 dark:text-gray-500">
            Select a count and press Run to see finishing position distributions
          </div>
        </div>
      </div>

      <!-- Current -->
      <div v-else-if="activeTab === 'current'" ref="currentCaptureEl">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h2 class="text-lg font-bold text-gray-800 dark:text-gray-100">Current Ladder</h2>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Based on concluded matches this season</p>
          </div>
          <ScreenshotButton v-if="!capturing" @click="screenshot(currentCaptureEl, 'current-ladder.png')" />
        </div>
        <LadderTable :ladder="actualLadder" :isLoading="isLoading" />
      </div>

      <!-- Power Rankings -->
      <div v-else-if="activeTab === 'power'">
        <PowerRankings :ranking="ranking" :rankingHistory="rankingHistory" />
      </div>

      <!-- Circle of Parity -->
      <div v-else-if="activeTab === 'parity'">
        <CircleOfParity />
      </div>
    </div>
  </div>

  <!-- Smoke puff particles (5k simulation) -->
  <Teleport to="body">
    <div
      v-for="(p, i) in smokeParticles"
      :key="i"
      class="smoke-puff"
      :style="{
        left: p.x + 'px',
        top: p.y + 'px',
        width: p.size + 'px',
        height: p.size + 'px',
        '--dx': p.dx + 'px',
        '--dy': p.dy + 'px',
        animationDelay: p.delay + 'ms',
      }"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import type { LadderRow, TeamRanking } from '../types/afl'
import type { RangeEntry, SimulationStats } from '../composables/useSimulation'
import LadderTable from './LadderTable.vue'
import HtmlTooltip from './HtmlTooltip.vue'
import PowerRankings from './PowerRankings.vue'
import CircleOfParity from './CircleOfParity.vue'
import SimulationRange from './SimulationRange.vue'
import ScreenshotButton from './ScreenshotButton.vue'
import { useScreenshot } from '../composables/useScreenshot'
import { useAnalytics } from '../composables/useAnalytics'
import { powerRankingsTitle, firstMeaningfulWord } from '../composables/usePowerRankingsTitle'

const props = defineProps<{
  predictedLadder: LadderRow[]
  palmyPredictedLadder: LadderRow[]
  simulatedLadder: LadderRow[] | null
  actualLadder: LadderRow[]
  ranking: TeamRanking
  rankingHistory: Record<number, TeamRanking>
  isLoading: boolean
  hasMatches: boolean
  simulate: () => void
  getSimulationFrames: () => Array<{ roundNumber: number; roundName: string; ladder: LadderRow[] }>
  simulatedMatchWinners: Record<number, number> | null
  runMany: (n: number, useGpu?: boolean) => Promise<void>
  rangeResults: RangeEntry[] | null
  rangeTotal: number
  simStats: SimulationStats | null
  isRunningRange: boolean
  rangeProgress: number
  gpuAvailable: boolean
  viewOnly?: boolean
  palmyVenueAdjusted: boolean
  simVenueAdjusted: boolean
  usePalmyProb: boolean
}>()

const emit = defineEmits<{
  (e: 'update:palmyVenueAdjusted', value: boolean): void
  (e: 'update:simVenueAdjusted', value: boolean): void
  (e: 'update:usePalmyProb', value: boolean): void
}>()

const RANGE_COUNTS = [100, 500, 1000, 5000, 100000, 1000000, 10000000]
const rangeCount = ref(1000)
const runBtnEl = ref<HTMLElement | null>(null)

const { capturing, screenshot } = useScreenshot()
const palmyCaptureEl = ref<HTMLElement | null>(null)
const predictedCaptureEl = ref<HTMLElement | null>(null)
const simulatedCaptureEl = ref<HTMLElement | null>(null)
const currentCaptureEl = ref<HTMLElement | null>(null)

interface SmokeParticle { x: number; y: number; dx: number; dy: number; size: number; delay: number }
const smokeParticles = ref<SmokeParticle[]>([])

const SMOKE_PUFFS: Array<{ dx: number; dy: number; size: number; delay: number }> = [
  { dx:  -5, dy: -55, size: 28, delay:   0 },
  { dx:  30, dy: -48, size: 22, delay:  40 },
  { dx: -38, dy: -40, size: 20, delay:  70 },
  { dx:  52, dy: -30, size: 18, delay:  20 },
  { dx: -18, dy: -60, size: 24, delay: 100 },
  { dx:  60, dy: -18, size: 16, delay:  55 },
  { dx:  12, dy: -52, size: 20, delay:  15 },
  { dx: -55, dy: -22, size: 14, delay:  85 },
]

function triggerSmoke() {
  // Skip if a puff is still mid-animation: since the particles reuse the same
  // v-for keys, restarting mid-flight would just snap their style instead of
  // replaying the animation. Let each burst finish before the next can start.
  if (!runBtnEl.value || smokeParticles.value.length > 0) return
  const rect = runBtnEl.value.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  smokeParticles.value = SMOKE_PUFFS.map((p) => ({ x: cx, y: cy, ...p }))
  setTimeout(() => { smokeParticles.value = [] }, 1400)
}

// Smoke puffs once per batch while a big-enough run is in flight (past 10%
// progress), as a visible "still working" pulse. For the 1m option, fire
// takes over instead: it ignites once progress passes 30% and keeps burning
// for a few seconds after the run finishes, replacing the smoke entirely
// rather than running alongside it.
const SMOKE_MIN_COUNT = 5000
const SMOKE_START_PROGRESS = 0.1
const FIRE_THRESHOLD = 1000000
const FIRE_START_PROGRESS = 0.3
const FIRE_LINGER_MS = 5000

const activeRunCount = ref(0)
const fireActive = ref(false)
let fireHideTimer: ReturnType<typeof setTimeout> | null = null

function clearFireHideTimer() {
  if (fireHideTimer !== null) { clearTimeout(fireHideTimer); fireHideTimer = null }
}

const useGpu = ref(false)

async function handleRunMany() {
  if (props.isRunningRange || props.isLoading || !props.hasMatches) return
  activeRunCount.value = rangeCount.value
  await props.runMany(rangeCount.value, useGpu.value)
}

watch(() => props.isRunningRange, (running) => {
  if (running) {
    // A fresh run starts unlit; the progress watcher below re-ignites it once
    // this run crosses the threshold.
    clearFireHideTimer()
    fireActive.value = false
  } else if (activeRunCount.value >= FIRE_THRESHOLD && fireActive.value) {
    clearFireHideTimer()
    fireHideTimer = setTimeout(() => { fireActive.value = false }, FIRE_LINGER_MS)
  }
})

watch(() => props.rangeProgress, (progress) => {
  if (!props.isRunningRange) return
  if (activeRunCount.value >= FIRE_THRESHOLD) {
    if (progress >= FIRE_START_PROGRESS) { fireActive.value = true; return }
  }
  if (!fireActive.value && activeRunCount.value >= SMOKE_MIN_COUNT && progress >= SMOKE_START_PROGRESS) {
    triggerSmoke()
  }
})

// Progress lands in discrete jumps (one per simulation batch), which can be
// visibly spaced out at high run counts. Smooth those jumps into continuous
// motion: glide quickly toward a batch's real progress when it lands, then
// trickle slowly toward it while waiting for the next one, instead of sitting
// frozen. The same tick drives a live stopwatch of how long the run has taken.
const displayProgress = ref(0)
const elapsedMs = ref(0)
let progressRafId: number | null = null
let runStartTime = 0

function stopProgressAnim() {
  if (progressRafId !== null) { cancelAnimationFrame(progressRafId); progressRafId = null }
}

function tickProgress() {
  elapsedMs.value = performance.now() - runStartTime
  const target = props.rangeProgress
  if (target >= 1) {
    displayProgress.value = 1
    progressRafId = null
    return
  }
  displayProgress.value = displayProgress.value < target
    ? displayProgress.value + (target - displayProgress.value) * 0.35 + 0.004
    : displayProgress.value + (Math.min(0.99, target + 0.05) - displayProgress.value) * 0.02
  progressRafId = requestAnimationFrame(tickProgress)
}

function formatElapsed(ms: number): string {
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  return `${m}m ${(s - m * 60).toFixed(0)}s`
}

watch(() => props.isRunningRange, (running) => {
  stopProgressAnim()
  if (running) {
    displayProgress.value = 0
    runStartTime = performance.now()
    elapsedMs.value = 0
    progressRafId = requestAnimationFrame(tickProgress)
  } else if (props.rangeProgress >= 1) {
    displayProgress.value = 1
    elapsedMs.value = performance.now() - runStartTime
  }
})

onUnmounted(() => { stopProgressAnim(); clearFireHideTimer() })

const powerLabel = computed(() => ' ' + firstMeaningfulWord(powerRankingsTitle.value))

const ALL_TABS = computed(() => [
  { id: 'predicted', badge: 'P', badgeClass: 'px-1 rounded text-[1em] font-bold leading-tight bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400', label: 'redicted' },
  { id: 'palmy-predicted', badge: 'PS', badgeClass: 'px-1 rounded text-[1em] font-bold leading-tight bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400', label: '™' },
  { id: 'simulated', badge: 'S', badgeClass: 'px-1 rounded text-[1em] font-bold leading-tight bg-purple-500 text-white', label: 'imulated' },
  { id: 'current',   badge: null, badgeClass: '', label: 'Current' },
  { id: 'power',     badge: '↕', badgeClass: 'text-[1em] font-bold text-amber-500 dark:text-amber-400', label: powerLabel.value },
  { id: 'parity',   badge: null, badgeClass: '', label: 'Parity' },
])

const TABS = computed(() =>
  props.viewOnly
    ? ALL_TABS.value.filter((t) => t.id !== 'predicted' && t.id !== 'palmy-predicted' && t.id !== 'simulated')
    : ALL_TABS.value
)

const analytics = useAnalytics()
const router = useRouter()

const TAB_TOUR_IDS: Record<string, string> = {
  predicted: 'predicted-tab',
  'palmy-predicted': 'palmy-predicted-tab',
  simulated: 'simulated-tab',
  power: 'power-rankings-tab',
  parity: 'parity-tab',
}

const VALID_TAB_IDS = new Set(['predicted', 'palmy-predicted', 'simulated', 'current', 'power', 'parity'])

function tabFromHash(): string {
  const hash = window.location.hash.slice(1)
  const fallback = props.viewOnly ? 'current' : 'predicted'
  if (!VALID_TAB_IDS.has(hash)) return fallback
  if (props.viewOnly && (hash === 'predicted' || hash === 'simulated')) return 'current'
  return hash
}

const activeTab = ref(tabFromHash())
const simulating = ref(false)
const simStage = ref('')
const animatingLadder = ref<LadderRow[] | null>(null)

const ROUND_DELAY_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function switchTab(id: string) {
  activeTab.value = id
  window.location.hash = id
  analytics.trackTabSwitch(id as 'predicted' | 'palmy-predicted' | 'simulated' | 'current' | 'power' | 'parity')
}

function onHashChange() {
  const tab = tabFromHash()
  if (tab !== activeTab.value) activeTab.value = tab
}

onMounted(() => window.addEventListener('hashchange', onHashChange))
onUnmounted(() => window.removeEventListener('hashchange', onHashChange))

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

<style scoped>
.smoke-puff {
  position: fixed;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(160, 160, 160, 0.8) 0%, rgba(200, 200, 200, 0) 70%);
  pointer-events: none;
  z-index: 9999;
  transform: translate(-50%, -50%);
  animation: smoke-puff 1s ease-out forwards;
}

@keyframes smoke-puff {
  0% {
    transform: translate(-50%, -50%) scale(0.2);
    opacity: 1;
  }
  40% {
    opacity: 0.6;
  }
  100% {
    transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(3);
    opacity: 0;
  }
}

.fire-wrap {
  position: absolute;
  left: 50%;
  bottom: 100%;
  transform: translateX(-50%);
  width: 40px;
  height: 34px;
  pointer-events: none;
  z-index: 20;
}

.flame {
  position: absolute;
  bottom: 0;
  left: 50%;
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  background: radial-gradient(circle at 50% 70%, #fff3b0 0%, #ffb703 35%, #fb5607 65%, rgba(230, 57, 70, 0) 85%);
  transform-origin: 50% 100%;
  animation: flame-flicker 0.6s ease-in-out infinite alternate;
}

.flame-1 { width: 22px; height: 30px; margin-left: -11px; animation-delay: 0s; }
.flame-2 { width: 14px; height: 20px; margin-left: -20px; opacity: 0.85; animation-delay: 0.15s; }
.flame-3 { width: 14px; height: 20px; margin-left: 6px; opacity: 0.85; animation-delay: 0.3s; }

@keyframes flame-flicker {
  0%   { transform: scaleY(1) scaleX(1) rotate(-2deg); opacity: 0.95; }
  50%  { transform: scaleY(1.12) scaleX(0.92) rotate(1deg); opacity: 1; }
  100% { transform: scaleY(0.9) scaleX(1.05) rotate(-1deg); opacity: 0.85; }
}

.fire-fade-enter-active { transition: opacity 0.4s ease; }
.fire-fade-leave-active { transition: opacity 0.8s ease; }
.fire-fade-enter-from,
.fire-fade-leave-to { opacity: 0; }
</style>
