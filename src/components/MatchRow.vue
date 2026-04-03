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
        class="flex-1 min-w-0 flex items-center gap-1.5 truncate"
        :class="match.homeScore.totalScore > match.awayScore.totalScore ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-500'"
      >
        <svg v-if="homeIconId" class="size-5 shrink-0"><use :href="`/ranked-predictor/icons.svg#${homeIconId}`" /></svg>
        <span class="truncate">{{ match.homeTeamName }}</span>
      </span>
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
        class="flex-1 min-w-0 flex items-center justify-end gap-1.5 truncate"
        :class="match.awayScore.totalScore > match.homeScore.totalScore ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-500'"
      >
        <span class="truncate">{{ match.awayTeamName }}</span>
        <svg v-if="awayIconId" class="size-5 shrink-0"><use :href="`/ranked-predictor/icons.svg#${awayIconId}`" /></svg>
      </span>
    </template>

    <!-- Live -->
    <template v-else-if="match.status === 'LIVE'">
      <span class="flex-1 flex items-center gap-1.5 truncate text-blue-700 dark:text-blue-400 font-medium">
        <svg v-if="homeIconId" class="size-5 shrink-0"><use :href="`/ranked-predictor/icons.svg#${homeIconId}`" /></svg>
        <span class="truncate">{{ match.homeTeamName }}</span>
      </span>
      <span class="shrink-0 mx-2 text-xs text-blue-500 dark:text-blue-400 font-semibold">LIVE</span>
      <span class="flex-1 flex items-center justify-end gap-1.5 truncate text-blue-700 dark:text-blue-400 font-medium">
        <span class="truncate">{{ match.awayTeamName }}</span>
        <svg v-if="awayIconId" class="size-5 shrink-0"><use :href="`/ranked-predictor/icons.svg#${awayIconId}`" /></svg>
      </span>
    </template>

    <!-- Future: predicted + simulated winners -->
    <template v-else>
      <span class="flex-1 min-w-0 flex items-center gap-1 truncate">
        <svg v-if="homeIconId" class="size-5 shrink-0" :class="predictedWinnerId === match.homeTeamId ? 'opacity-100' : 'opacity-30'"><use :href="`/ranked-predictor/icons.svg#${homeIconId}`" /></svg>
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
        <svg v-if="awayIconId" class="size-5 shrink-0" :class="predictedWinnerId === match.awayTeamId ? 'opacity-100' : 'opacity-30'"><use :href="`/ranked-predictor/icons.svg#${awayIconId}`" /></svg>
      </span>
    </template>

    <!-- Date -->
    <span
      v-if="match.status !== 'CONCLUDED' && match.status !== 'LIVE' && countdown"
      class="shrink-0 ml-2 text-xs text-gray-400 dark:text-gray-600 hidden sm:block cursor-default"
      :title="fullTimestamp"
    >
      {{ countdown }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { AflMatch } from '../types/afl'
import { TEAMS } from '../composables/useAFLData'

const props = defineProps<{
  match: AflMatch
  index: number
  rankMap: Record<number, number>
  simulatedMatchWinners: Record<number, number> | null
}>()

const homeIconId = computed(() => TEAMS.find(t => t.id === props.match.homeTeamId)?.iconId ?? null)
const awayIconId = computed(() => TEAMS.find(t => t.id === props.match.awayTeamId)?.iconId ?? null)

const predictedWinnerId = computed<number | null>(() => {
  const hRank = props.rankMap[props.match.homeTeamId] ?? 999
  const aRank = props.rankMap[props.match.awayTeamId] ?? 999
  if (hRank === aRank) return null
  return hRank < aRank ? props.match.homeTeamId : props.match.awayTeamId
})

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 30_000) })
onUnmounted(() => { if (timer !== null) clearInterval(timer) })

const fullTimestamp = computed(() => {
  try {
    return new Date(props.match.utcStartTime).toLocaleString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'Australia/Melbourne',
      timeZoneName: 'short',
    })
  } catch {
    return ''
  }
})

const countdown = computed(() => {
  try {
    const diff = new Date(props.match.utcStartTime).getTime() - now.value
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
})
</script>
