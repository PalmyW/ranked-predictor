<template>
  <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
    <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">AFL 2026 Season Predictor</h1>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Rank teams 1–18 to predict the final ladder</p>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-xs text-gray-400 dark:text-gray-500 text-right hidden sm:block">
          <span v-if="isLoading">Loading fixture...</span>
          <span v-else-if="matchCount > 0">{{ matchCount }} matches loaded</span>
        </div>
        <button
          @click="$emit('toggle-dark')"
          class="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
</script>
