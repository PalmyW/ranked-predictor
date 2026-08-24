<template>
  <div
    ref="captureEl"
    class="relative select-none overflow-hidden rounded-lg text-white"
    style="background: #0a0d14"
  >
    <!-- Subtle gradient accent — hue shifts per round -->
    <div
      class="pointer-events-none absolute inset-0 transition-[background] duration-700"
      :style="`background: radial-gradient(ellipse at 30% 0%, ${weekAccentColor} 0%, transparent 75%)`"
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

          <!-- TABLE VIEW -->
          <div v-show="activeView === 'table'">
            <!-- No history -->
            <div
              v-if="rows.length === 0"
              class="py-10 text-center text-sm text-gray-500"
            >
              Changes will appear after the next round
            </div>

            <!-- EDIT MODE: draggable rows -->
            <draggable
              v-else-if="editMode"
              v-model="editRows"
              item-key="teamId"
              handle=".power-edit-handle"
              :animation="150"
              tag="div"
              class="space-y-0"
            >
              <template #item="{ element, index }">
                <div
                  class="flex items-center gap-2 border-b py-1.5 hover:bg-white/5"
                  :class="
                    index === FINALS_BOUNDARY_INDEXES[0]
                      ? 'border-b-2 border-b-red-500'
                      : index === FINALS_BOUNDARY_INDEXES[1]
                        ? 'border-b-2 border-b-blue-500'
                        : 'border-b border-b-white/10'
                  "
                >
                  <!-- Drag handle -->
                  <span class="power-edit-handle cursor-grab active:cursor-grabbing shrink-0 text-lg leading-none text-gray-500 touch-none">⠿</span>
                  <!-- Tier badge (no change arrow in edit mode) -->
                  <span class="flex shrink-0 items-center gap-0.5">
                    <span
                      class="w-5 rounded py-[3px] text-center text-[0.6rem] font-black uppercase leading-none tracking-wide"
                      :class="editTierForIndex[index] ? TIER_BADGE_CLASS[editTierForIndex[index]] : 'bg-white/8 text-gray-500 ring-1 ring-white/15'"
                    >{{ editTierForIndex[index] }}</span>
                    <span class="w-2 shrink-0" />
                  </span>
                  <!-- Team name -->
                  <span class="flex-1 truncate text-right text-xs font-bold uppercase tracking-wide sm:text-sm" style="letter-spacing: 0.06em">
                    {{ element.teamName }}
                  </span>
                  <!-- Logo -->
                  <svg class="size-7 shrink-0">
                    <use :href="`/ranked-predictor/icons.svg#${element.iconId}`" />
                  </svg>
                  <!-- Rank -->
                  <span class="w-5 shrink-0 text-right text-sm font-black tabular-nums text-white">{{ index + 1 }}</span>
                  <!-- Delta spacer -->
                  <span class="w-9 shrink-0" />
                </div>
              </template>
            </draggable>

            <!-- VIEW MODE: static rows -->
            <TransitionGroup v-else tag="div" name="power-row" class="space-y-0">
              <div
                v-for="(row, i) in rows"
                :key="row.teamId"
                class="flex items-center gap-2 border-b transition-colors"
                :class="[
                  i === FINALS_BOUNDARY_INDEXES[0]
                    ? [
                        'border-b-2',
                        isAnimating ? 'border-b-transparent' : 'border-b-red-500',
                      ]
                    : i === FINALS_BOUNDARY_INDEXES[1]
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
          </div>

          <!-- GRAPH VIEW -->
          <div v-show="activeView === 'graph'" class="py-2">
            <div
              v-if="sortedRounds.length < 2"
              class="py-10 text-center text-sm text-gray-500"
            >
              Snapshot at least two rounds to see the worm chart
            </div>

            <svg
              v-else
              viewBox="0 0 600 450"
              class="w-full"
              style="overflow: visible"
              aria-label="Power rankings worm chart"
            >
              <!-- Top 4 reference line -->
              <line
                :x1="CHART.x0" :y1="yRef4" :x2="CHART.x1" :y2="yRef4"
                stroke="rgba(239,68,68,0.3)" stroke-width="1" stroke-dasharray="4,3"
              />
              <!-- Top 8 reference line -->
              <line
                :x1="CHART.x0" :y1="yRef8" :x2="CHART.x1" :y2="yRef8"
                stroke="rgba(59,130,246,0.3)" stroke-width="1" stroke-dasharray="4,3"
              />

              <!-- Y-axis position labels -->
              <text
                v-for="pos in [1, 4, 5, 8, 9, 14, 18]"
                :key="pos"
                :x="CHART.x0 - 4"
                :y="yScale(pos) + 3.5"
                text-anchor="end"
                font-size="8"
                font-family="system-ui,sans-serif"
                fill="rgba(255,255,255,0.3)"
              >{{ pos }}</text>

              <!-- X-axis gridlines + round labels -->
              <g v-for="(r, idx) in sortedRounds" :key="`xcol-${r}`">
                <line
                  :x1="xScale(idx)" :y1="CHART.y0"
                  :x2="xScale(idx)" :y2="CHART.y1"
                  stroke="rgba(255,255,255,0.05)" stroke-width="1"
                />
                <text
                  :x="xScale(idx)"
                  :y="CHART.y1 + 5"
                  text-anchor="end"
                  font-size="8"
                  font-family="system-ui,sans-serif"
                  fill="rgba(255,255,255,0.3)"
                  :transform="`rotate(-45, ${xScale(idx)}, ${CHART.y1 + 5})`"
                >{{ roundPill(r) }}</text>
              </g>

              <!-- Team worm lines -->
              <path
                v-for="d in wormData"
                :key="`line-${d.team.id}`"
                :d="buildWormPath(d.points)"
                fill="none"
                :stroke="d.color"
                stroke-width="2"
                stroke-opacity="0.85"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <!-- Team logos at final position -->
              <g v-for="d in wormData" :key="`logo-${d.team.id}`">
                <template v-if="d.points.length">
                  <!-- Dark backdrop circle -->
                  <circle
                    :cx="CHART.x1 + 16"
                    :cy="d.points[d.points.length - 1].y"
                    r="13"
                    fill="#0a0d14"
                  />
                  <!-- Coloured ring -->
                  <circle
                    :cx="CHART.x1 + 16"
                    :cy="d.points[d.points.length - 1].y"
                    r="12"
                    fill="none"
                    :stroke="d.color"
                    stroke-width="1"
                    stroke-opacity="0.5"
                  />
                  <!-- Team icon -->
                  <svg
                    :x="CHART.x1 + 4"
                    :y="d.points[d.points.length - 1].y - 12"
                    width="24"
                    height="24"
                    overflow="visible"
                  >
                    <use :href="`/ranked-predictor/icons.svg#${d.team.iconId}`" />
                  </svg>
                </template>
              </g>
            </svg>
          </div>

          <!-- Round history pills + screenshot (table mode) -->
          <div
            v-if="!capturing && activeView === 'table'"
            class="mt-4 flex flex-wrap items-center gap-1.5"
          >
            <!-- Edit mode: save / cancel -->
            <template v-if="editMode">
              <span class="self-center text-xs text-gray-400">Editing {{ roundPill(selectedRound ?? 0) }}</span>
              <button
                @click="saveEdit"
                class="rounded px-2 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50 hover:bg-amber-500/30 transition-colors"
              >Save</button>
              <button
                @click="cancelEdit"
                class="rounded px-2 py-0.5 text-xs font-semibold bg-white/5 text-gray-400 hover:bg-white/10 transition-colors"
              >Cancel</button>
            </template>

            <!-- View mode: history pills + edit button -->
            <template v-else>
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
              <!-- Edit button: only for past (non-latest) rounds -->
              <button
                v-if="selectedRound !== null && selectedRound !== currentSnapshotRound && rows.length > 0"
                @click="startEdit"
                title="Edit this round"
                class="rounded px-2 py-0.5 text-xs font-semibold bg-white/5 text-gray-400 hover:bg-white/10 transition-colors"
              >✎</button>
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
            </template>
          </div>

          <!-- Segmented control (always visible) + screenshot in graph mode -->
          <div v-if="!capturing && !editMode" class="mt-3 flex items-center">
            <div class="flex-1" />
            <div class="flex overflow-hidden rounded ring-1 ring-white/15">
              <button
                @click="activeView = 'table'"
                class="px-3 py-1 text-xs font-semibold transition-colors"
                :class="
                  activeView === 'table'
                    ? 'bg-white/15 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                "
              >Table</button>
              <button
                @click="activeView = 'graph'"
                class="border-l border-white/15 px-3 py-1 text-xs font-semibold transition-colors"
                :class="
                  activeView === 'graph'
                    ? 'bg-white/15 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                "
              >Graph</button>
            </div>
            <div class="flex flex-1 justify-end">
              <button
                v-if="activeView === 'graph'"
                @click="screenshot"
                title="Save as image"
                class="rounded p-1.5 text-gray-500 transition-colors hover:bg-white/10 hover:text-white"
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
        </div>

        <!-- Right sidebar: vertical round label (table mode only) -->
        <div
          v-show="activeView === 'table'"
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
import draggable from 'vuedraggable'
import type { TeamRanking, AflTeam } from '../types/afl'
import { TEAMS } from '../composables/useAFLData'
import {
  powerRankingsTitle,
  titleToFilename,
} from '../composables/usePowerRankingsTitle'
import { useRanking } from '../composables/useRanking'
import { getActiveSeasonYear } from '../config/seasons'
import { LEAGUE_CONFIG } from '../config/league'
import { FINALS_BOUNDARY_INDEXES } from '../composables/useFinalsBoundary'

