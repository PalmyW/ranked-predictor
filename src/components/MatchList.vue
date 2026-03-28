<template>
  <div>
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-base font-bold text-gray-800 dark:text-gray-100">Full Fixture</h2>
      <div class="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span class="flex items-center gap-1">
          <span class="inline-block w-2 h-2 rounded-full bg-green-500"></span> Concluded
        </span>
        <span class="flex items-center gap-1">
          <span class="inline-block w-2 h-2 rounded-full bg-blue-400"></span> Live
        </span>
        <span class="flex items-center gap-1">
          <span class="font-bold text-gray-700 dark:text-gray-300">Bold</span> Predicted
        </span>
        <span v-if="simulatedMatchWinners" class="flex items-center gap-1">
          <span class="px-1 rounded text-white bg-purple-500 font-bold" style="font-size:10px">S</span> Simulated
        </span>
      </div>
    </div>

    <div class="space-y-2">
      <div v-for="round in rounds" :key="round.roundNumber">
        <button
          class="w-full flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-sm font-semibold text-gray-700 dark:text-gray-200 transition-colors"
          @click="toggleRound(round.roundNumber)"
        >
          <span>{{ round.roundName }}</span>
          <span class="flex items-center gap-2 text-xs font-normal">
            <span class="text-gray-500 dark:text-gray-400">{{ round.concludedCount }}/{{ round.matches.length }} played</span>
            <span>{{ expandedRounds.has(round.roundNumber) ? '▲' : '▼' }}</span>
          </span>
        </button>

        <div v-show="expandedRounds.has(round.roundNumber)" class="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
          <MatchRow
            v-for="(match, i) in round.matches"
            :key="match.id"
            :match="match"
            :index="i"
            :rankMap="rankMap"
            :simulatedMatchWinners="simulatedMatchWinners"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { AflMatch, TeamRanking } from '../types/afl'
import MatchRow from './MatchRow.vue'

const props = defineProps<{
  matches: readonly AflMatch[]
  ranking: TeamRanking
  simulatedMatchWinners: Record<number, number> | null
}>()

const rankMap = computed<Record<number, number>>(() => {
  const map: Record<number, number> = {}
  props.ranking.forEach((id, i) => { map[id] = i + 1 })
  return map
})

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
      map.set(match.roundNumber, { roundNumber: match.roundNumber, roundName: match.roundName, matches: [], concludedCount: 0 })
    }
    const group = map.get(match.roundNumber)!
    group.matches.push(match)
    if (match.status === 'CONCLUDED') group.concludedCount++
  }
  return Array.from(map.values()).sort((a, b) => a.roundNumber - b.roundNumber)
})

const expandedRounds = reactive(new Set<number>())

const currentRoundNumber = computed(() => {
  const inProgress = rounds.value.find(r => r.concludedCount > 0 && r.concludedCount < r.matches.length)
  if (inProgress) return inProgress.roundNumber
  const liveRound = rounds.value.find(r => r.matches.some(m => m.status === 'LIVE'))
  if (liveRound) return liveRound.roundNumber
  const future = rounds.value.find(r => r.concludedCount === 0)
  return future?.roundNumber ?? rounds.value[0]?.roundNumber
})

watch(rounds, (newRounds) => {
  if (newRounds.length && expandedRounds.size === 0) {
    const curr = currentRoundNumber.value
    if (curr !== undefined) expandedRounds.add(curr)
  }
}, { immediate: true })

function toggleRound(roundNumber: number) {
  if (expandedRounds.has(roundNumber)) expandedRounds.delete(roundNumber)
  else expandedRounds.add(roundNumber)
}
</script>
