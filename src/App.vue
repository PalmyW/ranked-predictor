<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
    <AppHeader :isLoading="isLoading" :syncedAt="syncedAt" :isDark="isDark" @toggle-dark="toggleDark" />
    <RouterView />
  </div>
</template>

<script setup lang="ts">
import { useAFLData } from './composables/useAFLData'
import { useDarkMode } from './composables/useDarkMode'
import AppHeader from './components/AppHeader.vue'

const { isDark, toggle: toggleDark } = useDarkMode()
const { isLoading, syncedAt } = useAFLData()
</script>
