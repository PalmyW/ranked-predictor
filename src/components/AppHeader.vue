<template>
  <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
      <!-- Tile logo -->
      <div class="flex flex-col gap-0.5 shrink-0">
        <div v-for="(row, ri) in LOGO_ROWS" :key="ri" class="flex gap-0.5">
          <div
            v-for="(char, ci) in row"
            :key="ci"
            class="size-6 flex items-center justify-center text-white font-black text-xs leading-none select-none font-shoulders"
            :class="char === '/' ? 'bg-slate-800 dark:bg-slate-700 text-slate-400 dark:text-slate-500' : 'bg-slate-800 dark:bg-slate-700'"
          >{{ char }}</div>
        </div>
      </div>

      <div class="flex items-center gap-3 shrink-0 ml-auto">
        <div class="text-xs text-gray-400 dark:text-gray-500 text-right hidden sm:block">
          <span v-if="isLoading">Loading fixture...</span>
          <span v-else-if="matchCount > 0">{{ matchCount }} matches loaded</span>
        </div>
        <button
          @click="$emit('toggle-dark')"
          class="size-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        >
          <span v-if="isDark">☀️</span>
          <span v-else>🌙</span>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  isLoading: boolean
  matchCount: number
  isDark: boolean
}>()

defineEmits<{
  (e: 'toggle-dark'): void
}>()

// Row 1: "DONT CALL ME A CHAMP, MATE" (26 positions)
// Row 2: "DATA" + slashes padded to 26
const LOGO_ROWS: string[][] = [
  ['D','O','N','T',' ','C','A','L','L',' ','M','E',' ','A',' ','C','H','A','M','P',',',' ','M','A','T','E','!'],
  ['D','A','T','A','/','/','/','/','/','/','/','/','/','/','/','/','/','/','/','/','/','/','/','/','/','/','/' ],
]
</script>
