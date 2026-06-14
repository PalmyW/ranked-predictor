<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { toPng } from 'html-to-image'
import { fmt } from '@/constants/stats.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  columns: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const previewRef = ref(null)
const downloading = ref(false)
const exportTitle = ref('')

watch(
  () => props.modelValue,
  (open) => {
    if (open) exportTitle.value = props.title
  },
)

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

const rowLimitOpts = computed(() => {
  const opts = [10, 20, 50, 100].filter((n) => n < props.rows.length)
  opts.push(props.rows.length)
  return [...new Set(opts)].sort((a, b) => a - b)
})
const rowLimit = ref(50)
const visibleRows = computed(() => props.rows.slice(0, rowLimit.value))

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
        <v-text-field
          v-model="exportTitle"
          label="Title"
          variant="outlined"
          density="compact"
          hide-details
          prepend-inner-icon="mdi-format-title"
          style="min-width: 220px; max-width: 380px; flex: 1"
        />

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
          <!-- Title area -->
          <div
            v-if="exportTitle"
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
              :style="{
                fontSize: '22px',
                fontWeight: '800',
                letterSpacing: '0.01em',
                color: theme.text,
              }"
            >
              {{ exportTitle }}
            </div>
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
                  v-for="col in columns"
                  :key="col.field"
                  :style="{
                    background: theme.head,
                    color: theme.sub,
                    fontWeight: '600',
                    fontSize: '11px',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    padding: '9px 14px',
                    textAlign: isNum(col) ? 'right' : 'left',
                    borderBottom: `2px solid ${theme.border}`,
                    whiteSpace: 'nowrap',
                  }"
                >
                  {{ col.title }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, ri) in visibleRows" :key="ri">
                <td
                  v-for="col in columns"
                  :key="col.field"
                  :style="{
                    padding: '8px 14px',
                    textAlign: isNum(col) ? 'right' : 'left',
                    background: ri % 2 === 0 ? 'transparent' : theme.alt,
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
            <svg
              width="73"
              height="28"
              viewBox="0 0 73 28"
              xmlns="http://www.w3.org/2000/svg"
            >
              <!-- Row 1 tiles -->
              <rect
                x="0"
                y="0"
                width="13"
                height="13"
                fill="#1e293b"
                rx="1.5"
              />
              <rect
                x="15"
                y="0"
                width="13"
                height="13"
                fill="#1e293b"
                rx="1.5"
              />
              <rect
                x="30"
                y="0"
                width="13"
                height="13"
                fill="#1e293b"
                rx="1.5"
              />
              <rect
                x="45"
                y="0"
                width="13"
                height="13"
                fill="#1e293b"
                rx="1.5"
              />
              <rect
                x="60"
                y="0"
                width="13"
                height="13"
                fill="#1e293b"
                rx="1.5"
              />
              <!-- Row 2 tiles -->
              <rect
                x="0"
                y="15"
                width="13"
                height="13"
                fill="#1e293b"
                rx="1.5"
              />
              <rect
                x="15"
                y="15"
                width="13"
                height="13"
                fill="#1e293b"
                rx="1.5"
              />
              <rect
                x="30"
                y="15"
                width="13"
                height="13"
                fill="#1e293b"
                rx="1.5"
              />
              <rect
                x="45"
                y="15"
                width="13"
                height="13"
                fill="#1e293b"
                rx="1.5"
              />
              <rect
                x="60"
                y="15"
                width="13"
                height="13"
                fill="#1e293b"
                rx="1.5"
              />
              <!-- Row 1 letters: P A L M Y -->
              <text
                x="6.5"
                y="6.5"
                dominant-baseline="central"
                text-anchor="middle"
                font-family="'Arial Black', Arial, sans-serif"
                font-size="7.5"
                font-weight="900"
                fill="white"
              >
                P
              </text>
              <text
                x="21.5"
                y="6.5"
                dominant-baseline="central"
                text-anchor="middle"
                font-family="'Arial Black', Arial, sans-serif"
                font-size="7.5"
                font-weight="900"
                fill="white"
              >
                A
              </text>
              <text
                x="36.5"
                y="6.5"
                dominant-baseline="central"
                text-anchor="middle"
                font-family="'Arial Black', Arial, sans-serif"
                font-size="7.5"
                font-weight="900"
                fill="white"
              >
                L
              </text>
              <text
                x="51.5"
                y="6.5"
                dominant-baseline="central"
                text-anchor="middle"
                font-family="'Arial Black', Arial, sans-serif"
                font-size="7.5"
                font-weight="900"
                fill="white"
              >
                M
              </text>
              <text
                x="66.5"
                y="6.5"
                dominant-baseline="central"
                text-anchor="middle"
                font-family="'Arial Black', Arial, sans-serif"
                font-size="7.5"
                font-weight="900"
                fill="white"
              >
                Y
              </text>
              <!-- Row 2 letters: D A T A / -->
              <text
                x="6.5"
                y="21.5"
                dominant-baseline="central"
                text-anchor="middle"
                font-family="'Arial Black', Arial, sans-serif"
                font-size="7.5"
                font-weight="900"
                fill="white"
              >
                D
              </text>
              <text
                x="21.5"
                y="21.5"
                dominant-baseline="central"
                text-anchor="middle"
                font-family="'Arial Black', Arial, sans-serif"
                font-size="7.5"
                font-weight="900"
                fill="white"
              >
                A
              </text>
              <text
                x="36.5"
                y="21.5"
                dominant-baseline="central"
                text-anchor="middle"
                font-family="'Arial Black', Arial, sans-serif"
                font-size="7.5"
                font-weight="900"
                fill="white"
              >
                T
              </text>
              <text
                x="51.5"
                y="21.5"
                dominant-baseline="central"
                text-anchor="middle"
                font-family="'Arial Black', Arial, sans-serif"
                font-size="7.5"
                font-weight="900"
                fill="white"
              >
                A
              </text>
              <text
                x="66.5"
                y="21.5"
                dominant-baseline="central"
                text-anchor="middle"
                font-family="'Arial Black', Arial, sans-serif"
                font-size="7.5"
                font-weight="900"
                fill="#64748b"
              >
                /
              </text>
            </svg>
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
          variant="filled"
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
