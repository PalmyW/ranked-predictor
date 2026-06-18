<template>
  <!-- Team detail popup -->
  <Teleport to="body">
    <div
      v-if="popupRow !== null"
      class="fixed z-50 overflow-hidden rounded-xl border border-gray-200 bg-white text-xs shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      :style="popupStyle"
      @click.stop
    >
      <!-- Header -->
      <div class="border-b border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/60">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <svg class="size-6 shrink-0"><use :href="`${BASE_URL}icons.svg#${popupRow.iconId}`" /></svg>
            <span class="text-sm font-bold text-gray-800 dark:text-gray-100">{{ popupRow.teamName }}</span>
          </div>
          <button
            @click="closePopup"
            class="flex size-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            aria-label="Close"
          >✕</button>
        </div>
      </div>

      <!-- Stats summary -->
      <div class="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
        <!-- Header row labels -->
        <div class="mb-1 flex items-center justify-end gap-2 text-gray-400 dark:text-gray-500">
          <span class="w-14 text-right">All</span>
          <span class="w-14 text-right">Home</span>
          <span class="w-14 text-right">Away</span>
        </div>
        <!-- Avg attack -->
        <div class="flex items-center justify-between gap-2 py-0.5">
          <span class="text-gray-500 dark:text-gray-400">Avg attack</span>
          <div class="flex items-center gap-2 tabular-nums">
            <span class="w-14 text-right font-semibold text-gray-800 dark:text-gray-200">{{ popupRow.avgFor.toFixed(1) }}</span>
            <span class="w-14 text-right text-gray-600 dark:text-gray-400">{{ popupRow.playedHome > 0 ? popupRow.avgForHome.toFixed(1) : '–' }}</span>
            <span class="w-14 text-right text-gray-600 dark:text-gray-400">{{ popupRow.playedAway > 0 ? popupRow.avgForAway.toFixed(1) : '–' }}</span>
          </div>
        </div>
        <!-- Avg conceded -->
        <div class="flex items-center justify-between gap-2 py-0.5">
          <span class="text-gray-500 dark:text-gray-400">Avg conceded</span>
          <div class="flex items-center gap-2 tabular-nums">
            <span class="w-14 text-right font-semibold text-gray-800 dark:text-gray-200">{{ popupRow.avgAgainst.toFixed(1) }}</span>
            <span class="w-14 text-right text-gray-600 dark:text-gray-400">{{ popupRow.playedHome > 0 ? popupRow.avgAgainstHome.toFixed(1) : '–' }}</span>
            <span class="w-14 text-right text-gray-600 dark:text-gray-400">{{ popupRow.playedAway > 0 ? popupRow.avgAgainstAway.toFixed(1) : '–' }}</span>
          </div>
        </div>
        <!-- Defence adj -->
        <div class="flex items-center justify-between gap-2 py-0.5">
          <span class="text-gray-500 dark:text-gray-400">Defence adj</span>
          <div class="flex items-center gap-2 tabular-nums">
            <span
              class="w-14 text-right font-semibold"
              :class="popupRow.defenceAdjustment < 0 ? 'text-green-600 dark:text-green-400' : popupRow.defenceAdjustment > 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'"
            >{{ popupRow.defenceAdjustment > 0 ? '+' : '' }}{{ popupRow.defenceAdjustment.toFixed(1) }}</span>
            <span
              class="w-14 text-right font-semibold"
              :class="popupRow.defenceAdjHome < 0 ? 'text-green-600 dark:text-green-400' : popupRow.defenceAdjHome > 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'"
            >{{ popupRow.playedHome > 0 ? (popupRow.defenceAdjHome > 0 ? '+' : '') + popupRow.defenceAdjHome.toFixed(1) : '–' }}</span>
            <span
              class="w-14 text-right font-semibold"
              :class="popupRow.defenceAdjAway < 0 ? 'text-green-600 dark:text-green-400' : popupRow.defenceAdjAway > 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'"
            >{{ popupRow.playedAway > 0 ? (popupRow.defenceAdjAway > 0 ? '+' : '') + popupRow.defenceAdjAway.toFixed(1) : '–' }}</span>
          </div>
        </div>
      </div>

      <!-- Match breakdown subtitle -->
      <div class="border-b border-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:text-gray-500">
        Opponent score vs their own season avg
      </div>

      <!-- Per-match rows -->
      <div class="overflow-y-auto" style="max-height: 280px">
        <div
          v-if="popupMatchBreakdown.length === 0"
          class="px-3 py-4 text-center text-gray-400 dark:text-gray-500"
        >
          No concluded matches
        </div>
        <div
          v-for="m in popupMatchBreakdown"
          :key="m.matchId"
          class="flex items-center gap-2 border-b border-gray-50 px-3 py-1.5 last:border-0 dark:border-gray-800/60"
        >
          <span class="w-7 shrink-0 text-right tabular-nums text-gray-400 dark:text-gray-500">R{{ m.roundNumber }}</span>
          <svg class="size-5 shrink-0"><use :href="`${BASE_URL}icons.svg#${m.opponentIconId}`" /></svg>
          <span class="flex-1 truncate font-medium text-gray-800 dark:text-gray-100">{{ m.opponentName }}</span>
          <span class="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">{{ m.opponentScore }}</span>
          <span
            class="w-10 shrink-0 text-right tabular-nums font-semibold"
            :class="
              m.differential > 0
                ? 'text-red-500 dark:text-red-400'
                : m.differential < 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-400'
            "
          >{{ m.differential > 0 ? '+' : '' }}{{ m.differential.toFixed(0) }}</span>
        </div>
      </div>

      <!-- Footer legend -->
      <div class="border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500">
        <span class="text-red-500">+</span> = opponent above avg &nbsp;·&nbsp;
        <span class="text-green-600">−</span> = below avg
      </div>
    </div>
  </Teleport>

  <main class="mx-auto max-w-4xl px-4 py-6 space-y-6">
    <!-- Page heading -->
    <div>
      <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">PalmyScore™</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Each team's attack and defence rating is derived from their season averages. The defence
        adjustment measures how many points above or below their average opponents score when facing
        that team. Predictions apply each team's attack average adjusted by the opponent's defence
        rating.
      </p>
    </div>

    <!-- No-data banner -->
    <div
      v-if="!isLoading && !hasEnoughData"
      class="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
    >
      No concluded matches yet — predictions will appear once the season begins.
    </div>

    <!-- Predicted Scores card -->
    <div
      v-if="hasEnoughData || isLoading"
      data-tour="score-predictor-predictions"
      class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    >
      <div
        class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700"
      >
        <div>
          <h2 class="text-sm font-bold text-gray-800 dark:text-gray-100">PalmyScore™ Predictions</h2>
          <p v-if="nextRoundName" class="text-xs text-gray-400 dark:text-gray-500">
            {{ nextRoundName }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <!-- Venue toggle -->
          <div class="flex overflow-hidden rounded border border-gray-300 text-xs font-semibold dark:border-gray-600">
            <button
              @click="venueAdjusted = false"
              class="px-3 py-1 transition-colors"
              :class="
                !venueAdjusted
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              "
            >All Games</button>
            <button
              @click="venueAdjusted = true"
              class="px-3 py-1 transition-colors"
              :class="
                venueAdjusted
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              "
            >Home/Away</button>
          </div>
          <!-- Round toggle -->
          <div
            v-if="allUpcomingPredictions.length > 0"
            class="flex overflow-hidden rounded border border-gray-300 text-xs font-semibold dark:border-gray-600"
          >
            <button
              @click="showAllUpcoming = false"
              class="px-3 py-1 transition-colors"
              :class="
                !showAllUpcoming
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              "
            >
              Next Round
            </button>
            <button
              @click="showAllUpcoming = true"
              class="px-3 py-1 transition-colors"
              :class="
                showAllUpcoming
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              "
            >
              All Upcoming
            </button>
          </div>
        </div>
      </div>

      <!-- Loading skeleton -->
      <div v-if="isLoading" class="space-y-px p-2">
        <div
          v-for="n in 5"
          :key="n"
          class="h-12 animate-pulse rounded bg-gray-100 dark:bg-gray-800"
        />
      </div>

      <!-- Match rows -->
      <template v-else>
        <div
          v-if="activePredictions.length === 0"
          class="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500"
        >
          No upcoming matches scheduled.
        </div>

        <div
          v-for="m in activePredictions"
          :key="m.matchId"
          class="flex items-center gap-2 border-b border-gray-100 px-4 py-3 last:border-0 dark:border-gray-800"
        >
          <!-- Round label when showing all upcoming -->
          <span
            v-if="showAllUpcoming"
            class="hidden w-16 shrink-0 text-xs text-gray-400 dark:text-gray-500 sm:block"
          >
            {{ m.roundName }}
          </span>

          <!-- Home side -->
          <div
            class="flex flex-1 cursor-pointer items-center justify-end gap-2 rounded px-1 py-0.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            :class="popupTeamId === m.homeTeamId ? 'bg-blue-50 dark:bg-blue-900/10' : ''"
            @click.stop="onRowClick(m.homeTeamId, $event)"
          >
            <span class="hidden text-sm font-medium text-gray-800 dark:text-gray-200 sm:inline">
              {{ m.homeTeamName }}
            </span>
            <span class="text-sm font-medium text-gray-800 dark:text-gray-200 sm:hidden">
              {{ m.homeTeamAbbreviation }}
            </span>
            <svg class="size-6 shrink-0">
              <use :href="`${BASE_URL}icons.svg#${m.homeTeamIconId}`" />
            </svg>
          </div>

          <!-- Scores -->
          <div class="flex shrink-0 items-center gap-1 tabular-nums">
            <span
              class="w-9 text-right text-xl font-bold"
              :class="
                m.hasStrengthData
                  ? 'text-gray-900 dark:text-gray-100'
                  : 'text-gray-300 dark:text-gray-600'
              "
            >
              {{ m.hasStrengthData ? m.predictedHomeScore : '–' }}
            </span>
            <span class="text-xs text-gray-400 dark:text-gray-500">vs</span>
            <span
              class="w-9 text-left text-xl font-bold"
              :class="
                m.hasStrengthData
                  ? 'text-gray-900 dark:text-gray-100'
                  : 'text-gray-300 dark:text-gray-600'
              "
            >
              {{ m.hasStrengthData ? m.predictedAwayScore : '–' }}
            </span>
          </div>

          <!-- Away side -->
          <div
            class="flex flex-1 cursor-pointer items-center justify-start gap-2 rounded px-1 py-0.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            :class="popupTeamId === m.awayTeamId ? 'bg-blue-50 dark:bg-blue-900/10' : ''"
            @click.stop="onRowClick(m.awayTeamId, $event)"
          >
            <svg class="size-6 shrink-0">
              <use :href="`${BASE_URL}icons.svg#${m.awayTeamIconId}`" />
            </svg>
            <span class="hidden text-sm font-medium text-gray-800 dark:text-gray-200 sm:inline">
              {{ m.awayTeamName }}
            </span>
            <span class="text-sm font-medium text-gray-800 dark:text-gray-200 sm:hidden">
              {{ m.awayTeamAbbreviation }}
            </span>
          </div>

          <!-- vs-avg adjustments -->
          <div
            v-if="m.hasStrengthData"
            class="hidden w-40 shrink-0 justify-end gap-3 text-xs md:flex"
          >
            <span
              :class="
                m.homeVsAvg > 0
                  ? 'text-green-600 dark:text-green-400'
                  : m.homeVsAvg < 0
                    ? 'text-red-500 dark:text-red-400'
                    : 'text-gray-400 dark:text-gray-500'
              "
            >
              {{ m.homeVsAvg > 0 ? '+' : '' }}{{ m.homeVsAvg }} vs {{ venueAdjusted ? 'home' : '' }}avg
            </span>
            <span
              :class="
                m.awayVsAvg > 0
                  ? 'text-green-600 dark:text-green-400'
                  : m.awayVsAvg < 0
                    ? 'text-red-500 dark:text-red-400'
                    : 'text-gray-400 dark:text-gray-500'
              "
            >
              {{ m.awayVsAvg > 0 ? '+' : '' }}{{ m.awayVsAvg }} vs {{ venueAdjusted ? 'away' : '' }}avg
            </span>
          </div>
        </div>
      </template>
    </div>

    <!-- Team Strength table card -->
    <div
      v-if="hasEnoughData || isLoading"
      data-tour="score-predictor-strength"
      class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    >
      <div
        class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700"
      >
        <h2 class="text-sm font-bold text-gray-800 dark:text-gray-100">Attack &amp; Defence</h2>
        <div
          class="flex overflow-hidden rounded border border-gray-300 text-xs font-semibold dark:border-gray-600"
        >
          <button
            @click="sortKey = 'attackRank'"
            class="px-3 py-1 transition-colors"
            :class="
              sortKey === 'attackRank'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            "
          >
            Attack
          </button>
          <button
            @click="sortKey = 'defenceRank'"
            class="px-3 py-1 transition-colors"
            :class="
              sortKey === 'defenceRank'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            "
          >
            Defence
          </button>
        </div>
      </div>

      <!-- Loading skeleton -->
      <div v-if="isLoading" class="space-y-px p-2">
        <div
          v-for="n in 18"
          :key="n"
          class="h-9 animate-pulse rounded bg-gray-100 dark:bg-gray-800"
        />
      </div>

      <table v-else class="w-full table-fixed text-sm">
        <thead>
          <tr class="border-b border-gray-100 text-xs text-gray-400 dark:border-gray-800 dark:text-gray-500">
            <th class="w-8 py-2 pl-4 text-left font-medium">#</th>
            <th class="py-2 pl-2 text-left font-medium">Team</th>
            <th class="w-24 py-2 pr-1 text-right font-medium">Avg Score</th>
            <th class="hidden w-20 py-2 pr-1 text-right font-medium sm:table-cell">Atk Rank</th>
            <th class="w-28 py-2 pr-1 text-right font-medium">Avg Conceded</th>
            <th class="w-28 py-2 pr-4 text-right font-medium">Def Adj</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in sortedStrengthRows"
            :key="row.teamId"
            class="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50 dark:border-gray-800/50 dark:hover:bg-gray-800/30"
            :class="popupTeamId === row.teamId ? 'bg-blue-50 dark:bg-blue-900/10' : ''"
            @click="onRowClick(row.teamId, $event)"
          >
            <td class="py-2 pl-4 text-xs text-gray-400 dark:text-gray-500">{{ i + 1 }}</td>
            <td class="py-2 pl-2">
              <div class="flex items-center gap-2">
                <svg class="size-5 shrink-0">
                  <use :href="`${BASE_URL}icons.svg#${row.iconId}`" />
                </svg>
                <span class="hidden font-medium text-gray-800 dark:text-gray-200 sm:inline">
                  {{ row.teamName }}
                </span>
                <span class="font-medium text-gray-800 dark:text-gray-200 sm:hidden">
                  {{ row.abbreviation }}
                </span>
                <span v-if="row.played === 0" class="text-xs text-gray-300 dark:text-gray-600">no data</span>
              </div>
            </td>
            <td class="py-2 pr-1 text-right tabular-nums">
              <span class="font-semibold text-gray-800 dark:text-gray-200">
                {{ row.played > 0 ? row.avgFor.toFixed(1) : '–' }}
              </span>
            </td>
            <td class="hidden py-2 pr-1 text-right tabular-nums sm:table-cell">
              <span :class="rankClass(row.attackRank)">
                {{ row.played > 0 ? row.attackRank : '–' }}
              </span>
            </td>
            <td class="py-2 pr-1 text-right tabular-nums">
              <span class="text-gray-600 dark:text-gray-400">
                {{ row.played > 0 ? row.avgAgainst.toFixed(1) : '–' }}
              </span>
            </td>
            <td class="py-2 pr-4 text-right tabular-nums">
              <span
                v-if="row.played > 0"
                :class="
                  row.defenceAdjustment < 0
                    ? 'font-semibold text-green-600 dark:text-green-400'
                    : row.defenceAdjustment > 0
                      ? 'font-semibold text-red-500 dark:text-red-400'
                      : 'text-gray-400 dark:text-gray-500'
                "
              >
                {{ row.defenceAdjustment > 0 ? '+' : '' }}{{ row.defenceAdjustment.toFixed(1) }}
              </span>
              <span v-else class="text-gray-300 dark:text-gray-600">–</span>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Legend -->
      <div
        v-if="!isLoading"
        class="flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 px-4 py-2 text-xs text-gray-400 dark:border-gray-800 dark:text-gray-500"
      >
        <span>Def Adj = avg pts opponents score above their own average against this team</span>
        <span>Negative = strong defence</span>
      </div>
    </div>

    <!-- Tipping accuracy (retrospective backtest) -->
    <TippingAccuracy
      :round-results="roundResults"
      :tally="tally"
      :loading="tipsLoading"
      :venue-adjusted="venueAdjusted"
    />
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAFLData } from '../composables/useAFLData'
import { useScorePredictor } from '../composables/useScorePredictor'
import type { StrengthSortKey, TeamStrengthRow } from '../composables/useScorePredictor'
import { useTipsBacktest } from '../composables/useTipsBacktest'
import { getActiveSeasonYear } from '../config/seasons'
import TippingAccuracy from '../components/TippingAccuracy.vue'

