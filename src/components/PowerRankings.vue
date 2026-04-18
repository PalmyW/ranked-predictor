<template>
  <div
    ref="captureEl"
    class="relative select-none overflow-hidden rounded-lg text-white"
    style="background: #0a0d14"
  >
    <!-- Subtle gradient accent -->
    <div
      class="pointer-events-none absolute inset-0"
      style="
        background: radial-gradient(
          ellipse at 30% 0%,
          rgba(59, 130, 246, 0.08) 0%,
          transparent 60%
        );
      "
    />

    <div class="relative">
      <!-- Header (full width) -->
      <div class="px-5 pt-5 text-center">
        <div
          ref="yearEl"
          contenteditable="true"
          spellcheck="false"
          @keydown.enter.prevent="yearEl?.blur()"
          @blur="save('year', yearEl?.innerText)"
          class="inline-block cursor-text rounded px-1 py-0.5 text-xs font-bold uppercase tracking-[0.5em] text-gray-400 outline-none transition-colors hover:bg-white/5 focus:bg-white/10"
        />
        <div
          ref="titleEl"
          contenteditable="true"
          spellcheck="false"
          @keydown.enter.prevent="titleEl?.blur()"
          @blur="save('title', titleEl?.innerText)"
          class="mt-0.5 block cursor-text rounded px-1 py-0.5 font-black uppercase leading-none tracking-widest text-white outline-none transition-colors hover:bg-white/5 focus:bg-white/10"
          style="font-size: clamp(1.4rem, 4vw, 2rem)"
        />
        <div class="mb-0 mr-[7px] mt-3 h-px bg-white/20" />
      </div>

      <!-- Rows + vertical round label -->
      <div class="flex">
        <div class="min-w-0 flex-1 px-5 pb-4 pt-2">
          <!-- No history -->
          <div
            v-if="rows.length === 0"
            class="py-10 text-center text-sm text-gray-500"
          >
            Changes will appear after the next round
          </div>

          <!-- Team rows -->
          <TransitionGroup v-else tag="div" name="power-row" class="space-y-0">
            <div
              v-for="(row, i) in rows"
              :key="row.teamId"
              class="flex items-center gap-2 border-b transition-colors"
              :class="[
                i === 5
                  ? [
                      'border-b-2',
                      isAnimating ? 'border-b-transparent' : 'border-b-red-500',
                    ]
                  : i === 9
                    ? [
                        'border-b-2',
                        isAnimating
                          ? 'border-b-transparent'
                          : 'border-b-blue-500',
                      ]
                    : 'border-b border-b-white/10',
                'py-1.5 hover:bg-white/5',
              ]"
            >
              <!-- Tier badge + change arrow -->
              <span class="flex shrink-0 items-center gap-0.5">
                <span
                  class="w-5 rounded py-[3px] text-center text-[0.6rem] font-black uppercase leading-none tracking-wide"
                  :class="
                    TIER_BADGE_CLASS[tierForIndex[i]] ??
                    'bg-white/8 text-gray-500 ring-1 ring-white/15'
                  "
                  >{{ tierForIndex[i] }}</span
                >
                <span
                  v-if="row.tierChange === 'up'"
                  class="ml-1 text-[0.6rem] font-black leading-none text-green-400"
                  >▲</span
                >
                <span
                  v-else-if="row.tierChange === 'down'"
                  class="ml-1 text-[0.6rem] font-black leading-none text-red-400"
                  >▼</span
                >
                <span v-else class="w-2 shrink-0" />
              </span>
              <!-- Team name -->
              <span
                class="flex-1 truncate text-right text-xs font-bold uppercase tracking-wide sm:text-sm"
                style="letter-spacing: 0.06em"
              >
                {{ row.teamName }}
              </span>
              <!-- Logo -->
              <svg class="size-7 shrink-0">
                <use :href="`/ranked-predictor/icons.svg#${row.iconId}`" />
              </svg>
              <!-- Rank -->
              <span
                class="w-5 shrink-0 text-right text-sm font-black tabular-nums text-white"
                >{{ i + 1 }}</span
              >
              <!-- Movement -->
              <span
                class="w-9 shrink-0 text-right text-xs font-bold tabular-nums"
              >
                <span v-if="row.delta === null" class="text-gray-500">NEW</span>
                <span v-else-if="row.delta > 0" class="text-green-400"
                  >▲{{ row.delta }}</span
                >
                <span v-else-if="row.delta < 0" class="text-red-400"
                  >▼{{ Math.abs(row.delta) }}</span
                >
                <span v-else class="text-gray-500">—</span>
              </span>
            </div>
          </TransitionGroup>

          <!-- Round history pills + screenshot (hidden during capture) -->
          <div
            v-if="!capturing"
            class="mt-4 flex flex-wrap items-center gap-1.5"
          >
            <template v-if="sortedRounds.length > 1">
              <span class="self-center text-xs text-gray-500">History:</span>
              <button
                v-for="round in sortedRounds"
                :key="round"
                @click="selectedRound = round"
                class="rounded px-2 py-0.5 text-xs font-semibold transition-colors"
                :class="
                  selectedRound === round
                    ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                "
              >
                {{ roundPill(round) }}
              </button>
            </template>
            <button
              @click="screenshot"
              title="Save as image"
              class="ml-auto rounded p-1.5 text-gray-500 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Right sidebar: vertical round label -->
        <div
          class="flex shrink-0 items-center justify-center border-l border-white/10"
          style="width: 28px"
        >
          <div
            ref="roundEl"
            contenteditable="true"
            spellcheck="false"
            @keydown.enter.prevent="roundEl?.blur()"
            @blur="save('roundLabel', roundEl?.innerText)"
            class="cursor-text rounded px-0.5 text-center font-black uppercase text-white outline-none transition-colors hover:bg-white/5 focus:bg-white/10"
            style="
              writing-mode: vertical-rl;
              transform: rotate(180deg);
              font-size: 0.75rem;
              letter-spacing: 0.35em;
              white-space: nowrap;
            "
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { toPng } from 'html-to-image'
import type { TeamRanking } from '../types/afl'
import { TEAMS } from '../composables/useAFLData'
import {
  powerRankingsTitle,
  titleToFilename,
} from '../composables/usePowerRankingsTitle'
import { useRanking } from '../composables/useRanking'

