<script setup>
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps({
  columns:      { type: Array,   required: true },
  data:         { type: Array,   default: () => [] },
  layout:       { type: String,  default: 'fitDataStretch' },
  height:       { type: String,  default: 'calc(100vh - 180px)' },
  pageSize:     { type: Number,  default: 50 },
  clickable:    { type: Boolean, default: false },
  selectedKey:  { type: String,  default: null },
  selectedVal:  { default: null },
})

const emit = defineEmits(['row-click', 'table-ready'])

const sortField = ref('')
const sortDir   = ref('asc')
const page      = ref(1)
const hiddenCols = ref(new Set())

// Flatten grouped columns to a single list
const flatCols = computed(() => {
  const out = []
  for (const col of props.columns) {
    if (col.columns) out.push(...col.columns)
    else out.push(col)
  }
  return out
})

const visibleCols = computed(() =>
  flatCols.value.filter(c => !hiddenCols.value.has(c.field))
)

const hasGroups = computed(() => props.columns.some(c => c.columns))

// Build the two header rows needed when column groups are present
const headerMeta = computed(() => {
  if (!hasGroups.value) {
    return {
      row1: visibleCols.value.map(c => ({ ...c, _rowspan: 1, _colspan: 1, _isGroup: false })),
      row2: [],
    }
  }
  const row1 = []
  const row2 = []
  for (const col of props.columns) {
    if (col.columns) {
      const vis = col.columns.filter(c => !hiddenCols.value.has(c.field))
      if (vis.length) {
        row1.push({ title: col.title, _rowspan: 1, _colspan: vis.length, _isGroup: true })
        row2.push(...vis)
      }
    } else if (!hiddenCols.value.has(col.field)) {
      row1.push({ ...col, _rowspan: 2, _colspan: 1, _isGroup: false })
    }
  }
  return { row1, row2 }
})

// Sorting
const sortedData = computed(() => {
  if (!sortField.value) return props.data
  const col = flatCols.value.find(c => c.field === sortField.value)
  const isNum = col?.sorter === 'number'
  return [...props.data].sort((a, b) => {
    const av = a[sortField.value]
    const bv = b[sortField.value]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = isNum ? av - bv : String(av).localeCompare(String(bv))
    return sortDir.value === 'desc' ? -cmp : cmp
  })
})

// Pagination
const totalRows  = computed(() => sortedData.value.length)
const totalPages = computed(() =>
  props.pageSize > 0 ? Math.max(1, Math.ceil(totalRows.value / props.pageSize)) : 1
)

const pagedData = computed(() => {
  if (props.pageSize <= 0) return sortedData.value
  const start = (page.value - 1) * props.pageSize
  return sortedData.value.slice(start, start + props.pageSize)
})

const pageNums = computed(() => {
  const total = totalPages.value
  const cur   = page.value
  const start = Math.max(1, cur - 2)
  const end   = Math.min(total, cur + 2)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
})

const rowStart = computed(() => Math.min((page.value - 1) * props.pageSize + 1, totalRows.value))
const rowEnd   = computed(() => Math.min(page.value * props.pageSize, totalRows.value))

watch([() => props.data, sortField, sortDir], () => { page.value = 1 })

// Cell rendering — fake Tabulator's cell API so existing formatters work unchanged
function renderCell(row, col) {
  if (!col.formatter) {
    const v = row[col.field]
    if (v == null) return '—'
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(1)
    return String(v)
  }
  return col.formatter({
    getValue: () => row[col.field],
    getRow:   () => ({ getData: () => row }),
  })
}

function toggleSort(field) {
  if (!field) return
  if (sortField.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDir.value = 'asc'
  }
}

function colStyle(col) {
  const s = {}
  if (col.width)    { s.width = `${col.width}px`; s.minWidth = `${col.width}px` }
  if (col.minWidth) s.minWidth = `${col.minWidth}px`
  if (col.hozAlign === 'right')  s.textAlign = 'right'
  if (col.hozAlign === 'center') s.textAlign = 'center'
  return s
}

// Public API — mirrors the Tabulator instance API used by the views
function showColumn(field) {
  const s = new Set(hiddenCols.value)
  s.delete(field)
  hiddenCols.value = s
}

function hideColumn(field) {
  const s = new Set(hiddenCols.value)
  s.add(field)
  hiddenCols.value = s
}

function download(_format, filename) {
  const cols = visibleCols.value
  const header = cols.map(c => c.field).join(',')
  const rows = sortedData.value.map(row =>
    cols.map(c => {
      const v = row[c.field]
      if (v == null) return ''
      const s = String(v)
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')
  )
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename ?? 'export.csv' })
  a.click()
  URL.revokeObjectURL(url)
}

const api = { showColumn, hideColumn, download }
defineExpose({ getTable: () => api })
onMounted(() => emit('table-ready', api))
</script>