const BASE_URL = import.meta.env.BASE_URL

const { matches, isLoading } = useAFLData()

const venueAdjusted = ref(false)

const {
  strengthRows,
  hasEnoughData,
  nextRoundName,
  nextRoundPredictions,
  allUpcomingPredictions,
} = useScorePredictor(matches, venueAdjusted)

const { roundResults, tally, loading: tipsLoading } = useTipsBacktest(
  matches,
  getActiveSeasonYear(),
  venueAdjusted,
)

const showAllUpcoming = ref(false)
const sortKey = ref<StrengthSortKey>('attackRank')

const activePredictions = computed(() =>
  showAllUpcoming.value ? allUpcomingPredictions.value : nextRoundPredictions.value,
)

const sortedStrengthRows = computed(() =>
  [...strengthRows.value].sort((a, b) => a[sortKey.value] - b[sortKey.value]),
)

function rankClass(rank: number): string {
  if (rank <= 6) return 'font-bold text-green-600 dark:text-green-400'
  if (rank >= 13) return 'font-bold text-red-500 dark:text-red-400'
  return 'text-gray-600 dark:text-gray-400'
}

// --- Team popup ---

const popupTeamId = ref<number | null>(null)
const popupStyle = ref<Record<string, string>>({})
const popupAnchorEl = ref<HTMLElement | null>(null)

