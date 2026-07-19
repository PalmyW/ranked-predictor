<template>
  <SeasonStatsBrowser />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useSeason } from '../composables/useSeason'
import SeasonStatsBrowser from '../components/SeasonStatsBrowser.vue'

const { enforceCurrentSeason } = useSeason()
onMounted(enforceCurrentSeason)
</script>
