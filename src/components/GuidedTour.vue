<template>
  <Teleport to="body">
    <template v-if="isActive">
      <!-- SVG spotlight overlay -->
      <svg
        class="fixed inset-0 pointer-events-auto"
        :style="{ zIndex: 10000, width: '100vw', height: '100vh' }"
        @click.self="skipTour"
        @keydown.escape="skipTour"
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              v-if="targetRect"
              :x="targetRect.x - PADDING"
              :y="targetRect.y - PADDING"
              :width="targetRect.width + PADDING * 2"
              :height="targetRect.height + PADDING * 2"
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.65)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      <!-- Highlight ring around target element -->
      <div
        v-if="targetRect"
        class="fixed pointer-events-none rounded-lg"
        :style="{
          zIndex: 10001,
          top: `${targetRect.y - PADDING}px`,
          left: `${targetRect.x - PADDING}px`,
          width: `${targetRect.width + PADDING * 2}px`,
          height: `${targetRect.height + PADDING * 2}px`,
          boxShadow: '0 0 0 2px #aa3bff, 0 0 0 5px rgba(170, 59, 255, 0.3)',
        }"
      />

      <!-- Tour card -->
      <div
        class="fixed bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl pointer-events-auto"
        :style="cardStyle"
      >
        <!-- Step counter + skip -->
        <div class="flex items-center justify-between px-4 pt-4 pb-1">
          <span class="text-xs font-semibold text-gray-400 dark:text-gray-500">
            {{ stepNumber }} / {{ totalSteps }}
          </span>
          <button
            @click="skipTour"
            class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Skip tour
          </button>
        </div>

        <!-- Animated step content -->
        <Transition name="tour-slide" mode="out-in">
          <div :key="currentStep" class="px-4 pt-1 pb-3">
            <h3 class="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">
              {{ step.title }}
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {{ step.description }}
            </p>
          </div>
        </Transition>

        <!-- Progress dots -->
        <div class="flex justify-center gap-1 px-4 pb-2">
          <div
            v-for="i in totalSteps"
            :key="i"
            class="rounded-full transition-all duration-200"
            :style="
              i - 1 === currentStep
                ? { background: '#aa3bff', width: '16px', height: '6px' }
                : { background: '', width: '6px', height: '6px' }
            "
            :class="i - 1 === currentStep ? '' : 'bg-gray-200 dark:bg-gray-700'"
          />
        </div>

        <!-- Prev / Next controls -->
        <div class="flex items-center gap-2 px-4 pb-4 pt-1">
          <button
            v-if="!isFirst"
            @click="prevStep"
            class="flex-1 py-2 text-sm font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Previous
          </button>
          <button
            @click="nextStep"
            class="flex-1 py-2 text-sm font-semibold rounded-lg text-white transition-colors hover:opacity-90"
            :style="{ background: '#aa3bff' }"
          >
            {{ isLast ? 'Done' : 'Next' }}
          </button>
        </div>
      </div>
    </template>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTour } from '../composables/useTour'
import { useAFLData } from '../composables/useAFLData'

const { isActive, currentStep, step, stepNumber, totalSteps, isFirst, isLast, nextStep, prevStep, skipTour } = useTour()
const router = useRouter()
const route = useRoute()
const { matches } = useAFLData()

const prevStepId = ref<string | null>(null)

const PADDING = 6
const CARD_WIDTH = 320
const CARD_MARGIN = 12
const CARD_GAP = 12
const ESTIMATED_CARD_HEIGHT = 230

interface Rect { x: number; y: number; width: number; height: number }

const targetRect = ref<Rect | null>(null)
const cardStyle = ref<Record<string, string>>({})

function buildCenteredCard(): void {
  const actualWidth = Math.min(CARD_WIDTH, window.innerWidth - CARD_MARGIN * 2)
  cardStyle.value = {
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: `${actualWidth}px`,
    zIndex: '10002',
  }
}