const POPUP_W = 300
const POPUP_H = 440

function closePopup() {
  popupTeamId.value = null
}

onMounted(() => document.addEventListener('click', closePopup))
onUnmounted(() => document.removeEventListener('click', closePopup))

function onRowClick(teamId: number, event: MouseEvent) {
  event.stopPropagation()
  if (popupTeamId.value === teamId) {
    popupTeamId.value = null
    return
  }
  popupTeamId.value = teamId
  popupAnchorEl.value = event.currentTarget as HTMLElement
  positionPopup()
}

function positionPopup() {
  const row = popupAnchorEl.value
  if (!row) return
  const rowRect = row.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  let left = rowRect.left + rowRect.width / 2 - POPUP_W / 2
  left = Math.max(8, Math.min(left, vw - POPUP_W - 8))

  let top = rowRect.bottom + 8
  if (top + POPUP_H > vh - 8) top = rowRect.top - POPUP_H - 8
  top = Math.max(8, Math.min(top, vh - POPUP_H - 8))

  popupStyle.value = { left: `${left}px`, top: `${top}px`, width: `${POPUP_W}px` }
}

const strengthRowMap = computed(() => {
  const map = new Map<number, TeamStrengthRow>()
  for (const r of strengthRows.value) map.set(r.teamId, r)
  return map
})

