<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi.js'
import DataTable from '@/components/DataTable.vue'
import ColToggle from '@/components/ColToggle.vue'
import MatchDetailsPanel from '@/components/MatchDetailsPanel.vue'
import { STAT_SECTIONS, makeStatCols } from '@/constants/stats.js'

const route  = useRoute()
const router = useRouter()
const { api } = useApi()

const rows        = ref([])
const scoreEvents = ref([])
const loading     = ref(false)
const tableRef    = ref(null)

const matchId = computed(() => route.query.match?.trim() ?? '')

const COL_VIS_KEY = 'afl_col_vis_pms'
const visibility = ref((() => {
  try { return JSON.parse(localStorage.getItem(COL_VIS_KEY) ?? '{}') } catch { return {} }
})())

const columns = [
  {
    title: 'Player', field: 'surname', minWidth: 120,
    formatter: cell => {
      const r = cell.getRow().getData()
      return `${r.given_name} ${r.surname}`
    },
  },
  { title: 'Team', field: 'team_name', minWidth: 130 },
  { title: 'Pos',  field: 'position',  width: 55 },
  { title: '#',    field: 'jumper_number', width: 45, hozAlign: 'center' },
  ...makeStatCols('stat_'),
]

function applyVisToTable(tab) {
  if (!tab) return
  for (const [key, visible] of Object.entries(visibility.value)) {
    try { visible !== false ? tab.showColumn('stat_' + key) : tab.hideColumn('stat_' + key) } catch {}
  }
}

async function load(id) {
  if (!id) { rows.value = []; scoreEvents.value = []; return }
  loading.value = true
  try {
    const params = new URLSearchParams({ match: id, sort: 'stat_disposals', dir: 'desc', limit: 100 })
    ;[rows.value, scoreEvents.value] = await Promise.all([
      api(`/api/player-match-stats?${params}`),
      api(`/api/score-events/${id}`),
    ])
    applyVisToTable(tableRef.value?.getTable())
  } finally {
    loading.value = false
  }
}

function onTableReady(tab) { applyVisToTable(tab) }

function onColChange({ key, visible }) {
  localStorage.setItem(COL_VIS_KEY, JSON.stringify(visibility.value))
  const tab = tableRef.value?.getTable()
  if (!tab) return
  try { visible ? tab.showColumn('stat_' + key) : tab.hideColumn('stat_' + key) } catch {}
}

function exportCsv() {
  tableRef.value?.getTable()?.download('csv', `afl-${matchId.value}.csv`)
}

function onRowClick({ data }) {
  if (data.player_id) router.push({ name: 'player', query: { id: data.player_id } })
}

function secsToMin(secs) {
  const m = Math.floor(secs / 60)
  const s = String(Math.round(secs % 60)).padStart(2, '0')
  return `${m}:${s}`
}

// Group score events by quarter for display
const eventsByQuarter = computed(() => {
  const groups = {}
  for (const ev of scoreEvents.value) {
    const q = ev.period_number
    if (!groups[q]) groups[q] = []
    groups[q].push(ev)
  }
  return Object.entries(groups).map(([q, events]) => ({ quarter: Number(q), events }))
})

watch(matchId, id => load(id))
onMounted(() => load(matchId.value))
</script>

<template>
  <div>
    <v-row align="center" dense class="mb-4">
      <v-col cols="auto">
        <v-btn
          variant="tonal" size="small" prepend-icon="mdi-arrow-left"
          @click="router.push({ name: 'matches' })"
        >Matches</v-btn>
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
        <span class="text-caption text-medium-emphasis">{{ rows.length }} players</span>
      </v-col>
    </v-row>

    <div v-if="!matchId" class="text-center text-medium-emphasis py-12">
      Select a match from the <a href="#/matches" class="text-primary">Matches</a> page.
    </div>

    <template v-else>
      <MatchDetailsPanel :match-id="matchId" class="mb-4" />

      <DataTable
        ref="tableRef"
        :columns="columns"
        :data="rows"
        layout="fitDataStretch"
        :clickable="true"
        @table-ready="onTableReady"
        @row-click="onRowClick"
      />

      <!-- Score events -->
      <v-card v-if="scoreEvents.length" color="surface" rounded="lg" elevation="2" class="mt-4">
        <v-card-text class="pa-4">
          <div class="text-caption text-medium-emphasis mb-3" style="font-weight:600; letter-spacing:0.06em; text-transform:uppercase">Scoring</div>

          <div v-for="group in eventsByQuarter" :key="group.quarter" class="se-quarter">
            <div class="se-q-label">Q{{ group.quarter }}</div>
            <table class="se-table">
              <tbody>
                <tr v-for="ev in group.events" :key="ev.seq"
                  :class="['se-row', ev.home_or_away === 'HOME' ? 'se-home' : 'se-away']"
                >
                  <td class="se-time">{{ secsToMin(ev.period_seconds) }}</td>
                  <td class="se-team">{{ ev.team_abbr }}</td>
                  <td class="se-player">
                    <span v-if="ev.given_name">{{ ev.given_name }} {{ ev.surname }}</span>
                    <span v-else class="se-rushed">Rushed</span>
                  </td>
                  <td class="se-type">
                    <span :class="['se-badge', ev.score_type === 'GOAL' ? 'se-badge--goal' : 'se-badge--behind']">
                      {{ ev.score_type === 'GOAL' ? 'GOAL' : ev.score_type === 'RUSHED_BEHIND' ? 'RB' : 'BHD' }}
                    </span>
                  </td>
                  <td class="se-score">{{ ev.aggregate_home }} – {{ ev.aggregate_away }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </v-card-text>
      </v-card>
    </template>
  </div>
</template>

<style scoped>
.se-quarter { margin-bottom: 16px; }
.se-quarter:last-child { margin-bottom: 0; }

.se-q-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.35);
  margin-bottom: 4px;
}

.se-table {
  width: 100%;
  border-collapse: collapse;
}

.se-row {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  font-size: 12px;
}
.se-row:last-child { border-bottom: none; }

.se-home { border-left: 2px solid #4fc3f7; }
.se-away { border-left: 2px solid #ff8a65; }

.se-time   { width: 42px; padding: 5px 8px; color: rgba(var(--v-theme-on-surface), 0.45); font-variant-numeric: tabular-nums; }
.se-team   { width: 42px; padding: 5px 4px; font-weight: 700; font-size: 11px; }
.se-player { padding: 5px 8px; color: rgba(var(--v-theme-on-surface), 0.85); }
.se-rushed { color: rgba(var(--v-theme-on-surface), 0.35); font-style: italic; }
.se-type   { width: 48px; padding: 5px 4px; }
.se-score  { width: 60px; padding: 5px 8px; text-align: right; font-variant-numeric: tabular-nums; color: rgba(var(--v-theme-on-surface), 0.55); }

.se-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: 4px;
}
.se-badge--goal   { background: rgba(79, 195, 247, 0.18); color: #4fc3f7; }
.se-badge--behind { background: rgba(var(--v-theme-on-surface), 0.08); color: rgba(var(--v-theme-on-surface), 0.5); }
</style>
