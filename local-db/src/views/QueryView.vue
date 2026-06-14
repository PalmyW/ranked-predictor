<script setup>
import { ref, computed, inject, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi.js'
import { useQueryHistory } from '@/composables/useQueryHistory.js'
import DataTable from '@/components/DataTable.vue'
import ColToggle from '@/components/ColToggle.vue'
import AiPrompt from '@/components/AiPrompt.vue'
import SchemaPanel from '@/components/SchemaPanel.vue'
import QueryHistory from '@/components/QueryHistory.vue'
import ExportImageModal from '@/components/ExportImageModal.vue'
import { SAMPLE_QUERY, fmt } from '@/constants/stats.js'

const router  = useRouter()
const { api } = useApi()
const teamMap = inject('teamMap')
const refreshAiStats = inject('refreshAiStats', () => {})

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
const fixLoading    = ref(false)
const fixNote       = ref('')
let   fixNoteTimer  = null
const pendingTitle  = ref('')
const resultsTitle  = ref('')
const showExport    = ref(false)

const lastFocused    = ref('sql') // 'sql' | 'claude'
const sqlTextareaRef = ref(null)
const aiRef          = ref(null)

const hasMatchId      = computed(() => columns.value.some(c => c.field === 'match_id'))
const hasPlayerId     = computed(() => columns.value.some(c => c.field === 'player_id'))
const isClickable     = computed(() => hasMatchId.value || hasPlayerId.value)
const visibleColumns  = computed(() => columns.value.filter(c => colVis.value[c.field] !== false))

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
    resultsTitle.value = pendingTitle.value
    pendingTitle.value = ''

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
  resultsTitle.value = ''
  pendingTitle.value = ''
}

async function fixWithClaude() {
  fixLoading.value = true
  try {
    const res = await fetch('/api/ai/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `Fix this SQLite query that returned an error.\n\nQuery:\n${sqlText.value.trim()}\n\nError:\n${error.value}`,
      }),
    })
    const data = await res.json()
    if (data.sql) {
      sqlText.value = data.sql
      error.value = ''
      if (data.note) {
        fixNote.value = data.note
        clearTimeout(fixNoteTimer)
        fixNoteTimer = setTimeout(() => { fixNote.value = '' }, 10000)
      }
    } else {
      error.value = data.error ?? 'Claude could not fix the query'
    }
  } catch (e) {
    error.value = e.message
  } finally {
    fixLoading.value = false
    refreshAiStats()
  }
}

function onHistorySelect(h) {
  sqlText.value = h.sql
  if (h.prompt) {
    aiRef.value?.setPrompt(h.prompt)
    pendingTitle.value = ''
  } else {
    aiRef.value?.setPrompt('')
  }
}

function onSchemaSelect(name) {
  if (lastFocused.value === 'claude') {
    aiRef.value?.insert(name)
  } else {
    const ta = sqlTextareaRef.value?.$el?.querySelector('textarea')
    if (!ta) { sqlText.value += name; return }
    const start = ta.selectionStart ?? sqlText.value.length
    const end   = ta.selectionEnd   ?? sqlText.value.length
    sqlText.value = sqlText.value.substring(0, start) + name + sqlText.value.substring(end)
    nextTick(() => {
      ta.selectionStart = ta.selectionEnd = start + name.length
      ta.focus()
    })
  }
}

function onAiSql({ sql, prompt, title }) {
  sqlText.value = sql
  currentPrompt.value = prompt
  pendingTitle.value = title || ''
}

function onColChange({ key, visible }) {
  const tab = tableRef.value?.getTable()
  if (!tab) return
  try { visible ? tab.showColumn(key) : tab.hideColumn(key) } catch {}
}

function onRowClick({ event, data }) {
  if (data.match_id) {
    if (event.metaKey || event.ctrlKey) {
      const base = `${window.location.origin}${window.location.pathname}`
      window.open(`${base}#/match-stats?match=${encodeURIComponent(data.match_id)}`, '_blank')
      return
    }
    router.push({ name: 'match-stats', query: { match: data.match_id } })
  } else if (data.player_id) {
    router.push({ name: 'player', query: { id: data.player_id } })
  }
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
      <AiPrompt ref="aiRef" @sql="onAiSql" @error="error = $event" @focus="lastFocused = 'claude'" class="mb-4" />

      <v-textarea
        ref="sqlTextareaRef"
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
        @focus="lastFocused = 'sql'"
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
        <v-col v-if="rowCount" cols="auto">
          <v-btn @click="showExport = true" variant="tonal" size="small" prepend-icon="mdi-image-outline">
            Export Image
          </v-btn>
        </v-col>
      </v-row>

      <v-alert
        v-if="error"
        type="error"
        density="compact"
        closable
        class="font-mono text-sm mb-4"
        @click:close="error = ''"
      >
        <div class="d-flex align-center gap-3">
          <span style="flex:1">{{ error }}</span>
          <v-btn
            @click.stop="fixWithClaude"
            :loading="fixLoading"
            color="white"
            variant="outlined"
            size="x-small"
            prepend-icon="mdi-creation"
            style="flex-shrink:0"
          >
            Fix with Claude
          </v-btn>
        </div>
      </v-alert>

      <v-alert
        v-if="fixNote"
        type="info"
        density="compact"
        closable
        class="text-sm mb-4"
        @click:close="fixNote = ''"
      >
        {{ fixNote }}
      </v-alert>

      <div v-if="columns.length">
        <div v-if="resultsTitle" class="text-h6 font-weight-medium mb-3">{{ resultsTitle }}</div>
        <DataTable
          ref="tableRef"
          :columns="columns"
          :data="rows"
          layout="fitDataStretch"
          :clickable="isClickable"
          @row-click="onRowClick"
        />
      </div>
    </div>

    <!-- Schema sidebar -->
    <div style="width:280px; flex-shrink:0">
      <SchemaPanel class="mb-4" @select="onSchemaSelect" />
      <QueryHistory
        :history="history"
        @select="onHistorySelect"
        @remove="removeHistory($event)"
        @clear="clearHistory()"
      />
    </div>
  </div>

  <ExportImageModal
    v-model="showExport"
    :title="resultsTitle"
    :columns="visibleColumns"
    :rows="rows"
  />
</template>
