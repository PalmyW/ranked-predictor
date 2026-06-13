<script setup>
import { ref, computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi.js'
import { useQueryHistory } from '@/composables/useQueryHistory.js'
import DataTable from '@/components/DataTable.vue'
import ColToggle from '@/components/ColToggle.vue'
import AiPrompt from '@/components/AiPrompt.vue'
import SchemaPanel from '@/components/SchemaPanel.vue'
import QueryHistory from '@/components/QueryHistory.vue'
import { SAMPLE_QUERY, fmt } from '@/constants/stats.js'

const router  = useRouter()
const { api } = useApi()
const teamMap = inject('teamMap')

const { history, push: pushHistory, remove: removeHistory, clear: clearHistory } = useQueryHistory()

const sqlText  = ref(SAMPLE_QUERY)
const rows     = ref([])
const columns  = ref([])
const error    = ref('')
const execTime = ref('')
const rowCount = ref(null)
const loading  = ref(false)
const tableRef = ref(null)

const colVis = ref({})
const currentPrompt = ref('')

const hasMatchId = computed(() => columns.value.some(c => c.field === 'match_id'))

const colSections = computed(() =>
  columns.value.length
    ? [{ flat: true, cols: columns.value.map(c => ({ key: c.field, label: c.field })) }]
    : []
)

async function runQuery() {
  const sql = sqlText.value.trim()
  if (!sql) return
  error.value = ''
  execTime.value = 'Running…'
  rowCount.value = null
  loading.value = true
  try {
    const result = await api('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
    })
    if (result.error) {
      error.value = result.error
      execTime.value = ''
      columns.value = []
      rows.value = []
      return
    }
    execTime.value = `${result.executionMs}ms`
    rowCount.value = result.rowCount

    const tmap = teamMap?.value ?? {}
    const toLabel = s => { const w = s.replace(/_/g, ' '); return w.charAt(0).toUpperCase() + w.slice(1) }
    columns.value = result.columns.map(c => {
      const isTeamId = /team_id$/i.test(c)
      const firstVal = result.rows[0]?.[c]
      const isNum = typeof firstVal === 'number'
      return {
        title: toLabel(c),
        field: c,
        formatter: cell => {
          const v = cell.getValue()
          if (isTeamId && v != null) return tmap[v] ?? v
          return fmt(v)
        },
        sorter: isNum ? 'number' : 'string',
        hozAlign: isNum ? 'right' : 'left',
        headerHozAlign: isNum ? 'right' : 'left',
        minWidth: isTeamId ? 130 : 90,
      }
    })
    rows.value = result.rows
    colVis.value = {}

    pushHistory({ sql, ts: Date.now(), rowCount: result.rowCount, executionMs: result.executionMs, prompt: currentPrompt.value || undefined })
  } finally {
    loading.value = false
  }
}

function clearQuery() {
  sqlText.value = ''
  error.value = ''
  execTime.value = ''
  rowCount.value = null
  columns.value = []
  rows.value = []
  colVis.value = {}
  currentPrompt.value = ''
}

function onAiSql({ sql, prompt }) {
  sqlText.value = sql
  currentPrompt.value = prompt
}

function onColChange({ key, visible }) {
  const tab = tableRef.value?.getTable()
  if (!tab) return
  try { visible ? tab.showColumn(key) : tab.hideColumn(key) } catch {}
}

function onRowClick({ event, data }) {
  if (!data.match_id) return
  if (event.metaKey || event.ctrlKey) {
    const base = `${window.location.origin}${window.location.pathname}`
    window.open(`${base}#/match-stats?match=${encodeURIComponent(data.match_id)}`, '_blank')
    return
  }
  router.push({ name: 'match-stats', query: { match: data.match_id } })
}

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    runQuery()
  }
}

function exportCsv() {
  tableRef.value?.getTable()?.download('csv', 'afl-query-results.csv')
}
</script>

<template>
  <div style="display:flex; gap:24px; align-items:flex-start">
    <!-- Main area -->
    <div style="flex:1; min-width:0">
      <AiPrompt @sql="onAiSql" @error="error = $event" class="mb-4" />

      <v-textarea
        v-model="sqlText"
        label="SQL"
        :rows="6"
        variant="outlined"
        density="comfortable"
        class="font-mono mb-4"
        spellcheck="false"
        auto-grow
        hide-details
        @keydown="onKeydown"
      />

      <v-row align="center" dense class="mb-4">
        <v-col cols="auto">
          <v-btn
            @click="runQuery" :loading="loading"
            color="primary" variant="filled" size="small" prepend-icon="mdi-play"
          >
            Run
          </v-btn>
        </v-col>
        <v-col cols="auto">
          <v-btn @click="clearQuery" variant="tonal" size="small">Clear</v-btn>
        </v-col>
        <v-col v-if="execTime" cols="auto">
          <span class="text-caption text-medium-emphasis">{{ execTime }}</span>
        </v-col>
        <v-col v-if="rowCount != null" cols="auto">
          <span class="text-caption text-medium-emphasis">{{ rowCount.toLocaleString() }} rows</span>
        </v-col>
        <v-spacer />
        <v-col v-if="columns.length" cols="auto">
          <ColToggle :sections="colSections" v-model="colVis" @change="onColChange" />
        </v-col>
        <v-col v-if="rowCount" cols="auto">
          <v-btn @click="exportCsv" variant="tonal" size="small" prepend-icon="mdi-download">
            Export CSV
          </v-btn>
        </v-col>
      </v-row>

      <v-alert
        v-if="error" type="error" density="compact" closable
        class="font-mono text-sm mb-4" @click:close="error = ''"
      >
        {{ error }}
      </v-alert>

      <DataTable
        v-if="columns.length"
        ref="tableRef"
        :columns="columns"
        :data="rows"
        layout="fitDataStretch"
        :clickable="hasMatchId"
        @row-click="onRowClick"
      />
    </div>

    <!-- Schema sidebar -->
    <div style="width:280px; flex-shrink:0">
      <SchemaPanel class="mb-4" />
      <QueryHistory
        :history="history"
        @select="sqlText = $event"
        @remove="removeHistory($event)"
        @clear="clearHistory()"
      />
    </div>
  </div>
</template>
