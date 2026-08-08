<template>
  <!-- Header -->
  <div class="relative flex items-start justify-center mb-2">
    <div class="text-center">
      <h2
        v-if="!isEditingTitle"
        @click="startEditTitle"
        title="Click to edit title"
        class="text-lg font-bold text-gray-800 dark:text-gray-100 cursor-pointer hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
      >{{ title }}</h2>
      <input
        v-else
        ref="titleInput"
        v-model="title"
        @blur="stopEditTitle"
        @keydown.enter="stopEditTitle"
        @keydown.escape="stopEditTitle"
        class="text-lg font-bold text-center bg-transparent border-b border-blue-500 outline-none text-gray-800 dark:text-gray-100 w-56"
      />
      <p v-if="cycle.length === 0" class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Not enough data yet</p>
    </div>
    <div class="absolute right-0 top-0 flex items-center gap-2">
      <button
        v-if="cycle.length > 0"
        @click="refreshCycle"
        title="Try a different cycle"
        class="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 text-base leading-none transition-colors"
      >↺</button>
      <HtmlTooltip placement="below">
        <template #trigger="{ toggle }">
          <button @click.stop="toggle" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm leading-none">ⓘ</button>
        </template>
        <template #content>
          <div class="p-3 max-w-[240px]">
            <p class="font-semibold mb-1 text-gray-800 dark:text-gray-100">Circle of Parity</p>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed text-xs">
              The longest chain of actual match results that forms a closed loop. Each arrow means "beat". Even the top team is caught in the cycle, showing no team is definitively better than all others.
            </p>
          </div>
        </template>
      </HtmlTooltip>
    </div>
  </div>

  <!-- Empty state -->
  <div v-if="cycle.length === 0" class="py-16 text-center space-y-2">
    <p class="text-3xl">⟳</p>
    <p class="text-sm font-semibold text-gray-600 dark:text-gray-300">No parity cycle yet</p>
    <p class="text-xs text-gray-400 dark:text-gray-500 max-w-xs mx-auto">
      A cycle appears once enough matches have been played for wins to loop back around — check back after more rounds.
    </p>
  </div>

  <!-- SVG diagram -->
  <svg
    v-else
    viewBox="0 0 500 500"
    class="w-full max-w-[500px] mx-auto block"
    aria-label="Circle of Parity diagram"
  >
    <defs>
      <marker id="cop-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" :fill="arrowColor" />
      </marker>
    </defs>

    <!-- Curved arrows -->
    <path
      v-for="(_, i) in cycle"
      :key="`arrow-${i}`"
      :d="arrowPath(i)"
      fill="none"
      :stroke="arrowColor"
      stroke-width="1.8"
      marker-end="url(#cop-arrow)"
    />

    <!-- Bum crack -->
    <path
      v-if="shapeId === 'bum'"
      d="M 250 158 C 308 210 308 312 250 362"
      fill="none"
      :stroke="arrowColor"
      stroke-width="2.5"
      stroke-linecap="round"
      opacity="0.55"
    />

    <!-- Team nodes -->
    <g v-for="(node, i) in cycleNodes" :key="`node-${i}`">
      <circle :cx="node.x" :cy="node.y" r="22" :fill="iconBgColor" :stroke="arrowColor" stroke-width="1" />
      <svg :x="node.x - 16" :y="node.y - 16" width="32" height="32" overflow="visible">
        <use :href="`/ranked-predictor/icons.svg#${node.iconId}`" />
      </svg>
      <text
        :x="node.labelX"
        :y="node.labelY"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="9"
        font-weight="600"
        font-family="system-ui, sans-serif"
        :fill="labelColor"
      >{{ node.abbr }}</text>
    </g>

    <!-- Arrow info dots: small circle on each arrow midpoint, tooltip on hover -->
    <g
      v-for="(dot, i) in arrowDots"
      :key="`dot-${i}`"
      style="cursor: default"
    >
      <title>{{ dot.tooltip }}</title>
      <circle :cx="dot.cx" :cy="dot.cy" r="9" :fill="arrowColor" />
      <text
        :x="dot.cx"
        :y="dot.cy"
        text-anchor="middle"
        dominant-baseline="middle"
        font-size="6.5"
        font-weight="700"
        font-family="system-ui, sans-serif"
        :fill="iconBgColor"
      >{{ dot.badge }}</text>
    </g>
  </svg>

  <!-- Footer legend -->
  <p v-if="cycle.length > 0" class="mt-2 text-xs text-gray-400 dark:text-gray-500 text-center">
    Arrow direction: winner → loser · {{ cycle.length }} teams in cycle
  </p>

  <!-- Shape selector -->
  <div v-if="cycle.length > 0" class="flex items-center justify-center gap-1.5 mt-3 flex-wrap">
    <button
      v-for="shape in SHAPES"
      :key="shape.id"
      @click="shapeId = shape.id"
      class="px-2.5 py-0.5 text-xs rounded-full font-medium transition-colors"
      :class="shapeId === shape.id
        ? 'bg-blue-500 text-white'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
    >{{ shape.label }}</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useAFLData, TEAMS } from '../composables/useAFLData'
