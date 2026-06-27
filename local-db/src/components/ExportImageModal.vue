<script setup>
import { ref, computed, nextTick, watch, onMounted } from 'vue'
import { toPng } from 'html-to-image'
import { fmt } from '@/constants/stats.js'
import BrandLogo from '@/components/BrandLogo.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  columns: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const previewRef = ref(null)
const titleRef   = ref(null)
const downloading = ref(false)
const exportTitle = ref('')
const highlighted = ref(new Set())

// Sorting (driven by the arrow control in each header)
const sortField = ref('')
const sortDir   = ref('asc')

function toggleSort(field) {
  if (sortField.value === field) {
    if (sortDir.value === 'asc') sortDir.value = 'desc'
    else { sortField.value = ''; sortDir.value = 'asc' }   // third click clears
  } else {
    sortField.value = field
    sortDir.value = 'asc'
  }
}

// Editable headers — content lives in the DOM (captured directly in the PNG), so
// we set the initial text via refs rather than interpolation (which would fight
// the caret on every keystroke, exactly like the title field).
const headerRefs = ref([])
function setHeaderRef(el, ci) {
  headerRefs.value[ci] = el
  if (el && el.innerText === '') el.innerText = props.columns[ci]?.title ?? ''
}

// Highlights are by visible-row index, which sorting reshuffles — clear them.
watch([sortField, sortDir], () => { highlighted.value = new Set() })

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      exportTitle.value = props.title
      highlighted.value = new Set()
      sortField.value = ''
      sortDir.value = 'asc'
      nextTick(() => {
        if (titleRef.value) titleRef.value.innerText = props.title
        props.columns.forEach((c, i) => {
          if (headerRefs.value[i]) headerRefs.value[i].innerText = c.title
        })
      })
    }
  },
)

function toggleHighlight(ri) {
  const next = new Set(highlighted.value)
  next.has(ri) ? next.delete(ri) : next.add(ri)
  highlighted.value = next
}

function onTitleInput(e) {
  exportTitle.value = e.target.innerText.replace(/\n/g, ' ').trim()
}

function onTitleKeydown(e) {
  if (e.key === 'Enter') e.preventDefault()
}

const THEMES = [
  {
    label: 'AFL Dark',
    bg: '#0a0d14',
    text: '#e8eaf0',
    sub: '#8892b0',
    accent: '#4f7ef7',
    head: 'rgba(255,255,255,0.07)',
    alt: 'rgba(255,255,255,0.03)',
    border: 'rgba(255,255,255,0.09)',
  },
  {
    label: 'Slate',
    bg: '#1a1d27',
    text: '#e8eaf0',
    sub: '#8892b0',
    accent: '#4f7ef7',
    head: 'rgba(255,255,255,0.06)',
    alt: 'rgba(255,255,255,0.03)',
    border: 'rgba(255,255,255,0.08)',
  },
  {
    label: 'Light',
    bg: '#f0f4f8',
    text: '#0f172a',
    sub: '#475569',
    accent: '#3b5bdb',
    head: 'rgba(0,0,0,0.05)',
    alt: 'rgba(0,0,0,0.025)',
    border: 'rgba(0,0,0,0.09)',
  },
]
const themeIdx = ref(0)
const theme = computed(() => THEMES[themeIdx.value])
// Highlighted-row background: accent tint (~25% alpha via 8-digit hex)
const highlightBg = computed(() => theme.value.accent + '40')

const rowLimitOpts = computed(() => {
  const opts = [10, 20, 50, 100].filter((n) => n < props.rows.length)
  opts.push(props.rows.length)
  return [...new Set(opts)].sort((a, b) => a - b)
})
const rowLimit = ref(50)

const sortedRows = computed(() => {
  if (!sortField.value) return props.rows
  const numeric = isNum({ field: sortField.value })
  return [...props.rows].sort((a, b) => {
    const av = a[sortField.value]
    const bv = b[sortField.value]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    const cmp = numeric ? av - bv : String(av).localeCompare(String(bv))
    return sortDir.value === 'desc' ? -cmp : cmp
  })
})
const visibleRows = computed(() => sortedRows.value.slice(0, rowLimit.value))

function cellText(row, col) {
  if (!col.formatter) return fmt(row[col.field]) ?? '—'
  try {
    const out = col.formatter({
      getValue: () => row[col.field],
      getRow: () => ({ getData: () => row }),
    })
    if (typeof out !== 'string') return fmt(row[col.field]) ?? '—'
    return out.replace(/<[^>]*>/g, '').trim() || '—'
  } catch {
    return String(row[col.field] ?? '—')
  }
}

function isNum(col) {
  return typeof props.rows[0]?.[col.field] === 'number'
}

