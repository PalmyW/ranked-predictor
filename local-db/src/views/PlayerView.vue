<script setup>
import { ref, computed, watch, onActivated } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi.js'
import DataTable from '@/components/DataTable.vue'
import PlayerChart from '@/components/PlayerChart.vue'
import { numCol, fmt, STAT_BASES, statLabel, STAR_SIGN_EMOJI } from '@/constants/stats.js'

const route  = useRoute()
const router = useRouter()
const { api } = useApi()

// ── Search ────────────────────────────────────────────────────────────────────

const searchText    = ref('')
const searchResults = ref([])
const searching     = ref(false)
let   searchTimer   = null

async function onSearchUpdate(q) {
  searchText.value = q
  clearTimeout(searchTimer)
  if (!q || q.length < 2) { searchResults.value = []; return }
  searchTimer = setTimeout(async () => {
    searching.value = true
    try {
      searchResults.value = await api(`/api/players/search?q=${encodeURIComponent(q)}`)
    } finally {
      searching.value = false
    }
  }, 200)
}

function onPlayerSelect(item) {
  if (!item) return
  router.push({ name: 'player', query: { id: item.player_id } })
}

// ── Player data ───────────────────────────────────────────────────────────────

const playerId     = ref('')
const playerInfo   = ref(null)   // { given_name, surname, position, team_name }
const playerDetails = ref(null)  // from players table
const seasonStats  = ref([])
const matchHistory = ref([])
const loadingData  = ref(false)
const activeTab    = ref('seasons')

// Where the player ranks for each stat's average this (latest) season,
// among all players with more than 5 games.
const seasonRanks  = ref([])     // [{ base, label, value, rank, total }]
const rankSeason   = ref(null)   // year the rankings are computed for

// SQL fragment: avg of every stat base, e.g. "ROUND(AVG(p.stat_disposals), 2) AS avg_disposals, ..."
// Goal accuracy is only meaningful in matches where the player had a shot, so we
// average it over those rows only (AVG ignores the NULLs from goalless games).
const RANK_AVG_SELECT = STAT_BASES
  .map(b => b === 'goal_accuracy'
    ? `ROUND(AVG(CASE WHEN p.stat_shots_at_goal >= 1 THEN p.stat_goal_accuracy END), 2) AS avg_goal_accuracy`
    : `ROUND(AVG(p.stat_${b}), 2) AS avg_${b}`)
  .join(',\n           ')

// Stats where a lower value is better — rank ascending for these.
const LOWER_IS_BETTER = new Set([
  'clangers', 'turnovers', 'frees_against',
  'contest_def_losses', 'contest_def_loss_percentage',
])

function computeSeasonRanks(allRows, id) {
  const me = allRows.find(r => String(r.player_id) === String(id))
  if (!me) return { season: null, ranks: [] }

  const ranks = []
  for (const base of STAT_BASES) {
    const field = `avg_${base}`
    const myVal = me[field]
    if (myVal === null || myVal === undefined) continue
    const vals = allRows.map(r => r[field]).filter(v => v !== null && v !== undefined)
    const ahead = LOWER_IS_BETTER.has(base)
      ? vals.filter(v => v < myVal).length
      : vals.filter(v => v > myVal).length
    ranks.push({
      base,
      label: statLabel(base),
      value: myVal,
      rank: ahead + 1,
      total: vals.length,
    })
  }
  // Best rankings first (use percentile so differing totals compare fairly).
  ranks.sort((a, b) => (a.rank / a.total) - (b.rank / b.total))
  return { season: me.year, ranks }
}

const playerAge = computed(() => {
  const dob = playerDetails.value?.date_of_birth
  if (!dob) return null
  const [d, m, y] = dob.split('/').map(Number)
  const today = new Date()
  let age = today.getFullYear() - y
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--
  return age
})

