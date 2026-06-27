<script setup>
import { ref, computed } from 'vue'
import { useTheme } from 'vuetify'

// Generic calibration chart: one or more datasets of [{ x, y, games }], drawn as
// a sample-size-scaled scatter plus a sample-weighted least-squares trend line,
// with a hover readout. y is a probability (0–1); x is an integer bucket.
const props = defineProps({
  // [{ key, label, color, points: [{ x, y, games }] }]
  datasets:    { type: Array,  default: () => [] },
  xMax:        { type: Number, default: 80 },
  xStep:       { type: Number, default: 10 },
  xLabel:      { type: String, default: '' },
  xHoverLabel: { type: String, default: 'x' },
  yMin:        { type: Number, default: 0.4 },
  yMax:        { type: Number, default: 1.0 },
  yMidline:    { type: Number, default: null },  // optional dashed reference line
  activeKey:   { type: String, default: null },  // emphasised dataset; null = all
})

const theme = useTheme()
const fg = computed(() => (theme.global.current.value.dark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.6)'))

const W = 640, H = 320
const M = { l: 46, r: 14, t: 26, b: 38 }
const plotW = W - M.l - M.r
const plotH = H - M.t - M.b

const xPx = (x) => M.l + (x / props.xMax) * plotW
const yPx = (p) => M.t + (1 - (p - props.yMin) / (props.yMax - props.yMin)) * plotH

function fit(points) {
  let Wt = 0, sx = 0, sy = 0
  const pts = []
  for (const { x, y, games } of points) {
    if (!games || games <= 0 || x > props.xMax) continue
    pts.push([x, y, games]); Wt += games; sx += games * x; sy += games * y
  }
  if (Wt === 0) return null
  const mx = sx / Wt, my = sy / Wt
  let cov = 0, vx = 0
  for (const [x, y, g] of pts) { cov += g * (x - mx) * (y - my); vx += g * (x - mx) ** 2 }
  const slope = vx === 0 ? 0 : cov / vx
  return { slope, intercept: my - slope * mx }
}

const isActive = (key) => props.activeKey == null || props.activeKey === key

const series = computed(() => props.datasets.map(ds => {
  const t = fit(ds.points)
  return {
    ...ds,
    dots: ds.points
      .filter(p => p.games > 0 && p.x <= props.xMax)
      .map(p => ({ x: xPx(p.x), y: yPx(p.y), r: Math.min(7, 2 + Math.sqrt(p.games) * 0.55) })),
    trend: t
      ? { x1: xPx(0), y1: yPx(t.intercept), x2: xPx(props.xMax), y2: yPx(t.intercept + t.slope * props.xMax) }
      : null,
    map: new Map(ds.points.map(p => [p.x, p])),
    active: isActive(ds.key),
  }
}))

const xTicks = computed(() => Array.from({ length: Math.floor(props.xMax / props.xStep) + 1 }, (_, i) => i * props.xStep))
const yTicks = computed(() => {
  const out = []
  for (let v = props.yMin; v <= props.yMax + 1e-9; v += 0.1) out.push(Math.round(v * 100) / 100)
  return out
})

const svgEl = ref(null)
const hoverX = ref(null)

function onMove(e) {
  const el = svgEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const svgX = ((e.clientX - rect.left) / rect.width) * W
  const x = Math.round(((svgX - M.l) / plotW) * props.xMax)
  hoverX.value = Math.max(0, Math.min(props.xMax, x))
}
function onLeave() { hoverX.value = null }

const hover = computed(() => {
  const x = hoverX.value
  if (x == null) return null
  return {
    x, px: xPx(x),
    points: series.value.map(s => {
      const p = s.map.get(x)
      return { key: s.key, label: s.label, color: s.color, y: p?.y, py: p ? yPx(p.y) : null, games: p?.games ?? 0 }
    }),
  }
})

const pct = (p) => (p == null ? '—' : `${Math.round(p * 100)}%`)
</script>

<template>
  <div :style="{ color: fg }">
    <svg
      ref="svgEl" :viewBox="`0 0 ${W} ${H}`" style="width:100%; touch-action:none"
      @mousemove="onMove" @mouseleave="onLeave"
    >
      <!-- Y gridlines + labels -->
      <g v-for="t in yTicks" :key="`y${t}`">
        <line
          :x1="M.l" :x2="W - M.r" :y1="yPx(t)" :y2="yPx(t)"
          stroke="currentColor" :stroke-opacity="t === yMidline ? 0.35 : 0.1"
          :stroke-dasharray="t === yMidline ? '4,3' : undefined" stroke-width="1"
        />
        <text :x="M.l - 6" :y="yPx(t) + 3" text-anchor="end" font-size="11" fill="currentColor">
          {{ Math.round(t * 100) }}%
        </text>
      </g>

      <!-- X ticks + labels -->
      <g v-for="t in xTicks" :key="`x${t}`">
        <line :x1="xPx(t)" :x2="xPx(t)" :y1="M.t" :y2="H - M.b" stroke="currentColor" stroke-opacity="0.06" stroke-width="1" />
        <text :x="xPx(t)" :y="H - M.b + 16" text-anchor="middle" font-size="11" fill="currentColor">{{ t }}</text>
      </g>
      <text :x="M.l + plotW / 2" :y="H - 4" text-anchor="middle" font-size="11" fill="currentColor">{{ xLabel }}</text>

      <defs>
        <clipPath id="scatter-plot"><rect :x="M.l" :y="M.t" :width="plotW" :height="plotH" /></clipPath>
      </defs>

      <!-- Datasets: scatter (dot size = sample count) + weighted trend line -->
      <template v-for="s in series" :key="s.key">
        <g :opacity="s.active ? 1 : 0.5">
          <circle v-for="(d, i) in s.dots" :key="i" :cx="d.x" :cy="d.y" :r="d.r" :fill="s.color" fill-opacity="0.7" />
        </g>
        <line
          v-if="s.trend" :x1="s.trend.x1" :y1="s.trend.y1" :x2="s.trend.x2" :y2="s.trend.y2"
          :stroke="s.color" stroke-width="2" stroke-dasharray="6,4" clip-path="url(#scatter-plot)"
          :opacity="s.active ? 0.9 : 0.45"
        />
      </template>

      <!-- Hover crosshair + points -->
      <g v-if="hover">
        <line :x1="hover.px" :x2="hover.px" :y1="M.t" :y2="H - M.b" stroke="currentColor" stroke-opacity="0.25" stroke-width="1" />
        <template v-for="p in hover.points" :key="p.key">
          <circle v-if="p.py != null" :cx="hover.px" :cy="p.py" r="3.5" :fill="p.color" />
        </template>
      </g>

      <!-- Legend -->
      <g font-size="11">
        <template v-for="(s, i) in series" :key="`leg${s.key}`">
          <circle :cx="M.l + 8 + i * 102" :cy="M.t - 12" r="4" :fill="s.color" fill-opacity="0.7" />
          <text :x="M.l + 16 + i * 102" :y="M.t - 8" fill="currentColor">{{ s.label }}</text>
        </template>
      </g>
    </svg>

    <!-- Readout -->
    <div class="readout">
      <template v-if="hover">
        <span>{{ xHoverLabel }} <b>{{ hover.x }}</b></span>
        <span v-for="p in hover.points" :key="p.key" :style="{ color: p.color }">
          {{ p.label }} {{ pct(p.y) }} <span style="opacity:0.6">({{ p.games }})</span>
        </span>
      </template>
      <span v-else style="opacity:0.6">Each dot = a bucket; dot size = sample count. Hover to read the values (games in brackets).</span>
    </div>
  </div>
</template>

<style scoped>
.readout {
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  min-height: 18px;
}
</style>