const props = defineProps<{
  ranking: TeamRanking
  rankingHistory: Record<number, TeamRanking>
}>()

const LABELS_KEY = 'afl-power-rankings-labels-2026'

const teamMap = Object.fromEntries(TEAMS.map((t) => [t.id, t]))

// --- Tier labels ---
const TIER_NAMES = ['S', 'A', 'B', 'C', 'D', 'E', 'F'] as const
const { tierSizes, tierSizesHistory } = useRanking()

function buildTierForIndex(sizes: number[]): string[] {
  const map: string[] = []
  TIER_NAMES.forEach((name, i) => {
    const count = sizes[i] ?? 0
    for (let j = 0; j < count; j++) map.push(name)
  })
  return map
}

const tierForIndex = computed<string[]>(() => {
  const sizes =
    selectedRound.value !== null &&
    selectedRound.value !== currentSnapshotRound.value
      ? (tierSizesHistory.value[selectedRound.value] ?? tierSizes.value)
      : tierSizes.value
  return buildTierForIndex(sizes)
})

// Maps teamId → tier letter for the previous round
const previousTierByTeamId = computed<Map<number, string>>(() => {
  const map = new Map<number, string>()
  if (previousRound.value === null) return map
  const prevRanking = props.rankingHistory[previousRound.value]
  if (!prevRanking) return map
  const prevSizes =
    tierSizesHistory.value[previousRound.value] ?? tierSizes.value
  const prevTiers = buildTierForIndex(prevSizes)
  prevRanking.forEach((teamId, i) => map.set(teamId, prevTiers[i]))
  return map
})

const TIER_BADGE_CLASS: Record<string, string> = {
  S: 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40',
  A: 'bg-green-500/20 text-green-400 ring-1 ring-green-500/40',
  B: 'bg-teal-500/20 text-teal-400 ring-1 ring-teal-500/40',
  C: 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40',
  D: 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/40',
  E: 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40',
  F: 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40',
}

// --- Screenshot ---
const captureEl = ref<HTMLDivElement | null>(null)
const capturing = ref(false)

async function screenshot() {
  if (!captureEl.value) return
  capturing.value = true
  await new Promise((r) => setTimeout(r, 50)) // let UI hide pills/button

  // html-to-image can't resolve external SVG <use> hrefs, so inline the sprite
  // temporarily and switch to fragment-only references before capturing.
  let spriteEl: Element | null = null
  const useEls: { el: Element; original: string }[] = []
  try {
    const spriteRes = await fetch('/ranked-predictor/icons.svg')
    const spriteText = await spriteRes.text()
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
    wrapper.innerHTML = spriteText
    spriteEl = wrapper
    captureEl.value.prepend(wrapper)

    captureEl.value.querySelectorAll('use[href]').forEach((use) => {
      const href = use.getAttribute('href') ?? ''
      useEls.push({ el: use, original: href })
      const fragment = href.split('#')[1]
      if (fragment) use.setAttribute('href', `#${fragment}`)
    })

    const dataUrl = await toPng(captureEl.value, { pixelRatio: 2 })
    const link = document.createElement('a')
    link.download = titleToFilename(title.value)
    link.href = dataUrl
    link.click()
  } finally {
    // Restore original hrefs and remove inlined sprite
    useEls.forEach(({ el, original }) => el.setAttribute('href', original))
    spriteEl?.remove()
    capturing.value = false
  }
}

