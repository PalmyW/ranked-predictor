<script setup>
import { ref, computed, inject, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi.js'
import DataTable from '@/components/DataTable.vue'
import ColToggle from '@/components/ColToggle.vue'
import { MATCH_SECTIONS } from '@/constants/stats.js'

const route  = useRoute()
const router = useRouter()
const { api } = useApi()

const seasons = inject('seasons')
const teams   = inject('teams')

const year   = ref('')
const round  = ref('')
const team   = ref('')
const status = ref('CONCLUDED')
const rows   = ref([])
const loading = ref(false)
const tableRef = ref(null)

const COL_VIS_KEY = 'afl_col_vis_matches'
const visibility = ref((() => {
  try { return JSON.parse(localStorage.getItem(COL_VIS_KEY) ?? '{}') } catch { return {} }
})())

const seasonOptions = computed(() => [
  { value: '', title: 'All seasons' },
  ...(seasons?.value ?? []).map(s => ({ value: String(s.year), title: String(s.year) })),
])

const roundOptions = [
  { value: '', title: 'All rounds' },
  { value: '0', title: 'Opening Round' },
  ...Array.from({ length: 27 }, (_, i) => ({ value: String(i + 1), title: `Round ${i + 1}` })),
]

const teamOptions = computed(() => [
  { value: '', title: 'All teams' },
  ...(teams?.value ?? []).map(t => ({ value: t.team_id, title: t.name })),
])

const statusOptions = [
  { value: '', title: 'All statuses' },
  { value: 'CONCLUDED', title: 'Concluded' },
  { value: 'SCHEDULED', title: 'Scheduled' },
  { value: 'LIVE', title: 'Live' },
]

const columns = [
  { title: 'Rd', field: 'round_number', width: 50, hozAlign: 'center' },
  {
    title: 'Date', field: 'utc_start_time', width: 130,
    formatter: cell => {
      const v = cell.getValue()
      return v ? new Date(v).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
    },
  },
  { title: 'Home', field: 'home_team_name', minWidth: 140 },
  {
    title: 'Score', field: 'home_score', minWidth: 215, hozAlign: 'center',
    formatter: cell => {
      const r = cell.getRow().getData()
      if (r.home_score == null) return '—'
      const hw = r.home_score > r.away_score
      const aw = r.away_score > r.home_score
      return `<span class="score ${hw ? 'score-win' : ''}">${r.home_goals}.${r.home_behinds}&nbsp;(${r.home_score})</span>` +
             `<span style="opacity:0.4"> – </span>` +
             `<span class="score ${aw ? 'score-win' : ''}">${r.away_goals}.${r.away_behinds}&nbsp;(${r.away_score})</span>`
    },
  },
  { title: 'Away', field: 'away_team_name', minWidth: 140 },
  { title: 'Venue', field: 'venue_name', minWidth: 120 },
  {
    title: 'Status', field: 'status', width: 110,
    formatter: cell => {
      const v = cell.getValue()
      if (!v) return '—'
      const cls = v === 'CONCLUDED' ? 'tag-concluded' : v === 'SCHEDULED' ? 'tag-scheduled' : 'tag-live'
      return `<span class="tag ${cls}">${v}</span>`
    },
  },
]

async function loadMatches() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (year.value)   params.set('year', year.value)
    if (round.value)  params.set('round', round.value)
    if (team.value)   params.set('team', team.value)
    if (status.value) params.set('status', status.value)
    params.set('limit', 500)
    rows.value = await api(`/api/matches?${params}`)
    router.replace({
      query: {
        ...(year.value   && { year:   year.value }),
        ...(round.value  && { round:  round.value }),
        ...(team.value   && { team:   team.value }),
        ...(status.value && { status: status.value }),
      },
    })
  } finally {
    loading.value = false
  }
}

function onTableReady(tab) {
  for (const [key, visible] of Object.entries(visibility.value)) {
    try { visible !== false ? tab.showColumn(key) : tab.hideColumn(key) } catch {}
  }
}

function onColChange({ key, visible }) {
  localStorage.setItem(COL_VIS_KEY, JSON.stringify(visibility.value))
  const tab = tableRef.value?.getTable()
  if (!tab) return
  try { visible ? tab.showColumn(key) : tab.hideColumn(key) } catch {}
}

function onRowClick({ event, data }) {
  if (!data.match_id) return
  router.push({ name: 'match-stats', query: { match: data.match_id } })
}

function exportCsv() {
  tableRef.value?.getTable()?.download('csv', 'afl-matches.csv')
}

onMounted(() => {
  const q = route.query
  if (q.year)   year.value   = q.year
  if (q.round)  round.value  = q.round
  if (q.team)   team.value   = q.team
  if (q.status) status.value = q.status

  function doLoad() {
    if (!year.value && seasons?.value?.length) year.value = String(seasons.value[0].year)
    loadMatches()
  }

  if (seasons?.value?.length || Object.keys(q).length > 0) {
    doLoad()
  } else {
    const stop = watch(seasons, newVal => {
      if (newVal?.length) { stop(); doLoad() }
    })
  }
})
</script>

<template>
  <div>
    <v-row align="center" dense class="mb-4">
      <v-col cols="auto">
        <v-select
          v-model="year" :items="seasonOptions" label="Season"
          density="comfortable" variant="outlined" hide-details style="min-width:130px"
        />
      </v-col>
      <v-col cols="auto">
        <v-select
          v-model="round" :items="roundOptions" label="Round"
          density="comfortable" variant="outlined" hide-details style="min-width:130px"
        />
      </v-col>
      <v-col cols="auto">
        <v-select
          v-model="team" :items="teamOptions" label="Team"
          density="comfortable" variant="outlined" hide-details style="min-width:180px"
        />
      </v-col>
      <v-col cols="auto">
        <v-select
          v-model="status" :items="statusOptions" label="Status"
          density="comfortable" variant="outlined" hide-details style="min-width:140px"
        />
      </v-col>
      <v-col cols="auto">
        <v-btn @click="loadMatches" :loading="loading" color="primary" variant="filled" size="small">
          Load
        </v-btn>
      </v-col>
      <v-spacer />
      <v-col cols="auto">
        <ColToggle :sections="MATCH_SECTIONS" v-model="visibility" @change="onColChange" />
      </v-col>
      <v-col cols="auto">
        <v-btn @click="exportCsv" variant="tonal" size="small" prepend-icon="mdi-download">
          Export CSV
        </v-btn>
      </v-col>
      <v-col cols="auto">
        <span class="text-caption text-medium-emphasis">{{ rows.length.toLocaleString() }} matches</span>
      </v-col>
    </v-row>

    <DataTable
      ref="tableRef"
      :columns="columns"
      :data="rows"
      layout="fitColumns"
      :clickable="true"
      @table-ready="onTableReady"
      @row-click="onRowClick"
    />
  </div>
</template>