import { useDarkMode } from '../composables/useDarkMode'
import HtmlTooltip from './HtmlTooltip.vue'
import type { AflMatch } from '../types/afl'
import { LEAGUE_CONFIG } from '../config/league'

const { matches } = useAFLData()
const { isDark } = useDarkMode()

const ALL_TEAMS = TEAMS.length
const CENTER     = 250
const ICON_CLEAR = 22
const CURVE_PULL = 0.28

const teamMap = Object.fromEntries(TEAMS.map(t => [t.id, t]))

// --- Editable title ---

const TITLE_KEY = `afl-circle-parity-title${LEAGUE_CONFIG.lsSuffix}`
const title = ref(localStorage.getItem(TITLE_KEY) ?? 'Circle of Parity')
const isEditingTitle = ref(false)
const titleInput = ref<HTMLInputElement>()

function startEditTitle() {
  isEditingTitle.value = true
  nextTick(() => titleInput.value?.select())
}

function stopEditTitle() {
  if (!title.value.trim()) title.value = 'Circle of Parity'
  isEditingTitle.value = false
  localStorage.setItem(TITLE_KEY, title.value)
}

// --- Shapes ---

const SHAPES = [
  { id: 'circle',  label: 'Circle'  },
  { id: 'oval',    label: 'Oval'    },
  { id: 'star',    label: 'Star'    },
  { id: 'square',  label: 'Square'  },
  { id: 'potato',  label: '🥔 Potato' },
  { id: 'bum',     label: '🍑 Bum'   },
] as const

type ShapeId = typeof SHAPES[number]['id']

const SHAPE_KEY = `afl-circle-parity-shape${LEAGUE_CONFIG.lsSuffix}`
const storedShape = localStorage.getItem(SHAPE_KEY)
const shapeId = ref<ShapeId>(
  SHAPES.some(s => s.id === storedShape) ? (storedShape as ShapeId) : 'circle'
)
watch(shapeId, v => localStorage.setItem(SHAPE_KEY, v))

function computeIconPos(i: number, n: number): { x: number; y: number } {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n
  switch (shapeId.value) {
    case 'circle':
      return { x: CENTER + 175 * Math.cos(a), y: CENTER + 175 * Math.sin(a) }
    case 'oval':
      return { x: CENTER + 215 * Math.cos(a), y: CENTER + 138 * Math.sin(a) }
    case 'star': {
      const r = i % 2 === 0 ? 175 : 95
      return { x: CENTER + r * Math.cos(a), y: CENTER + r * Math.sin(a) }
    }
    case 'square': {
      // Distribute teams evenly around a square perimeter, starting at top-centre
      const s = 155
      const pos = ((i / n) * 4 + 0.5) % 4  // 0..4, offset so team 0 sits at top-centre
      if (pos < 1) return { x: CENTER - s + pos * 2 * s,         y: CENTER - s }
      if (pos < 2) return { x: CENTER + s,                        y: CENTER - s + (pos - 1) * 2 * s }
      if (pos < 3) return { x: CENTER + s - (pos - 2) * 2 * s,   y: CENTER + s }
      return                { x: CENTER - s,                       y: CENTER + s - (pos - 3) * 2 * s }
    }
    case 'potato': {
      // Tilted ellipse (portrait, slight clockwise lean) with concave upper-left dent
      const tilt = 0.15                        // ~9° clockwise — top leans right
      const semiW = 112, semiH = 152           // taller than wide, ~1.36:1
      const ta = a - tilt
      const rBase = (semiW * semiH) / Math.sqrt((semiH * Math.cos(ta)) ** 2 + (semiW * Math.sin(ta)) ** 2)
      // Concave dent: upper-left, ~10 o'clock going clockwise from top
      const aDent = -Math.PI / 2 + (5 * Math.PI) / 3   // 7π/6 ≈ 3.67 rad
      const dent = -44 * Math.exp(-3 * (a - aDent) ** 2)
      const r = rBase + dent
      return { x: (CENTER + 5) + r * Math.cos(a), y: (CENTER - 5) + r * Math.sin(a) }
    }
    case 'bum': {
      // Trace the outer silhouette of two overlapping circles (the union boundary).
      // Circles: left at (CENTER-60, CENTER+10), right at (CENTER+60, CENTER+10), r=120.
      // They overlap so their intersection points form the crack tip (top) and crease (bottom).
      // Left arc:  from crack tip clockwise around the left cheek to crease.
      //   angle from left center = -π/3  →  -π/3 - 4π/3  (= +π/3, i.e. 60°)
      // Right arc: from crease clockwise around the right cheek back to crack tip.
      //   angle from right center = 2π/3  →  2π/3 - 4π/3  (= -2π/3)
      const offset = 60, r = 120, bY = CENTER + 10
      const half = Math.round(n / 2)
      if (i < half) {
        const t = (i + 0.5) / half                           // never hits 0 or 1, so never lands on intersection
        const ang = -Math.PI / 3 - t * (4 * Math.PI / 3)
        return { x: (CENTER - offset) + r * Math.cos(ang), y: bY + r * Math.sin(ang) }
      } else {
        const j = i - half, rem = n - half
        const t = (j + 0.5) / rem
        const ang = (2 * Math.PI / 3) - t * (4 * Math.PI / 3)
        return { x: (CENTER + offset) + r * Math.cos(ang), y: bY + r * Math.sin(ang) }
      }
    }
  }
}