const props = defineProps<{
  ranking: TeamRanking
  rankingHistory: Record<number, TeamRanking>
}>()

const LABELS_KEY = `afl-power-rankings-labels-2026${LEAGUE_CONFIG.lsSuffix}`

const teamMap = Object.fromEntries(TEAMS.map((t) => [t.id, t]))

// --- Team brand colours (adjusted for dark background visibility) ---
// Keyed by club abbreviation, not the numeric team id — AFL_TEAMS and
// AFLW_TEAMS use different provider-derived ids for the same 18 clubs, but
// share the same abbreviations, so one map serves both leagues.
const TEAM_COLORS: Record<string, string> = {
  ADEL: '#E6002D', // Adelaide Crows
  BL:   '#A52834', // Brisbane Lions
  CARL: '#1565C0', // Carlton
  COLL: '#C8C8C8', // Collingwood (black → light grey on dark bg)
  ESS:  '#FF4136', // Essendon
  FRE:  '#6A3688', // Fremantle
  GEEL: '#1E6EB5', // Geelong Cats
  GCS:  '#FFB703', // Gold Coast SUNS (AFL abbreviation)
  GCFC: '#FFB703', // Gold Coast SUNS (AFLW abbreviation)
  GWS:  '#F15A22', // GWS GIANTS
  HAW:  '#C8922A', // Hawthorn
  MELB: '#CC0000', // Melbourne
  NMFC: '#1E88E5', // North Melbourne
  PORT: '#00B2C8', // Port Adelaide
  RICH: '#F4C430', // Richmond
  STK:  '#D50000', // St Kilda
  SYD:  '#E53935', // Sydney Swans
  WCE:  '#EFAB00', // West Coast Eagles
  WB:   '#4469DE', // Western Bulldogs
}

