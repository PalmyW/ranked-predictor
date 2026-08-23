<template>
  <div
    data-tour="round-banner"
    class="flex items-stretch overflow-hidden border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
  >
    <!-- Round selector -->
    <div
      class="flex shrink-0 items-center gap-1 border-r border-gray-200 px-2 dark:border-gray-700"
    >
      <button
        @click="prevRound"
        :disabled="!canGoPrev"
        class="flex size-5 items-center justify-center rounded text-base leading-none text-gray-400 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-20 dark:text-gray-500 dark:hover:bg-gray-800"
      >
        ‹
      </button>
      <div class="w-16 select-none text-center">
        <div
          class="text-[9px] font-bold uppercase leading-tight tracking-widest text-gray-400 dark:text-gray-500"
        >
          {{ roundLabel }}
        </div>
        <div
          class="font-shoulders text-xl font-black leading-none text-gray-800 dark:text-gray-100"
        >
          {{ roundNumber }}
        </div>
        <div
          class="mt-0.5 text-[9px] leading-tight text-gray-400 dark:text-gray-600"
        >
          {{ displayedRound.concludedCount }}/{{
            displayedRound.matches.length
          }}
          played
        </div>
      </div>
      <button
        @click="nextRound"
        :disabled="!canGoNext"
        class="flex size-5 items-center justify-center rounded text-base leading-none text-gray-400 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-20 dark:text-gray-500 dark:hover:bg-gray-800"
      >
        ›
      </button>
    </div>

    <!-- Scrollable match cards -->
    <div
      ref="scrollEl"
      class="scrollbar-hide flex divide-x divide-gray-100 overflow-x-auto dark:divide-gray-800"
      style="
        scroll-behavior: smooth;
        scrollbar-width: none;
        -ms-overflow-style: none;
      "
    >
      <div
        v-for="match in displayedRound.matches"
        :key="match.id"
        data-match-card
        class="flex min-w-[136px] flex-col justify-between px-3 pb-2 pt-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
        :class="[
          match.status === 'LIVE'
            ? 'border-l-2 border-blue-400 bg-blue-50/30 hover:bg-blue-50/50 dark:bg-blue-950/20 dark:hover:bg-blue-950/30'
            : '',
          match.status === 'CONCLUDED' || isUpcoming(match) ? 'cursor-pointer' : 'cursor-default',
        ]"
        @click="onCardClick(match)"
      >
        <!-- Status (LIVE / FT only) -->
        <div class="flex">
          <span
            v-if="match.status === 'LIVE'"
            class="rounded bg-blue-500/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-widest text-blue-500 dark:text-blue-400"
            >Live</span
          >
          <span
            v-else-if="match.status === 'CONCLUDED'"
            class="text-[9px] uppercase tracking-widest text-gray-300 dark:text-gray-700"
            >FT</span
          >
          <span
            v-else-if="matchDayTime(match)"
            class="mb-1 w-full text-center text-[9px] leading-none text-gray-400 dark:text-gray-500"
            >{{ matchDayTime(match) }}</span
          >
          <span v-else class="text-[9px] opacity-0">FT</span>
        </div>

        <!-- Home team -->
        <div class="flex w-full items-center gap-1">
          <svg
            v-if="iconId(match.homeTeamId)"
            class="size-4 shrink-0 opacity-80"
          >
            <use
              :href="`/ranked-predictor/icons.svg#${iconId(match.homeTeamId)}`"
            />
          </svg>
          <span
            class="truncate text-[11px] font-bold tracking-wide"
            :class="
              isHomeWinner(match)
                ? 'text-gray-900 dark:text-white'
                : match.status === 'CONCLUDED'
                  ? 'text-gray-400 dark:text-gray-600'
                  : predictedWinnerId(match) === match.homeTeamId
                    ? 'text-gray-800 dark:text-gray-100'
                    : 'text-gray-500 dark:text-gray-400'
            "
            ><TeamFixtureSummaryPopup
              :teamId="match.homeTeamId"
              :teamName="match.homeTeamName"
              :label="abbrev(match.homeTeamId)"
          /></span>
          <span
            v-if="
              match.status !== 'CONCLUDED' &&
              match.status !== 'LIVE' &&
              predictedWinnerId(match) === match.homeTeamId
            "
            class="shrink-0 rounded bg-blue-100 px-1 text-[9px] font-bold leading-tight text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
            title="Predicted winner"
            >P</span
          >
          <span
            v-if="
              match.status !== 'CONCLUDED' &&
              simulatedMatchWinners?.[match.id] === match.homeTeamId
            "
            class="shrink-0 rounded bg-purple-500 px-1 text-[9px] font-bold leading-tight text-white"
            title="Simulated winner"
            >S</span
          >
          <span
            v-if="
              (match.status === 'CONCLUDED' || match.status === 'LIVE') &&
              match.homeScore
            "
            class="ml-auto shrink-0 font-mono text-[11px] tabular-nums"
            :class="
              match.status === 'LIVE'
                ? 'font-bold text-blue-500 dark:text-blue-400'
                : isHomeWinner(match)
                  ? 'font-bold text-gray-900 dark:text-white'
                  : 'text-gray-400 dark:text-gray-600'
            "
            >{{ match.homeScore.totalScore }}</span
          >
        </div>

        <!-- Away team -->
        <div class="flex w-full items-center gap-1">
          <svg
            v-if="iconId(match.awayTeamId)"
            class="size-4 shrink-0 opacity-80"
          >
            <use
              :href="`/ranked-predictor/icons.svg#${iconId(match.awayTeamId)}`"
            />
          </svg>
          <span
            class="truncate text-[11px] font-bold tracking-wide"
            :class="
              isAwayWinner(match)
                ? 'text-gray-900 dark:text-white'
                : match.status === 'CONCLUDED'
                  ? 'text-gray-400 dark:text-gray-600'
                  : predictedWinnerId(match) === match.awayTeamId
                    ? 'text-gray-800 dark:text-gray-100'
                    : 'text-gray-500 dark:text-gray-400'
            "
            ><TeamFixtureSummaryPopup
              :teamId="match.awayTeamId"
              :teamName="match.awayTeamName"
              :label="abbrev(match.awayTeamId)"
          /></span>
          <span
            v-if="
              match.status !== 'CONCLUDED' &&
              match.status !== 'LIVE' &&
              predictedWinnerId(match) === match.awayTeamId
            "
            class="shrink-0 rounded bg-blue-100 px-1 text-[9px] font-bold leading-tight text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
            title="Predicted winner"
            >P</span
          >
          <span
            v-if="
              match.status !== 'CONCLUDED' &&
              simulatedMatchWinners?.[match.id] === match.awayTeamId
            "
            class="shrink-0 rounded bg-purple-500 px-1 text-[9px] font-bold leading-tight text-white"
            title="Simulated winner"
            >S</span
          >
          <span
            v-if="
              (match.status === 'CONCLUDED' || match.status === 'LIVE') &&
              match.awayScore
            "
            class="ml-auto shrink-0 font-mono text-[11px] tabular-nums"
            :class="
              match.status === 'LIVE'
                ? 'font-bold text-blue-500 dark:text-blue-400'
                : isAwayWinner(match)
                  ? 'font-bold text-gray-900 dark:text-white'
                  : 'text-gray-400 dark:text-gray-600'
            "
            >{{ match.awayScore.totalScore }}</span
          >
        </div>

        <!-- Countdown -->
        <div v-if="countdown(match)" class="flex justify-center">
          <span class="text-[9px] text-gray-400 dark:text-gray-500">{{
            countdown(match)
          }}</span>
        </div>
      </div>

      <!-- Byes -->
      <div
        v-if="byeTeamIds.length"
        class="flex min-w-[88px] flex-col justify-center gap-1 px-3 py-2.5"
      >
        <div
          class="text-[9px] font-bold uppercase tracking-widest text-gray-300 dark:text-gray-600"
        >
          Bye
        </div>
        <div class="flex flex-col gap-0.5">
          <div
            v-for="teamId in byeTeamIds"
            :key="teamId"
            class="flex items-center gap-1"
          >
            <svg v-if="iconId(teamId)" class="size-3.5 shrink-0 opacity-50">
              <use :href="`/ranked-predictor/icons.svg#${iconId(teamId)}`" />
            </svg>
            <span
              class="text-[11px] font-bold tracking-wide text-gray-400 dark:text-gray-600"
              ><TeamFixtureSummaryPopup
                :teamId="teamId"
                :teamName="teamName(teamId)"
                :label="abbrev(teamId)"
            /></span>
          </div>
        </div>
      </div>
    </div>

    <HeadToHeadModal
      v-if="h2hMatch"
      :home="{ id: h2hMatch.homeTeamId, name: h2hMatch.homeTeamName, iconId: iconId(h2hMatch.homeTeamId) ?? '' }"
      :away="{ id: h2hMatch.awayTeamId, name: h2hMatch.awayTeamName, iconId: iconId(h2hMatch.awayTeamId) ?? '' }"
      @close="h2hMatch = null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import type { AflMatch, TeamRanking } from '../types/afl'