function toFilename(s) {
  return (s || 'afl-stats')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function downloadImage() {
  if (!previewRef.value) return
  downloading.value = true
  await nextTick()
  await new Promise((r) => setTimeout(r, 60))
  try {
    const dataUrl = await toPng(previewRef.value, { pixelRatio: 2 })
    const a = document.createElement('a')
    a.download = `${toFilename(exportTitle.value)}.png`
    a.href = dataUrl
    a.click()
  } finally {
    downloading.value = false
  }
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="1100"
    scrollable
  >
    <v-card rounded="lg">
      <!-- Header -->
      <v-card-title class="d-flex align-center justify-space-between pa-4 pb-3">
        <div class="d-flex align-center gap-2">
          <v-icon color="primary">mdi-image-outline</v-icon>
          <span>Export as Image</span>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="close" />
      </v-card-title>

      <v-divider />

      <!-- Controls -->
      <div
        class="pa-4 d-flex align-center flex-wrap gap-4"
        style="background: rgba(var(--v-theme-on-surface), 0.02)"
      >
        <div class="d-flex align-center gap-2">
          <span
            class="text-caption text-medium-emphasis"
            style="white-space: nowrap"
            >Theme</span
          >
          <v-btn-toggle
            v-model="themeIdx"
            density="compact"
            variant="outlined"
            mandatory
            rounded="lg"
          >
            <v-btn v-for="(t, i) in THEMES" :key="i" :value="i" size="small">{{
              t.label
            }}</v-btn>
          </v-btn-toggle>
        </div>

        <v-select
          v-model="rowLimit"
          :items="rowLimitOpts"
          label="Max rows"
          variant="outlined"
          density="compact"
          hide-details
          style="min-width: 100px; max-width: 130px"
        />

        <span class="text-caption text-medium-emphasis ml-auto" style="white-space: nowrap">
          Edit a heading to rename · ⇅ to sort · click rows to highlight
        </span>
      </div>

      <v-divider />

      <!-- Preview area -->
      <v-card-text style="background: #0b0c10; overflow: auto; padding: 32px">
        <!-- ref="previewRef" — this exact element is captured as the PNG -->
        <div
          ref="previewRef"
          :style="{
            background: theme.bg,
            color: theme.text,
            fontFamily: '\'Inter\', \'Helvetica Neue\', Arial, sans-serif',
            padding: '36px',
            display: 'block',
            width: 'max-content',
            borderRadius: '12px',
          }"
        >
          <!-- Title area — always shown so the editable region is always present -->
          <div
            :style="{
              marginBottom: '24px',
              paddingBottom: '16px',
              borderBottom: `2px solid ${theme.accent}`,
            }"
          >
            <div
              :style="{
                color: theme.sub,
                fontSize: '10px',
                fontWeight: '700',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                marginBottom: '6px',
              }"
            >
              SirPalmyThing Stats
            </div>
            <div
              ref="titleRef"
              contenteditable="true"
              spellcheck="false"
              @input="onTitleInput"
              @keydown="onTitleKeydown"
              :data-placeholder="'Click to add a title…'"
              :style="{
                fontSize: '22px',
                fontWeight: '800',
                letterSpacing: '0.01em',
                color: exportTitle ? theme.text : theme.sub,
                outline: 'none',
                minWidth: '120px',
                cursor: 'text',
                borderRadius: '4px',
              }"
              class="title-editable"
            />
          </div>

          <!-- Table -->
          <table
            :style="{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
              lineHeight: '1.4',
            }"
          >
            <thead>
              <tr>
                <th
                  v-for="(col, ci) in columns"
                  :key="col.field"
                  :style="{
                    background: theme.head,
                    color: theme.sub,
                    fontWeight: '600',
                    fontSize: '11px',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    padding: '9px 14px',
                    borderBottom: `2px solid ${theme.border}`,
                    whiteSpace: 'nowrap',
                  }"
                >
                  <span
                    :style="{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      justifyContent: ci === 0 ? 'flex-start' : isNum(col) ? 'flex-end' : 'flex-start',
                    }"
                  >
                    <span
                      :ref="el => setHeaderRef(el, ci)"
                      contenteditable="true"
                      spellcheck="false"
                      @keydown="onTitleKeydown"
                      class="header-editable"
                      :style="{ outline: 'none', cursor: 'text', borderRadius: '3px', minWidth: '10px' }"
                    />
                    <span
                      class="sort-arrow"
                      @click="toggleSort(col.field)"
                      :style="{
                        cursor: 'pointer',
                        userSelect: 'none',
                        fontSize: '11px',
                        lineHeight: '1',
                        color: sortField === col.field ? theme.accent : theme.sub,
                        opacity: sortField === col.field ? 1 : 0.5,
                        display: (downloading && sortField !== col.field) ? 'none' : 'inline',
                      }"
                    >{{ sortField === col.field ? (sortDir === 'asc' ? '▲' : '▼') : '⇅' }}</span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, ri) in visibleRows"
                :key="ri"
                style="cursor: pointer"
                @click="toggleHighlight(ri)"
              >
                <td
                  v-for="(col, ci) in columns"
                  :key="col.field"
                  :style="{
                    padding: '8px 14px',
                    textAlign: ci === 0 ? 'left' : isNum(col) ? 'right' : 'left',
                    background: highlighted.has(ri) ? highlightBg : ri % 2 === 0 ? 'transparent' : theme.alt,
                    borderBottom: `1px solid ${theme.border}`,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                    color: theme.text,
                    fontWeight: ri === 0 ? '500' : '400',
                  }"
                >
                  {{ cellText(row, col) }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Footer -->
          <div
            :style="{
              marginTop: '14px',
              color: theme.sub,
              fontSize: '11px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }"
          >
            <!-- Palmy Data tile logo -->
            <BrandLogo />
            <span>
              {{
                visibleRows.length +
                (rows.length > visibleRows.length ? ` of ${rows.length}` : '')
              }}
              rows
            </span>
          </div>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="tonal" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-download"
          :loading="downloading"
          @click="downloadImage"
        >
          Download PNG
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.title-editable:hover {
  background: rgba(255, 255, 255, 0.05);
}
.title-editable:focus {
  background: rgba(255, 255, 255, 0.07);
  box-shadow: 0 0 0 2px rgba(79, 126, 247, 0.5);
}
.title-editable:empty::before {
  content: attr(data-placeholder);
  opacity: 0.4;
  pointer-events: none;
}
.header-editable:hover {
  background: rgba(255, 255, 255, 0.07);
}
.header-editable:focus {
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 0 2px rgba(79, 126, 247, 0.5);
}
.sort-arrow:hover {
  opacity: 1 !important;
}
</style>
