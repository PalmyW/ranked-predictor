<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click="$emit('close')"
    >
      <div
        class="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        @click.stop
      >
        <!-- Header: matchup -->
        <div class="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/60">
          <div class="flex flex-1 items-center justify-center gap-2 text-sm">
            <svg class="size-6 shrink-0"><use :href="`${BASE_URL}icons.svg#${home.iconId}`" /></svg>
            <span class="font-bold text-gray-800 dark:text-gray-100">{{ home.name }}</span>
            <span class="mx-1 text-xs text-gray-400 dark:text-gray-500">vs</span>
            <span class="font-bold text-gray-800 dark:text-gray-100">{{ away.name }}</span>
            <svg class="size-6 shrink-0"><use :href="`${BASE_URL}icons.svg#${away.iconId}`" /></svg>
          </div>
          <button
            @click="$emit('close')"
            class="ml-2 flex size-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            aria-label="Close"
          >✕</button>
        </div>

        <!-- Loading -->
        <div v-if="store.isLoading && !store.loaded" class="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
          Loading history…
        </div>

        <!-- Empty -->
        <div v-else-if="h2h.total === 0" class="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
          No previous meetings on record
        </div>

        <template v-else>
          <!-- All-time record -->
          <div class="border-b border-gray-100 px-4 py-4 dark:border-gray-800">
            <div class="mb-1 text-center text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Since {{ h2h.firstYear }}
            </div>
            <div class="flex items-center justify-center gap-3 text-2xl tabular-nums">
              <span :class="h2h.aWins > h2h.bWins ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'">{{ h2h.aWins }}</span>
              <span class="text-base text-gray-400 dark:text-gray-500">–</span>
              <span :class="h2h.bWins > h2h.aWins ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'">{{ h2h.bWins }}</span>
            </div>
            <div class="mt-1 text-center text-xs text-gray-400 dark:text-gray-500">
              {{ h2h.total }} {{ h2h.total === 1 ? 'meeting' : 'meetings' }}<template v-if="h2h.draws > 0"> · {{ h2h.draws }} {{ h2h.draws === 1 ? 'draw' : 'draws' }}</template>
            </div>
          </div>

          <!-- Last 8 form graphic -->
          <div class="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <div class="mb-2 text-center text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Last 8
            </div>
            <div class="flex items-center justify-center gap-2">
              <!-- newest on the right; winning team's logo (grey dash for a draw) -->
              <template v-for="m in [...h2h.lastEight].reverse()" :key="m.matchId">
                <svg
                  v-if="winnerIconId(m.result)"
                  class="size-7 shrink-0"
                  :title="`${m.year} ${m.roundName}`"
                >
                  <use :href="`${BASE_URL}icons.svg#${winnerIconId(m.result)}`" />
                </svg>
                <span
                  v-else
                  class="flex size-7 items-center justify-center rounded-full bg-gray-300 text-xs font-bold text-white dark:bg-gray-600"
                  :title="`${m.year} ${m.roundName} · draw`"
                >D</span>
              </template>
            </div>
          </div>

          <!-- Last 8 meeting list -->
          <div class="px-2 py-1">
            <div
              v-for="m in h2h.lastEight"
              :key="m.matchId"
              class="flex items-center gap-2 border-b border-gray-50 px-2 py-1.5 text-xs last:border-0 dark:border-gray-800/60"
            >
              <span class="w-20 shrink-0 text-gray-400 dark:text-gray-500">{{ m.year }} · {{ shortRound(m.roundName) }}</span>
              <span class="flex-1 truncate text-right tabular-nums" :class="m.homeScore > m.awayScore ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'">
                {{ m.homeTeamName }} {{ m.homeScore }}
              </span>
              <span class="shrink-0 text-gray-300 dark:text-gray-600">–</span>
              <span class="flex-1 truncate tabular-nums" :class="m.awayScore > m.homeScore ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'">
                {{ m.awayScore }} {{ m.awayTeamName }}
              </span>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useFixturesStore, type H2HResult } from '../stores/fixtures'

interface TeamRef {
  id: number
  name: string
  iconId: string
}

const props = defineProps<{
  home: TeamRef
  away: TeamRef
}>()

defineEmits<{ close: [] }>()

const BASE_URL = import.meta.env.BASE_URL
const store = useFixturesStore()

onMounted(() => { store.loadAllSeasons() })

// Re-reads on load because allConcludedMatches (a store getter) is reactive.
const h2h = computed(() => store.getHeadToHead(props.home.id, props.away.id))

// Winning team's logo, from team A's (home prop) perspective. null = draw.
function winnerIconId(result: H2HResult): string | null {
  if (result === 'W') return props.home.iconId
  if (result === 'L') return props.away.iconId
  return null
}

function shortRound(roundName: string): string {
  const m = roundName.match(/Round\s+(\d+)/i)
  return m ? `Rd ${m[1]}` : roundName
}
</script>
