<template>
  <RoundBanner v-if="!isLoading && matches.length > 0" :matches="matches" :ranking="ranking" :simulatedMatchWinners="null" />
  <StatsBrowser
    :matches="matches"
    :providerId="providerId"
    @select="handleSelect"
  />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAFLData } from '../composables/useAFLData'
import { useRanking } from '../composables/useRanking'
import { useSeason } from '../composables/useSeason'
import RoundBanner from '../components/RoundBanner.vue'
import StatsBrowser from '../components/StatsBrowser.vue'

const route = useRoute()
const router = useRouter()
const { matches, isLoading } = useAFLData()
const { ranking } = useRanking()
const { enforceCurrentSeason } = useSeason()
onMounted(enforceCurrentSeason)

const providerId = computed(() => (route.params.providerId as string) || null)

function handleSelect(id: string | null) {
  if (!id) {
    router.push('/stats')
  } else if (route.params.providerId !== id) {
    router.push('/stats/' + id)
  }
}
</script>
