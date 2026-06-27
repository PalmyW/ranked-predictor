<script setup>
import { ref, computed, inject, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi.js'
import DataTable from '@/components/DataTable.vue'
import { numCol, STAT_BASES, statLabel } from '@/constants/stats.js'
import { buildLeaderboardSql, metricAlias, isPct, LOWER_IS_BETTER } from '@/composables/useLeaderboard.js'

const route  = useRoute()
const router = useRouter()
const { api } = useApi()

const seasons = inject('seasons')

// ── Controls ───────────────────────────────────────────────────────────────────
const stat      = ref('disposals')
const metric    = ref('avg')              // 'avg' | 'tot'
const rangeMode = ref('season')           // 'season' | 'range' | 'alltime' | 'recent'
const year      = ref(null)               // single-season mode
const yearFrom  = ref(null)               // range mode
const yearTo    = ref(null)               // range mode
const recentN   = ref(4)                  // recent-rounds mode (4 | 8)
const minGames  = ref(10)
const dir       = ref('desc')

const rows    = ref([])
const loading = ref(false)
const errMsg  = ref('')
const ready   = ref(false)   // suppress the auto-run watcher during initial setup

const statOptions   = STAT_BASES.map(b => ({ value: b, title: statLabel(b) }))
const metricOptions = computed(() => [
  { value: 'avg', title: 'Average' },
  { value: 'tot', title: 'Total', props: { disabled: isPct(stat.value) } },
])
const rangeOptions = [
  { value: 'season',  title: 'Single season' },
  { value: 'range',   title: 'Season range' },
  { value: 'alltime', title: 'All-time' },
  { value: 'recent',  title: 'Recent rounds' },
]
const recentOptions = [
  { value: 4, title: 'Last 4 rounds' },
  { value: 8, title: 'Last 8 rounds' },
]
const dirOptions = [
  { value: 'desc', title: 'Highest first' },
  { value: 'asc',  title: 'Lowest first' },
]

const yearItems = computed(() =>
  (seasons?.value ?? []).map(s => ({ value: s.year, title: String(s.year) })),
)
const latestYear = computed(() => seasons?.value?.[0]?.year ?? null)
const earliestYear = computed(() => {
  const ys = seasons?.value ?? []
  return ys.length ? ys[ys.length - 1].year : null
})

// Percentage stats can't be totalled — force average.
watch(stat, () => { if (isPct(stat.value) && metric.value === 'tot') metric.value = 'avg' })
// Default sort direction follows the stat (lower-is-better stats rank ascending).
watch(stat, () => { dir.value = LOWER_IS_BETTER.has(stat.value) ? 'asc' : 'desc' })

const valueAlias = computed(() => metricAlias(stat.value, metric.value))

function currentRange() {
  if (rangeMode.value === 'alltime') return { kind: 'alltime' }
  if (rangeMode.value === 'recent')  return { kind: recentN.value === 8 ? 'last8' : 'last4' }
  if (rangeMode.value === 'range')   return { kind: 'range', from: yearFrom.value, to: yearTo.value }
  return { kind: 'season', year: year.value }
}

const columns = computed(() => [
  { title: '#', field: 'rank', width: 50, hozAlign: 'right', sorter: 'number' },
  { title: 'Player', field: 'player', minWidth: 160 },
  { title: 'Team', field: 'team_name', minWidth: 140 },
  { title: 'GP', field: 'games_played', width: 60, hozAlign: 'right', sorter: 'number' },
  numCol(valueAlias.value, statLabel(stat.value), 120),
])

async function run() {
  loading.value = true
  errMsg.value = ''
  try {
    const sql = buildLeaderboardSql(stat.value, currentRange(), metric.value, minGames.value, dir.value)
    const res = await api('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
    })
    if (res.error) { errMsg.value = res.error; rows.value = []; return }
    rows.value = (res.rows ?? []).map((r, i) => ({ ...r, rank: i + 1 }))
    syncUrl()
  } catch (e) {
    errMsg.value = e?.message ?? 'Query failed'
    rows.value = []
  } finally {
    loading.value = false
  }
}

function syncUrl() {
  const q = { stat: stat.value, metric: metric.value, mode: rangeMode.value, dir: dir.value, min: minGames.value }
  if (rangeMode.value === 'season') q.year = year.value
  if (rangeMode.value === 'range')  { q.from = yearFrom.value; q.to = yearTo.value }
  if (rangeMode.value === 'recent') q.n = recentN.value
  router.replace({ query: q })
}

function onRowClick({ data }) {
  if (data.player_id) router.push({ name: 'player', query: { id: data.player_id } })
}

