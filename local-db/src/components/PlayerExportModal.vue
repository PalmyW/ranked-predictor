<script setup>
import { ref, computed, nextTick, watch, onUnmounted } from 'vue'
import { toPng } from 'html-to-image'
import { Chart } from 'chart.js'
import { fmt, STAR_SIGN_EMOJI } from '@/constants/stats.js'
import BrandLogo from '@/components/BrandLogo.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // 'chart' renders the player's graph; 'ratings' renders the rankings grid.
  mode:   { type: String, default: 'chart' },
  player: { type: Object, default: () => ({}) }, // { name, photoUrl, starSign, teamName, position }
  label:  { type: String, default: '' },         // stat label / headline shown above the content
  rangeLabel: { type: String, default: '' },      // small tag e.g. "Last 5 Games"
  chart:  { type: Object, default: null },         // { type, data, yMin, yMax, xAutoSkip, xMaxTicks }
  ranks:  { type: Array, default: () => [] },       // [{ base, label, value, rank, total }]
})
const emit = defineEmits(['update:modelValue'])

const previewRef  = ref(null)
const canvasRef   = ref(null)
const downloading = ref(false)
let modalChart = null

const THEMES = [
  { label: 'AFL Dark', bg: '#0a0d14', text: '#e8eaf0', sub: '#8892b0', accent: '#4f7ef7', panel: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.09)' },
  { label: 'Slate',    bg: '#1a1d27', text: '#e8eaf0', sub: '#8892b0', accent: '#4f7ef7', panel: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)' },
  { label: 'Light',    bg: '#f0f4f8', text: '#0f172a', sub: '#475569', accent: '#3b5bdb', panel: 'rgba(0,0,0,0.035)', border: 'rgba(0,0,0,0.09)' },
]
const themeIdx = ref(0)
const theme = computed(() => THEMES[themeIdx.value])

const RANK_LIMITS = [10, 20, 30, 50]
const rankLimit = ref(20)
const limitOpts = computed(() => {
  const opts = RANK_LIMITS.filter(n => n < props.ranks.length)
  opts.push(props.ranks.length)
  return [...new Set(opts)]
})
const visibleRanks = computed(() => props.ranks.slice(0, rankLimit.value))

const starEmoji = computed(() => STAR_SIGN_EMOJI[props.player?.starSign] ?? '')

// Route the remote photo through the same-origin proxy so html-to-image can
// inline it without tripping cross-origin restrictions on export.
const photoSrc = computed(() => {
  const u = props.player?.photoUrl
  return u ? `/api/image?url=${encodeURIComponent(u)}` : ''
})

function rankColor(rank, total) {
  if (rank === 1) return '#f59e0b'
  const pct = rank / total
  if (pct <= 0.1) return '#22c55e'
  if (pct <= 0.25) return theme.value.accent
  if (pct >= 0.9) return '#ef4444'
  return null // muted — use panel/sub
}

// ── Chart rebuild (re-rendered with export-theme colors) ───────────────────────

function destroyChart() {
  if (modalChart) { modalChart.destroy(); modalChart = null }
}

function buildChart() {
  destroyChart()
  if (props.mode !== 'chart' || !props.chart || !canvasRef.value) return
  const t = theme.value
  const data = JSON.parse(JSON.stringify(props.chart.data)) // detach from the live chart
  const axis = pos => ({
    position: pos,
    grid: { color: t.border, drawOnChartArea: pos !== 'right' },
    ticks: { color: t.sub },
    min: props.chart.yMin,
    max: props.chart.yMax,
  })
  modalChart = new Chart(canvasRef.value, {
    type: props.chart.type,
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: true, labels: { color: t.sub, boxWidth: 12, padding: 12, font: { size: 12 } } },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          grid: { color: t.border },
          ticks: { color: t.sub, maxRotation: 45, font: { size: 11 }, autoSkip: props.chart.xAutoSkip ?? true, maxTicksLimit: props.chart.xMaxTicks },
        },
        y: { ...axis('left') },
        y1: { ...axis('right') },
      },
    },
  })
}

watch([() => props.modelValue, themeIdx], ([open]) => {
  if (open && props.mode === 'chart') nextTick(buildChart)
  if (!open) destroyChart()
})
onUnmounted(destroyChart)

// ── Download ──────────────────────────────────────────────────────────────────