const draftLabel = computed(() => {
  const p = playerDetails.value
  if (!p?.draft_year) return null
  const type = p.draft_type === 'nationalDraft' ? 'National Draft'
    : p.draft_type === 'rookieElevation' ? 'Rookie Elevation'
    : p.draft_type === 'fatherSonSelection' ? 'Father-Son'
    : p.draft_type === 'academySelection' ? 'Academy'
    : p.draft_type ?? ''
  return p.draft_position
    ? `${p.draft_year} ${type} (Pick ${p.draft_position})`
    : `${p.draft_year} ${type}`
})

const playerName = computed(() =>
  playerInfo.value
    ? `${playerInfo.value.given_name} ${playerInfo.value.surname}`
    : ''
)
const careerGames = computed(() =>
  seasonStats.value.reduce((s, r) => s + (r.games_played ?? 0), 0)
)
const yearsActive = computed(() => {
  if (!seasonStats.value.length) return ''
  const years = seasonStats.value.map(r => r.year)
  const min = Math.min(...years)
  const max = Math.max(...years)
  return min === max ? String(min) : `${min}–${max}`
})

async function runSQL(sql, params = []) {
  const res = await api('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  })
  if (res.error) throw new Error(res.error)
  return res.rows ?? []
}

async function loadPlayer(id) {
  if (!id || id === playerId.value) return
  playerId.value = id
  loadingData.value = true
  seasonStats.value = []
  matchHistory.value = []
  playerInfo.value = null
  playerDetails.value = null
  seasonRanks.value = []
  rankSeason.value = null

  try {
    const [seasons, matches, detailsRows, rankRows] = await Promise.all([
      runSQL(
        `SELECT
           p.year,
           t.name AS team_name,
           MIN(p.position) AS position,
           COUNT(*) AS games_played,
           ROUND(AVG(p.stat_disposals), 2) AS avg_disposals,
           ROUND(AVG(p.stat_kicks), 2) AS avg_kicks,
           ROUND(AVG(p.stat_handballs), 2) AS avg_handballs,
           ROUND(AVG(p.stat_marks), 2) AS avg_marks,
           ROUND(AVG(p.stat_tackles), 2) AS avg_tackles,
           ROUND(AVG(p.stat_goals), 2) AS avg_goals,
           ROUND(AVG(p.stat_behinds), 2) AS avg_behinds,
           ROUND(AVG(p.stat_inside50s), 2) AS avg_inside50s,
           ROUND(AVG(p.stat_contested_possessions), 2) AS avg_contested_possessions,
           ROUND(AVG(p.stat_total_clearances), 2) AS avg_total_clearances,
           ROUND(AVG(p.stat_centre_clearances), 2) AS avg_centre_clearances,
           ROUND(AVG(p.stat_stoppage_clearances), 2) AS avg_stoppage_clearances,
           ROUND(AVG(p.stat_dream_team_points), 2) AS avg_dream_team_points,
           ROUND(AVG(p.stat_rebound50s), 2) AS avg_rebound50s,
           ROUND(AVG(p.stat_score_involvements), 2) AS avg_score_involvements,
           ROUND(AVG(p.stat_goal_assists), 2) AS avg_goal_assists,
           ROUND(AVG(p.stat_hitouts), 2) AS avg_hitouts,
           ROUND(AVG(p.stat_one_percenters), 2) AS avg_one_percenters,
           ROUND(AVG(p.stat_metres_gained), 2) AS avg_metres_gained,
           ROUND(AVG(p.stat_intercepts), 2) AS avg_intercepts,
           ROUND(AVG(p.stat_turnovers), 2) AS avg_turnovers,
           ROUND(AVG(p.stat_effective_kicks), 2) AS avg_effective_kicks,
           ROUND(AVG(p.stat_effective_disposals), 2) AS avg_effective_disposals,
           ROUND(AVG(p.stat_pressure_acts), 2) AS avg_pressure_acts,
           ROUND(AVG(p.stat_ground_ball_gets), 2) AS avg_ground_ball_gets,
           ROUND(AVG(p.stat_spoils), 2) AS avg_spoils,
           ROUND(AVG(p.stat_clangers), 2) AS avg_clangers,
           ROUND(AVG(p.stat_frees_for), 2) AS avg_frees_for,
           ROUND(AVG(p.stat_contested_marks), 2) AS avg_contested_marks,
           ROUND(AVG(p.stat_marks_inside50), 2) AS avg_marks_inside50,
           ROUND(AVG(p.stat_shots_at_goal), 2) AS avg_shots_at_goal,
           ROUND(AVG(p.stat_bounces), 2) AS avg_bounces,
           ROUND(AVG(p.stat_centre_bounce_attendances), 2) AS avg_centre_bounce_attendances,
           ROUND(AVG(p.stat_contest_def_loss_percentage), 2) AS avg_contest_def_loss_percentage,
           ROUND(AVG(p.stat_contest_def_losses), 2) AS avg_contest_def_losses,
           ROUND(AVG(p.stat_contest_def_one_on_ones), 2) AS avg_contest_def_one_on_ones,
           ROUND(AVG(p.stat_contest_off_one_on_ones), 2) AS avg_contest_off_one_on_ones,
           ROUND(AVG(p.stat_contest_off_wins), 2) AS avg_contest_off_wins,
           ROUND(AVG(p.stat_contest_off_wins_percentage), 2) AS avg_contest_off_wins_percentage,
           ROUND(AVG(p.stat_contested_possession_rate), 2) AS avg_contested_possession_rate,
           ROUND(AVG(p.stat_def_half_pressure_acts), 2) AS avg_def_half_pressure_acts,
           ROUND(AVG(p.stat_disposal_efficiency), 2) AS avg_disposal_efficiency,
           ROUND(AVG(p.stat_f50_ground_ball_gets), 2) AS avg_f50_ground_ball_gets,
           ROUND(AVG(p.stat_frees_against), 2) AS avg_frees_against,
           ROUND(AVG(p.stat_goal_accuracy), 2) AS avg_goal_accuracy,
           ROUND(AVG(p.stat_hitout_to_advantage_rate), 2) AS avg_hitout_to_advantage_rate,
           ROUND(AVG(p.stat_hitout_win_percentage), 2) AS avg_hitout_win_percentage,
           ROUND(AVG(p.stat_hitouts_to_advantage), 2) AS avg_hitouts_to_advantage,
           ROUND(AVG(p.stat_intercept_marks), 2) AS avg_intercept_marks,
           ROUND(AVG(p.stat_kick_efficiency), 2) AS avg_kick_efficiency,
           ROUND(AVG(p.stat_kick_to_handball_ratio), 2) AS avg_kick_to_handball_ratio,
           ROUND(AVG(p.stat_kickins), 2) AS avg_kickins,
           ROUND(AVG(p.stat_kickins_playon), 2) AS avg_kickins_playon,
           ROUND(AVG(p.stat_marks_on_lead), 2) AS avg_marks_on_lead,
           ROUND(AVG(p.stat_rating_points), 2) AS avg_rating_points,
           ROUND(AVG(p.stat_ruck_contests), 2) AS avg_ruck_contests,
           ROUND(AVG(p.stat_score_launches), 2) AS avg_score_launches,
           ROUND(AVG(p.stat_tackles_inside50), 2) AS avg_tackles_inside50,
           ROUND(AVG(p.stat_time_on_ground_percentage), 2) AS avg_time_on_ground_percentage,
           ROUND(AVG(p.stat_total_possessions), 2) AS avg_total_possessions,
           ROUND(AVG(p.stat_uncontested_possessions), 2) AS avg_uncontested_possessions,
           SUM(p.stat_disposals) AS tot_disposals,
           SUM(p.stat_kicks) AS tot_kicks,
           SUM(p.stat_handballs) AS tot_handballs,
           SUM(p.stat_marks) AS tot_marks,
           SUM(p.stat_tackles) AS tot_tackles,
           SUM(p.stat_goals) AS tot_goals,
           SUM(p.stat_behinds) AS tot_behinds,
           SUM(p.stat_inside50s) AS tot_inside50s,
           MIN(p.given_name) AS given_name,
           MIN(p.surname) AS surname
         FROM player_match_stats p
         JOIN teams t ON p.team_id = t.team_id
         WHERE p.player_id = ?
         GROUP BY p.year, p.team_id
         ORDER BY p.year DESC`,
        [id]
      ),
      runSQL(
        `SELECT
           m.year, m.round_number, m.utc_start_time AS match_date,
           CASE WHEN p.team_id = m.home_team_id THEN m.away_team_name ELSE m.home_team_name END AS opponent,
           CASE WHEN p.team_id = m.home_team_id THEN 'H' ELSE 'A' END AS venue,
           CASE
             WHEN p.team_id = m.home_team_id AND m.home_score > m.away_score THEN 'W'
             WHEN p.team_id = m.home_team_id AND m.home_score < m.away_score THEN 'L'
             WHEN p.team_id = m.away_team_id AND m.away_score > m.home_score THEN 'W'
             WHEN p.team_id = m.away_team_id AND m.away_score < m.home_score THEN 'L'
             ELSE 'D'
           END AS result,
           p.stat_disposals AS disposals, p.stat_kicks AS kicks,
           p.stat_handballs AS handballs, p.stat_marks AS marks,
           p.stat_tackles AS tackles, p.stat_goals AS goals,
           p.stat_behinds AS behinds, p.stat_inside50s AS inside50s,
           p.stat_contested_possessions AS cont_poss,
           p.stat_total_clearances AS clearances,
           p.stat_centre_clearances AS centre_clr,
           p.stat_stoppage_clearances AS stoppage_clr,
           p.stat_dream_team_points AS dtp,
           p.stat_rebound50s AS rebound50s,
           p.stat_score_involvements AS score_inv,
           p.stat_goal_assists AS goal_assists,
           p.stat_hitouts AS hitouts,
           p.stat_one_percenters AS one_pct,
           p.stat_metres_gained AS metres_gained,
           p.stat_intercepts AS intercepts,
           p.stat_turnovers AS turnovers,
           p.stat_effective_kicks AS eff_kicks,
           p.stat_effective_disposals AS eff_dis,
           p.stat_pressure_acts AS pressure_acts,
           p.stat_ground_ball_gets AS gbg,
           p.stat_spoils AS spoils,
           p.stat_clangers AS clangers,
           p.stat_frees_for AS frees_for,
           p.stat_contested_marks AS cont_marks,
           p.stat_marks_inside50 AS marks_i50,
           p.stat_shots_at_goal AS shots_at_goal,
           p.stat_bounces AS bounces,
           p.stat_centre_bounce_attendances AS cba,
           p.stat_contest_def_loss_percentage AS cdlp,
           p.stat_contest_def_losses AS cdl,
           p.stat_contest_def_one_on_ones AS cdo1,
           p.stat_contest_off_one_on_ones AS coo1,
           p.stat_contest_off_wins AS cow,
           p.stat_contest_off_wins_percentage AS cowp,
           p.stat_contested_possession_rate AS cont_poss_rate,
           p.stat_def_half_pressure_acts AS dhpa,
           p.stat_disposal_efficiency AS dis_eff,
           p.stat_f50_ground_ball_gets AS f50_gbg,
           p.stat_frees_against AS frees_against,
           p.stat_goal_accuracy AS goal_acc,
           p.stat_hitout_to_advantage_rate AS htar,
           p.stat_hitout_win_percentage AS hwp,
           p.stat_hitouts_to_advantage AS hta,
           p.stat_intercept_marks AS int_marks,
           p.stat_kick_efficiency AS kick_eff,
           p.stat_kick_to_handball_ratio AS k2hb,
           p.stat_kickins AS kickins,
           p.stat_kickins_playon AS kickins_po,
           p.stat_marks_on_lead AS mol,
           p.stat_rating_points AS rating_pts,
           p.stat_ruck_contests AS ruck_cont,
           p.stat_score_launches AS score_launches,
           p.stat_tackles_inside50 AS tackles_i50,
           p.stat_time_on_ground_percentage AS tog,
           p.stat_total_possessions AS total_poss,
           p.stat_uncontested_possessions AS uncont_poss,
           m.match_id
         FROM v_player_match_stats p
         JOIN v_matches m ON p.match_id = m.match_id
         WHERE p.player_id = ?
         ORDER BY m.utc_start_time DESC`,
        [id]
      ),
      runSQL(
        `SELECT given_name, surname, date_of_birth, height_cm, weight_kg,
                kicking_foot, state_of_origin, position, draft_year, draft_position,
                draft_type, debut_year, recruited_from, photo_url, star_sign
         FROM players WHERE player_id = ?`,
        [id]
      ),
      runSQL(
        `SELECT
           p.player_id,
           MAX(p.year) AS year,
           COUNT(*) AS games_played,
           ${RANK_AVG_SELECT}
         FROM player_match_stats p
         WHERE p.year = (SELECT MAX(year) FROM player_match_stats)
         GROUP BY p.player_id
         HAVING COUNT(*) > 5`
      ),
    ])

    seasonStats.value   = seasons
    matchHistory.value  = matches
    playerDetails.value = detailsRows[0] ?? null

    const { season, ranks } = computeSeasonRanks(rankRows, id)
    seasonRanks.value = ranks
    rankSeason.value  = season
    if (seasons.length) {
      const s = seasons[0]
      playerInfo.value = { given_name: s.given_name, surname: s.surname, position: s.position, team_name: s.team_name }
    }
  } finally {
    loadingData.value = false
  }
}

watch(() => route.query.id, id => { if (id) loadPlayer(id) }, { immediate: true })
onActivated(() => { if (route.query.id) loadPlayer(route.query.id) })

// ── Column definitions ────────────────────────────────────────────────────────

const seasonCols = [
  { title: 'Year', field: 'year', width: 60, sorter: 'number' },
  { title: 'Team', field: 'team_name', minWidth: 130 },
  { title: 'Pos',  field: 'position', width: 55 },
  { title: 'GP',   field: 'games_played', width: 50, hozAlign: 'right', headerHozAlign: 'right', sorter: 'number', formatter: cell => fmt(cell.getValue()) },
  numCol('avg_disposals', 'Avg Dis', 72),
  numCol('avg_kicks', 'Avg K', 65),
  numCol('avg_handballs', 'Avg HB', 65),
  numCol('avg_marks', 'Avg M', 65),
  numCol('avg_tackles', 'Avg T', 65),
  numCol('avg_goals', 'Avg G', 65),
  numCol('avg_behinds', 'Avg B', 65),
  numCol('avg_inside50s', 'Avg I50', 70),
  numCol('avg_contested_possessions', 'Avg CP', 70),
  numCol('avg_total_clearances', 'Avg CL', 70),
  numCol('avg_dream_team_points', 'Avg DT', 70),
  numCol('tot_disposals', 'Tot Dis', 72),
  numCol('tot_kicks', 'Tot K', 65),
  numCol('tot_goals', 'Tot G', 65),
]

const matchCols = [
  { title: 'Year', field: 'year', width: 55, sorter: 'number' },
  { title: 'Rd', field: 'round_number', width: 45, hozAlign: 'center' },
  {
    title: 'Date', field: 'match_date', width: 105,
    formatter: cell => {
      const v = cell.getValue()
      return v ? new Date(v).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
    },
  },
  { title: 'Opponent', field: 'opponent', minWidth: 130 },
  {
    title: 'H/A', field: 'venue', width: 50, hozAlign: 'center',
    formatter: cell => cell.getValue() || '—',
  },
  {
    title: 'Res', field: 'result', width: 48, hozAlign: 'center',
    formatter: cell => {
      const v = cell.getValue()
      if (!v) return '—'
      const color = v === 'W' ? 'var(--v-theme-success)' : v === 'L' ? 'var(--v-theme-error)' : ''
      return color ? `<span style="color:rgb(${color});font-weight:600">${v}</span>` : v
    },
  },
  numCol('disposals', 'Dis', 52),
  numCol('kicks', 'K', 45),
  numCol('handballs', 'HB', 45),
  numCol('marks', 'M', 45),
  numCol('tackles', 'T', 45),
  numCol('goals', 'G', 45),
  numCol('behinds', 'B', 45),
  numCol('inside50s', 'I50', 50),
  numCol('cont_poss', 'CP', 50),
  numCol('clearances', 'CL', 50),
  numCol('dtp', 'DT', 55),
]

function onMatchClick({ data }) {
  if (data.match_id) router.push({ name: 'match-stats', query: { match: data.match_id } })
}

function fmtPosition(pos) {
  if (!pos) return ''
  return pos.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

// Colour a rank by how high it sits in the field (top 1 → gold, top 10% → success, etc.)
function rankColor({ rank, total }) {
  if (rank === 1) return 'amber'
  const pct = rank / total
  if (pct <= 0.1) return 'success'
  if (pct <= 0.25) return 'primary'
  if (pct >= 0.9) return 'error'
  return 'surface-variant'
}
</script>

<template>
  <div>
    <!-- Search bar -->
    <v-autocomplete
      :model-value="null"
      :items="searchResults"
      :loading="searching"
      item-value="player_id"
      item-title="name"
      label="Search player by name"
      variant="outlined"
      density="comfortable"
      hide-details
      clearable
      return-object
      no-filter
      prepend-inner-icon="mdi-account-search-outline"
      style="max-width: 480px"
      class="mb-6"
      @update:search="onSearchUpdate"
      @update:model-value="onPlayerSelect"
    >
      <template #item="{ item, props: itemProps }">
        <v-list-item v-bind="itemProps" :subtitle="`${item.raw.team_name} · ${fmtPosition(item.raw.position)}`" />
      </template>
    </v-autocomplete>

    <!-- Loading -->
    <v-progress-linear v-if="loadingData" indeterminate color="primary" class="mb-4" />

    <!-- Empty state -->
    <div v-if="!loadingData && !playerInfo" class="text-center text-medium-emphasis py-16">
      <v-icon size="64" class="mb-4" style="opacity:0.2">mdi-account-outline</v-icon>
      <div class="text-h6">Search for a player above</div>
      <div class="text-body-2 mt-1">or click a row in any stats table to open their career profile</div>
    </div>

    <!-- Player profile -->
    <template v-else-if="playerInfo">
      <!-- Header -->
      <div class="d-flex align-start gap-4 mb-5 flex-wrap">
        <!-- Photo -->
        <v-avatar v-if="playerDetails?.photo_url" size="88" rounded="lg" class="flex-shrink-0">
          <v-img :src="playerDetails.photo_url" :alt="playerName" cover />
        </v-avatar>
        <v-avatar v-else size="88" rounded="lg" color="surface-variant" class="flex-shrink-0">
          <v-icon size="44" color="medium-emphasis">mdi-account-outline</v-icon>
        </v-avatar>

        <div class="flex-grow-1">
          <h1 class="text-h5 font-weight-bold mb-1">{{ playerName }}</h1>
          <div class="d-flex align-center gap-2 flex-wrap mb-2">
            <v-chip size="small" color="primary" variant="tonal">{{ playerInfo.team_name }}</v-chip>
            <v-chip v-if="playerDetails?.position || playerInfo.position" size="small" variant="outlined">{{ fmtPosition(playerDetails?.position || playerInfo.position) }}</v-chip>
          </div>

          <!-- Bio details -->
          <div v-if="playerDetails" class="d-flex flex-wrap gap-x-4 gap-y-1 text-body-2 text-medium-emphasis">
            <span v-if="playerAge">
              <span class="text-on-surface font-weight-medium">{{ playerAge }}</span> yrs
              <span class="text-caption ml-1">({{ playerDetails.date_of_birth }})</span>
            </span>
            <span v-if="playerDetails.height_cm">
              <span class="text-on-surface font-weight-medium">{{ playerDetails.height_cm }}</span> cm
            </span>
            <span v-if="playerDetails.weight_kg">
              <span class="text-on-surface font-weight-medium">{{ playerDetails.weight_kg }}</span> kg
            </span>
            <span v-if="playerDetails.kicking_foot">
              <span class="text-on-surface font-weight-medium">{{ playerDetails.kicking_foot === 'LEFT' ? 'Left' : 'Right' }}</span> foot
            </span>
            <span v-if="playerDetails.state_of_origin">
              <span class="text-on-surface font-weight-medium">{{ playerDetails.state_of_origin }}</span>
            </span>
            <span v-if="playerDetails.star_sign">
              {{ STAR_SIGN_EMOJI[playerDetails.star_sign] ?? '' }} <span class="text-on-surface font-weight-medium">{{ playerDetails.star_sign }}</span>
            </span>
            <span v-if="draftLabel">
              Draft: <span class="text-on-surface font-weight-medium">{{ draftLabel }}</span>
            </span>
            <span v-if="playerDetails.debut_year">
              Debut: <span class="text-on-surface font-weight-medium">{{ playerDetails.debut_year }}</span>
            </span>
            <span v-if="playerDetails.recruited_from" class="text-truncate" style="max-width:320px">
              From: <span class="text-on-surface font-weight-medium" :title="playerDetails.recruited_from">{{ playerDetails.recruited_from }}</span>
            </span>
          </div>
        </div>

        <div class="text-right text-medium-emphasis flex-shrink-0">
          <div class="text-body-2"><span class="font-weight-bold text-on-surface">{{ careerGames }}</span> career games</div>
          <div class="text-caption">{{ yearsActive }}</div>
        </div>
      </div>

      <!-- Chart -->
      <PlayerChart :match-history="matchHistory" :season-stats="seasonStats" />

      <!-- Season stat rankings -->
      <v-card v-if="seasonRanks.length" variant="tonal" rounded="lg" class="mb-5">
        <v-card-title class="text-subtitle-1 d-flex align-center flex-wrap gap-2 py-3">
          <v-icon size="small" color="primary">mdi-trophy-outline</v-icon>
          {{ rankSeason }} Season Rankings
          <span class="text-caption text-medium-emphasis font-weight-regular">
            average per stat vs. all players with 6+ games · best first
          </span>
        </v-card-title>
        <v-card-text class="pt-0">
          <dl class="rank-grid">
            <div v-for="r in seasonRanks" :key="r.base" class="rank-item">
              <dt class="text-body-2 text-medium-emphasis text-truncate" :title="r.label">{{ r.label }}</dt>
              <dd class="d-flex align-center justify-space-between gap-2 ma-0">
                <span class="text-body-1 font-weight-bold">{{ fmt(r.value) }}</span>
                <v-chip :color="rankColor(r)" size="small" variant="flat" label class="font-weight-bold">
                  #{{ r.rank }}<span class="ml-1" style="opacity:0.75">/ {{ r.total }}</span>
                </v-chip>
              </dd>
            </div>
          </dl>
        </v-card-text>
      </v-card>

      <!-- Tabs -->
      <v-tabs v-model="activeTab" color="primary" density="compact" class="mb-4">
        <v-tab value="seasons" prepend-icon="mdi-chart-bar">Season Stats</v-tab>
        <v-tab value="matches" prepend-icon="mdi-calendar-month-outline">
          Match History
          <v-chip size="x-small" class="ml-2" variant="tonal">{{ matchHistory.length }}</v-chip>
        </v-tab>
      </v-tabs>

      <v-tabs-window v-model="activeTab">
        <v-tabs-window-item value="seasons">
          <DataTable
            :columns="seasonCols"
            :data="seasonStats"
            layout="fitDataStretch"
          />
        </v-tabs-window-item>

        <v-tabs-window-item value="matches">
          <DataTable
            :columns="matchCols"
            :data="matchHistory"
            layout="fitDataStretch"
            :clickable="true"
            @row-click="onMatchClick"
          />
        </v-tabs-window-item>
      </v-tabs-window>
    </template>
  </div>
</template>

<style scoped>
.rank-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 6px 20px;
}
.rank-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
}
</style>
