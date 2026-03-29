<template>
  <div
    class="flex items-center px-3 py-2 text-sm"
    :class="[
      index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50',
      match.status === 'LIVE' ? 'border-l-2 border-blue-400' : '',
    ]"
  >
    <!-- Status dot -->
    <span class="shrink-0 mr-2">
      <span
        class="inline-block size-2 rounded-full"
        :class="{
          'bg-green-500': match.status === 'CONCLUDED',
          'bg-blue-400 animate-pulse': match.status === 'LIVE',
          'bg-gray-300': match.status !== 'CONCLUDED' && match.status !== 'LIVE',
        }"
      />
    </span>

    <!-- Concluded: show scores -->
    <template v-if="match.status === 'CONCLUDED' && match.homeScore && match.awayScore">
      <span
        class="flex-1 min-w-0 truncate"
        :class="match.homeScore.totalScore > match.awayScore.totalScore ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-500'"
      >{{ match.homeTeamName }}</span>
      <span class="shrink-0 mx-2 text-xs font-mono tabular-nums text-gray-700 dark:text-gray-300 font-semibold">
        {{ match.homeScore.goals }}.{{ match.homeScore.behinds }}
        <span class="text-gray-900 dark:text-gray-100">({{ match.homeScore.totalScore }})</span>
      </span>
      <span class="shrink-0 text-gray-400 dark:text-gray-600 mx-1">—</span>
      <span class="shrink-0 mx-2 text-xs font-mono tabular-nums text-gray-700 dark:text-gray-300 font-semibold">
        {{ match.awayScore.goals }}.{{ match.awayScore.behinds }}
        <span class="text-gray-900 dark:text-gray-100">({{ match.awayScore.totalScore }})</span>
      </span>
      <span
        class="flex-1 min-w-0 truncate text-right"
        :class="match.awayScore.totalScore > match.homeScore.totalScore ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-500'"
      >{{ match.awayTeamName }}</span>
    </template>

    <!-- Live -->
    <template v-else-if="match.status === 'LIVE'">
      <span class="flex-1 truncate text-blue-700 dark:text-blue-400 font-medium">{{ match.homeTeamName }}</span>
      <span class="shrink-0 mx-2 text-xs text-blue-500 dark:text-blue-400 font-semibold">LIVE</span>
      <span class="flex-1 truncate text-right text-blue-700 dark:text-blue-400 font-medium">{{ match.awayTeamName }}</span>
    </template>

    <!-- Future: predicted + simulated winners -->
    <template v-else>
      <span class="flex-1 min-w-0 flex items-center gap-1 truncate">
        <span :class="predictedWinnerId === match.homeTeamId ? 'font-bold text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-600'">
          {{ match.homeTeamName }}
        </span>
        <span
          v-if="simulatedMatchWinners && simulatedMatchWinners[match.id] === match.homeTeamId"
          class="shrink-0 px-1 rounded text-white bg-purple-500 font-bold leading-tight cursor-default"
          style="font-size:10px"
          title="Simulated winner"
        >S</span>
      </span>
      <span class="shrink-0 mx-2 text-xs text-gray-400 dark:text-gray-600">vs</span>
      <span class="flex-1 min-w-0 flex items-center justify-end gap-1 truncate">
        <span
          v-if="simulatedMatchWinners && simulatedMatchWinners[match.id] === match.awayTeamId"
          class="shrink-0 px-1 rounded text-white bg-purple-500 font-bold leading-tight cursor-default"
          style="font-size:10px"
          title="Simulated winner"
        >S</span>
        <span :class="predictedWinnerId === match.awayTeamId ? 'font-bold text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-600'">
          {{ match.awayTeamName }}
        </span>
      </span>
    </template>

    <!-- Date -->
    <span v-if="match.status !== 'CONCLUDED'" class="shrink-0 ml-2 text-xs text-gray-400 dark:text-gray-600 hidden sm:block">
      {{ formattedDate }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AflMatch } from '../types/afl'

const props = defineProps<{
  match: AflMatch
  index: number
  rankMap: Record<number, number>
  simulatedMatchWinners: Record<number, number> | null
}>()

const predictedWinnerId = computed<number | null>(() => {
  const hRank = props.rankMap[props.match.homeTeamId] ?? 999
  const aRank = props.rankMap[props.match.awayTeamId] ?? 999
  if (hRank === aRank) return null
  return hRank < aRank ? props.match.homeTeamId : props.match.awayTeamId
})

const formattedDate = computed(() => {
  try {
    return new Date(props.match.utcStartTime).toLocaleDateString('en-AU', {
      weekday: 'short', month: 'short', day: 'numeric',
      timeZone: 'Australia/Melbourne',
    })
  } catch {
    return ''
  }
})
</script>
