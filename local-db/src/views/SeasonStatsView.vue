<script setup>
import { ref, computed, inject, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi.js'
import DataTable from '@/components/DataTable.vue'
import ColToggle from '@/components/ColToggle.vue'
import { makeStatCols, makeStatSections, SORT_DIR_OPTIONS, STAT_BASES, statLabel } from '@/constants/stats.js'

const route  = useRoute()
const router = useRouter()
const { api } = useApi()

const seasons = inject('seasons')
const teams   = inject('teams')

const year     = ref('')
const team     = ref('')
const minGames = ref('1')
const mode     = ref('avg')
const sortBase = ref('disposals')
const dir      = ref('desc')
const rows     = ref([])
const loading  = ref(false)
const tableRef = ref(null)

const COL_VIS_KEY = 'afl_col_vis_pss'
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

const modeOptions = [
  { value: 'avg', title: 'Per Game (Avg)' },
  { value: 'tot', title: 'Season Total' },
]

const sortOptions = STAT_BASES.map(b => ({ value: b, title: statLabel(b) }))

const idCols = [
  {
    title: 'Player', field: 'surname', minWidth: 130,
    formatter: cell => {
      const r = cell.getRow().getData()
      return `${r.given_name} ${r.surname}`
    },
  },
  { title: 'Team', field: 'team_name',    minWidth: 130 },
  { title: 'Pos',  field: 'position',     width: 55 },
  { title: 'Yr',   field: 'year',         width: 55 },
  { title: 'GP',   field: 'games_played', width: 50, hozAlign: 'right', sorter: 'number' },
]

const columns = computed(() => [...idCols, ...makeStatCols(`${mode.value}_`)])
const statSections = computed(() => makeStatSections(mode.value === 'tot'))

function applyVisToTable(tab, prefix) {
  if (!tab) return
  for (const [key, visible] of Object.entries(visibility.value)) {
    try { visible !== false ? tab.showColumn(prefix + key) : tab.hideColumn(prefix + key) } catch {}
  }
}

async function loadPSS() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (year.value) params.set('year', year.value)
    if (team.value) params.set('team', team.value)
    params.set('min_games', minGames.value || '1')
    params.set('sort', `${mode.value}_${sortBase.value}`)
    params.set('dir', dir.value)
    params.set('limit', 1000)
    rows.value = await api(`/api/player-season-stats?${params}`)
    router.replace({
      query: {
        ...(year.value  && { year:  year.value }),
        ...(team.value  && { team:  team.value }),
        min_games: minGames.value,
        mode: mode.value,
        sort: sortBase.value,
        dir: dir.value,
      },
    })
    // Wait for DataTable to apply new columns, then re-apply visibility
    await nextTick()
    await nextTick()
    applyVisToTable(tableRef.value?.getTable(), `${mode.value}_`)
  } finally {
    loading.value = false
  }
}

function onTableReady(tab) {
  applyVisToTable(tab, `${mode.value}_`)
}

function onColChange({ key, visible, prefix }) {
  localStorage.setItem(COL_VIS_KEY, JSON.stringify(visibility.value))
  const tab = tableRef.value?.getTable()
  if (!tab) return
  try { visible ? tab.showColumn(prefix + key) : tab.hideColumn(prefix + key) } catch {}
}

function exportCsv() {
  tableRef.value?.getTable()?.download('csv', 'afl-season-stats.csv')
}

onMounted(() => {
  const q = route.query
  if (q.year)      year.value     = q.year
  if (q.team)      team.value     = q.team
  if (q.min_games) minGames.value = q.min_games
  if (q.mode)      mode.value     = q.mode
  if (q.sort)      sortBase.value = q.sort
  if (q.dir)       dir.value      = q.dir

  function doLoad() {
    if (!year.value && seasons?.value?.length) year.value = String(seasons.value[0].year)
    loadPSS()
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
          v-model="team" :items="teamOptions" label="Team"
          density="comfortable" variant="outlined" hide-details style="min-width:180px"
        />
      </v-col>
      <v-col cols="auto">
        <v-text-field
          v-model="minGames" label="Min games" type="number"
          density="comfortable" variant="outlined" hide-details style="min-width:110px"
          :min="1" :max="30"
        />
      </v-col>
      <v-col cols="auto">
        <v-select
          v-model="mode" :items="modeOptions" label="Mode"
          density="comfortable" variant="outlined" hide-details style="min-width:160px"
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
        <v-btn @click="loadPSS" :loading="loading" color="primary" variant="filled" size="small">
          Load
        </v-btn>
      </v-col>
      <v-spacer />
      <v-col cols="auto">
        <ColToggle
          :sections="statSections" v-model="visibility"
          :prefix="`${mode}_`" @change="onColChange"
        />
      </v-col>
      <v-col cols="auto">
        <v-btn @click="exportCsv" variant="tonal" size="small" prepend-icon="mdi-download">
          Export CSV
        </v-btn>
      </v-col>
      <v-col cols="auto">
        <span class="text-caption text-medium-emphasis">{{ rows.length.toLocaleString() }} players</span>
      </v-col>
    </v-row>

    <DataTable
      ref="tableRef"
      :columns="columns"
      :data="rows"
      layout="fitDataStretch"
      @table-ready="onTableReady"
    />
  </div>
</template>
