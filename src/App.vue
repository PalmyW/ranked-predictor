<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
    <AppHeader :isLoading="isLoading" :syncedAt="syncedAt" :isDark="isDark" @toggle-dark="toggleDark" @start-tour="startTour" />
    <RouterView />
    <GuidedTour />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useAFLData } from './composables/useAFLData'
import { useDarkMode } from './composables/useDarkMode'
import { useTour } from './composables/useTour'
import AppHeader from './components/AppHeader.vue'
import GuidedTour from './components/GuidedTour.vue'

const { isDark, toggle: toggleDark } = useDarkMode()
const { isLoading, syncedAt } = useAFLData()
const { startTour, initTour } = useTour()

onMounted(() => {
  initTour()
})
</script>