function computeLabelPos(ix: number, iy: number, teamIndex: number, n: number, extraPush = 0): { x: number; y: number } {
  let dx: number, dy: number
  let push = 34 + extraPush

  if (shapeId.value === 'bum') {
    // Use per-cheek circle center so labels point outward from each cheek, not from overall CENTER
    const half = Math.round(n / 2)
    const refX = teamIndex < half ? CENTER - 60 : CENTER + 60
    const refY = CENTER + 10
    dx = ix - refX; dy = iy - refY
  } else if (shapeId.value === 'square') {
    // Use edge normal (perpendicular to the side the team sits on) for clean outward labels
    const pos = ((teamIndex / n) * 4 + 0.5) % 4
    if (pos < 1)      { dx =  0; dy = -1 }
    else if (pos < 2) { dx =  1; dy =  0 }
    else if (pos < 3) { dx =  0; dy =  1 }
    else              { dx = -1; dy =  0 }
  } else if (shapeId.value === 'star') {
    dx = ix - CENTER; dy = iy - CENTER
    push = (teamIndex % 2 === 0 ? 34 : 50) + extraPush
  } else {
    dx = ix - CENTER; dy = iy - CENTER
  }

  const len = Math.sqrt(dx * dx + dy * dy) || 1
  return { x: ix + (dx / len) * push, y: iy + (dy / len) * push }
}

// --- Types ---

interface MatchDetail { roundName: string; roundNumber: number; margin: number }

// --- Seeded shuffle ---

function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b)
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b)
    s ^= s >>> 16
    return (s >>> 0) / 0x100000000
  }
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// --- Graph building ---

function buildWinGraphWithDetails(matches: readonly AflMatch[]): {
  graph: Map<number, Set<number>>
  details: Map<string, MatchDetail>
} {
  const graph = new Map<number, Set<number>>()
  const details = new Map<string, MatchDetail>()
  for (const m of matches) {
    if (m.status !== 'CONCLUDED') continue
    if (!m.homeScore || !m.awayScore) continue
    const h = m.homeScore.totalScore, a = m.awayScore.totalScore
    if (h === a) continue
    const winner = h > a ? m.homeTeamId : m.awayTeamId
    const loser  = h > a ? m.awayTeamId : m.homeTeamId
    if (!graph.has(winner)) graph.set(winner, new Set())
    graph.get(winner)!.add(loser)
    const key = `${winner}-${loser}`
    const existing = details.get(key)
    if (!existing || m.roundNumber > existing.roundNumber)
      details.set(key, { roundName: m.roundName, roundNumber: m.roundNumber, margin: Math.abs(h - a) })
  }
  return { graph, details }
}

// --- Longest cycle via DFS with seeded traversal ---

function findLongestCycle(graph: Map<number, Set<number>>, rng: () => number): number[] {
  let best: number[] = []
  function dfs(start: number, current: number, path: number[], visited: Set<number>) {
    if (best.length === ALL_TEAMS) return
    for (const neighbor of shuffled([...graph.get(current) ?? []], rng)) {
      if (neighbor === start && path.length >= 3) {
        if (path.length > best.length) best = [...path]
        continue
      }
      if (!visited.has(neighbor)) {
        path.push(neighbor); visited.add(neighbor)
        dfs(start, neighbor, path, visited)
        path.pop(); visited.delete(neighbor)
      }
    }
  }
  for (const start of shuffled([...graph.keys()], rng)) {
    if (best.length === ALL_TEAMS) break
    dfs(start, start, [start], new Set([start]))
  }
  return best
}

