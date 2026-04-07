<template>
  <div
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

    <div class="relative flex">
      <!-- Main content -->
      <div class="min-w-0 flex-1 px-5 pb-4 pt-5">
        <!-- Header -->
        <div class="mb-4 text-center">
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
          <div class="mb-1 mt-3 h-px bg-white/20" />
        </div>

        <!-- No history -->
        <div
          v-if="rows.length === 0"
          class="py-10 text-center text-sm text-gray-500"
        >
          Changes will appear after the next round
        </div>

        <!-- Team rows -->
        <div v-else class="space-y-0">
          <div
            v-for="(row, i) in rows"
            :key="row.teamId"
            class="flex items-center gap-2 border-b transition-colors"
            :class="[
              i === 5 ? 'border-b-2 border-b-red-500' : i === 9 ? 'border-b-2 border-b-blue-500' : 'border-b border-b-white/10',
              'py-1.5 hover:bg-white/5',
            ]"
          >
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
        </div>

        <!-- Round history pills -->
        <div v-if="sortedRounds.length > 1" class="mt-4 flex flex-wrap gap-1.5">
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
            font-size: 0.6rem;
            letter-spacing: 0.35em;
            white-space: nowrap;
          "
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import type { TeamRanking } from '../types/afl'
import { TEAMS } from '../composables/useAFLData'

const props = defineProps<{
  ranking: TeamRanking
  rankingHistory: Record<number, TeamRanking>
}>()

const LABELS_KEY = 'afl-power-rankings-labels-2026'

const teamMap = Object.fromEntries(TEAMS.map((t) => [t.id, t]))

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
  else if (key === 'title') title.value = value
  else roundLabel.value = value
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

  return snapshot.map((teamId, i) => {
    const team = teamMap[teamId]
    const prevRank = prevRankMap.get(teamId) ?? null
    const delta = prevRank !== null ? prevRank - (i + 1) : null
    return {
      teamId,
      teamName: team?.name ?? String(teamId),
      iconId: team?.iconId ?? '',
      previousRank: prevRank,
      delta,
    }
  })
})
</script>
