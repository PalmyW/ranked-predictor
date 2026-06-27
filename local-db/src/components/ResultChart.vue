<script setup>
import { ref, computed, watch, inject, onMounted, onUnmounted, nextTick } from 'vue'
import { useTheme } from 'vuetify'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

// Plots an arbitrary query result set. The user picks the chart type, the x-axis
// (category) column and one or more y-axis (numeric) columns, and the chart
// rebuilds live. Reused by the Ask page; works for any { columns, rows }.
const props = defineProps({
  columns: { type: Array, default: () => [] },   // string column names
  rows:    { type: Array, default: () => [] },   // array of row objects
})

const theme = useTheme()
const isDark = computed(() => theme.global.current.value.dark)
const teamMap = inject('teamMap', null)

const MAX_POINTS = 50
const PALETTE = [
  '#42a5f5', '#66bb6a', '#ffa726', '#ab47bc', '#ef5350',
  '#26c6da', '#ec407a', '#d4e157', '#8d6e63', '#78909c',
]

const CHART_TYPES = [
  { value: 'bar',           label: 'Bar',            icon: 'mdi-chart-bar' },
  { value: 'horizontalBar', label: 'Horizontal bar', icon: 'mdi-chart-bar-stacked' },
  { value: 'line',          label: 'Line',           icon: 'mdi-chart-line' },
  { value: 'area',          label: 'Area',           icon: 'mdi-chart-areaspline' },
  { value: 'pie',           label: 'Pie',            icon: 'mdi-chart-pie' },
  { value: 'doughnut',      label: 'Doughnut',       icon: 'mdi-chart-donut' },
  { value: 'scatter',       label: 'Scatter',        icon: 'mdi-chart-scatter-plot' },
]

// Classify columns by sampling the first non-null value.
function isNumericCol(col) {
  for (const r of props.rows) {
    const v = r[col]
    if (v == null) continue
    return typeof v === 'number' && isFinite(v)
  }
  return false
}

const numericCols = computed(() => props.columns.filter(isNumericCol))
const labelCols   = computed(() => props.columns.filter(c => !numericCols.value.includes(c)))

const chartType = ref('bar')
const xCol = ref(null)
const yCols = ref([])

const singleY = computed(() => ['pie', 'doughnut', 'scatter'].includes(chartType.value))
// Scatter needs a numeric x; the others read a category/label for x.
const xOptions = computed(() => (chartType.value === 'scatter' ? numericCols.value : (labelCols.value.length ? labelCols.value : props.columns)))

// Pick sensible defaults whenever the data or chart type changes.
function applyDefaults() {
  const xs = xOptions.value
  if (!xs.includes(xCol.value)) xCol.value = xs[0] ?? props.columns[0] ?? null
  const ys = numericCols.value.filter(c => c !== xCol.value)
  if (singleY.value) {
    if (!ys.includes(yCols.value[0])) yCols.value = ys.length ? [ys[0]] : []
    else yCols.value = [yCols.value[0]]
  } else {
    const kept = yCols.value.filter(c => ys.includes(c))
    yCols.value = kept.length ? kept : (ys.length ? [ys[0]] : [])
  }
}

// The select flips between multiple (array) and single (scalar); keep yCols an
// array internally and adapt via this proxy so the chart logic stays uniform.
const yModel = computed({
  get: () => (singleY.value ? (yCols.value[0] ?? null) : yCols.value),
  set: (v) => { yCols.value = singleY.value ? (v == null ? [] : [v]) : (v ?? []) },
})

const canPlot = computed(() => xCol.value && yCols.value.length > 0)
const truncated = computed(() => props.rows.length > MAX_POINTS)

function tickColor() { return isDark.value ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)' }
function gridColor() { return isDark.value ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }

function labelFor(col, value) {
  if (value == null) return ''
  if (teamMap?.value && /team_id$/i.test(col)) return teamMap.value[value] ?? value
  return String(value)
}

const canvasRef = ref(null)
let chart = null

