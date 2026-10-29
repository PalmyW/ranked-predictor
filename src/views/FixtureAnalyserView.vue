<template>
  <main class="mx-auto max-w-4xl px-4 py-6">
    <div v-if="error" class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
      Failed to load fixture data: {{ error }}.
    </div>

    <div class="mb-6">
      <h1 class="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">Fixture Analyser</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        How hard each team's {{ seasonYear }} home-and-away fixture is, from the average strength of
        its opponents (1st = hardest draw) — rated by the {{ previousSeasonYear ?? 'previous' }} final
        ladder, {{ previousSeasonYear ?? 'previous' }} percentages, or your team ranking.
      </p>
    </div>

    <div
      v-if="isDefaultRanking && basis === 'ranking'"
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
      <section data-tour="fixture-table" class="mb-8">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-base font-bold text-gray-800 dark:text-gray-100">Hardest fixture</h2>
          <div class="flex gap-0.5 rounded-lg bg-gray-100 p-0.5 text-xs dark:bg-gray-800">
            <button
              v-for="key in BASIS_KEYS"
              :key="key"
              @click="basis = key"
              class="rounded-md px-2.5 py-1 font-semibold transition-colors"
              :class="basis === key
                ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
            >{{ BASES[key].label }}</button>
          </div>
        </div>

        <table class="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr class="bg-gray-100 text-xs uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              <th class="w-8 py-2 text-center font-semibold">#</th>
              <th class="py-2 pl-2 text-left font-semibold">Team</th>
              <th
                v-for="col in SORT_COLUMNS"
                :key="col.key"
                class="py-2 text-center font-semibold"
                :class="col.key === 'difficulty' ? 'w-28 sm:w-32' : 'w-20'"
                :aria-sort="sortColumn === col.key ? (sortDesc ? 'descending' : 'ascending') : 'none'"
              >
                <button
                  @click="sortOn(col.key)"
                  class="inline-flex items-center gap-0.5 uppercase tracking-wide hover:text-gray-800 dark:hover:text-gray-200"
                  :class="sortColumn === col.key ? 'text-gray-800 dark:text-gray-100' : ''"
                  :title="col.key === 'difficulty'
                    ? 'Fixture difficulty — 1st is the hardest draw'
                    : `Each team's ${active.positionName}`"
                >
                  {{ col.label }}
                  <span class="w-2 text-[9px]">{{ sortColumn === col.key ? (sortDesc ? '▼' : '▲') : '' }}</span>
                </button>
              </th>
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
              <td class="py-1.5 text-center text-xs text-gray-600 dark:text-gray-400">{{ position(row.teamId) }}</td>
              <td class="py-1.5 text-center text-xs font-semibold" :class="orderClass(row[orderKey])">
                {{ ordinal(row[orderKey], rows, orderKey) }}
                <span class="ml-0.5 hidden font-normal text-gray-400 sm:inline">({{ avg(row[difficultyKey]) }})</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p class="mt-2 text-xs text-gray-400 dark:text-gray-500">
          Position is each team's {{ active.positionName }}.
          Difficulty ranks the draws (1st = hardest); the bracketed number is the opponents' average
          {{ active.averageName }}. Click a heading to sort.
        </p>
      </section>

      <!-- Per-team breakdown -->
      <section>
        <h2 class="mb-3 text-base font-bold text-gray-800 dark:text-gray-100">Team breakdown</h2>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div
            v-for="(row, i) in sortedRows"
            :id="`team-${row.teamId}`"
            :key="row.teamId"
            :data-tour="i === 0 ? 'fixture-team-card' : undefined"
            class="scroll-mt-20 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <div class="mb-3 flex items-center gap-2">
              <svg class="size-8 shrink-0"><use :href="`${BASE_URL}icons.svg#${team(row.teamId).iconId}`" /></svg>
              <h3 class="flex-1 truncate text-sm font-bold text-gray-800 dark:text-gray-100">{{ team(row.teamId).name }}</h3>
              <span class="text-right text-xs text-gray-400 dark:text-gray-500">
                <span class="font-semibold" :class="orderClass(row[orderKey])">{{ ordinal(row[orderKey], rows, orderKey) }}</span>
                hardest
                <span class="block text-[11px]">{{ standingLine(row.teamId) }}</span>
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
                <span class="shrink-0 font-semibold text-gray-500 dark:text-gray-400" :title="`${team(d.opponentId).abbreviation}'s ${active.positionName}`">
                  {{ position(d.opponentId) }}
                </span>
              </li>
            </ul>
            <p v-else class="mb-3 text-xs text-gray-400 dark:text-gray-500">None</p>

            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Game days</p>
            <div class="grid grid-cols-5 gap-1 text-center text-xs">
              <div v-for="d in GAME_DAYS" :key="d" class="rounded bg-gray-50 py-1 dark:bg-gray-800/60">
                <div class="text-[10px] text-gray-400 dark:text-gray-500">{{ d }}</div>
                <div class="font-bold tabular-nums" :class="(row.gameDays[d] ?? 0) ? 'text-gray-700 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'">{{ row.gameDays[d] ?? 0 }}</div>
              </div>
              <div class="rounded bg-gray-50 py-1 dark:bg-gray-800/60" :title="otherDaysTitle(row)">
                <div class="text-[10px] text-gray-400 dark:text-gray-500">Other</div>
                <div class="font-bold tabular-nums text-gray-500 dark:text-gray-400">{{ otherDays(row) }}</div>
              </div>
            </div>
            <p class="mb-3 mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
              {{ row.standaloneFridayNights }} stand-alone Friday night {{ row.standaloneFridayNights === 1 ? 'match' : 'matches' }}.
              <span v-if="otherDaysTitle(row)">Other: {{ otherDaysTitle(row) }}. </span>
              <span v-if="row.untimedGames">{{ row.untimedGames }} still to be timed.</span>
            </p>

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
            <template v-if="row.shortBreaks.length">
              <p class="mb-1 mt-2 text-[11px] text-gray-400 dark:text-gray-500">Short breaks, and the opponent's break into the same game:</p>
              <ul class="space-y-1">
                <li v-for="b in row.shortBreaks" :key="b.matchId" class="flex items-center gap-2 text-xs">
                  <span class="w-6 shrink-0 font-bold tabular-nums" :class="breakClass(b.days, 1)">{{ b.days }}d</span>
                  <span class="w-11 shrink-0 text-gray-500 dark:text-gray-400">Rd {{ b.roundNumber }}</span>
                  <svg class="size-5 shrink-0"><use :href="`${BASE_URL}icons.svg#${team(b.opponentId).iconId}`" /></svg>
                  <span class="w-12 shrink-0 font-semibold text-gray-700 dark:text-gray-200">{{ team(b.opponentId).abbreviation }}</span>
                  <span class="flex-1" :class="b.isHome ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'">{{ b.isHome ? 'H' : 'A' }}</span>
                  <span class="shrink-0 tabular-nums" :class="restGapClass(b.days, b.opponentDays)" :title="opponentBreakTitle(b)">
                    {{ b.opponentDays === null ? 'first game' : `on ${b.opponentDays}d` }}
                  </span>
                </li>
              </ul>
            </template>
            <p v-if="otherBreaksTitle(row) || row.pendingBreaks" class="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
              <span v-if="otherBreaksTitle(row)">Other: {{ otherBreaksTitle(row) }}. </span>
              <span v-if="row.pendingBreaks">{{ row.pendingBreaks }} still to be timed.</span>
            </p>

            <p class="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Opponents coming off a bye</p>
            <ul v-if="row.opponentsOffBye.length" class="space-y-1">
              <li v-for="o in row.opponentsOffBye" :key="o.matchId" class="flex items-center gap-2 text-xs">
                <span class="w-11 shrink-0 text-gray-500 dark:text-gray-400">Rd {{ o.roundNumber }}</span>
                <svg class="size-5 shrink-0"><use :href="`${BASE_URL}icons.svg#${team(o.opponentId).iconId}`" /></svg>
                <span class="w-12 shrink-0 font-semibold text-gray-700 dark:text-gray-200">{{ team(o.opponentId).abbreviation }}</span>
                <span class="flex-1" :class="o.isHome ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'">{{ o.isHome ? 'H' : 'A' }}</span>
                <span v-if="o.opponentDays === null" class="shrink-0 text-gray-400 dark:text-gray-500">time TBC</span>
                <span v-else class="shrink-0 tabular-nums">
                  <span :class="restGapClass(o.days, o.opponentDays)">they're on {{ o.opponentDays }}d</span>
                  <span v-if="o.days !== null" class="text-gray-400 dark:text-gray-500"> · you {{ o.days }}d</span>
                </span>
              </li>
            </ul>
            <p v-else class="text-xs text-gray-400 dark:text-gray-500">None</p>
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
import { analyseFixture, finalLadderPositions, finalPercentages, BREAK_DAYS, GAME_DAYS, type FixtureTeamAnalysis, type ShortBreak } from '../composables/useFixtureAnalysis'
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
const percentageMap = computed(() => finalPercentages(previousMatches.value))

