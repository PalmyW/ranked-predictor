<script setup lang="ts">
import { ref, computed } from 'vue'
import winProb from '../data/palmyWinProb.json'
import { palmyTrends } from '../utils/palmyWinProb'

const props = defineProps<{
  // Which variant the page is currently using — drawn emphasised
  variant?: 'all' | 'ha'
}>()

const HA = winProb.ha as number[]
const ALL = winProb.all as number[]
const GAMES_HA = (winProb._gamesHa ?? []) as number[]
const GAMES_ALL = (winProb._gamesAll ?? []) as number[]
const X_MAX = winProb.maxMargin as number

// SVG geometry (viewBox units)
const W = 640
const H = 320
const M = { l: 46, r: 14, t: 26, b: 38 }
const plotW = W - M.l - M.r
const plotH = H - M.t - M.b
const Y_MIN = 0.4
const Y_MAX = 1.0

const xPx = (margin: number) => M.l + (margin / X_MAX) * plotW
const yPx = (p: number) => M.t + (1 - (p - Y_MIN) / (Y_MAX - Y_MIN)) * plotH

// Scatter: one dot per predicted margin that actually has games, radius scaled
// by sample size so reliable (big-sample) points read larger.
function scatter(arr: number[], games: number[]) {
  const pts: { x: number; y: number; r: number }[] = []
  for (let m = 0; m <= X_MAX; m++) {
    const g = games[m] ?? 0
    if (g <= 0) continue
    pts.push({ x: xPx(m), y: yPx(arr[m]), r: Math.min(7, 2 + Math.sqrt(g) * 0.55) })
  }
  return pts
}

const haDots = computed(() => scatter(HA, GAMES_HA))
const allDots = computed(() => scatter(ALL, GAMES_ALL))

// Trend lines come from the shared util (the same sample-weighted fit used for
// all win-probability calculations), so the drawn line matches the numbers used.
function trendLine(t: { slope: number; intercept: number }) {
  return {
    x1: xPx(0), y1: yPx(t.intercept),
    x2: xPx(X_MAX), y2: yPx(t.intercept + t.slope * X_MAX),
  }
}

const haTrend = trendLine(palmyTrends.ha)
const allTrend = trendLine(palmyTrends.all)

const xTicks = Array.from({ length: X_MAX / 10 + 1 }, (_, i) => i * 10)
const yTicks = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]

// Hover readout
const svgEl = ref<SVGSVGElement | null>(null)
const hoverM = ref<number | null>(null)

function onMove(e: MouseEvent) {
  const el = svgEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const svgX = ((e.clientX - rect.left) / rect.width) * W
  const m = Math.round(((svgX - M.l) / plotW) * X_MAX)
  hoverM.value = Math.max(0, Math.min(X_MAX, m))
}
function onLeave() {
  hoverM.value = null
}

const hover = computed(() => {
  const m = hoverM.value
  if (m == null) return null
  return {
    m,
    x: xPx(m),
    ha: HA[m], haY: yPx(HA[m]), haGames: GAMES_HA[m] ?? 0,
    all: ALL[m], allY: yPx(ALL[m]), allGames: GAMES_ALL[m] ?? 0,
  }
})

const pct = (p: number) => `${Math.round(p * 100)}%`
</script>

