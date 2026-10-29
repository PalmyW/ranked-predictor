<template>
  <main class="mx-auto max-w-4xl px-4 py-6">
    <div v-if="error" class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
      Failed to load fixture data: {{ error }}.
    </div>

    <div class="mb-6">
      <h1 class="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">Fixture Analyser</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        How hard each team's {{ seasonYear }} home-and-away fixture is. Diff is the average rank of a
        team's opponents (1 = hardest draw), rated by your team ranking and by the
        {{ previousSeasonYear ?? 'previous' }} final ladder.
      </p>
    </div>

    <div
      v-if="isDefaultRanking"
      class="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
    >
      You haven't ranked the teams yet, so "Your ranking" is just alphabetical.
      <RouterLink to="/" class="font-semibold underline underline-offset-2">Rank them on the Predictor</RouterLink>
      to make it meaningful.
    </div>
    <div
      v-if="untimedRounds"
      class="mb-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400"
    >
      {{ untimedRounds }} don't have confirmed times yet, so breaks involving those games aren't
      counted until the AFL locks them in.
    </div>

    <div v-if="isLoading || loadingPrevious" class="space-y-1">
      <div v-for="n in 18" :key="n" class="h-9 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
    </div>

    <template v-else-if="rows.length">
      <!-- Hardest-fixture ladder -->
      <section class="mb-8">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-base font-bold text-gray-800 dark:text-gray-100">Hardest fixture</h2>
          <div class="flex gap-0.5 rounded-lg bg-gray-100 p-0.5 text-xs dark:bg-gray-800">
            <button
              v-for="opt in SORT_OPTIONS"
              :key="opt.key"
              @click="sortBy = opt.key"
              class="rounded-md px-2.5 py-1 font-semibold transition-colors"
              :class="sortBy === opt.key
                ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
            >{{ opt.key === 'ladder' ? `${previousSeasonYear} ladder` : opt.label }}</button>
          </div>
        </div>

        <table class="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr class="bg-gray-100 text-xs uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              <th class="w-8 py-2 text-center font-semibold">#</th>
              <th class="py-2 pl-2 text-left font-semibold">Team</th>
              <th class="w-24 py-2 text-center font-semibold sm:w-32">Your ranking</th>
              <th class="w-24 py-2 text-center font-semibold sm:w-32">{{ previousSeasonYear }} ladder</th>
              <th class="w-14 py-2 text-center font-semibold" title="How much harder (▲) or easier (▼) your ranking rates the fixture than the ladder does">Gap</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in sortedRows"
              :key="row.teamId"
              class="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
            >
              <td class="py-1.5 text-center text-xs text-gray-500">{{ i + 1 }}</td>
              <td class="py-1.5 pl-2 font-medium text-gray-800 dark:text-gray-200">
                <a :href="`#team-${row.teamId}`" class="flex items-center gap-1.5 hover:underline underline-offset-2">
                  <svg class="size-7 shrink-0"><use :href="`${BASE_URL}icons.svg#${team(row.teamId).iconId}`" /></svg>
                  <span class="truncate">{{ team(row.teamId).name }}</span>
                </a>
              </td>
              <td class="py-1.5 text-center text-xs font-semibold" :class="orderClass(row.rankingOrder)">
                {{ ordinal(row.rankingOrder, rows, 'rankingOrder') }}
                <span class="ml-0.5 hidden font-normal text-gray-400 sm:inline">({{ avg(row.rankingDifficulty) }})</span>
              </td>
              <td class="py-1.5 text-center text-xs font-semibold" :class="orderClass(row.ladderOrder)">
                {{ ordinal(row.ladderOrder, rows, 'ladderOrder') }}
                <span class="ml-0.5 hidden font-normal text-gray-400 sm:inline">({{ avg(row.ladderDifficulty) }})</span>
              </td>
              <td class="py-1.5 text-center text-xs font-bold tabular-nums">
                <template v-if="row.rankingOrder !== null && row.ladderOrder !== null">
                  <span v-if="row.rankingOrder < row.ladderOrder" class="text-red-500">▲{{ row.ladderOrder - row.rankingOrder }}</span>
                  <span v-else-if="row.rankingOrder > row.ladderOrder" class="text-green-600">▼{{ row.rankingOrder - row.ladderOrder }}</span>
                  <span v-else class="text-gray-300 dark:text-gray-600">—</span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="mt-2 text-xs text-gray-400 dark:text-gray-500">
          Bracketed numbers are the average opponent rank. Gap ▲ means your ranking rates the draw harder
          than the {{ previousSeasonYear }} ladder does; ▼ means easier.
        </p>
      </section>

      <!-- Per-team breakdown -->
      <section>
        <h2 class="mb-3 text-base font-bold text-gray-800 dark:text-gray-100">Team breakdown</h2>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div
            v-for="row in sortedRows"
            :id="`team-${row.teamId}`"
            :key="row.teamId"
            class="scroll-mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <div class="mb-3 flex items-center gap-2">
              <svg class="size-8 shrink-0"><use :href="`${BASE_URL}icons.svg#${team(row.teamId).iconId}`" /></svg>
              <h3 class="flex-1 truncate text-sm font-bold text-gray-800 dark:text-gray-100">{{ team(row.teamId).name }}</h3>
              <span class="text-xs text-gray-400 dark:text-gray-500">
                <span class="font-semibold" :class="orderClass(row.rankingOrder)">{{ ordinal(row.rankingOrder, rows, 'rankingOrder') }}</span>
                /
                <span class="font-semibold" :class="orderClass(row.ladderOrder)">{{ ordinal(row.ladderOrder, rows, 'ladderOrder') }}</span>
                hardest
              </span>
            </div>

            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Double-ups</p>
            <ul v-if="row.doubleUps.length" class="mb-3 space-y-1">
              <li v-for="d in row.doubleUps" :key="d.opponentId" class="flex items-center gap-2 text-xs">
                <svg class="size-5 shrink-0"><use :href="`${BASE_URL}icons.svg#${team(d.opponentId).iconId}`" /></svg>
                <span class="w-12 shrink-0 font-semibold text-gray-700 dark:text-gray-200">{{ team(d.opponentId).abbreviation }}</span>
                <span class="flex-1 text-gray-500 dark:text-gray-400">
                  <span v-for="(mt, mi) in d.meetings" :key="mt.matchId">
                    {{ mi > 0 ? ' · ' : '' }}Rd {{ mt.roundNumber }}
                    <span :class="mt.isHome ? 'text-blue-600 dark:text-blue-400' : ''">{{ mt.isHome ? 'H' : 'A' }}</span>
                  </span>
                </span>
                <span class="shrink-0 text-gray-400 dark:text-gray-500" :title="`Your ranking / ${previousSeasonYear} ladder`">
                  #{{ rankingMap[d.opponentId] ?? '—' }} / {{ ladderMap[d.opponentId] ? ordinalNumber(ladderMap[d.opponentId]) : '—' }}
                </span>
              </li>
            </ul>
            <p v-else class="mb-3 text-xs text-gray-400 dark:text-gray-500">None</p>

            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Breaks between games</p>
            <div class="grid grid-cols-7 gap-1 text-center text-xs">
              <div v-for="d in BREAK_DAYS" :key="d" class="rounded bg-gray-50 py-1 dark:bg-gray-800/60">
                <div class="text-[10px] text-gray-400 dark:text-gray-500">{{ d }}d</div>
                <div class="font-bold tabular-nums" :class="breakClass(d, row.breaks[d] ?? 0)">{{ row.breaks[d] ?? 0 }}</div>
              </div>
              <div class="rounded bg-gray-50 py-1 dark:bg-gray-800/60" :title="otherBreaksTitle(row)">
                <div class="text-[10px] text-gray-400 dark:text-gray-500">Other</div>
                <div class="font-bold tabular-nums text-gray-500 dark:text-gray-400">{{ otherBreaks(row) }}</div>
              </div>
            </div>
            <p v-if="otherBreaksTitle(row) || row.pendingBreaks" class="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
              <span v-if="otherBreaksTitle(row)">Other: {{ otherBreaksTitle(row) }}. </span>
              <span v-if="row.pendingBreaks">{{ row.pendingBreaks }} still to be timed.</span>
            </p>
          </div>
        </div>
      </section>
    </template>

    <p v-else class="py-8 text-center text-sm text-gray-400 dark:text-gray-600">No fixture available for {{ seasonYear }}.</p>
  </main>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAFLData, fetchSeasonMatches, teamById } from '../composables/useAFLData'
