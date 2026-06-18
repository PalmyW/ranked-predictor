<script setup>
import { ref, computed, inject, onMounted, watch } from 'vue'
import { useApi } from '@/composables/useApi.js'
import DataTable from '@/components/DataTable.vue'
import { fmt, fmtStarSign } from '@/constants/stats.js'

const { api } = useApi()
const teamMap = inject('teamMap')

const tables   = ref([])
const selected = ref('')

const columns  = ref([])
const rows     = ref([])
const total    = ref(0)
const loading  = ref(false)
const error    = ref('')

const pageSize = ref(100)
const offset   = ref(0)
const sort     = ref('')
const dir      = ref('asc')

const tableRef = ref(null)

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500, 1000]

const page       = computed(() => Math.floor(offset.value / pageSize.value) + 1)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const rowStart   = computed(() => (total.value ? offset.value + 1 : 0))
const rowEnd     = computed(() => Math.min(offset.value + pageSize.value, total.value))

const sortOptions = computed(() => [
  { value: '', title: 'Default order' },
  ...columns.value.map(c => ({ value: c.field, title: c.field })),
])

function toLabel(s) {
  const w = s.replace(/_/g, ' ')
  return w.charAt(0).toUpperCase() + w.slice(1)
}

async function loadTables() {
  tables.value = await api('/api/browse/tables')
}

async function loadRows() {
  if (!selected.value) return
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ limit: pageSize.value, offset: offset.value })
    if (sort.value) { params.set('sort', sort.value); params.set('dir', dir.value) }
    const result = await api(`/api/browse/${encodeURIComponent(selected.value)}?${params}`)
    if (result.error) {
      error.value = result.error
      columns.value = []
      rows.value = []
      total.value = 0
      return
    }
    total.value = result.total
    const tmap = teamMap?.value ?? {}
    columns.value = result.columns.map(c => {
      const isTeamId = /team_id$/i.test(c)
      const isStarSign = /star_sign$/i.test(c)
      const isNum = typeof result.rows[0]?.[c] === 'number'
      return {
        title: toLabel(c),
        field: c,
        formatter: cell => {
          const v = cell.getValue()
          if (isTeamId && v != null) return tmap[v] ?? v
          if (isStarSign) return fmtStarSign(v)
          return fmt(v)
        },
        sorter: isNum ? 'number' : 'string',
        hozAlign: isNum ? 'right' : 'left',
        headerHozAlign: isNum ? 'right' : 'left',
        minWidth: isTeamId ? 130 : 90,
      }
    })
    rows.value = result.rows
  } finally {
    loading.value = false
  }
}

function selectTable(name) {
  if (selected.value === name) return
  selected.value = name
  offset.value = 0
  sort.value = ''
  dir.value = 'asc'
  loadRows()
}

function goToPage(p) {
  const clamped = Math.min(Math.max(1, p), totalPages.value)
  offset.value = (clamped - 1) * pageSize.value
  loadRows()
}

function toggleDir() {
  dir.value = dir.value === 'asc' ? 'desc' : 'asc'
  if (sort.value) { offset.value = 0; loadRows() }
}

watch(pageSize, () => { offset.value = 0; loadRows() })
watch(sort, () => { offset.value = 0; loadRows() })

function exportCsv() {
  tableRef.value?.getTable()?.download('csv', `afl-${selected.value}.csv`)
}

const grouped = computed(() => ({
  Tables: tables.value.filter(t => t.type === 'table'),
  Views:  tables.value.filter(t => t.type === 'view'),
}))

onMounted(loadTables)
</script>