<template>
  <div class="text-gray-500 dark:text-gray-400">
    <svg
      ref="svgEl"
      :viewBox="`0 0 ${W} ${H}`"
      class="w-full"
      style="touch-action: none"
      @mousemove="onMove"
      @mouseleave="onLeave"
    >
      <!-- Y gridlines + labels -->
      <g v-for="t in yTicks" :key="`y${t}`">
        <line
          :x1="M.l" :x2="W - M.r" :y1="yPx(t)" :y2="yPx(t)"
          stroke="currentColor" :stroke-opacity="t === 0.5 ? 0.35 : 0.1"
          :stroke-dasharray="t === 0.5 ? '4,3' : undefined" stroke-width="1"
        />
        <text :x="M.l - 6" :y="yPx(t) + 3" text-anchor="end" font-size="11" fill="currentColor">
          {{ Math.round(t * 100) }}%
        </text>
      </g>

      <!-- X ticks + labels -->
      <g v-for="t in xTicks" :key="`x${t}`">
        <line
          :x1="xPx(t)" :x2="xPx(t)" :y1="M.t" :y2="H - M.b"
          stroke="currentColor" stroke-opacity="0.06" stroke-width="1"
        />
        <text :x="xPx(t)" :y="H - M.b + 16" text-anchor="middle" font-size="11" fill="currentColor">
          {{ t }}
        </text>
      </g>
      <text :x="M.l + plotW / 2" :y="H - 4" text-anchor="middle" font-size="11" fill="currentColor">
        PalmyScore predicted margin (points)
      </text>

      <!-- Series (scatter; dot size = sample count) -->
      <g :opacity="variant === 'all' ? 1 : 0.5">
        <circle
          v-for="(d, i) in allDots" :key="`a${i}`"
          :cx="d.x" :cy="d.y" :r="d.r" fill="#f59e0b" fill-opacity="0.7"
        />
      </g>
      <g :opacity="variant === 'ha' || !variant ? 1 : 0.5">
        <circle
          v-for="(d, i) in haDots" :key="`h${i}`"
          :cx="d.x" :cy="d.y" :r="d.r" fill="#3b82f6" fill-opacity="0.7"
        />
      </g>

      <!-- Trend lines (weighted least-squares), clipped to the plot area -->
      <defs>
        <clipPath id="winprob-plot">
          <rect :x="M.l" :y="M.t" :width="plotW" :height="plotH" />
        </clipPath>
      </defs>
      <line
        v-if="allTrend" :x1="allTrend.x1" :y1="allTrend.y1" :x2="allTrend.x2" :y2="allTrend.y2"
        stroke="#f59e0b" stroke-width="2" stroke-dasharray="6,4" clip-path="url(#winprob-plot)"
        :opacity="variant === 'all' ? 0.9 : 0.45"
      />
      <line
        v-if="haTrend" :x1="haTrend.x1" :y1="haTrend.y1" :x2="haTrend.x2" :y2="haTrend.y2"
        stroke="#3b82f6" stroke-width="2" stroke-dasharray="6,4" clip-path="url(#winprob-plot)"
        :opacity="variant === 'ha' || !variant ? 0.9 : 0.45"
      />

      <!-- Hover crosshair + points -->
      <g v-if="hover">
        <line :x1="hover.x" :x2="hover.x" :y1="M.t" :y2="H - M.b" stroke="currentColor" stroke-opacity="0.25" stroke-width="1" />
        <circle :cx="hover.x" :cy="hover.allY" r="3.5" fill="#f59e0b" />
        <circle :cx="hover.x" :cy="hover.haY" r="3.5" fill="#3b82f6" />
      </g>

      <!-- Legend -->
      <g font-size="11">
        <circle :cx="M.l + 8" :cy="M.t - 12" r="4" fill="#3b82f6" fill-opacity="0.7" />
        <text :x="M.l + 16" :y="M.t - 8" fill="currentColor">Home/Away</text>
        <circle :cx="M.l + 110" :cy="M.t - 12" r="4" fill="#f59e0b" fill-opacity="0.7" />
        <text :x="M.l + 118" :y="M.t - 8" fill="currentColor">All Games</text>
      </g>
    </svg>

    <!-- Readout -->
    <div class="mt-1 flex items-center justify-center gap-4 text-xs tabular-nums" style="min-height: 18px">
      <template v-if="hover">
        <span>Margin <span class="font-semibold text-gray-700 dark:text-gray-200">{{ hover.m }}</span> pts</span>
        <span class="text-blue-600 dark:text-blue-400">H/A {{ pct(hover.ha) }} <span class="opacity-60">({{ hover.haGames }})</span></span>
        <span class="text-amber-600 dark:text-amber-500">All {{ pct(hover.all) }} <span class="opacity-60">({{ hover.allGames }})</span></span>
      </template>
      <span v-else class="opacity-60">Each dot = a predicted margin; dot size = sample count. Hover to read the favourite's win % (games in brackets).</span>
    </div>
  </div>
</template>
