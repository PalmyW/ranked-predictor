<template>
  <!-- Header -->
  <div class="flex items-start justify-between mb-3">
    <div>
      <h2 class="text-lg font-bold text-gray-800 dark:text-gray-100">Circle of Parity</h2>
      <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
        <template v-if="cycle.length > 0">
          {{ cycle.length }}-team win cycle found
          <span v-if="cycle.length === 18" class="text-green-500 dark:text-green-400 font-semibold ml-1">All 18 teams!</span>
        </template>
        <template v-else>Not enough data yet</template>
      </p>
    </div>
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
    viewBox="0 0 650 500"
    class="w-full max-w-[650px] mx-auto block"
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

    <!-- Arrow labels (round + margin) -->
    <text
      v-for="(label, i) in arrowLabels"
      :key="`alabel-${i}`"
      :x="label.x"
      :y="label.y"
      text-anchor="middle"
      dominant-baseline="middle"
      :font-size="arrowLabelSize"
      font-family="system-ui, sans-serif"
      :stroke="textOutlineColor"
      stroke-width="3"
      stroke-linejoin="round"
      paint-order="stroke"
      :fill="labelColor"
    >
      <tspan :x="label.x" dy="-0.55em">{{ label.line1 }}</tspan>
      <tspan :x="label.x" dy="1.1em">{{ label.line2 }}</tspan>
    </text>

    <!-- Sidebar: teams not in cycle -->
    <g v-if="missingTeams.length > 0">
      <line x1="507" y1="16" x2="507" y2="484" :stroke="arrowColor" stroke-width="0.5" stroke-dasharray="4,3" opacity="0.35" />
      <text x="578" y="24" text-anchor="middle" font-size="8" font-weight="600" font-family="system-ui, sans-serif" :fill="labelColor" opacity="0.6">Not in cycle</text>
      <g v-for="(team, i) in missingTeams" :key="`missing-${team.id}`">
        <circle :cx="528" :cy="42 + i * 28" r="12" :fill="iconBgColor" :stroke="arrowColor" stroke-width="0.8" opacity="0.5" />
        <svg :x="528 - 10" :y="42 + i * 28 - 10" width="20" height="20" overflow="visible" opacity="0.5">
          <use :href="`/ranked-predictor/icons.svg#${team.iconId}`" />
        </svg>
        <text :x="546" :y="42 + i * 28" dominant-baseline="middle" font-size="8" font-family="system-ui, sans-serif" :fill="labelColor" opacity="0.6">{{ team.abbreviation }}</text>
      </g>
    </g>

    <!-- Team nodes (rendered above labels) -->
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
  </svg>

  <!-- Footer legend -->
  <p v-if="cycle.length > 0" class="mt-2 text-xs text-gray-400 dark:text-gray-500 text-center">
    Arrow direction: winner → loser · {{ cycle.length }} teams in cycle
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAFLData, TEAMS } from '../composables/useAFLData'
import { useDarkMode } from '../composables/useDarkMode'
import HtmlTooltip from './HtmlTooltip.vue'
import type { AflMatch } from '../types/afl'

const { matches } = useAFLData()
const { isDark } = useDarkMode()

const ALL_TEAMS = TEAMS.length

const CENTER       = 250
const ICON_RADIUS  = 175
const LABEL_RADIUS = 215
const ICON_CLEAR   = 22
const CURVE_PULL   = 0.28

const teamMap = Object.fromEntries(TEAMS.map(t => [t.id, t]))

// --- Types ---

interface MatchDetail {
  roundName: string
  roundNumber: number
  margin: number
}

// --- Graph building (also captures per-edge match details) ---

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

    // Keep the most recent match for this directed edge
    const key = `${winner}-${loser}`
    const existing = details.get(key)
    if (!existing || m.roundNumber > existing.roundNumber) {
      details.set(key, { roundName: m.roundName, roundNumber: m.roundNumber, margin: Math.abs(h - a) })
    }
  }

  return { graph, details }
}