// useRanking falls back to the alphabetical TEAMS order when nothing is saved.
const isDefaultRanking = computed(() => ranking.value.every((id, i) => id === teams[i]?.id))

const rows = computed(() =>
  analyseFixture(matches.value, rankingMap.value, ladderMap.value, percentageMap.value),
)

// Each view shows only its own basis — e.g. the ladder view has no ranking data.
type Basis = 'ladder' | 'percentage' | 'ranking'
type OrderKey = 'ladderOrder' | 'percentageOrder' | 'rankingOrder'
const BASES: Record<Basis, {
  label: string
  orderKey: OrderKey
  difficultyKey: 'ladderDifficulty' | 'percentageDifficulty' | 'rankingDifficulty'
  // What the Position column (and double-up labels) show.
  positionName: string
  // What the bracketed average in the Difficulty column is an average of.
  averageName: string
}> = {
  ladder: {
    label: `${previousSeasonYear} ladder`,
    orderKey: 'ladderOrder',
    difficultyKey: 'ladderDifficulty',
    positionName: `${previousSeasonYear} ladder finish`,
    averageName: 'ladder position',
  },
  percentage: {
    label: `${previousSeasonYear} %`,
    orderKey: 'percentageOrder',
    difficultyKey: 'percentageDifficulty',
    positionName: `${previousSeasonYear} percentage`,
    averageName: 'percentage',
  },
  ranking: {
    label: 'Your ranking',
    orderKey: 'rankingOrder',
    difficultyKey: 'rankingDifficulty',
    positionName: 'place in your team ranking',
    averageName: 'ranking',
  },
}
const BASIS_KEYS: Basis[] = ['ladder', 'percentage', 'ranking']
const basis = ref<Basis>('ladder')
const active = computed(() => BASES[basis.value])
const orderKey = computed(() => active.value.orderKey)
const difficultyKey = computed(() => active.value.difficultyKey)

