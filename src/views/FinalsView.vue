<template>
  <main class="max-w-6xl mx-auto px-4 py-6">
    <div v-if="error" class="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-sm">
      Failed to load fixture data: {{ error }}.
    </div>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-bold text-gray-800 dark:text-gray-100">Finals</h1>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {{ seasonComplete ? 'Live ladder — click a team in a scheduled final to pick the winner' : 'Seeded from your last simulated season' }}
        </p>
      </div>
      <div v-if="seasonComplete || simulatedLadder" class="flex items-center gap-2">
        <ScreenshotButton v-if="!capturing && columns.length > 0" @click="screenshot(bracketEl, 'finals-bracket.png')" />
        <button
          v-if="seasonComplete"
          @click="resetPicks"
          class="px-3 py-1.5 text-xs font-semibold rounded bg-purple-600 text-white hover:bg-purple-700 transition-colors"
        >Reset Picks</button>
        <button
          v-else
          @click="rerollTick++"
          class="px-3 py-1.5 text-xs font-semibold rounded bg-purple-600 text-white hover:bg-purple-700 transition-colors"
        >Re-roll Finals</button>
      </div>
    </div>

    <div v-if="isLoading" class="text-sm text-gray-400 dark:text-gray-500">Loading fixture...</div>
    <div v-else-if="!seasonComplete && !simulatedLadder" class="text-sm text-gray-400 dark:text-gray-500">
      No simulation yet — head to the
      <RouterLink to="/" class="text-purple-600 dark:text-purple-400 font-semibold hover:underline">Predictor page's Simulated tab</RouterLink>
      and click Simulate to seed the finals bracket.
    </div>
    <div v-else-if="columns.length === 0" class="text-sm text-gray-400 dark:text-gray-500">
      No finals matches found for this season.
    </div>

    <div v-else ref="bracketEl" class="relative flex gap-6 overflow-x-auto pb-4">
      <svg
        class="pointer-events-none absolute left-0 top-0 z-0"
        :width="linesWidth"
        :height="linesHeight"
      >
        <path
          v-for="line in connectorLines"
          :key="line.id"
          :d="line.d"
          fill="none"
          :stroke="isDark ? '#374151' : '#d1d5db'"
          stroke-width="2"
        />
      </svg>
      <div v-for="col in columns" :key="col.code" class="relative z-10 flex flex-col gap-4">
        <h2 class="text-sm font-bold text-gray-700 dark:text-gray-200">{{ col.title }}</h2>
        <div class="flex flex-1 flex-col justify-around gap-6">
          <FinalsBracketCard
            v-for="m in col.matches"
            :key="m.matchId"
            :ref="(el) => setCardRef(m.matchId, el)"
            :match="m"
            :interactive="seasonComplete"
            @pick="onPick"
          />
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'
import type { FinalsBracketMatch, FinalsSlot } from '../types/afl'
import { useAFLData } from '../composables/useAFLData'
import { useRanking } from '../composables/useRanking'
import { useSimulation } from '../composables/useSimulation'
import { useScreenshot } from '../composables/useScreenshot'
import { useDarkMode } from '../composables/useDarkMode'
import { buildFinalsBracket, groupFinalsColumns, isFinalsMatch } from '../composables/useFinals'
import FinalsBracketCard from '../components/FinalsBracketCard.vue'
import ScreenshotButton from '../components/ScreenshotButton.vue'

const { matches, isLoading, error } = useAFLData()
const { ranking } = useRanking()
// simulatedLadder is a module-level singleton (see useSimulation.ts) shared
// with the Predictor page's Simulated tab, so this reflects whatever season
// was last simulated there rather than running an independent simulation.
const { simulatedLadder, actualLadder } = useSimulation(ranking, matches)
const { capturing, screenshot } = useScreenshot()
const { isDark } = useDarkMode()
const bracketEl = ref<HTMLElement | null>(null)

// Once every home-and-away match has been played, the real ladder is final
// and the bracket no longer needs a simulated season to seed it — the user
// picks the still-to-be-played finals directly instead.
const seasonComplete = computed(() => {
  const seasonMatches = matches.value.filter((m) => !isFinalsMatch(m))
  return seasonMatches.length > 0 && seasonMatches.every((m) => m.status === 'CONCLUDED')
})

const rankMap = computed<Record<number, number>>(() => {
  const map: Record<number, number> = {}
  ranking.value.forEach((id, i) => { map[id] = i + 1 })
  return map
})

// Bumped by "Re-roll Finals" to re-randomise just the finals matches against
// the same simulated ladder, without re-running the whole season.
const rerollTick = ref(0)

// matchId → manually-picked winner, used once the season is complete instead
// of algorithmic simulation. In-memory only — cleared on reload or reset.
const manualWinners = ref(new Map<number, number>())

function onPick(matchId: number, teamId: number) {
  manualWinners.value.set(matchId, teamId)
}
function resetPicks() {
  manualWinners.value.clear()
}

