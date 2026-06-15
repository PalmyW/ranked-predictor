<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useTheme } from 'vuetify'
import {
  Chart, LineController, BarController, CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, Tooltip, Legend, Filler,
} from 'chart.js'

Chart.register(
  LineController, BarController, CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, Tooltip, Legend, Filler,
)

const props = defineProps({
  matchHistory: { type: Array, default: () => [] },
  seasonStats:  { type: Array, default: () => [] },
})

const theme = useTheme()
const isDark = computed(() => theme.global.current.value.dark)

// ── Stat options ──────────────────────────────────────────────────────────────

const STAT_OPTIONS = [
  { label: 'Behinds',                      matchKey: 'behinds',        seasonKey: 'avg_behinds' },
  { label: 'Bounces',                       matchKey: 'bounces',        seasonKey: 'avg_bounces' },
  { label: 'Centre Bounce Attendances',     matchKey: 'cba',            seasonKey: 'avg_centre_bounce_attendances' },
  { label: 'Centre Clearances',            matchKey: 'centre_clr',     seasonKey: 'avg_centre_clearances' },
  { label: 'Clangers',                     matchKey: 'clangers',       seasonKey: 'avg_clangers' },
  { label: 'Contest Def Loss %',           matchKey: 'cdlp',           seasonKey: 'avg_contest_def_loss_percentage' },
  { label: 'Contest Def Losses',           matchKey: 'cdl',            seasonKey: 'avg_contest_def_losses' },
  { label: 'Contest Def One On Ones',      matchKey: 'cdo1',           seasonKey: 'avg_contest_def_one_on_ones' },
  { label: 'Contest Off One On Ones',      matchKey: 'coo1',           seasonKey: 'avg_contest_off_one_on_ones' },
  { label: 'Contest Off Wins',             matchKey: 'cow',            seasonKey: 'avg_contest_off_wins' },
  { label: 'Contest Off Wins %',           matchKey: 'cowp',           seasonKey: 'avg_contest_off_wins_percentage' },
  { label: 'Contested Marks',              matchKey: 'cont_marks',     seasonKey: 'avg_contested_marks' },
  { label: 'Contested Possession Rate',    matchKey: 'cont_poss_rate', seasonKey: 'avg_contested_possession_rate' },
  { label: 'Contested Possessions',        matchKey: 'cont_poss',      seasonKey: 'avg_contested_possessions' },
  { label: 'Def Half Pressure Acts',       matchKey: 'dhpa',           seasonKey: 'avg_def_half_pressure_acts' },
  { label: 'Disposal Efficiency',          matchKey: 'dis_eff',        seasonKey: 'avg_disposal_efficiency' },
  { label: 'Disposals',                    matchKey: 'disposals',      seasonKey: 'avg_disposals' },
  { label: 'Dream Team Points',            matchKey: 'dtp',            seasonKey: 'avg_dream_team_points' },
  { label: 'Effective Disposals',          matchKey: 'eff_dis',        seasonKey: 'avg_effective_disposals' },
  { label: 'Effective Kicks',              matchKey: 'eff_kicks',      seasonKey: 'avg_effective_kicks' },
  { label: 'F50 Ground Ball Gets',         matchKey: 'f50_gbg',        seasonKey: 'avg_f50_ground_ball_gets' },
  { label: 'Frees Against',                matchKey: 'frees_against',  seasonKey: 'avg_frees_against' },
  { label: 'Frees For',                    matchKey: 'frees_for',      seasonKey: 'avg_frees_for' },
  { label: 'Goal Accuracy',               matchKey: 'goal_acc',       seasonKey: 'avg_goal_accuracy' },
  { label: 'Goal Assists',                 matchKey: 'goal_assists',   seasonKey: 'avg_goal_assists' },
  { label: 'Goals',                        matchKey: 'goals',          seasonKey: 'avg_goals' },
  { label: 'Ground Ball Gets',             matchKey: 'gbg',            seasonKey: 'avg_ground_ball_gets' },
  { label: 'Handballs',                    matchKey: 'handballs',      seasonKey: 'avg_handballs' },
  { label: 'Hitout To Advantage Rate',     matchKey: 'htar',           seasonKey: 'avg_hitout_to_advantage_rate' },
  { label: 'Hitout Win %',                 matchKey: 'hwp',            seasonKey: 'avg_hitout_win_percentage' },
  { label: 'Hitouts',                      matchKey: 'hitouts',        seasonKey: 'avg_hitouts' },
  { label: 'Hitouts To Advantage',         matchKey: 'hta',            seasonKey: 'avg_hitouts_to_advantage' },
  { label: 'Inside 50s',                   matchKey: 'inside50s',      seasonKey: 'avg_inside50s' },
  { label: 'Intercept Marks',              matchKey: 'int_marks',      seasonKey: 'avg_intercept_marks' },
  { label: 'Intercepts',                   matchKey: 'intercepts',     seasonKey: 'avg_intercepts' },
  { label: 'Kick Efficiency',              matchKey: 'kick_eff',       seasonKey: 'avg_kick_efficiency' },
  { label: 'Kick To Handball Ratio',       matchKey: 'k2hb',           seasonKey: 'avg_kick_to_handball_ratio' },
  { label: 'Kickins',                      matchKey: 'kickins',        seasonKey: 'avg_kickins' },
  { label: 'Kickins Playon',               matchKey: 'kickins_po',     seasonKey: 'avg_kickins_playon' },
  { label: 'Kicks',                        matchKey: 'kicks',          seasonKey: 'avg_kicks' },
  { label: 'Marks',                        matchKey: 'marks',          seasonKey: 'avg_marks' },
  { label: 'Marks Inside 50',              matchKey: 'marks_i50',      seasonKey: 'avg_marks_inside50' },
  { label: 'Marks On Lead',                matchKey: 'mol',            seasonKey: 'avg_marks_on_lead' },
  { label: 'Metres Gained',                matchKey: 'metres_gained',  seasonKey: 'avg_metres_gained' },
  { label: 'One Percenters',               matchKey: 'one_pct',        seasonKey: 'avg_one_percenters' },
  { label: 'Pressure Acts',                matchKey: 'pressure_acts',  seasonKey: 'avg_pressure_acts' },
  { label: 'Rating Points',                matchKey: 'rating_pts',     seasonKey: 'avg_rating_points' },
  { label: 'Rebound 50s',                  matchKey: 'rebound50s',     seasonKey: 'avg_rebound50s' },
  { label: 'Ruck Contests',                matchKey: 'ruck_cont',      seasonKey: 'avg_ruck_contests' },
  { label: 'Score Involvements',           matchKey: 'score_inv',      seasonKey: 'avg_score_involvements' },
  { label: 'Score Launches',               matchKey: 'score_launches', seasonKey: 'avg_score_launches' },
  { label: 'Shots at Goal',                matchKey: 'shots_at_goal',  seasonKey: 'avg_shots_at_goal' },
  { label: 'Spoils',                       matchKey: 'spoils',         seasonKey: 'avg_spoils' },
  { label: 'Stoppage Clearances',          matchKey: 'stoppage_clr',   seasonKey: 'avg_stoppage_clearances' },
  { label: 'Tackles',                      matchKey: 'tackles',        seasonKey: 'avg_tackles' },
  { label: 'Tackles Inside 50',            matchKey: 'tackles_i50',    seasonKey: 'avg_tackles_inside50' },
  { label: 'Time On Ground %',             matchKey: 'tog',            seasonKey: 'avg_time_on_ground_percentage' },
  { label: 'Total Clearances',             matchKey: 'clearances',     seasonKey: 'avg_total_clearances' },
  { label: 'Total Possessions',            matchKey: 'total_poss',     seasonKey: 'avg_total_possessions' },
  { label: 'Turnovers',                    matchKey: 'turnovers',      seasonKey: 'avg_turnovers' },
  { label: 'Uncontested Possessions',      matchKey: 'uncont_poss',    seasonKey: 'avg_uncontested_possessions' },
]