function buildConfig() {
  const rows = props.rows.slice(0, MAX_POINTS)
  const tc = tickColor()
  const gc = gridColor()
  const type = chartType.value

  if (type === 'scatter') {
    const yc = yCols.value[0]
    return {
      type: 'scatter',
      data: {
        datasets: [{
          label: `${yc} vs ${xCol.value}`,
          data: rows.map(r => ({ x: r[xCol.value], y: r[yc] })),
          backgroundColor: PALETTE[0],
        }],
      },
      options: scatterOptions(tc, gc),
    }
  }

  const labels = rows.map(r => labelFor(xCol.value, r[xCol.value]))

  if (type === 'pie' || type === 'doughnut') {
    const yc = yCols.value[0]
    return {
      type,
      data: {
        labels,
        datasets: [{
          label: yc,
          data: rows.map(r => r[yc]),
          backgroundColor: rows.map((_, i) => PALETTE[i % PALETTE.length]),
          borderWidth: 0,
        }],
      },
      options: pieOptions(tc),
    }
  }

  // bar / horizontalBar / line / area
  const isLine = type === 'line' || type === 'area'
  const datasets = yCols.value.map((yc, i) => ({
    label: yc,
    data: rows.map(r => r[yc]),
    backgroundColor: isLine ? hexA(PALETTE[i % PALETTE.length], 0.25) : PALETTE[i % PALETTE.length],
    borderColor: PALETTE[i % PALETTE.length],
    borderWidth: isLine ? 2 : 0,
    fill: type === 'area',
    tension: 0.3,
    pointRadius: type === 'line' ? 2 : 0,
  }))
  return {
    type: isLine ? 'line' : 'bar',
    data: { labels, datasets },
    options: cartesianOptions(tc, gc, type === 'horizontalBar'),
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function baseOptions(tc) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: yCols.value.length > 1 || singleY.value, labels: { color: tc } },
      tooltip: { enabled: true },
    },
  }
}
function cartesianOptions(tc, gc, horizontal) {
  return {
    ...baseOptions(tc),
    indexAxis: horizontal ? 'y' : 'x',
    scales: {
      x: { ticks: { color: tc }, grid: { color: gc } },
      y: { ticks: { color: tc }, grid: { color: gc }, beginAtZero: true },
    },
  }
}
function scatterOptions(tc, gc) {
  return {
    ...baseOptions(tc),
    scales: {
      x: { type: 'linear', title: { display: true, text: xCol.value, color: tc }, ticks: { color: tc }, grid: { color: gc } },
      y: { title: { display: true, text: yCols.value[0], color: tc }, ticks: { color: tc }, grid: { color: gc } },
    },
  }
}
function pieOptions(tc) {
  return { ...baseOptions(tc), plugins: { ...baseOptions(tc).plugins, legend: { display: true, position: 'right', labels: { color: tc } } } }
}

function render() {
  if (!canvasRef.value) return
  if (chart) { chart.destroy(); chart = null }
  if (!canPlot.value) return
  chart = new Chart(canvasRef.value, buildConfig())
}

watch([() => props.columns, () => props.rows], applyDefaults, { immediate: true })
watch(chartType, applyDefaults)
watch([chartType, xCol, yCols, isDark, () => props.rows], () => nextTick(render), { deep: true })

onMounted(() => nextTick(render))
onUnmounted(() => { if (chart) { chart.destroy(); chart = null } })
</script>

<template>
  <div>
    <v-row dense align="center" class="mb-3">
      <v-col cols="12" sm="auto">
        <v-btn-toggle v-model="chartType" mandatory density="comfortable" variant="outlined" divided>
          <v-btn v-for="t in CHART_TYPES" :key="t.value" :value="t.value" size="small" :title="t.label">
            <v-icon>{{ t.icon }}</v-icon>
          </v-btn>
        </v-btn-toggle>
      </v-col>
      <v-col cols="6" sm="3" md="2">
        <v-select
          v-model="xCol"
          :items="xOptions"
          :label="chartType === 'scatter' ? 'X (numeric)' : 'X axis'"
          density="compact" variant="outlined" hide-details
        />
      </v-col>
      <v-col cols="6" sm="4" md="3">
        <v-select
          v-model="yModel"
          :items="numericCols"
          :label="singleY ? 'Value' : 'Y axis (one or more)'"
          :multiple="!singleY"
          :chips="!singleY"
          :closable-chips="!singleY"
          density="compact" variant="outlined" hide-details
        />
      </v-col>
      <v-col v-if="truncated" cols="auto">
        <span class="text-caption text-medium-emphasis">Showing first {{ MAX_POINTS }} rows</span>
      </v-col>
    </v-row>

    <div v-if="canPlot" class="result-chart">
      <canvas ref="canvasRef" />
    </div>
    <div v-else class="text-medium-emphasis text-body-2 pa-6 text-center">
      Pick an X axis and at least one numeric value to plot.
    </div>
  </div>
</template>

<style scoped>
.result-chart {
  position: relative;
  height: calc(100vh - 280px);
  min-height: 320px;
}
</style>