const bracket = computed(() => {
  if (seasonComplete.value) {
    const ladder = actualLadder.value
    if (ladder.length === 0) return []
    return buildFinalsBracket(matches.value, ladder, rankMap.value, null, false, 'ha', true, manualWinners.value)
  }
  void rerollTick.value
  const ladder = simulatedLadder.value
  if (!ladder || ladder.length === 0) return []
  return buildFinalsBracket(matches.value, ladder, rankMap.value, null, false, 'ha', true)
})

const columns = computed(() => groupFinalsColumns(bracket.value))

// Connector lines tracing which match feeds which slot ("Winner of QF1" etc).
// Positions are measured from the actual card DOM (rather than derived from
// layout math) since column heights vary with `justify-around` spacing.
const cardRefs = new Map<number, HTMLElement>()

function setCardRef(matchId: number, el: Element | ComponentPublicInstance | null) {
  if (!el) { cardRefs.delete(matchId); return }
  const node = ('$el' in el ? el.$el : el) as HTMLElement
  cardRefs.set(matchId, node)
}

// Column (round) display order, used to tell "earlier round" from "later" when
// reconstructing a bracket edge structurally.
const roundRankMap = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  columns.value.forEach((c, i) => { map[c.code] = i })
  return map
})
const roundRank = (abbr: string) => roundRankMap.value[abbr] ?? 99

// Resolves the bracket match (and which of its two rows) that actually
// feeds a given slot: for a "Winner/Loser of X" rule that's the winner's or
// loser's row of match X respectively; for a "ranked WF winner" rule (which
// can be fed by either wildcard match) it's the winner's row of whichever
// one produced the team currently occupying the slot. For an already-resolved
// slot (the fixture hard-fills the real team — discarding the "Winner of X"
// placeholder — once its feeder concludes) the edge is reconstructed from the
// team's most recent concluded finals match in an earlier round: its winner
// row if the team won there, otherwise its loser row.
function sourceRowFor(slot: FinalsSlot, destMatch: FinalsBracketMatch): { match: FinalsBracketMatch; side: 'home' | 'away' } | undefined {
  const rule = slot.rule
  if (rule.kind === 'result') {
    const match = bracket.value.find((b) => b.sourceCode === rule.sourceCode)
    if (!match || match.winnerTeamId === null) return undefined
    const winnerSide = match.winnerTeamId === match.home.teamId ? 'home' : 'away'
    const side = rule.result === 'winner' ? winnerSide : (winnerSide === 'home' ? 'away' : 'home')
    return { match, side }
  }
  if (rule.kind === 'rankedWinner') {
    const match = bracket.value.find((b) => b.sourceCode.startsWith(rule.roundCode) && b.winnerTeamId === slot.teamId)
    if (!match || match.winnerTeamId === null) return undefined
    return { match, side: match.winnerTeamId === match.home.teamId ? 'home' : 'away' }
  }
  if (rule.kind === 'resolved' && slot.teamId !== null) {
    const destRank = roundRank(destMatch.roundAbbreviation)
    const feeder = bracket.value
      .filter((b) =>
        b.matchId !== destMatch.matchId &&
        b.winnerTeamId !== null &&
        roundRank(b.roundAbbreviation) < destRank &&
        (b.home.teamId === slot.teamId || b.away.teamId === slot.teamId),
      )
      .sort((a, b) => roundRank(b.roundAbbreviation) - roundRank(a.roundAbbreviation))[0]
    if (!feeder) return undefined
    const side = feeder.home.teamId === slot.teamId ? 'home' : 'away'
    return { match: feeder, side }
  }
  return undefined
}

const linesWidth = ref(0)
const linesHeight = ref(0)
const connectorLines = ref<{ id: string; d: string }[]>([])

interface RawLine { id: string; x1: number; y1: number; x2: number; y2: number; srcCol: number; dstCol: number }