// Re-run automatically whenever a control changes (after initial setup).
watch([stat, metric, rangeMode, year, yearFrom, yearTo, recentN, minGames, dir], () => {
  if (ready.value) run()
})

onMounted(() => {
  const q = route.query
  const start = () => {
    // Defaults that depend on the loaded season list.
    if (year.value == null) year.value = latestYear.value
    if (yearFrom.value == null) yearFrom.value = earliestYear.value
    if (yearTo.value == null) yearTo.value = latestYear.value

    // Preload from query params (e.g. a rank-chip drill-down).
    if (q.stat && STAT_BASES.includes(q.stat)) stat.value = q.stat
    if (q.metric === 'tot' || q.metric === 'avg') metric.value = q.metric
    // `range` (legacy string from chips) or `mode` (this page's own URL state)
    const incoming = q.mode || q.range
    if (incoming === 'alltime') rangeMode.value = 'alltime'
    else if (incoming === 'last4') { rangeMode.value = 'recent'; recentN.value = 4 }
    else if (incoming === 'last8') { rangeMode.value = 'recent'; recentN.value = 8 }
    else if (incoming === 'range') rangeMode.value = 'range'
    else if (incoming === 'recent') { rangeMode.value = 'recent'; if (q.n) recentN.value = +q.n }
    else if (incoming === 'season' || incoming === undefined) rangeMode.value = 'season'
    if (q.year) year.value = +q.year
    if (q.from) yearFrom.value = +q.from
    if (q.to)   yearTo.value = +q.to
    if (q.dir === 'asc' || q.dir === 'desc') dir.value = q.dir
    else dir.value = LOWER_IS_BETTER.has(stat.value) ? 'asc' : 'desc'
    // `min` may be a flag (0/1 from chips) or an explicit count.
    if (q.min != null) minGames.value = +q.min <= 1 ? (+q.min === 1 ? 10 : 1) : +q.min

    ready.value = true
    run()
  }

  if (seasons?.value?.length) start()
  else {
    const stop = watch(seasons, v => { if (v?.length) { stop(); start() } })
  }
})
</script>

<template>
  <div>
    <v-row align="center" dense class="mb-4">
      <v-col cols="auto">
        <v-select
          v-model="stat" :items="statOptions" label="Stat"
          density="comfortable" variant="outlined" hide-details style="min-width:200px"
        />
      </v-col>
      <v-col cols="auto">
        <v-select
          v-model="metric" :items="metricOptions" label="Metric"
          density="comfortable" variant="outlined" hide-details style="min-width:130px"
        />
      </v-col>
      <v-col cols="auto">
        <v-select
          v-model="rangeMode" :items="rangeOptions" label="Range"
          density="comfortable" variant="outlined" hide-details style="min-width:150px"
        />
      </v-col>

      <v-col v-if="rangeMode === 'season'" cols="auto">
        <v-select
          v-model="year" :items="yearItems" label="Season"
          density="comfortable" variant="outlined" hide-details style="min-width:110px"
        />
      </v-col>
      <template v-else-if="rangeMode === 'range'">
        <v-col cols="auto">
          <v-select
            v-model="yearFrom" :items="yearItems" label="From"
            density="comfortable" variant="outlined" hide-details style="min-width:100px"
          />
        </v-col>
        <v-col cols="auto">
          <v-select
            v-model="yearTo" :items="yearItems" label="To"
            density="comfortable" variant="outlined" hide-details style="min-width:100px"
          />
        </v-col>
      </template>
      <v-col v-else-if="rangeMode === 'recent'" cols="auto">
        <v-select
          v-model="recentN" :items="recentOptions" label="Window"
          density="comfortable" variant="outlined" hide-details style="min-width:150px"
        />
      </v-col>

      <v-col cols="auto">
        <v-text-field
          v-model.number="minGames" label="Min games" type="number"
          density="comfortable" variant="outlined" hide-details style="min-width:110px"
          :min="1" :max="400"
        />
      </v-col>
      <v-col cols="auto">
        <v-select
          v-model="dir" :items="dirOptions" label="Order"
          density="comfortable" variant="outlined" hide-details style="min-width:150px"
        />
      </v-col>
      <v-spacer />
      <v-col cols="auto">
        <span class="text-caption text-medium-emphasis">{{ rows.length.toLocaleString() }} players</span>
      </v-col>
    </v-row>

    <v-alert v-if="errMsg" type="error" variant="tonal" density="compact" class="mb-3">{{ errMsg }}</v-alert>

    <DataTable
      :columns="columns"
      :data="rows"
      :page-size="100"
      layout="fitDataStretch"
      :clickable="true"
      @row-click="onRowClick"
    />
  </div>
</template>
