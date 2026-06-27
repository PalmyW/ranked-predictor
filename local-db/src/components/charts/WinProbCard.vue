<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApi } from '@/composables/useApi.js'
import ScatterTrendChart from '@/components/ScatterTrendChart.vue'

const { api } = useApi()

const MAX_MARGIN = 80

const haSeries  = ref([])
const allSeries = ref([])
const variant   = ref('ha')
const loading   = ref(false)
const errMsg    = ref('')

const variantOptions = [
  { value: 'ha',  title: 'Home/Away' },
  { value: 'all', title: 'All Games' },
]

// Historical favourite win rate at each 1-point predicted margin, from the
// walk-forward predictions stored in the DB (v_match_predictions). Draws count
// as a loss for the favourite via the boolean comparison.
function calibrationSql(marginCol) {
  return `SELECT CAST(ROUND(ABS(${marginCol})) AS INT) AS margin,
       COUNT(*) AS games,
       AVG(CASE WHEN (${marginCol} > 0) = (actual_margin > 0) THEN 1.0 ELSE 0.0 END) AS prob
FROM v_match_predictions
WHERE status = 'CONCLUDED' AND ${marginCol} IS NOT NULL AND ${marginCol} <> 0
GROUP BY margin
HAVING margin <= ${MAX_MARGIN}
ORDER BY margin`
}

async function runSql(sql) {
  const res = await api('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  })
  if (res.error) throw new Error(res.error)
  return (res.rows ?? []).map(r => ({ margin: r.margin, games: r.games, prob: r.prob }))
}

const datasets = computed(() => [
  { key: 'ha',  label: 'Home/Away', color: '#3b82f6', points: haSeries.value },
  { key: 'all', label: 'All Games', color: '#f59e0b', points: allSeries.value },
])

onMounted(async () => {
  loading.value = true
  try {
    const [ha, all] = await Promise.all([
      runSql(calibrationSql('pred_margin_ha')),
      runSql(calibrationSql('pred_margin_all')),
    ])
    haSeries.value = ha
    allSeries.value = all
  } catch (e) {
    errMsg.value = e?.message ?? 'Failed to load visualisation data'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <v-card color="surface" rounded="lg" elevation="2">
    <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-2">
      <span class="text-subtitle-1 font-weight-bold">PalmyScore Win Probability</span>
      <v-btn-toggle v-model="variant" density="compact" variant="outlined" color="primary" mandatory>
        <v-btn v-for="o in variantOptions" :key="o.value" :value="o.value" size="small">{{ o.title }}</v-btn>
      </v-btn-toggle>
    </v-card-title>
    <v-card-subtitle>
      Favourite win rate vs predicted margin (walk-forward predictions, all concluded matches).
    </v-card-subtitle>
    <v-card-text>
      <div v-if="loading" class="d-flex justify-center py-10">
        <v-progress-circular indeterminate color="primary" />
      </div>
      <v-alert v-else-if="errMsg" type="error" variant="tonal" density="compact">{{ errMsg }}</v-alert>
      <ScatterTrendChart
        v-else
        :datasets="datasets" :active-key="variant"
        :x-max="MAX_MARGIN" x-label="PalmyScore predicted margin (points)" x-hover-label="Margin"
        :y-min="0.4" :y-max="1.0" :y-midline="0.5"
      />
    </v-card-text>
  </v-card>
</template>