// --- Editable label state ---
function loadLabels() {
  try {
    const raw = localStorage.getItem(LABELS_KEY)
    if (raw) return JSON.parse(raw) as Record<string, string>
  } catch {
    /* ignore */
  }
  return {}
}

const stored = loadLabels()
const year = ref(stored.year ?? '2026')
const title = ref(stored.title ?? 'POWER RANKINGS')
const roundLabel = ref(stored.roundLabel ?? '')

const yearEl = ref<HTMLDivElement | null>(null)
const titleEl = ref<HTMLDivElement | null>(null)
const roundEl = ref<HTMLDivElement | null>(null)

function save(key: 'year' | 'title' | 'roundLabel', raw: string | undefined) {
  const value = raw?.trim() ?? ''
  if (key === 'year') year.value = value
  else if (key === 'title') {
    title.value = value
    powerRankingsTitle.value = value
  } else roundLabel.value = value
  const labels = loadLabels()
  labels[key] = value
  localStorage.setItem(LABELS_KEY, JSON.stringify(labels))
}

// Seed DOM from refs (avoids Vue overwriting contenteditable content on re-render)
onMounted(() => {
  if (yearEl.value) yearEl.value.innerText = year.value
  if (titleEl.value) titleEl.value.innerText = title.value
  if (roundEl.value) roundEl.value.innerText = roundLabel.value
})

// --- Round history ---
const sortedRounds = computed(() =>
  Object.keys(props.rankingHistory)
    .map(Number)
    .sort((a, b) => a - b),
)

const currentSnapshotRound = computed(
  () => sortedRounds.value[sortedRounds.value.length - 1] ?? null,
)

const selectedRound = ref<number | null>(currentSnapshotRound.value)

watch(
  currentSnapshotRound,
  (r) => {
    if (r !== null && selectedRound.value === null) selectedRound.value = r
  },
  { immediate: true },
)

// Hide position-separator borders during row reorder animation, then fade them back in
const isAnimating = ref(false)
let animTimer: ReturnType<typeof setTimeout> | null = null
watch(selectedRound, () => {
  isAnimating.value = true
  if (animTimer) clearTimeout(animTimer)
  animTimer = setTimeout(() => {
    isAnimating.value = false
  }, 350)
})

// Keep the round label in sync with whichever round is selected
watch(
  selectedRound,
  (r) => {
    if (r === null) return
    const label = r === 0 ? 'AFTER OPENING ROUND' : `AFTER ROUND ${r}`
    roundLabel.value = label
    if (roundEl.value) roundEl.value.innerText = label
  },
  { immediate: true },
)

const previousRound = computed(() => {
  if (selectedRound.value === null) return null
  const idx = sortedRounds.value.indexOf(selectedRound.value)
  return idx > 0 ? sortedRounds.value[idx - 1] : null
})

function roundPill(r: number) {
  return r === 0 ? 'Opening' : `Rd ${r}`
}

// --- Power ranking rows ---
interface PowerRow {
  teamId: number
  teamName: string
  iconId: string
  previousRank: number | null
  delta: number | null
  tierChange: 'up' | 'down' | null
}

const rows = computed<PowerRow[]>(() => {
  // For the latest round, use the live ranking so it stays in sync with the ranking table
  const isLatest = selectedRound.value === currentSnapshotRound.value
  const snapshot = isLatest
    ? props.ranking
    : selectedRound.value !== null
      ? props.rankingHistory[selectedRound.value]
      : null
  const prev =
    previousRound.value !== null
      ? props.rankingHistory[previousRound.value]
      : null

  if (!snapshot) return []

  const prevRankMap = new Map<number, number>()
  if (prev) prev.forEach((id, i) => prevRankMap.set(id, i + 1))

  const currentTiers = tierForIndex.value
  const prevTiers = previousTierByTeamId.value

  return snapshot.map((teamId, i) => {
    const team = teamMap[teamId]
    const prevRank = prevRankMap.get(teamId) ?? null
    const delta = prevRank !== null ? prevRank - (i + 1) : null
    const currentTier = currentTiers[i]
    const prevTier = prevTiers.get(teamId)
    let tierChange: 'up' | 'down' | null = null
    if (prevTier && prevTier !== currentTier) {
      tierChange =
        TIER_NAMES.indexOf(prevTier as (typeof TIER_NAMES)[number]) >
        TIER_NAMES.indexOf(currentTier as (typeof TIER_NAMES)[number])
          ? 'up'
          : 'down'
    }
    return {
      teamId,
      teamName: team?.name ?? String(teamId),
      iconId: team?.iconId ?? '',
      previousRank: prevRank,
      delta,
      tierChange,
    }
  })
})
</script>

<style scoped>
.power-row-move {
  transition: transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
</style>
