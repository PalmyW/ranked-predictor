<script setup>
import { ref, computed, onActivated } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '@/composables/useApi.js'
import DataTable from '@/components/DataTable.vue'
import { numCol, fmt } from '@/constants/stats.js'

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

const STAR_SIGN_EMOJI = {
  Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋',
  Leo: '♌', Virgo: '♍', Libra: '♎', Scorpio: '♏',
  Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓',
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

  try {
    const [seasons, matches, detailsRows] = await Promise.all([
      runSQL(
        `SELECT year, team_name, position, games_played,
           avg_disposals, avg_kicks, avg_handballs, avg_marks, avg_tackles,
           avg_goals, avg_behinds, avg_inside50s, avg_contested_possessions,
           avg_total_clearances, avg_dream_team_points,
           tot_disposals, tot_kicks, tot_handballs, tot_marks, tot_tackles,
           tot_goals, tot_behinds, tot_inside50s,
           given_name, surname
         FROM v_player_season_stats
         WHERE player_id = ?
         ORDER BY year DESC`,
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
           p.stat_dream_team_points AS dtp,
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
    ])

    seasonStats.value   = seasons
    matchHistory.value  = matches
    playerDetails.value = detailsRows[0] ?? null
    if (seasons.length) {
      const s = seasons[0]
      playerInfo.value = { given_name: s.given_name, surname: s.surname, position: s.position, team_name: s.team_name }
    }
  } finally {
    loadingData.value = false
  }
}

onActivated(() => {
  const id = route.query.id
  if (id) loadPlayer(id)
})

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
        <v-list-item v-bind="itemProps" :subtitle="`${item.raw.team_name} · ${item.raw.position}`" />
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
            <v-chip v-if="playerInfo.position" size="small" variant="outlined">{{ playerInfo.position }}</v-chip>
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
