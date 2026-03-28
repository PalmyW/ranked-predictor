<template>
  <div>
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-base font-bold text-gray-800">Full Fixture</h2>
      <div class="flex gap-2 text-xs text-gray-500">
        <span class="flex items-center gap-1">
          <span class="inline-block w-2 h-2 rounded-full bg-green-500"></span> Concluded
        </span>
        <span class="flex items-center gap-1">
          <span class="inline-block w-2 h-2 rounded-full bg-blue-400"></span> Live
        </span>
        <span class="flex items-center gap-1">
          <span class="inline-block w-2 h-2 rounded-full bg-gray-300"></span> Predicted
        </span>
      </div>
    </div>

    <div class="space-y-2">
      <div v-for="round in rounds" :key="round.roundNumber">
        <!-- Round header (clickable to collapse) -->
        <button
          class="w-full flex items-center justify-between px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm font-semibold text-gray-700 transition-colors"
          @click="toggleRound(round.roundNumber)"
        >
          <span>{{ round.roundName }}</span>
          <span class="flex items-center gap-2 text-xs font-normal text-gray-500">
            <span>{{ round.concludedCount }}/{{ round.matches.length }} played</span>
            <span>{{ expandedRounds.has(round.roundNumber) ? '▲' : '▼' }}</span>
          </span>
        </button>

        <!-- Match rows -->
        <div v-show="expandedRounds.has(round.roundNumber)" class="border border-gray-200 rounded overflow-hidden">
          <div
            v-for="(match, i) in round.matches"
            :key="match.id"
            class="flex items-center px-3 py-2 text-sm"
            :class="[
              i % 2 === 0 ? 'bg-white' : 'bg-gray-50',
              match.status === 'LIVE' ? 'border-l-2 border-blue-400' : ''
            ]"
          >
            <!-- Status dot -->
            <span class="shrink-0 mr-2">
              <span
                class="inline-block w-2 h-2 rounded-full"
                :class="{
                  'bg-green-500': match.status === 'CONCLUDED',
                  'bg-blue-400 animate-pulse': match.status === 'LIVE',
                  'bg-gray-300': match.status !== 'CONCLUDED' && match.status !== 'LIVE',
                }"
              />
            </span>

            <!-- Concluded match: show scores -->
            <template v-if="match.status === 'CONCLUDED' && match.homeScore && match.awayScore">
              <span
                class="flex-1 min-w-0 truncate"
                :class="match.homeScore.totalScore > match.awayScore.totalScore ? 'font-bold text-gray-900' : 'text-gray-500'"
              >
                {{ match.homeTeamName }}
              </span>
              <span class="shrink-0 mx-2 text-xs font-mono tabular-nums text-gray-700 font-semibold">
                {{ match.homeScore.goals }}.{{ match.homeScore.behinds }}
                <span class="text-gray-900">({{ match.homeScore.totalScore }})</span>
              </span>
              <span class="shrink-0 text-gray-400 mx-1">—</span>
              <span class="shrink-0 mx-2 text-xs font-mono tabular-nums text-gray-700 font-semibold">
                {{ match.awayScore.goals }}.{{ match.awayScore.behinds }}
                <span class="text-gray-900">({{ match.awayScore.totalScore }})</span>
              </span>
              <span
                class="flex-1 min-w-0 truncate text-right"
                :class="match.awayScore.totalScore > match.homeScore.totalScore ? 'font-bold text-gray-900' : 'text-gray-500'"
              >
                {{ match.awayTeamName }}
              </span>
            </template>

            <!-- Live match: show partial scores or in-progress indicator -->
            <template v-else-if="match.status === 'LIVE'">
              <span class="flex-1 truncate text-blue-700 font-medium">{{ match.homeTeamName }}</span>
              <span class="shrink-0 mx-2 text-xs text-blue-500 font-semibold">LIVE</span>
              <span class="flex-1 truncate text-right text-blue-700 font-medium">{{ match.awayTeamName }}</span>
            </template>

            <!-- Future match: show teams and predicted winner -->
            <template v-else>
              <span
                class="flex-1 min-w-0 truncate"
                :class="predictedWinner(match) === match.homeTeamId ? 'font-bold text-gray-800' : 'text-gray-400'"
              >
                {{ match.homeTeamName }}
              </span>
              <span class="shrink-0 mx-2 text-xs text-gray-400">vs</span>
              <span
                class="flex-1 min-w-0 truncate text-right"
                :class="predictedWinner(match) === match.awayTeamId ? 'font-bold text-gray-800' : 'text-gray-400'"
              >
                {{ match.awayTeamName }}
              </span>
            </template>

            <!-- Date for future matches -->
            <span v-if="match.status !== 'CONCLUDED'" class="shrink-0 ml-2 text-xs text-gray-400 hidden sm:block">
              {{ formatDate(match.utcStartTime) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { AflMatch, TeamRanking } from '../types/afl'

const props = defineProps<{
  matches: readonly AflMatch[]
  ranking: TeamRanking
}>()

// Build rank map reactively
const rankMap = computed<Record<number, number>>(() => {
  const map: Record<number, number> = {}
  props.ranking.forEach((id, i) => { map[id] = i + 1 })
  return map
})

function predictedWinner(match: AflMatch): number | null {
  const hRank = rankMap.value[match.homeTeamId] ?? 999
  const aRank = rankMap.value[match.awayTeamId] ?? 999
  if (hRank === aRank) return null
  return hRank < aRank ? match.homeTeamId : match.awayTeamId
}

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

// Auto-expand current round (first with any non-concluded match) and the last concluded round
const expandedRounds = reactive(new Set<number>())

const currentRoundNumber = computed(() => {
  const inProgress = rounds.value.find(r => r.concludedCount > 0 && r.concludedCount < r.matches.length)
  if (inProgress) return inProgress.roundNumber
  const liveRound = rounds.value.find(r => r.matches.some(m => m.status === 'LIVE'))
  if (liveRound) return liveRound.roundNumber
  // First future round
  const future = rounds.value.find(r => r.concludedCount === 0)
  return future?.roundNumber ?? rounds.value[0]?.roundNumber
})

// Watch for rounds to load and expand the current one
import { watch } from 'vue'
watch(rounds, (newRounds) => {
  if (newRounds.length && expandedRounds.size === 0) {
    const curr = currentRoundNumber.value
    if (curr !== undefined) expandedRounds.add(curr)
  }
}, { immediate: true })

function toggleRound(roundNumber: number) {
  if (expandedRounds.has(roundNumber)) {
    expandedRounds.delete(roundNumber)
  } else {
    expandedRounds.add(roundNumber)
  }
}

function formatDate(utcStartTime: string): string {
  try {
    const d = new Date(utcStartTime)
    return d.toLocaleDateString('en-AU', {
      weekday: 'short', month: 'short', day: 'numeric',
      timeZone: 'Australia/Melbourne',
    })
  } catch {
    return ''
  }
}
</script>
