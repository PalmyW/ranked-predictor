<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi.js'

const props = defineProps({ matchId: { type: String, default: null } })
const { api } = useApi()
const router  = useRouter()

const matchDetails = ref(null)
const loading      = ref(false)

async function fetchDetails(id) {
  if (!id) { matchDetails.value = null; return }
  loading.value = true
  try { matchDetails.value = await api(`/api/match-details/${id}`) } catch { matchDetails.value = null }
  finally { loading.value = false }
}

watch(() => props.matchId, fetchDetails, { immediate: true })

// ── Score worm SVG ────────────────────────────────────────────────────────────

const wormSvg = computed(() => {
  if (!matchDetails.value?.score_worm_json) return null
  let parsed
  try { parsed = JSON.parse(matchDetails.value.score_worm_json) } catch { return null }
  const events = parsed.scoringEvents ?? []
  if (!events.length) return null

  const W = 800, H = 140, PADY = 16
  const numPeriods  = Math.max(...events.map(e => e.periodNumber), 4)
  const quarterWidth = W / numPeriods

  const periodMaxSecs = {}
  for (const ev of events) {
    if (!periodMaxSecs[ev.periodNumber] || ev.periodSeconds > periodMaxSecs[ev.periodNumber])
      periodMaxSecs[ev.periodNumber] = ev.periodSeconds
  }

  const toX = (period, seconds) => {
    const qMax = periodMaxSecs[period] || 2000
    return (period - 1) * quarterWidth + (seconds / qMax) * quarterWidth
  }

  const raw = [{ x: 0, margin: 0 }]
  for (const ev of events) raw.push({ x: toX(ev.periodNumber, ev.periodSeconds), margin: ev.aggregateHomeScore - ev.aggregateAwayScore })

  const stepPts = [{ x: 0, m: 0 }]
  for (let i = 1; i < raw.length; i++) {
    stepPts.push({ x: raw[i].x, m: raw[i - 1].margin })
    stepPts.push({ x: raw[i].x, m: raw[i].margin })
  }
  stepPts.push({ x: W, m: raw[raw.length - 1].margin })

  const margins = raw.map(p => p.margin)
  const absMax  = Math.ceil(Math.max(Math.abs(Math.min(...margins)), Math.abs(Math.max(...margins)), 6) / 10) * 10
  const toY     = m => H / 2 - (m / absMax) * (H / 2 - PADY)
  const zero    = toY(0)

  const svgPts  = stepPts.map(p => `${p.x.toFixed(1)},${toY(p.m).toFixed(1)}`).join(' ')
  const fillPts = `0,${zero.toFixed(1)} ${svgPts} ${W},${zero.toFixed(1)}`
  const qSeps   = Array.from({ length: numPeriods - 1 }, (_, i) => ((i + 1) * quarterWidth).toFixed(1))
  const qLabels = Array.from({ length: numPeriods }, (_, i) => ({ label: `Q${i + 1}`, x: ((i + 0.5) * quarterWidth).toFixed(1) }))
  const gridLines = []
  for (let g = 10; g <= absMax; g += 10) { gridLines.push(toY(g).toFixed(1)); gridLines.push(toY(-g).toFixed(1)) }

  return { svgPts, fillPts, qSeps, qLabels, gridLines, zero: zero.toFixed(1), W, H }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function qScore(side, q) {
  const d = matchDetails.value
  const g = d[`${side}_q${q}_goals`], b = d[`${side}_q${q}_behinds`], s = d[`${side}_q${q}_score`]
  return g == null ? '—' : `${g}.${b} (${s})`
}

function marginLabel(margin, homeAbbr, awayAbbr) {
  if (margin == null) return '—'
  if (margin === 0)   return 'Level'
  return margin > 0 ? `${homeAbbr} +${margin}` : `${awayAbbr} +${Math.abs(margin)}`
}

function secsToMin(secs) {
  if (secs == null) return ''
  const m = Math.floor(secs / 60)
  const s = String(Math.round(secs % 60)).padStart(2, '0')
  return `${m}:${s}`
}

function peakTeamAbbr(team) {
  if (!matchDetails.value) return ''
  return team === 'H' ? matchDetails.value.home_abbr : team === 'A' ? matchDetails.value.away_abbr : ''
}
</script>

<template>
  <div v-if="loading" class="d-flex justify-center py-6">
    <v-progress-circular indeterminate color="primary" size="24" />
  </div>

  <v-card v-else-if="matchDetails" color="surface" rounded="lg" elevation="2">
    <v-card-text class="pa-4">

      <!-- Header -->
      <div class="d-flex align-center justify-space-between mb-3 flex-wrap ga-2">
        <div class="d-flex align-center ga-3">
          <span class="text-body-1 font-weight-bold">{{ matchDetails.home_team_name }}</span>
          <span class="text-caption text-medium-emphasis">vs</span>
          <span class="text-body-1 font-weight-bold">{{ matchDetails.away_team_name }}</span>
          <v-chip v-if="matchDetails.weather_type" size="x-small" variant="tonal" color="primary">
            {{ matchDetails.weather_description }}
            <template v-if="matchDetails.weather_temp_celsius != null">&nbsp;· {{ matchDetails.weather_temp_celsius }}°C</template>
          </v-chip>
        </div>
        <div class="d-flex align-center ga-2">
          <span class="text-caption text-medium-emphasis">
            {{ matchDetails.venue_name }}<template v-if="matchDetails.round_name"> · {{ matchDetails.round_name }}</template>
          </span>
          <v-btn
            size="x-small" variant="tonal" color="primary"
            :to="{ name: 'match-stats', query: { match: matchId } }"
          >Player Stats →</v-btn>
        </div>
      </div>

      <!-- Quarter score grid -->
      <div class="quarter-grid mb-3">
        <div class="qg-row qg-header">
          <div class="qg-team"></div>
          <div class="qg-cell" v-for="h in ['Q1','Q2','Q3','Q4','Final']" :key="h">{{ h }}</div>
        </div>
        <div class="qg-row">
          <div class="qg-team">{{ matchDetails.home_abbr }}</div>
          <div v-for="q in [1,2,3,4]" :key="q" class="qg-cell"
            :class="{ 'qg-win': matchDetails[`home_q${q}_score`] > matchDetails[`away_q${q}_score`] }"
          >{{ qScore('home', q) }}</div>
          <div class="qg-cell qg-final" :class="{ 'qg-win': matchDetails.home_score > matchDetails.away_score }">
            {{ matchDetails.home_goals }}.{{ matchDetails.home_behinds }} ({{ matchDetails.home_score }})
          </div>
        </div>
        <div class="qg-row">
          <div class="qg-team">{{ matchDetails.away_abbr }}</div>
          <div v-for="q in [1,2,3,4]" :key="q" class="qg-cell"
            :class="{ 'qg-win': matchDetails[`away_q${q}_score`] > matchDetails[`home_q${q}_score`] }"
          >{{ qScore('away', q) }}</div>
          <div class="qg-cell qg-final" :class="{ 'qg-win': matchDetails.away_score > matchDetails.home_score }">
            {{ matchDetails.away_goals }}.{{ matchDetails.away_behinds }} ({{ matchDetails.away_score }})
          </div>
        </div>

        <!-- Per-quarter biggest lead row -->
        <div v-if="matchDetails.max_margin_q1 != null" class="qg-row qg-peak-row">
          <div class="qg-team qg-peak-lbl">Peak</div>
          <div v-for="q in [1,2,3,4]" :key="q" class="qg-cell qg-peak-cell"
            :class="matchDetails[`max_margin_q${q}_team`] === 'H' ? 'qg-peak--home' : 'qg-peak--away'"
          >
            <span class="qg-peak-abbr">{{ peakTeamAbbr(matchDetails[`max_margin_q${q}_team`]) }}</span>
            +{{ matchDetails[`max_margin_q${q}`] }}
            <span class="qg-peak-time">@ {{ secsToMin(matchDetails[`max_margin_q${q}_secs`]) }}</span>
          </div>
          <div class="qg-cell qg-peak-cell"
            :class="matchDetails.max_margin_team === 'H' ? 'qg-peak--home' : 'qg-peak--away'"
          >
            <span class="qg-peak-abbr">{{ peakTeamAbbr(matchDetails.max_margin_team) }}</span>
            +{{ matchDetails.max_margin }}
            <span class="qg-peak-time">Q{{ matchDetails.max_margin_period }} @ {{ secsToMin(matchDetails.max_margin_secs) }}</span>
          </div>
        </div>
      </div>

      <!-- Worm metrics row -->
      <div v-if="matchDetails.max_margin != null" class="metrics-row mb-3">
        <div class="metric">
          <div class="metric-val">{{ matchDetails.max_margin }}</div>
          <div class="metric-lbl">Biggest Lead</div>
        </div>
        <div class="metric">
          <div class="metric-val">{{ matchDetails.lead_changes }}</div>
          <div class="metric-lbl">Lead Changes</div>
        </div>
        <div class="metric">
          <div class="metric-val">{{ marginLabel(matchDetails.halftime_margin, matchDetails.home_abbr, matchDetails.away_abbr) }}</div>
          <div class="metric-lbl">Half Time</div>
        </div>
        <div class="metric">
          <div class="metric-val">{{ marginLabel(matchDetails.three_quarter_margin, matchDetails.home_abbr, matchDetails.away_abbr) }}</div>
          <div class="metric-lbl">3 Quarter Time</div>
        </div>
        <div v-if="matchDetails.largest_deficit_recovered > 0" class="metric metric--highlight">
          <div class="metric-val">{{ matchDetails.largest_deficit_recovered }} pts</div>
          <div class="metric-lbl">Biggest Comeback</div>
        </div>
      </div>

      <!-- Score worm -->
      <template v-if="wormSvg">
        <div class="d-flex justify-space-between text-caption mb-1" style="opacity:0.5">
          <span>{{ matchDetails.home_abbr }} (home)</span>
          <span>Score Worm</span>
          <span>{{ matchDetails.away_abbr }} (away)</span>
        </div>
        <div class="worm-wrap">
          <svg :viewBox="`0 0 ${wormSvg.W} ${wormSvg.H}`" preserveAspectRatio="none" style="width:100%; height:140px; display:block">
            <defs>
              <clipPath id="worm-clip-home"><rect x="0" y="0" :width="wormSvg.W" :height="wormSvg.zero" /></clipPath>
              <clipPath id="worm-clip-away"><rect x="0" :y="wormSvg.zero" :width="wormSvg.W" :height="wormSvg.H" /></clipPath>
            </defs>
            <line v-for="y in wormSvg.gridLines" :key="y" x1="0" :y1="y" :x2="wormSvg.W" :y2="y" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
            <text v-for="q in wormSvg.qLabels" :key="q.label" :x="q.x" :y="wormSvg.H / 2 + 12"
              text-anchor="middle" dominant-baseline="middle"
              font-size="80" font-weight="700" fill="rgba(255,255,255,0.055)" font-family="sans-serif"
            >{{ q.label }}</text>
            <line v-for="(x, i) in wormSvg.qSeps" :key="i" :x1="x" y1="0" :x2="x" :y2="wormSvg.H" stroke="rgba(255,255,255,0.18)" stroke-width="1" />
            <polygon :points="wormSvg.fillPts" fill="rgba(79,195,247,0.18)" clip-path="url(#worm-clip-home)" />
            <polygon :points="wormSvg.fillPts" fill="rgba(255,138,101,0.18)" clip-path="url(#worm-clip-away)" />
            <line x1="0" :y1="wormSvg.zero" :x2="wormSvg.W" :y2="wormSvg.zero" stroke="rgba(255,255,255,0.3)" stroke-width="1" stroke-dasharray="4,3" />
            <polyline :points="wormSvg.svgPts" fill="none" stroke="rgba(255,255,255,0.88)" stroke-width="2.5" stroke-linejoin="round" />
          </svg>
        </div>
      </template>

    </v-card-text>
  </v-card>
</template>

<style scoped>
.quarter-grid { font-size: 12px; }

.qg-row {
  display: grid;
  grid-template-columns: 52px repeat(5, 1fr);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.qg-row:last-child { border-bottom: none; }
.qg-header { opacity: 0.45; font-size: 11px; }
.qg-team   { font-weight: 600; padding: 5px 0; opacity: 0.85; }
.qg-cell   { padding: 5px 4px; text-align: center; opacity: 0.55; }
.qg-win    { opacity: 1; font-weight: 600; color: #4fc3f7; }
.qg-final  { font-weight: 600; opacity: 0.85; }
.qg-final.qg-win { opacity: 1; }

.qg-peak-row { border-top: 1px solid rgba(255,255,255,0.08); }
.qg-peak-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.4; font-weight: 600; padding: 5px 0; }
.qg-peak-cell { font-size: 11px; opacity: 0.75; padding: 5px 4px; text-align: center; }
.qg-peak--home { color: #4fc3f7; opacity: 1; }
.qg-peak--away { color: #ff8a65; opacity: 1; }
.qg-peak-abbr  { font-weight: 700; }
.qg-peak-time  { opacity: 0.6; margin-left: 2px; }

.metrics-row {
  display: flex;
  gap: 0;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  overflow: hidden;
}
.metric {
  flex: 1;
  padding: 8px 12px;
  text-align: center;
  border-right: 1px solid rgba(255,255,255,0.08);
}
.metric:last-child { border-right: none; }
.metric--highlight { background: rgba(255,193,7,0.07); }
.metric-val { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.9); }
.metric-lbl { font-size: 10px; color: rgba(255,255,255,0.4); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em; }

.worm-wrap { border-radius: 6px; overflow: hidden; background: rgba(0,0,0,0.25); }
</style>