const popupRow = computed<TeamStrengthRow | null>(() =>
  popupTeamId.value !== null ? (strengthRowMap.value.get(popupTeamId.value) ?? null) : null,
)

const popupMatchBreakdown = computed(() => {
  if (popupTeamId.value === null) return []
  const tid = popupTeamId.value
  return matches.value
    .filter(
      (m) =>
        m.status === 'CONCLUDED' &&
        m.homeScore &&
        m.awayScore &&
        (m.homeTeamId === tid || m.awayTeamId === tid),
    )
    .map((m) => {
      const isHome = m.homeTeamId === tid
      const opponentId = isHome ? m.awayTeamId : m.homeTeamId
      const opponentRow = strengthRowMap.value.get(opponentId)
      const opponentScore = isHome ? m.awayScore!.totalScore : m.homeScore!.totalScore
      const opponentAvgFor = opponentRow?.avgFor ?? 0
      return {
        matchId: m.id,
        roundNumber: m.roundNumber,
        opponentId,
        opponentName: isHome ? m.awayTeamName : m.homeTeamName,
        opponentIconId: opponentRow?.iconId ?? '',
        opponentScore,
        differential: opponentScore - opponentAvgFor,
      }
    })
    .sort((a, b) => a.roundNumber - b.roundNumber)
})
</script>