// ── Form range options ────────────────────────────────────────────────────────

const RANGE_OPTIONS = [
  { label: 'L5',       value: 5 },
  { label: 'L10',      value: 10 },
  { label: 'L20',      value: 20 },
  { label: 'Season',   value: 'season' },
  { label: 'L50',      value: 50 },
  { label: 'Career',   value: 'career' },
]

// ── Persisted state ───────────────────────────────────────────────────────────

const LS_TAB   = 'player-chart-tab'
const LS_STAT  = 'player-chart-stat'
const LS_RANGE = 'player-chart-range'

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback } catch { return fallback }
}

const activeTab     = ref(lsGet(LS_TAB,   'form'))
const selectedStat  = ref(STAT_OPTIONS.find(o => o.matchKey === lsGet(LS_STAT, null)) ?? STAT_OPTIONS[0])
const selectedRange = ref(lsGet(LS_RANGE, 5))

watch(activeTab,     v => localStorage.setItem(LS_TAB,   JSON.stringify(v)))
watch(selectedStat,  v => localStorage.setItem(LS_STAT,  JSON.stringify(v.matchKey)))
watch(selectedRange, v => localStorage.setItem(LS_RANGE, JSON.stringify(v)))

// ── Derived data ──────────────────────────────────────────────────────────────

const formData = computed(() => {
  const matches = [...props.matchHistory] // newest-first
  if (selectedRange.value === 'career') {
    return matches.reverse() // oldest-first, every game
  }
  if (selectedRange.value === 'season') {
    if (!matches.length) return []
    const currentYear = matches[0].year
    return matches.filter(m => m.year === currentYear).reverse()
  }
  return matches.slice(0, selectedRange.value).reverse()
})

const trendData = computed(() => [...props.seasonStats].reverse()) // oldest-first

// ── Chart ─────────────────────────────────────────────────────────────────────

const canvasRef = ref(null)
let chart = null

function tickColor() {
  return isDark.value ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)'
}
function gridColor() {
  return isDark.value ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'
}