// --- View toggle ---
const activeView = ref<'table' | 'graph'>('table')

// --- Tier labels ---
const TIER_NAMES = ['S', 'A', 'B', 'C', 'D', 'E', 'F'] as const
const { tierSizes, tierSizesHistory, saveHistoryRanking } = useRanking()

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
  await new Promise((r) => setTimeout(r, 50))

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
const year = ref(getActiveSeasonYear())
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

const weekAccentColor = computed(() => {
  const hue = ((selectedRound.value ?? 0) * 47) % 360
  return `hsla(${hue}, 90%, 65%, 0.18)`
})

watch(
  currentSnapshotRound,
  (r) => {
    if (r !== null && selectedRound.value === null) selectedRound.value = r
  },
  { immediate: true },
)

const isAnimating = ref(false)
let animTimer: ReturnType<typeof setTimeout> | null = null
watch(selectedRound, () => {
  isAnimating.value = true
  if (animTimer) clearTimeout(animTimer)
  animTimer = setTimeout(() => {
    isAnimating.value = false
  }, 350)
})

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

// --- Edit mode ---
const editMode = ref(false)
const editRows = ref<PowerRow[]>([])

const editTierSizes = computed<number[]>(() =>
  selectedRound.value !== null
    ? (tierSizesHistory.value[selectedRound.value] ?? [...tierSizes.value])
    : [...tierSizes.value]
)

const editTierForIndex = computed<string[]>(() => buildTierForIndex(editTierSizes.value))

watch(selectedRound, () => { editMode.value = false })

function startEdit() {
  editRows.value = rows.value.map((r) => ({ ...r }))
  editMode.value = true
}

function cancelEdit() {
  editMode.value = false
}

function saveEdit() {
  if (selectedRound.value === null) return
  saveHistoryRanking(
    selectedRound.value,
    editRows.value.map((r) => r.teamId),
    editTierSizes.value,
  )
  editMode.value = false
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

// --- Worm chart ---

const CHART = { x0: 26, x1: 546, y0: 20, y1: 422 } as const

function xScale(idx: number): number {
  const n = sortedRounds.value.length
  if (n <= 1) return (CHART.x0 + CHART.x1) / 2
  return CHART.x0 + (idx * (CHART.x1 - CHART.x0)) / (n - 1)
}

function yScale(pos: number): number {
  return CHART.y0 + ((pos - 1) * (CHART.y1 - CHART.y0)) / 17
}

const yRef4 = yScale(4.5)
const yRef8 = yScale(8.5)

interface WormPoint { x: number; y: number }
interface WormTeam { team: AflTeam; color: string; points: WormPoint[] }

const wormData = computed<WormTeam[]>(() => {
  const rounds = sortedRounds.value
  if (rounds.length === 0) return []

  return TEAMS.map((team) => {
    const points: WormPoint[] = []
    rounds.forEach((r, idx) => {
      const snapshot =
        r === currentSnapshotRound.value
          ? props.ranking
          : props.rankingHistory[r]
      const posIdx = snapshot?.indexOf(team.id)
      if (posIdx === undefined || posIdx === -1) return
      points.push({ x: xScale(idx), y: yScale(posIdx + 1) })
    })
    return { team, color: TEAM_COLORS[team.abbreviation] ?? '#888888', points }
  }).filter((d) => d.points.length > 0)
})

function buildWormPath(pts: WormPoint[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1]
    const p1 = pts[i]
    const dx = (p1.x - p0.x) / 3
    d += ` C ${p0.x + dx},${p0.y} ${p1.x - dx},${p1.y} ${p1.x},${p1.y}`
  }
  return d
}
</script>

<style scoped>
.power-row-move {
  transition: transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
</style>
