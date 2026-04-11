<template>
  <HtmlTooltip placement="above">
    <template #trigger="{ toggle }">
      <button
        @click.stop="toggle"
        class="max-w-full cursor-pointer truncate text-left underline-offset-2 hover:underline"
      >
        {{ label ?? teamName }}
      </button>
    </template>
    <template #content>
      <div class="min-w-[200px] space-y-2.5 p-3">
        <p class="text-xs font-semibold text-gray-800 dark:text-gray-100">
          {{ teamName }}
        </p>
        <div v-if="lastSixResults.length" class="flex gap-1">
          <span
            v-for="(r, i) in lastSixResults"
            :key="i"
            class="flex size-5 cursor-default items-center justify-center rounded text-[10px] font-bold"
            :class="
              r.result === 'W'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                : r.result === 'L'
                  ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
                  : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
            "
            :title="r.tooltip"
            >{{ r.result }}</span
          >
        </div>

        <!-- Double-up opponents -->
        <div v-if="doubleOpponents.length">
          <p class="mb-1 text-xs text-gray-500 dark:text-gray-400">
            Still to play twice vs:
          </p>
          <div
            v-for="opp in doubleOpponents"
            :key="opp"
            class="text-xs text-gray-700 dark:text-gray-200"
          >
            · {{ opp }}
          </div>
        </div>
        <div v-else>
          <p class="text-xs italic text-gray-400 dark:text-gray-500">
            No double-up opponents
          </p>
        </div>

        <!-- Home / Away difficulty (remaining) -->
        <div
          class="space-y-1.5 border-t border-gray-100 pt-2 text-xs dark:border-gray-700"
        >
          <p class="text-gray-500 dark:text-gray-400">Remaining</p>
          <div class="flex items-center gap-2">
            <span
              class="w-4 shrink-0 rounded bg-blue-100 px-0.5 text-center text-xs font-bold text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
              >H</span
            >
            <span class="text-gray-700 dark:text-gray-200">
              {{ homeMatches.length }} games
              <span class="text-gray-400 dark:text-gray-500"
                >· avg opp. rank
              </span>
              <span class="font-semibold">{{
                homeAvgRank !== null ? homeAvgRank.toFixed(1) : '—'
              }}</span>
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span
              class="w-4 shrink-0 rounded bg-gray-100 px-0.5 text-center text-xs font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              >A</span
            >
            <span class="text-gray-700 dark:text-gray-200">
              {{ awayMatches.length }} games
              <span class="text-gray-400 dark:text-gray-500"
                >· avg opp. rank
              </span>
              <span class="font-semibold">{{
                awayAvgRank !== null ? awayAvgRank.toFixed(1) : '—'
              }}</span>
            </span>
          </div>
        </div>

        <!-- Played difficulty -->
        <div
          v-if="concludedMatches.length"
          class="border-t border-gray-100 pt-2 text-xs dark:border-gray-700"
        >
          <div class="flex items-center gap-2">
            <span
              class="w-4 shrink-0 rounded bg-green-100 px-0.5 text-center text-xs font-bold text-green-700 dark:bg-green-900/40 dark:text-green-400"
              >✓</span
            >
            <span class="text-gray-700 dark:text-gray-200">
              {{ concludedMatches.length }} played
              <span class="text-gray-400 dark:text-gray-500"
                >· avg opp. rank
              </span>
              <span class="font-semibold">{{
                playedAvgRank !== null ? playedAvgRank.toFixed(1) : '—'
              }}</span>
            </span>
          </div>
        </div>
      </div>
    </template>
  </HtmlTooltip>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { Ref } from 'vue'
import type { AflMatch, TeamRanking } from '../types/afl'
import HtmlTooltip from './HtmlTooltip.vue'

const props = defineProps<{
  teamId: number
  teamName: string
  label?: string // optional display text for the trigger; defaults to teamName
}>()

const matches = inject<Ref<readonly AflMatch[]>>('matches')!
const ranking = inject<Ref<TeamRanking>>('ranking')!

const rankMap = computed<Record<number, number>>(() => {
  const map: Record<number, number> = {}
  ranking.value.forEach((id, i) => {
    map[id] = i + 1
  })
  return map
})

const teamMatches = computed(() =>
  matches.value.filter(
    (m) =>
      (m.homeTeamId === props.teamId || m.awayTeamId === props.teamId) &&
      m.status !== 'CONCLUDED',
  ),
)

const homeMatches = computed(() =>
  teamMatches.value.filter((m) => m.homeTeamId === props.teamId),
)

const awayMatches = computed(() =>
  teamMatches.value.filter((m) => m.awayTeamId === props.teamId),
)

const doubleOpponents = computed<string[]>(() => {
  const counts: Record<number, { count: number; name: string }> = {}
  for (const m of teamMatches.value) {
    const oppId = m.homeTeamId === props.teamId ? m.awayTeamId : m.homeTeamId
    const oppName =
      m.homeTeamId === props.teamId ? m.awayTeamName : m.homeTeamName
    if (!counts[oppId]) counts[oppId] = { count: 0, name: oppName }
    counts[oppId].count++
  }
  return Object.values(counts)
    .filter((o) => o.count >= 2)
    .map((o) => o.name)
    .sort()
})

const homeAvgRank = computed<number | null>(() => {
  if (!homeMatches.value.length) return null
  const sum = homeMatches.value.reduce(
    (acc, m) => acc + (rankMap.value[m.awayTeamId] ?? 0),
    0,
  )
  return sum / homeMatches.value.length
})

const awayAvgRank = computed<number | null>(() => {
  if (!awayMatches.value.length) return null
  const sum = awayMatches.value.reduce(
    (acc, m) => acc + (rankMap.value[m.homeTeamId] ?? 0),
    0,
  )
  return sum / awayMatches.value.length
})

const concludedMatches = computed(() =>
  matches.value.filter(
    (m) =>
      (m.homeTeamId === props.teamId || m.awayTeamId === props.teamId) &&
      m.status === 'CONCLUDED',
  ),
)

const lastSixResults = computed<{ result: 'W' | 'L' | 'D'; tooltip: string }[]>(() => {
  const sorted = [...concludedMatches.value].sort(
    (a, b) =>
      new Date(a.utcStartTime).getTime() - new Date(b.utcStartTime).getTime(),
  )
  return sorted.slice(-6).map((m) => {
    const isHome = m.homeTeamId === props.teamId
    const oppName = isHome ? m.awayTeamName : m.homeTeamName
    const teamScore = isHome ? m.homeScore?.totalScore : m.awayScore?.totalScore
    const oppScore = isHome ? m.awayScore?.totalScore : m.homeScore?.totalScore
    let result: 'W' | 'L' | 'D' = 'D'
    if (teamScore != null && oppScore != null) {
      if (teamScore > oppScore) result = 'W'
      else if (teamScore < oppScore) result = 'L'
    }
    const margin =
      teamScore != null && oppScore != null
        ? `by ${Math.abs(teamScore - oppScore)}`
        : '—'
    const tooltip = `vs ${oppName} (${result === 'W' ? 'won' : result === 'L' ? 'lost' : 'drew'} ${margin})`
    return { result, tooltip }
  })
})

const playedAvgRank = computed<number | null>(() => {
  if (!concludedMatches.value.length) return null
  const sum = concludedMatches.value.reduce((acc, m) => {
    const oppId = m.homeTeamId === props.teamId ? m.awayTeamId : m.homeTeamId
    return acc + (rankMap.value[oppId] ?? 0)
  }, 0)
  return sum / concludedMatches.value.length
})
</script>