// --- Longest cycle via DFS backtracking ---

function findLongestCycle(graph: Map<number, Set<number>>): number[] {
  let best: number[] = []

  function dfs(start: number, current: number, path: number[], visited: Set<number>) {
    if (best.length === ALL_TEAMS) return
    for (const neighbor of graph.get(current) ?? []) {
      if (neighbor === start && path.length >= 3) {
        if (path.length > best.length) best = [...path]
        continue
      }
      if (!visited.has(neighbor)) {
        path.push(neighbor)
        visited.add(neighbor)
        dfs(start, neighbor, path, visited)
        path.pop()
        visited.delete(neighbor)
      }
    }
  }

  for (const start of graph.keys()) {
    if (best.length === ALL_TEAMS) break
    dfs(start, start, [start], new Set([start]))
  }

  return best
}

// Single computed that builds graph + details + cycle together
const cycleData = computed(() => {
  const { graph, details } = buildWinGraphWithDetails(matches.value)
  return { cycle: findLongestCycle(graph), details }
})

const cycle   = computed(() => cycleData.value.cycle)
const details = computed(() => cycleData.value.details)

// --- Round name abbreviation ---

function abbreviateRound(name: string): string {
  const m = name.match(/(\d+)/)
  if (m) return `Rd ${m[1]}`
  // "Opening Round" → "OR", "Qualifying Final" → "QF", etc.
  return name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).join('')
}

// --- Geometry ---

const angleStep = computed(() => (2 * Math.PI) / cycle.value.length)

function angleFor(i: number): number {
  return -Math.PI / 2 + i * angleStep.value
}

function iconPos(i: number) {
  const a = angleFor(i)
  return { x: CENTER + ICON_RADIUS * Math.cos(a), y: CENTER + ICON_RADIUS * Math.sin(a) }
}

function labelPos(i: number) {
  const a = angleFor(i)
  return { x: CENTER + LABEL_RADIUS * Math.cos(a), y: CENTER + LABEL_RADIUS * Math.sin(a) }
}

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
  return { x: midX + (CENTER - midX) * CURVE_PULL, y: midY + (CENTER - midY) * CURVE_PULL }
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

const cycleNodes = computed<CycleNode[]>(() =>
  cycle.value.map((teamId, i) => {
    const p = iconPos(i), l = labelPos(i)
    const team = teamMap[teamId]
    return { x: p.x, y: p.y, labelX: l.x, labelY: l.y, iconId: team?.iconId ?? '', abbr: team?.abbreviation ?? String(teamId) }
  })
)

const missingTeams = computed(() => TEAMS.filter(t => !cycle.value.includes(t.id)))

// --- Arrow label data ---

interface ArrowLabel { x: number; y: number; line1: string; line2: string }

const arrowLabels = computed<ArrowLabel[]>(() => {
  const det = details.value
  const n = cycle.value.length
  return cycle.value.map((winnerId, i) => {
    const loserId = cycle.value[(i + 1) % n]
    const cp = arrowControlPoint(i)
    const d = det.get(`${winnerId}-${loserId}`)
    return {
      x: cp.x,
      y: cp.y,
      line1: d ? abbreviateRound(d.roundName) : '',
      line2: d ? `by ${d.margin} pts` : '',
    }
  })
})

// Font size scales down for large cycles so labels stay within arrow gaps
const arrowLabelSize = computed(() => {
  const n = cycle.value.length
  if (n <= 6)  return 9
  if (n <= 10) return 8
  if (n <= 14) return 7
  return 6
})

// --- Colors ---

const arrowColor      = computed(() => isDark.value ? '#90CCE5' : '#508398')
const iconBgColor     = computed(() => isDark.value ? '#282A2C' : '#F4F5F6')
const labelColor      = computed(() => isDark.value ? '#C2C9CC' : '#383B3D')
const textOutlineColor = computed(() => isDark.value ? '#1A1C1E' : '#FFFFFF')
</script>