function toFilename(s) {
  return (s || 'afl-player').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function downloadImage() {
  if (!previewRef.value) return
  downloading.value = true
  await nextTick()
  await new Promise(r => setTimeout(r, 80))
  try {
    const dataUrl = await toPng(previewRef.value, { pixelRatio: 2, cacheBust: true })
    const a = document.createElement('a')
    a.download = `${toFilename(`${props.player?.name}-${props.label}`)}.png`
    a.href = dataUrl
    a.click()
  } catch (err) {
    console.error('Image export failed', err)
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
    max-width="1000"
    scrollable
  >
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center justify-space-between pa-4 pb-3">
        <div class="d-flex align-center gap-2">
          <v-icon color="primary">mdi-image-outline</v-icon>
          <span>Export as Image</span>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="close" />
      </v-card-title>

      <v-divider />

      <!-- Controls -->
      <div class="pa-4 d-flex align-center flex-wrap gap-4" style="background: rgba(var(--v-theme-on-surface), 0.02)">
        <div class="d-flex align-center gap-2">
          <span class="text-caption text-medium-emphasis" style="white-space: nowrap">Theme</span>
          <v-btn-toggle v-model="themeIdx" density="compact" variant="outlined" mandatory rounded="lg">
            <v-btn v-for="(t, i) in THEMES" :key="i" :value="i" size="small">{{ t.label }}</v-btn>
          </v-btn-toggle>
        </div>
        <v-select
          v-if="mode === 'ratings'"
          v-model="rankLimit"
          :items="limitOpts"
          label="Max stats"
          variant="outlined"
          density="compact"
          hide-details
          style="min-width: 100px; max-width: 130px"
        />
      </div>

      <v-divider />

      <!-- Preview -->
      <v-card-text style="background: #0b0c10; overflow: auto; padding: 32px">
        <div
          ref="previewRef"
          :style="{
            background: theme.bg,
            color: theme.text,
            fontFamily: '\'Inter\', \'Helvetica Neue\', Arial, sans-serif',
            padding: '36px',
            borderRadius: '12px',
            width: mode === 'chart' ? '820px' : '760px',
          }"
        >
          <!-- Brand line -->
          <div :style="{ color: theme.sub, fontSize: '10px', fontWeight: '700', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '14px' }">
            SirPalmyThing Stats
          </div>

          <!-- Player header -->
          <div :style="{ display: 'flex', alignItems: 'center', gap: '18px', paddingBottom: '16px', marginBottom: '20px', borderBottom: `2px solid ${theme.accent}` }">
            <img
              v-if="photoSrc"
              :src="photoSrc"
              :style="{ width: '72px', height: '72px', borderRadius: '12px', objectFit: 'cover', background: theme.panel, flexShrink: 0 }"
            />
            <div style="flex: 1; min-width: 0">
              <div :style="{ fontSize: '26px', fontWeight: '800', letterSpacing: '0.01em', lineHeight: 1.1 }">{{ player.name }}</div>
              <div :style="{ color: theme.sub, fontSize: '13px', marginTop: '4px' }">
                <span v-if="player.teamName">{{ player.teamName }}</span>
                <span v-if="player.position"> · {{ player.position }}</span>
              </div>
            </div>
            <div v-if="player.starSign" :style="{ textAlign: 'right', flexShrink: 0 }">
              <div :style="{ fontSize: '28px', lineHeight: 1 }">{{ starEmoji }}</div>
              <div :style="{ color: theme.sub, fontSize: '11px', marginTop: '3px', letterSpacing: '0.04em' }">{{ player.starSign }}</div>
            </div>
          </div>

          <!-- Stat label headline -->
          <div :style="{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '16px' }">
            <div :style="{ fontSize: '18px', fontWeight: '700', color: theme.text }">{{ label }}</div>
            <div
              v-if="rangeLabel"
              :style="{ fontSize: '11px', fontWeight: '600', color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: '999px', padding: '2px 10px', letterSpacing: '0.04em' }"
            >{{ rangeLabel }}</div>
          </div>

          <!-- Content: chart -->
          <div v-if="mode === 'chart'" :style="{ height: '380px', background: theme.panel, borderRadius: '10px', padding: '14px' }">
            <canvas ref="canvasRef" />
          </div>

          <!-- Content: ratings grid -->
          <div
            v-else
            :style="{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }"
          >
            <div
              v-for="r in visibleRanks"
              :key="r.base"
              :style="{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '7px 0', borderBottom: `1px solid ${theme.border}` }"
            >
              <span :style="{ color: theme.sub, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }">{{ r.label }}</span>
              <span style="display: flex; align-items: center; gap: 10px; flex-shrink: 0">
                <span :style="{ fontSize: '14px', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }">{{ fmt(r.value) }}</span>
                <span
                  :style="{
                    fontSize: '12px',
                    fontWeight: '700',
                    borderRadius: '5px',
                    padding: '2px 7px',
                    background: rankColor(r.rank, r.total) ?? theme.panel,
                    color: rankColor(r.rank, r.total) ? '#fff' : theme.sub,
                    fontVariantNumeric: 'tabular-nums',
                  }"
                >#{{ r.rank }}<span style="opacity: 0.8"> / {{ r.total }}</span></span>
              </span>
            </div>
          </div>

          <!-- Footer -->
          <div :style="{ marginTop: '18px', color: theme.sub, fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }">
            <BrandLogo />
            <span>{{ player.name }}</span>
          </div>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="tonal" @click="close">Cancel</v-btn>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-download" :loading="downloading" @click="downloadImage">
          Download PNG
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
