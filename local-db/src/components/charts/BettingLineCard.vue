<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApi } from '@/composables/useApi.js'
import ScatterTrendChart from '@/components/ScatterTrendChart.vue'

const { api } = useApi()

const MAX_LINE = 60

const series  = ref([])
const loading = ref(false)
const errMsg  = ref('')

// For each closing handicap line, the % of matches won outright by the team
// getting the points (the side with the positive closing line — the underdog).
const SQL = `WITH dog AS (
  SELECT
    CASE WHEN d.betting_home_line_close > 0 THEN d.betting_home_line_close
         ELSE d.betting_away_line_close END AS line,
    CASE WHEN d.betting_home_line_close > 0 THEN (mt.home_score > mt.away_score)
         ELSE (mt.away_score > mt.home_score) END AS won
  FROM match_details d
  JOIN matches mt ON mt.match_id = d.match_id
  WHERE mt.status = 'CONCLUDED'
    AND d.betting_home_line_close IS NOT NULL
    AND d.betting_away_line_close IS NOT NULL
    AND (d.betting_home_line_close > 0 OR d.betting_away_line_close > 0)
)
SELECT CAST(ROUND(line) AS INT) AS x,
       COUNT(*) AS games,
       AVG(CASE WHEN won THEN 1.0 ELSE 0.0 END) AS prob
FROM dog
GROUP BY x
HAVING x >= 1 AND x <= ${MAX_LINE}
ORDER BY x`

const datasets = computed(() => [
  { key: 'dog', label: 'Underdog win %', color: '#22c55e', points: series.value },
])

onMounted(async () => {
  loading.value = true
  try {
    const res = await api('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: SQL }),
    })
    if (res.error) throw new Error(res.error)
    series.value = (res.rows ?? []).map(r => ({ x: r.x, games: r.games, y: r.prob }))
  } catch (e) {
    errMsg.value = e?.message ?? 'Failed to load betting line data'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <v-card color="surface" rounded="lg" elevation="2">
    <v-card-title>
      <span class="text-subtitle-1 font-weight-bold">Underdog Win Rate by Closing Line</span>
    </v-card-title>
    <v-card-subtitle>
      % of matches won outright by the team starting with points (positive closing line), at each line.
    </v-card-subtitle>
    <v-card-text>
      <div v-if="loading" class="d-flex justify-center py-10">
        <v-progress-circular indeterminate color="primary" />
      </div>
      <v-alert v-else-if="errMsg" type="error" variant="tonal" density="compact">{{ errMsg }}</v-alert>
      <ScatterTrendChart
        v-else
        :datasets="datasets"
        :x-max="MAX_LINE" x-label="Closing line — points start to the underdog" x-hover-label="Line"
        :y-min="0" :y-max="0.6" :y-midline="0.5"
      />
    </v-card-text>
  </v-card>
</template>