import { useRanking } from '../composables/useRanking'
import { analyseFixture, finalLadderPositions, BREAK_DAYS, type FixtureTeamAnalysis } from '../composables/useFixtureAnalysis'
import { isFinalsMatch } from '../composables/useFinals'
import { getActiveSeasonYear, previousSeasonKey } from '../config/seasons'
import type { AflMatch, AflTeam } from '../types/afl'

const BASE_URL = import.meta.env.BASE_URL

const { matches, teams, isLoading, error } = useAFLData()
const { ranking } = useRanking()

const seasonYear = getActiveSeasonYear()
const previousSeasonYear = previousSeasonKey(seasonYear)

const previousMatches = ref<AflMatch[]>([])
const loadingPrevious = ref(!!previousSeasonYear)
if (previousSeasonYear) {
  fetchSeasonMatches(previousSeasonYear)
    .then((m) => { previousMatches.value = m })
    .finally(() => { loadingPrevious.value = false })
}

const rankingMap = computed<Record<number, number>>(() =>
  Object.fromEntries(ranking.value.map((id, i) => [id, i + 1])),
)
const ladderMap = computed(() => finalLadderPositions(previousMatches.value))

// useRanking falls back to the alphabetical TEAMS order when nothing is saved.
const isDefaultRanking = computed(() => ranking.value.every((id, i) => id === teams[i]?.id))