function recomputeLines() {
  const wrap = bracketEl.value
  if (!wrap) { connectorLines.value = []; return }

  linesWidth.value = wrap.scrollWidth
  linesHeight.value = wrap.scrollHeight
  const wrapRect = wrap.getBoundingClientRect()

  // matchId -> column index, so an edge knows how many columns it spans.
  const colOf = new Map<number, number>()
  columns.value.forEach((c, i) => c.matches.forEach((m) => colOf.set(m.matchId, i)))

  // Every card's box in wrap-local coords, grouped by column, for routing
  // multi-column edges around (never behind) the cards they'd otherwise cross.
  const cardBoxesByCol = new Map<number, { top: number; bottom: number }[]>()
  for (const [matchId, el] of cardRefs) {
    const col = colOf.get(matchId)
    if (col === undefined) continue
    const r = el.getBoundingClientRect()
    const box = { top: r.top - wrapRect.top, bottom: r.bottom - wrapRect.top }
    if (!cardBoxesByCol.has(col)) cardBoxesByCol.set(col, [])
    cardBoxesByCol.get(col)!.push(box)
  }

  const raw: RawLine[] = []
  for (const m of bracket.value) {
    for (const side of ['home', 'away'] as const) {
      const slot = m[side]
      if (slot.teamId === null) continue
      const source = sourceRowFor(slot, m)
      if (!source) continue
      const { match: sourceMatch, side: sourceSide } = source

      const sourceRowEl = cardRefs.get(sourceMatch.matchId)?.querySelector(`[data-row="${sourceSide}"]`)
      const destRowEl = cardRefs.get(m.matchId)?.querySelector(`[data-row="${side}"]`)
      if (!sourceRowEl || !destRowEl) continue

      const sr = sourceRowEl.getBoundingClientRect()
      const dr = destRowEl.getBoundingClientRect()
      raw.push({
        id: `${sourceMatch.matchId}-${m.matchId}-${side}`,
        x1: sr.right - wrapRect.left,
        y1: sr.top + sr.height / 2 - wrapRect.top,
        x2: dr.left - wrapRect.left,
        y2: dr.top + dr.height / 2 - wrapRect.top,
        srcCol: colOf.get(sourceMatch.matchId) ?? 0,
        dstCol: colOf.get(m.matchId) ?? 0,
      })
    }
  }

  const newLines: { id: string; d: string }[] = []

  // Adjacent-column edges (the common case): same x1/x2 for every card in the
  // pair, so group by that and fan the H-V-H elbows across the gutter — the
  // vertical run stays between the two columns, so it never crosses a card.
  const adjacent = raw.filter((l) => l.dstCol - l.srcCol <= 1)
  const groups = new Map<string, RawLine[]>()
  for (const line of adjacent) {
    const key = `${Math.round(line.x1)}-${Math.round(line.x2)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(line)
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.y1 - b.y1)
    const n = group.length
    group.forEach((line, i) => {
      const midX = line.x1 + (line.x2 - line.x1) * ((i + 1) / (n + 1))
      newLines.push({ id: line.id, d: `M ${line.x1} ${line.y1} H ${midX} V ${line.y2} H ${line.x2}` })
    })
  }

  // Multi-column edges (e.g. a Qualifying Final winner skipping the Semi
  // Finals straight into a Preliminary Final): drop into the gutter just past
  // the source column, run a horizontal "highway" through whichever clear
  // horizontal band (the gap above, below, or between the cards of every
  // spanned column) sits closest to the edge's midpoint, then drop into the
  // gutter just before the destination column. The vertical drops live in
  // gutters and the highway dodges every card, so nothing routes behind a card.
  const GAP = 8
  const MARGIN = 14
  const longGroups = new Map<string, RawLine[]>()
  for (const line of raw) {
    if (line.dstCol - line.srcCol <= 1) continue
    const key = `${Math.round(line.x1)}-${Math.round(line.x2)}`
    if (!longGroups.has(key)) longGroups.set(key, [])
    longGroups.get(key)!.push(line)
  }
  for (const group of longGroups.values()) {
    group.sort((a, b) => a.y1 - b.y1)

    // Clear horizontal bands spanning every intervening column (gaps in the
    // union of their card boxes) — shared by the whole group.
    const boxes: { top: number; bottom: number }[] = []
    for (let c = group[0].srcCol + 1; c < group[0].dstCol; c++) {
      for (const box of cardBoxesByCol.get(c) ?? []) boxes.push(box)
    }
    boxes.sort((a, b) => a.top - b.top)
    const bands: { lo: number; hi: number }[] = []
    let cursor = -Infinity
    for (const box of boxes) {
      if (box.top - MARGIN > cursor) bands.push({ lo: cursor, hi: box.top - MARGIN })
      cursor = Math.max(cursor, box.bottom + MARGIN)
    }
    bands.push({ lo: cursor, hi: Infinity })

    group.forEach((line, i) => {
      const midY = (line.y1 + line.y2) / 2
      let hy = midY
      let best = Infinity
      for (const band of bands) {
        const pt = Math.min(Math.max(midY, band.lo), band.hi)
        const d = Math.abs(pt - midY)
        if (d < best) { best = d; hy = pt }
      }
      const step = i * 6
      const xa = line.x1 + GAP + step
      const xb = line.x2 - GAP - step
      newLines.push({
        id: line.id,
        d: `M ${line.x1} ${line.y1} H ${xa} V ${hy + step} H ${xb} V ${line.y2} H ${line.x2}`,
      })
    })
  }

  connectorLines.value = newLines
}

let resizeObserver: ResizeObserver | null = null

// bracketEl only exists once data has loaded (it's behind `v-else`), so
// attach the observer whenever it appears rather than just once on mount.
watch(bracketEl, (el, oldEl) => {
  if (oldEl) resizeObserver?.unobserve(oldEl)
  if (el) resizeObserver?.observe(el)
  recomputeLines()
})

watch([bracket, columns], async () => {
  await nextTick()
  recomputeLines()
})

onMounted(() => {
  resizeObserver = new ResizeObserver(() => recomputeLines())
  if (bracketEl.value) resizeObserver.observe(bracketEl.value)
  window.addEventListener('resize', recomputeLines)
  recomputeLines()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', recomputeLines)
})
</script>