import { teamById } from '../composables/useAFLData'
import TeamFixtureSummaryPopup from './TeamFixtureSummaryPopup.vue'
import HeadToHeadModal from './HeadToHeadModal.vue'

const props = defineProps<{
  matches: readonly AflMatch[]
  ranking: TeamRanking
  simulatedMatchWinners: Record<number, number> | null
}>()

const router = useRouter()

// --- Head-to-head modal ---
const h2hMatch = ref<AflMatch | null>(null)

function isUpcoming(match: AflMatch): boolean {
  return match.status !== 'CONCLUDED' && match.status !== 'LIVE'
}

function onCardClick(match: AflMatch) {
  if (match.status === 'CONCLUDED') {
    router.push('/stats/' + match.providerId)
  } else if (isUpcoming(match)) {
    h2hMatch.value = match
  }
}

// --- Now ticker (for countdown) ---
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 30_000)
})
onUnmounted(() => {
  if (timer !== null) clearInterval(timer)
})

// --- Round grouping ---
interface RoundGroup {
  roundNumber: number
  roundName: string
  matches: AflMatch[]
  concludedCount: number
}

const rounds = computed<RoundGroup[]>(() => {
  const map = new Map<number, RoundGroup>()
  for (const match of props.matches) {
    if (!map.has(match.roundNumber)) {
      map.set(match.roundNumber, {
        roundNumber: match.roundNumber,
        roundName: match.roundName,
        matches: [],
        concludedCount: 0,
      })
    }
    const group = map.get(match.roundNumber)!
    group.matches.push(match)
    if (match.status === 'CONCLUDED') group.concludedCount++
  }
  return Array.from(map.values()).sort((a, b) => a.roundNumber - b.roundNumber)
})