const rows = computed(() => analyseFixture(matches.value, rankingMap.value, ladderMap.value))

type SortKey = 'ranking' | 'ladder'
const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'ranking', label: 'Your ranking' },
  { key: 'ladder', label: 'Ladder' },
]
const sortBy = ref<SortKey>('ranking')
const sortedRows = computed(() => {
  const key = sortBy.value === 'ranking' ? 'rankingOrder' : 'ladderOrder'
  return [...rows.value].sort((a, b) => (a[key] ?? 99) - (b[key] ?? 99))
})

// e.g. "Rounds 17–24", from the home-and-away matches whose times are still dummies.
const untimedRounds = computed(() => {
  const rounds = matches.value
    .filter((m) => m.status === 'PLACEHOLDER' && !isFinalsMatch(m))
    .map((m) => m.roundNumber)
  if (!rounds.length) return null
  const lo = Math.min(...rounds)
  const hi = Math.max(...rounds)
  return lo === hi ? `Round ${lo}` : `Rounds ${lo}–${hi}`
})

const FALLBACK_TEAM: AflTeam = { id: 0, name: 'Unknown', abbreviation: '???', letter: '', iconId: '', teamProviderId: '' }
function team(id: number): AflTeam {
  return teamById(id) ?? FALLBACK_TEAM
}

function ordinalNumber(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

// Tied places are shown as "=6th".
function ordinal(
  order: number | null,
  all: readonly FixtureTeamAnalysis[],
  key: 'rankingOrder' | 'ladderOrder',
): string {
  if (order === null) return '—'
  const tied = all.filter((r) => r[key] === order).length > 1
  return `${tied ? '=' : ''}${ordinalNumber(order)}`
}

function avg(v: number | null): string {
  return v === null ? '—' : v.toFixed(2)
}

// Same bands as the ladder's Diff column.
function orderClass(order: number | null): string {
  if (order === null) return 'text-gray-300'
  if (order <= 5) return 'text-red-600'
  if (order <= 9) return 'text-orange-500'
  if (order <= 13) return 'text-gray-500'
  return 'text-green-600'
}

function breakClass(days: number, count: number): string {
  if (count === 0) return 'text-gray-300 dark:text-gray-600'
  if (days === 5) return 'text-red-600'
  if (days === 6) return 'text-orange-500'
  return 'text-gray-700 dark:text-gray-200'
}

function otherBreakEntries(row: FixtureTeamAnalysis): Array<[number, number]> {
  return Object.entries(row.breaks)
    .map(([d, c]): [number, number] => [Number(d), c])
    .filter(([d]) => !BREAK_DAYS.includes(d))
    .sort((a, b) => a[0] - b[0])
}

function otherBreaks(row: FixtureTeamAnalysis): number {
  return otherBreakEntries(row).reduce((n, [, c]) => n + c, 0)
}

function otherBreaksTitle(row: FixtureTeamAnalysis): string {
  return otherBreakEntries(row)
    .map(([d, c]) => `${d}d${c > 1 ? ` ×${c}` : ''}`)
    .join(', ')
}
</script>
