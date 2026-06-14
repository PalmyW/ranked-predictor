<script setup>
import { ref, computed, inject, onMounted, onActivated, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi.js'
import DataTable from '@/components/DataTable.vue'
import ColToggle from '@/components/ColToggle.vue'
import { STAT_SECTIONS, makeStatCols, ROUND_OPTIONS, SORT_DIR_OPTIONS, STAT_BASES, statLabel } from '@/constants/stats.js'

const route  = useRoute()
const router = useRouter()
const { api } = useApi()

const seasons = inject('seasons')
const teams   = inject('teams')

const year     = ref('')
const round    = ref('')
const team     = ref('')
const match    = ref('')
const sortBase = ref('disposals')
const dir      = ref('desc')
const rows     = ref([])
const loading  = ref(false)
const tableRef = ref(null)
const lastCrossTabMatch = ref('')

const COL_VIS_KEY = 'afl_col_vis_pms'
const visibility = ref((() => {
  try { return JSON.parse(localStorage.getItem(COL_VIS_KEY) ?? '{}') } catch { return {} }
})())

const seasonOptions = computed(() => [
  { value: '', title: 'All seasons' },
  ...(seasons?.value ?? []).map(s => ({ value: String(s.year), title: String(s.year) })),
])

const teamOptions = computed(() => [
  { value: '', title: 'All teams' },
  ...(teams?.value ?? []).map(t => ({ value: t.team_id, title: t.name })),
])

const sortOptions = STAT_BASES.map(b => ({ value: b, title: statLabel(b) }))

const columns = [
  {
    title: 'Player', field: 'surname', minWidth: 120,
    formatter: cell => {
      const r = cell.getRow().getData()
      return `${r.given_name} ${r.surname}`
    },
  },
  { title: 'Team',  field: 'team_name',     minWidth: 130 },
  { title: 'Pos',   field: 'position',      width: 55 },
  { title: '#',     field: 'jumper_number', width: 45, hozAlign: 'center' },
  { title: 'Yr',    field: 'year',          width: 55 },
  { title: 'Rd',    field: 'round_number',  width: 50, hozAlign: 'center' },
  { title: 'Match', field: 'match_id',      width: 170 },
  ...makeStatCols('stat_'),
]

function applyVisToTable(tab) {
  if (!tab) return
  for (const [key, visible] of Object.entries(visibility.value)) {
    try { visible !== false ? tab.showColumn('stat_' + key) : tab.hideColumn('stat_' + key) } catch {}
  }
}

async function loadPMS() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (year.value)        params.set('year', year.value)
    if (round.value)       params.set('round', round.value)
    if (team.value)        params.set('team', team.value)
    if (match.value.trim()) params.set('match', match.value.trim())
    params.set('sort', `stat_${sortBase.value}`)
    params.set('dir', dir.value)
    params.set('limit', 1000)
    rows.value = await api(`/api/player-match-stats?${params}`)
    router.replace({
      query: {
        ...(year.value         && { year:  year.value }),
        ...(round.value        && { round: round.value }),
        ...(team.value         && { team:  team.value }),
        ...(match.value.trim() && { match: match.value.trim() }),
        sort: sortBase.value,
        dir: dir.value,
      },
    })
    applyVisToTable(tableRef.value?.getTable())
  } finally {
    loading.value = false
  }
}

function onTableReady(tab) {
  applyVisToTable(tab)
}

function onColChange({ key, visible }) {
  localStorage.setItem(COL_VIS_KEY, JSON.stringify(visibility.value))
  const tab = tableRef.value?.getTable()
  if (!tab) return
  try { visible ? tab.showColumn('stat_' + key) : tab.hideColumn('stat_' + key) } catch {}
}

function exportCsv() {
  tableRef.value?.getTable()?.download('csv', 'afl-player-match-stats.csv')
}

function onRowClick({ data }) {
  if (data.player_id) router.push({ name: 'player', query: { id: data.player_id } })
}

onMounted(() => {
  const q = route.query
  if (q.year)  year.value     = q.year
  if (q.round) round.value    = q.round
  if (q.team)  team.value     = q.team
  if (q.match) { match.value  = q.match; lastCrossTabMatch.value = q.match }
  if (q.sort)  sortBase.value = q.sort
  if (q.dir)   dir.value      = q.dir

  function doLoad() {
    if (!year.value && !match.value && seasons?.value?.length) {
      year.value = String(seasons.value[0].year)
    }
    loadPMS()
  }

  if (seasons?.value?.length || Object.keys(q).length > 0) {
    doLoad()
  } else {
    const stop = watch(seasons, newVal => {
      if (newVal?.length) { stop(); doLoad() }
    })
  }
})

onActivated(() => {
  const newMatch = route.query.match
  if (newMatch && newMatch !== lastCrossTabMatch.value) {
    year.value  = ''
    round.value = ''
    team.value  = ''
    match.value = newMatch
    lastCrossTabMatch.value = newMatch
    loadPMS()
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
          v-model="round" :items="ROUND_OPTIONS" label="Round"
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
        <v-text-field
          v-model="match" label="Match ID"
          density="comfortable" variant="outlined" hide-details style="min-width:190px"
          clearable @keydown.enter="loadPMS"
        />
      </v-col>
      <v-col cols="auto">
        <v-select
          v-model="sortBase" :items="sortOptions" label="Sort by"
          density="comfortable" variant="outlined" hide-details style="min-width:160px"
        />
      </v-col>
      <v-col cols="auto">
        <v-select
          v-model="dir" :items="SORT_DIR_OPTIONS" label="Direction"
          density="comfortable" variant="outlined" hide-details style="min-width:140px"
        />
      </v-col>
      <v-col cols="auto">
        <v-btn @click="loadPMS" :loading="loading" color="primary" variant="filled" size="small">
          Load
        </v-btn>
      </v-col>
      <v-spacer />
      <v-col cols="auto">
        <ColToggle :sections="STAT_SECTIONS" v-model="visibility" prefix="stat_" @change="onColChange" />
      </v-col>
      <v-col cols="auto">
        <v-btn @click="exportCsv" variant="tonal" size="small" prepend-icon="mdi-download">
          Export CSV
        </v-btn>
      </v-col>
      <v-col cols="auto">
        <span class="text-caption text-medium-emphasis">{{ rows.length.toLocaleString() }} rows</span>
      </v-col>
    </v-row>

    <DataTable
      ref="tableRef"
      :columns="columns"
      :data="rows"
      layout="fitDataStretch"
      :clickable="true"
      @table-ready="onTableReady"
      @row-click="onRowClick"
    />
  </div>
</template>