// --- Current round detection ---
const currentRoundIndex = computed(() => {
  const inProgress = rounds.value.findIndex(
    (r) => r.concludedCount > 0 && r.concludedCount < r.matches.length,
  )
  if (inProgress !== -1) return inProgress
  const liveIdx = rounds.value.findIndex((r) =>
    r.matches.some((m) => m.status === 'LIVE'),
  )
  if (liveIdx !== -1) return liveIdx
  const futureIdx = rounds.value.findIndex((r) => r.concludedCount === 0)
  return futureIdx !== -1 ? futureIdx : 0
})

const selectedRoundIndex = ref(0)
watch(
  currentRoundIndex,
  (idx) => {
    selectedRoundIndex.value = idx
  },
  { immediate: true },
)

const displayedRound = computed(
  () =>
    rounds.value[selectedRoundIndex.value] ?? {
      roundNumber: 0,
      roundName: '',
      matches: [],
      concludedCount: 0,
    },
)

// Split "Round 4" → label "RD" + number "4" (handles "Opening Round" etc. gracefully)
const roundLabel = computed(() => {
  const name = displayedRound.value.roundName
  return name.replace(/\d+.*/, '').trim() || name
})
const roundNumber = computed(() => {
  const match = displayedRound.value.roundName.match(/\d+/)
  return match ? match[0] : ''
})