function buildConfig() {
  const stat = selectedStat.value
  const tc   = tickColor()
  const gc   = gridColor()

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    plugins: {
      legend: {
        display: true,
        labels: { color: tc, boxWidth: 12, padding: 12, font: { size: 12 } },
      },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: {
        grid: { color: gc },
        ticks: { color: tc, maxRotation: 45, font: { size: 11 } },
      },
      y: {
        grid: { color: gc },
        ticks: { color: tc },
        beginAtZero: true,
      },
    },
  }

  if (activeTab.value === 'form') {
    const data   = formData.value
    const count  = data.length
    // Career view can be hundreds of games, so prefix the season to orient the (thinned) axis.
    const labels = data.map(m =>
      selectedRange.value === 'career'
        ? `${m.year} R${m.round_number} ${m.opponent ?? ''}`.trim()
        : `Rd${m.round_number} ${m.opponent ?? ''}`
    )
    const values = data.map(m => m[stat.matchKey] ?? null)
    const nonNull = values.filter(v => v !== null)
    const avg = nonNull.length ? nonNull.reduce((s, v) => s + v, 0) / nonNull.length : 0

    // Scale point size and axis-label density to the number of games on screen.
    const pointRadius      = count > 80 ? 0 : count > 40 ? 2 : count > 20 ? 4 : 6
    const pointHoverRadius = count > 40 ? 5 : 8
    const maxTicksLimit    = count > 25 ? 20 : count

    const resultColors = data.map(m =>
      m.result === 'W' ? 'rgba(76,175,80,0.9)'
      : m.result === 'L' ? 'rgba(244,67,54,0.8)'
      : 'rgba(158,158,158,0.8)'
    )

    const formOptions = {
      ...baseOptions,
      scales: {
        ...baseOptions.scales,
        x: {
          ...baseOptions.scales.x,
          ticks: { ...baseOptions.scales.x.ticks, autoSkip: true, maxTicksLimit },
        },
      },
    }

    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: stat.label,
            data: values,
            borderColor: 'rgba(99,102,241,1)',
            backgroundColor: 'rgba(99,102,241,0.12)',
            tension: 0.3,
            pointRadius,
            pointHoverRadius,
            pointBackgroundColor: resultColors,
            pointBorderColor: 'rgba(99,102,241,0.8)',
            pointBorderWidth: 2,
            fill: true,
          },
          {
            label: `Avg ${avg.toFixed(1)}`,
            data: values.map(() => +avg.toFixed(2)),
            borderColor: 'rgba(239,68,68,0.65)',
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: formOptions,
    }
  } else {
    const data   = trendData.value
    const labels = data.map(d => String(d.year))
    const values = data.map(d => d[stat.seasonKey] ?? null)

    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: `Avg ${stat.label}`,
          data: values,
          backgroundColor: 'rgba(99,102,241,0.65)',
          borderColor: 'rgba(99,102,241,1)',
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          tooltip: { mode: 'index', intersect: false },
        },
      },
    }
  }
}

function renderChart() {
  if (!canvasRef.value) return
  if (chart) { chart.destroy(); chart = null }
  const cfg = buildConfig()
  chart = new Chart(canvasRef.value, cfg)
}

watch(
  [activeTab, selectedStat, selectedRange, () => props.matchHistory, () => props.seasonStats, isDark],
  () => nextTick(renderChart),
)

onMounted(() => nextTick(renderChart))
onUnmounted(() => { if (chart) { chart.destroy(); chart = null } })
</script>

<template>
  <v-card variant="outlined" class="mb-4">
    <v-card-text class="pb-2 pt-3">
      <div class="d-flex align-center flex-wrap gap-3 mb-3">
        <!-- Tab toggle -->
        <v-btn-toggle
          v-model="activeTab"
          mandatory
          density="compact"
          color="primary"
          variant="outlined"
          divided
        >
          <v-btn value="form" size="small" prepend-icon="mdi-chart-line">Form</v-btn>
          <v-btn value="trend" size="small" prepend-icon="mdi-chart-bar">Season Trend</v-btn>
        </v-btn-toggle>

        <!-- Range buttons (form only) -->
        <v-btn-toggle
          v-if="activeTab === 'form'"
          v-model="selectedRange"
          mandatory
          density="compact"
          color="secondary"
          variant="outlined"
          divided
        >
          <v-btn
            v-for="r in RANGE_OPTIONS"
            :key="r.value"
            :value="r.value"
            size="small"
          >{{ r.label }}</v-btn>
        </v-btn-toggle>

        <v-spacer />

        <!-- Stat picker -->
        <v-select
          v-model="selectedStat"
          :items="STAT_OPTIONS"
          item-title="label"
          return-object
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 220px; min-width: 160px"
        />
      </div>

      <!-- No data state -->
      <div
        v-if="(activeTab === 'form' && !formData.length) || (activeTab === 'trend' && !trendData.length)"
        class="text-center text-medium-emphasis py-8"
        style="height: 240px; display:flex; align-items:center; justify-content:center;"
      >
        <span>No data available</span>
      </div>

      <!-- Chart canvas -->
      <div v-else style="height: 260px; position: relative">
        <canvas ref="canvasRef" />
      </div>
    </v-card-text>
  </v-card>
</template>