async function updatePosition(): Promise<void> {
  await nextTick()

  // Navigate to the step's route if we're not already there
  const stepRoute: string | undefined = (step.value as { route?: string }).route
  if (stepRoute) {
    const alreadyOnRoute = stepRoute === '/'
      ? route.path === '/'
      : route.path.startsWith(stepRoute)

    if (!alreadyOnRoute) {
      let targetPath = stepRoute
      let waitMs = 150

      if (stepRoute === '/stats') {
        // Navigate to the last concluded match so the stats table loads automatically
        const lastConcluded = [...matches.value]
          .filter((m) => m.status === 'CONCLUDED')
          .sort((a, b) => b.roundNumber - a.roundNumber)[0]
        if (lastConcluded) {
          targetPath = `/stats/${lastConcluded.providerId}`
        }
        waitMs = 800  // give the stats JSON time to fetch and render
      }

      if (stepRoute === '/season-stats') {
        waitMs = 100
      }

      if (stepRoute === '/rankings') {
        waitMs = 100
      }

      await router.push(targetPath)
      await nextTick()
      await new Promise<void>((r) => setTimeout(r, waitMs))
    }
  }

  // For season stats steps that need data: click the first team if none is loaded yet.
  if (step.value.id === 'season-stats-table' || step.value.id === 'season-mode-toggle') {
    const tableVisible = !!document.querySelector('[data-tour="season-stats-table"]')
    if (!tableVisible) {
      const firstTeamBtn = document.querySelector('[data-tour="season-team-browser"] button') as HTMLElement | null
      if (firstTeamBtn) {
        firstTeamBtn.click()
        await new Promise<void>((r) => setTimeout(r, 800))
      }
    }
  }

  // For the columns step: scroll the button into view first so the panel positions correctly,
  // then programmatically open the panel so we can spotlight it.
  if (step.value.id === 'stats-columns') {
    const btn = document.querySelector('[data-tour="stats-columns-btn"]') as HTMLElement | null
    if (btn) {
      btn.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'center', inline: 'nearest' })
      await nextTick()
      const panelAlreadyOpen = !!document.querySelector('[data-tour="stats-columns-panel"]')
      if (!panelAlreadyOpen) {
        btn.click()
        await nextTick()
        await new Promise<void>((r) => setTimeout(r, 80))
      }
    }
  }

  const target = step.value.target ? document.querySelector(step.value.target) : null

  if (!target) {
    targetRect.value = null
    buildCenteredCard()
    return
  }

  // Instant scroll so the layout settles before we measure
  target.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'center', inline: 'nearest' })
  await nextTick()

  const rect = target.getBoundingClientRect()

  // Treat zero-size elements as not found (hidden/collapsed)
  if (rect.width === 0 && rect.height === 0) {
    targetRect.value = null
    buildCenteredCard()
    return
  }

  targetRect.value = { x: rect.left, y: rect.top, width: rect.width, height: rect.height }

  const vw = window.innerWidth
  const vh = window.innerHeight
  const actualWidth = Math.min(CARD_WIDTH, vw - CARD_MARGIN * 2)

  // Prefer card below target, flip above if not enough room
  const spaceBelow = vh - rect.bottom - CARD_GAP - CARD_MARGIN
  const spaceAbove = rect.top - CARD_GAP - CARD_MARGIN

  let top: number
  if (spaceBelow >= ESTIMATED_CARD_HEIGHT || spaceBelow >= spaceAbove) {
    top = rect.bottom + CARD_GAP
  } else {
    top = rect.top - CARD_GAP - ESTIMATED_CARD_HEIGHT
  }

  top = Math.max(CARD_MARGIN, Math.min(top, vh - ESTIMATED_CARD_HEIGHT - CARD_MARGIN))

  let left = rect.left + rect.width / 2 - actualWidth / 2
  left = Math.max(CARD_MARGIN, Math.min(left, vw - actualWidth - CARD_MARGIN))

  cardStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    width: `${actualWidth}px`,
    zIndex: '10002',
  }
}

watch([isActive, currentStep], async () => {
  // Close the columns panel when navigating away from that step
  if (prevStepId.value === 'stats-columns') {
    const panel = document.querySelector('[data-tour="stats-columns-panel"]')
    if (panel) {
      const btn = document.querySelector('[data-tour="stats-columns-btn"]') as HTMLElement | null
      btn?.click()
    }
  }
  prevStepId.value = step.value.id
  if (isActive.value) await updatePosition()
})

function onResize() {
  if (isActive.value) updatePosition()
}

function onKeydown(e: KeyboardEvent) {
  if (!isActive.value) return
  if (e.key === 'Escape') skipTour()
  else if (e.key === 'ArrowRight') nextStep()
  else if (e.key === 'ArrowLeft') prevStep()
}

onMounted(() => {
  window.addEventListener('resize', onResize, { passive: true })
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.tour-slide-enter-active,
.tour-slide-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.tour-slide-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.tour-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