const byeTeamIds = computed<number[]>(() => {
  const roundNum = displayedRound.value.roundNumber
  const match = props.matches.find((m) => m.roundNumber === roundNum)
  return (match?.['byeTeamIds'] as number[] | undefined) ?? []
})
const canGoPrev = computed(() => selectedRoundIndex.value > 0)
const canGoNext = computed(
  () => selectedRoundIndex.value < rounds.value.length - 1,
)

function prevRound() {
  if (canGoPrev.value) selectedRoundIndex.value--
}
function nextRound() {
  if (canGoNext.value) selectedRoundIndex.value++
}

// --- Helpers ---
const rankMap = computed<Record<number, number>>(() => {
  const map: Record<number, number> = {}
  props.ranking.forEach((id, i) => {
    map[id] = i + 1
  })
  return map
})

function predictedWinnerId(match: AflMatch): number | null {
  if (match.status === 'CONCLUDED') return null
  const hRank = rankMap.value[match.homeTeamId] ?? 999
  const aRank = rankMap.value[match.awayTeamId] ?? 999
  if (hRank === aRank) return null
  return hRank < aRank ? match.homeTeamId : match.awayTeamId
}

function iconId(teamId: number) {
  return teamById(teamId)?.iconId || null
}
function abbrev(teamId: number) {
  // Unresolved finals slot (e.g. "Winner of QF1") — fall through to the
  // TeamFixtureSummaryPopup's teamName prop instead of showing a raw team id.
  return teamById(teamId)?.abbreviation
}
function teamName(teamId: number) {
  return teamById(teamId)?.name ?? String(teamId)
}

function isHomeWinner(match: AflMatch) {
  if (match.status !== 'CONCLUDED' || !match.homeScore || !match.awayScore)
    return false
  return match.homeScore.totalScore > match.awayScore.totalScore
}
function isAwayWinner(match: AflMatch) {
  if (match.status !== 'CONCLUDED' || !match.homeScore || !match.awayScore)
    return false
  return match.awayScore.totalScore > match.homeScore.totalScore
}

function matchDayTime(match: AflMatch): string {
  try {
    const date = new Date(match.utcStartTime)
    if (isNaN(date.getTime())) return ''
    return date.toLocaleString(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return ''
  }
}

function countdown(match: AflMatch): string {
  try {
    const diff = new Date(match.utcStartTime).getTime() - now.value
    if (diff <= 0) return ''
    const totalMins = Math.floor(diff / 60_000)
    const hours = Math.floor(totalMins / 60)
    const days = Math.floor(hours / 24)
    if (days >= 1) return `in ${days}d ${hours % 24}h`
    if (hours >= 1) return `in ${hours}h ${totalMins % 60}m`
    return `in ${totalMins}m`
  } catch {
    return ''
  }
}

// --- Auto-scroll to first LIVE match ---
const scrollEl = ref<HTMLElement | null>(null)

function scrollToLive() {
  nextTick(() => {
    if (!scrollEl.value) return
    const liveIdx = displayedRound.value.matches.findIndex(
      (m) => m.status === 'LIVE',
    )
    const cards = scrollEl.value.querySelectorAll('[data-match-card]')
    if (liveIdx > 0 && cards[liveIdx]) {
      cards[liveIdx].scrollIntoView({
        behavior: 'smooth',
        inline: 'start',
        block: 'nearest',
      })
    } else {
      scrollEl.value.scrollLeft = 0
    }
  })
}

onMounted(scrollToLive)
watch(selectedRoundIndex, scrollToLive)
</script>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