<template>
  <div class="dt">
    <div class="dt-scroll" :style="{ height }">
      <table class="dt-table">
        <thead class="dt-head">
          <!-- Row 1: group labels (colspan) + individual cols (rowspan 2) -->
          <tr>
            <th
              v-for="(col, i) in headerMeta.row1"
              :key="col.field ?? `g${i}`"
              :colspan="col._colspan"
              :rowspan="col._rowspan"
              :class="['dt-th', !col._isGroup && 'dt-th--sort']"
              :style="colStyle(col)"
              @click="!col._isGroup && toggleSort(col.field)"
            >
              <span class="dt-th-label">
                {{ col.title }}
                <span v-if="!col._isGroup && sortField === col.field" class="dt-sort-icon">
                  {{ sortDir === 'asc' ? '↑' : '↓' }}
                </span>
              </span>
            </th>
          </tr>
          <!-- Row 2: individual cols inside groups -->
          <tr v-if="headerMeta.row2.length">
            <th
              v-for="col in headerMeta.row2"
              :key="col.field"
              class="dt-th dt-th--sort dt-th--sub"
              :style="colStyle(col)"
              @click="toggleSort(col.field)"
            >
              <span class="dt-th-label">
                {{ col.title }}
                <span v-if="sortField === col.field" class="dt-sort-icon">
                  {{ sortDir === 'asc' ? '↑' : '↓' }}
                </span>
              </span>
            </th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="(row, i) in pagedData"
            :key="i"
            :class="['dt-row', i % 2 === 1 && 'dt-row--even', clickable && 'dt-row--click', selectedKey && row[selectedKey] === selectedVal && 'dt-row--selected']"
            @click="emit('row-click', { event: $event, data: row })"
          >
            <td
              v-for="col in visibleCols"
              :key="col.field"
              class="dt-td"
              :style="colStyle(col)"
            >
              <span v-if="col.formatter" v-html="renderCell(row, col)" />
              <template v-else>{{ renderCell(row, col) }}</template>
            </td>
          </tr>

          <tr v-if="!pagedData.length">
            <td :colspan="visibleCols.length" class="dt-empty">No data</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination footer -->
    <div class="dt-footer">
      <span class="dt-counter">
        {{ totalRows > 0 ? `Showing ${rowStart}–${rowEnd} of ${totalRows.toLocaleString()} rows` : 'No rows' }}
      </span>
      <div v-if="totalPages > 1" class="dt-pages">
        <button class="dt-page dt-page--nav" :disabled="page === 1" @click="page = 1">First</button>
        <button class="dt-page dt-page--nav" :disabled="page === 1" @click="page--">Prev</button>
        <button
          v-for="p in pageNums" :key="p"
          :class="['dt-page', p === page && 'dt-page--active']"
          @click="page = p"
        >{{ p }}</button>
        <button class="dt-page dt-page--nav" :disabled="page === totalPages" @click="page++">Next</button>
        <button class="dt-page dt-page--nav" :disabled="page === totalPages" @click="page = totalPages">Last</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Container ───────────────────────────────────────────────────────────── */
.dt {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 12px;
  overflow: hidden;
  font-size: 13px;
  color: rgb(var(--v-theme-on-surface));
  background: rgb(var(--v-theme-surface));
}

/* ── Scroll area ─────────────────────────────────────────────────────────── */
.dt-scroll {
  overflow: auto;
}

/* ── Table ───────────────────────────────────────────────────────────────── */
.dt-table {
  width: 100%;
  border-collapse: collapse;
  white-space: nowrap;
}

/* ── Header ──────────────────────────────────────────────────────────────── */

/*
 * Sticky table headers only work reliably when:
 *  1. isolation:isolate on thead creates a self-contained stacking context
 *     that sits above tbody regardless of what tbody cells do.
 *  2. th backgrounds are FULLY OPAQUE — two background layers composite
 *     the tint over the solid surface so nothing bleeds through.
 */
.dt-head {
  isolation: isolate;
  position: relative;
  z-index: 10;
}

.dt-th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: color-mix(in srgb, rgb(var(--v-theme-on-surface)) 6%, rgb(var(--v-theme-surface)));
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  user-select: none;
}

.dt-th--sub {
  top: 33px;
  background: color-mix(in srgb, rgb(var(--v-theme-on-surface)) 3%, rgb(var(--v-theme-surface)));
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.dt-th--sort {
  cursor: pointer;
}

.dt-th--sort:hover {
  background: color-mix(in srgb, rgb(var(--v-theme-on-surface)) 11%, rgb(var(--v-theme-surface)));
  color: rgba(var(--v-theme-on-surface), 0.8);
}

.dt-th-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dt-sort-icon {
  color: rgb(var(--v-theme-primary));
  font-size: 10px;
}

/* ── Rows ────────────────────────────────────────────────────────────────── */
.dt-row {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.07);
  transition: background 80ms;
}

.dt-row--even {
  background: rgba(var(--v-theme-on-surface), 0.025);
}

.dt-row:hover {
  background: rgba(var(--v-theme-on-surface), 0.07) !important;
}

.dt-row--click {
  cursor: pointer;
}

.dt-row--click:hover {
  background: rgba(var(--v-theme-primary), 0.1) !important;
}

.dt-row--selected {
  background: rgba(var(--v-theme-primary), 0.14) !important;
  box-shadow: inset 3px 0 0 rgb(var(--v-theme-primary));
}

/* ── Cells ───────────────────────────────────────────────────────────────── */
.dt-td {
  padding: 7px 12px;
  color: rgb(var(--v-theme-on-surface));
}

.dt-empty {
  padding: 40px 12px;
  text-align: center;
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-style: italic;
}

/* ── Footer ──────────────────────────────────────────────────────────────── */
.dt-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.dt-counter {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.dt-pages {
  display: flex;
  align-items: center;
  gap: 2px;
}

.dt-page {
  background: transparent;
  border: none;
  border-radius: 50%;
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  font-size: 13px;
  font-family: inherit;
  color: rgba(var(--v-theme-on-surface), 0.7);
  cursor: pointer;
  transition: background 120ms;
}

.dt-page--nav {
  border-radius: 6px;
  font-size: 12px;
}

.dt-page:hover:not(:disabled) {
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgb(var(--v-theme-on-surface));
}

.dt-page--active {
  background: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;
}

.dt-page:disabled {
  opacity: 0.35;
  cursor: default;
}
</style>