// --- Refresh ---

const refreshSeed = ref(0)
function refreshCycle() { refreshSeed.value++ }

const cycleData = computed(() => {
  const { graph, details } = buildWinGraphWithDetails(matches.value)
  return { cycle: findLongestCycle(graph, makeRng(refreshSeed.value)), details }
})

const cycle   = computed(() => cycleData.value.cycle)
const details = computed(() => cycleData.value.details)

// --- Geometry helpers ---

function bezierPoint(
  p0: {x:number,y:number}, cp: {x:number,y:number}, p1: {x:number,y:number}, t: number
): {x:number,y:number} {
  const mt = 1 - t
  return { x: mt*mt*p0.x + 2*mt*t*cp.x + t*t*p1.x, y: mt*mt*p0.y + 2*mt*t*cp.y + t*t*p1.y }
}

// --- Geometry ---

function iconPos(i: number) { return computeIconPos(i, cycle.value.length) }

function shortenPoint(from: { x: number; y: number }, toward: { x: number; y: number }, d: number) {
  const dx = toward.x - from.x, dy = toward.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return from
  return { x: from.x + (dx / len) * d, y: from.y + (dy / len) * d }
}

function arrowControlPoint(i: number) {
  const n = cycle.value.length
  const p1 = iconPos(i), p2 = iconPos((i + 1) % n)
  const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2
  // Star arrows are nearly straight lines between alternating inner/outer nodes —
  // less pull keeps control points away from the inner node icons
  const pull = shapeId.value === 'star' ? 0.10 : CURVE_PULL
  return { x: midX + (CENTER - midX) * pull, y: midY + (CENTER - midY) * pull }
}

function arrowPath(i: number): string {
  const n = cycle.value.length
  const p1 = iconPos(i), p2 = iconPos((i + 1) % n)
  const cp = arrowControlPoint(i)
  const start = shortenPoint(p1, cp, ICON_CLEAR)
  const end   = shortenPoint(p2, cp, ICON_CLEAR)
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${cp.x.toFixed(1)} ${cp.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`
}

// --- Node data ---

interface CycleNode { x: number; y: number; labelX: number; labelY: number; iconId: string; abbr: string }

const cycleNodes = computed<CycleNode[]>(() => {
  const n = cycle.value.length
  return cycle.value.map((teamId, i) => {
    const p = iconPos(i)
    const lp = computeLabelPos(p.x, p.y, i, n)
    const team = teamMap[teamId]
    return { x: p.x, y: p.y, labelX: lp.x, labelY: lp.y, iconId: team?.iconId ?? '', abbr: team?.abbreviation ?? String(teamId) }
  })
})

// --- Arrow dots ---

interface ArrowDot { cx: number; cy: number; badge: string; tooltip: string }

function roundBadge(name: string): string {
  const m = name.match(/(\d+)/)
  if (m) return `R${m[1]}`
  return name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).join('')
}

const arrowDots = computed<ArrowDot[]>(() => {
  const det = details.value
  const n = cycle.value.length
  if (n === 0) return []
  return cycle.value.map((winnerId, i) => {
    const loserId = cycle.value[(i + 1) % n]
    const p0 = iconPos(i), p1 = iconPos((i + 1) % n)
    const cp = arrowControlPoint(i)
    // Use the actual drawn arrow endpoints (shortened away from icon circles) so
    // the dot centre lands on the visual midpoint of the rendered line
    const arrowStart = shortenPoint(p0, cp, ICON_CLEAR)
    const arrowEnd   = shortenPoint(p1, cp, ICON_CLEAR)
    const mid = bezierPoint(arrowStart, cp, arrowEnd, 0.5)
    const d = det.get(`${winnerId}-${loserId}`)
    const badge = d ? roundBadge(d.roundName) : ''
    const tooltip = d ? `${d.roundName} · won by ${d.margin} pts` : ''
    return { cx: mid.x, cy: mid.y, badge, tooltip }
  })
})

// --- Colors ---

const arrowColor  = computed(() => isDark.value ? '#90CCE5' : '#508398')
const iconBgColor = computed(() => isDark.value ? '#282A2C' : '#F4F5F6')
const labelColor  = computed(() => isDark.value ? '#C2C9CC' : '#383B3D')
</script>