<template>
  <div style="display:flex; gap:24px; align-items:flex-start">
    <!-- Table list sidebar -->
    <div style="width:260px; flex-shrink:0">
      <v-card variant="outlined" rounded="lg">
        <v-card-title class="text-caption font-weight-bold text-uppercase text-medium-emphasis pa-3 pb-1">
          <v-icon size="small" class="mr-1">mdi-database-outline</v-icon>
          Tables &amp; Views
        </v-card-title>
        <v-list density="compact" nav class="pa-1">
          <template v-for="(items, group) in grouped" :key="group">
            <v-list-subheader v-if="items.length" class="text-caption">{{ group }}</v-list-subheader>
            <v-list-item
              v-for="t in items"
              :key="t.name"
              :active="selected === t.name"
              :prepend-icon="t.type === 'view' ? 'mdi-table-eye' : 'mdi-table'"
              density="compact"
              @click="selectTable(t.name)"
            >
              <v-list-item-title class="text-body-2 font-mono">{{ t.name }}</v-list-item-title>
              <template #append>
                <span class="text-caption text-medium-emphasis">{{ t.rowCount?.toLocaleString() ?? '—' }}</span>
              </template>
            </v-list-item>
          </template>
        </v-list>
      </v-card>
    </div>

    <!-- Data area -->
    <div style="flex:1; min-width:0">
      <div v-if="!selected" class="text-medium-emphasis pa-8 text-center">
        Select a table or view to browse its rows.
      </div>

      <template v-else>
        <v-row align="center" dense class="mb-4">
          <v-col cols="auto">
            <span class="text-h6 font-weight-medium font-mono">{{ selected }}</span>
          </v-col>
          <v-col cols="auto">
            <v-select
              v-model="sort" :items="sortOptions" label="Sort by"
              density="comfortable" variant="outlined" hide-details style="min-width:170px"
            />
          </v-col>
          <v-col cols="auto">
            <v-btn
              @click="toggleDir" :disabled="!sort" variant="tonal" size="small"
              :prepend-icon="dir === 'asc' ? 'mdi-sort-ascending' : 'mdi-sort-descending'"
            >
              {{ dir === 'asc' ? 'Asc' : 'Desc' }}
            </v-btn>
          </v-col>
          <v-col cols="auto">
            <v-select
              v-model.number="pageSize" :items="PAGE_SIZE_OPTIONS" label="Rows / page"
              density="comfortable" variant="outlined" hide-details style="min-width:120px"
            />
          </v-col>
          <v-spacer />
          <v-col cols="auto">
            <v-btn @click="exportCsv" :disabled="!rows.length" variant="tonal" size="small" prepend-icon="mdi-download">
              Export CSV
            </v-btn>
          </v-col>
        </v-row>

        <v-row align="center" dense class="mb-4">
          <v-col cols="auto">
            <span class="text-caption text-medium-emphasis">
              {{ total ? `Showing ${rowStart.toLocaleString()}–${rowEnd.toLocaleString()} of ${total.toLocaleString()} rows` : 'No rows' }}
            </span>
          </v-col>
          <v-spacer />
          <v-col v-if="totalPages > 1" cols="auto" class="d-flex align-center ga-1">
            <v-btn icon="mdi-chevron-double-left" size="small" variant="text" :disabled="page === 1" @click="goToPage(1)" />
            <v-btn icon="mdi-chevron-left" size="small" variant="text" :disabled="page === 1" @click="goToPage(page - 1)" />
            <span class="text-caption text-medium-emphasis px-2">Page {{ page.toLocaleString() }} of {{ totalPages.toLocaleString() }}</span>
            <v-btn icon="mdi-chevron-right" size="small" variant="text" :disabled="page === totalPages" @click="goToPage(page + 1)" />
            <v-btn icon="mdi-chevron-double-right" size="small" variant="text" :disabled="page === totalPages" @click="goToPage(totalPages)" />
          </v-col>
        </v-row>

        <v-alert v-if="error" type="error" density="compact" closable class="font-mono text-sm mb-4" @click:close="error = ''">
          {{ error }}
        </v-alert>

        <DataTable
          v-if="columns.length"
          ref="tableRef"
          :columns="columns"
          :data="rows"
          layout="fitDataStretch"
          :page-size="0"
        />
      </template>
    </div>
  </div>
</template>