// Table (and breakdown) order: click a column header to sort by it, again to reverse.
type SortColumn = 'difficulty' | 'position'
const SORT_COLUMNS: Array<{ key: SortColumn; label: string }> = [
  { key: 'position', label: 'Position' },
  { key: 'difficulty', label: 'Difficulty' },
]
const sortColumn = ref<SortColumn>('difficulty')
const sortDesc = ref(false)
function sortOn(column: SortColumn) {
  if (sortColumn.value === column) sortDesc.value = !sortDesc.value
  else {
    sortColumn.value = column
    sortDesc.value = false
  }
}
const sortedRows = computed(() => {
  const value = (r: FixtureTeamAnalysis) =>
    sortColumn.value === 'difficulty' ? (r[orderKey.value] ?? 99) : positionSortValue(r.teamId)
  const dir = sortDesc.value ? -1 : 1
  return [...rows.value].sort((a, b) => dir * (value(a) - value(b)))
})

// A team's own standing under the active basis: its ladder finish, its
// percentage, or your ranking.
function positionOf(teamId: number): number | null {
  const map = basis.value === 'ladder' ? ladderMap.value : basis.value === 'percentage' ? percentageMap.value : rankingMap.value
  return map[teamId] ?? null
}
// Ascending sort puts the best team first: 1st on the ladder, or the highest percentage.
function positionSortValue(teamId: number): number {
  const p = positionOf(teamId)
  if (p === null) return Infinity
  return basis.value === 'percentage' ? -p : p
}
function position(teamId: number): string {
  const p = positionOf(teamId)
  if (p === null) return '—'
  return basis.value === 'percentage' ? `${p.toFixed(1)}%` : ordinalNumber(p)
}

// The card's line under "Nth hardest".
function standingLine(teamId: number): string {
  if (basis.value === 'ladder') return `Finished ${position(teamId)} in ${previousSeasonYear}`
  if (basis.value === 'percentage') return `${position(teamId)} in ${previousSeasonYear}`
  return `You ranked them ${position(teamId)}`
}

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
  key: OrderKey,
): string {
  if (order === null) return '—'
  const tied = all.filter((r) => r[key] === order).length > 1
  return `${tied ? '=' : ''}${ordinalNumber(order)}`
}

function avg(v: number | null): string {
  if (v === null) return '—'
  return basis.value === 'percentage' ? `${v.toFixed(1)}%` : v.toFixed(2)
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

// Colours the opponent's break: red when they're better rested than the
// team, green when worse.
function restGapClass(days: number | null, opponentDays: number | null): string {
  if (days === null || opponentDays === null || opponentDays === days) return 'text-gray-500 dark:text-gray-400'
  return opponentDays > days ? 'font-semibold text-red-600' : 'font-semibold text-green-600'
}

function opponentBreakTitle(b: ShortBreak): string {
  const abbr = team(b.opponentId).abbreviation
  if (b.opponentDays === null) return `This is ${abbr}'s first game of the season`
  const diff = b.opponentDays - b.days
  if (diff === 0) return `${abbr} also had ${b.days} days`
  return `${abbr} had ${b.opponentDays} days — ${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'day' : 'days'} ${diff > 0 ? 'more' : 'less'}`
}

// Games on days outside GAME_DAYS, e.g. a Wednesday opener or holiday Monday.
function otherDayEntries(row: FixtureTeamAnalysis): Array<[string, number]> {
  return Object.entries(row.gameDays).filter(([d]) => !GAME_DAYS.includes(d))
}

function otherDays(row: FixtureTeamAnalysis): number {
  return otherDayEntries(row).reduce((n, [, c]) => n + c, 0)
}

function otherDaysTitle(row: FixtureTeamAnalysis): string {
  return otherDayEntries(row)
    .map(([d, c]) => `${d}${c > 1 ? ` ×${c}` : ''}`)
    .join(', ')
}
</script>
