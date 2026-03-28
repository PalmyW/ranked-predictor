<template>
  <div class="absolute right-0 top-full mt-1 z-50 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-sm overflow-hidden">
    <div class="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
      <span class="font-semibold text-gray-800 dark:text-gray-100 text-xs">{{ teamName }} — Remaining Fixture</span>
      <button @click.stop="$emit('close')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs">✕</button>
    </div>

    <div v-if="games.length === 0" class="px-3 py-3 text-gray-400 dark:text-gray-500 text-xs text-center">
      No remaining games
    </div>
    <div v-else class="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
      <div
        v-for="game in games"
        :key="game.matchId"
        class="flex items-center gap-2 px-3 py-2"
      >
        <!-- H/A badge -->
        <span
          class="shrink-0 w-5 h-5 flex items-center justify-center rounded text-xs font-semibold border"
          :class="game.isHome
            ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
            : 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'"
        >{{ game.isHome ? 'H' : 'A' }}</span>
        <!-- Round -->
        <span class="shrink-0 text-gray-400 dark:text-gray-600 text-xs w-6">R{{ game.roundNumber }}</span>
        <!-- Opponent -->
        <span class="flex-1 min-w-0 text-gray-800 dark:text-gray-200 text-xs truncate">{{ game.opponent }}</span>
        <!-- Predicted W/L -->
        <span
          class="shrink-0 w-5 h-5 flex items-center justify-center rounded text-white text-xs font-bold"
          :class="game.predicted === 'W' ? 'bg-green-500' : 'bg-red-500'"
          title="Predicted"
        >{{ game.predicted }}</span>
        <!-- Simulated W/L -->
        <span
          v-if="game.simulated !== null"
          class="shrink-0 w-5 h-5 flex items-center justify-center rounded text-white text-xs font-bold opacity-60"
          :class="game.simulated === 'W' ? 'bg-green-500' : 'bg-red-500'"
          title="Simulated"
        >{{ game.simulated }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface FixtureGame {
  matchId: number
  roundNumber: number
  opponent: string
  isHome: boolean
  predicted: 'W' | 'L'
  simulated: 'W' | 'L' | null
}

defineProps<{
  teamName: string
  games: FixtureGame[]
}>()

defineEmits<{
  (e: 'close'): void
}>()
</script>
