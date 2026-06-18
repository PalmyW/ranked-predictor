<script setup>
import { provide, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTeamMap } from '@/composables/useTeamMap.js'
import { useAiStats } from '@/composables/useAiStats.js'

const { teamMap, seasons, teams, dbStatus, loading, loadMeta } = useTeamMap()
const { stats: aiStats, refresh: refreshAiStats } = useAiStats()

provide('teamMap', teamMap)
provide('seasons', seasons)
provide('teams', teams)
provide('refreshAiStats', refreshAiStats)

const route = useRoute()

const TABS = [
  { name: 'matches',      label: 'Matches',           icon: 'mdi-calendar-month-outline' },
  { name: 'match-stats',  label: 'Match Stats',         icon: 'mdi-account-group-outline' },
  { name: 'season-stats', label: 'Season Stats',       icon: 'mdi-chart-bar' },
  { name: 'player',       label: 'Players',            icon: 'mdi-account-outline' },
  { name: 'query',        label: 'SQL Query',           icon: 'mdi-database-search-outline' },
  { name: 'browse',       label: 'DB Browser',          icon: 'mdi-table-search' },
]

const currentTab = computed(() => route.name)

function formatImportTime(ts) {
  if (!ts) return 'never'
  return new Date(ts).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })
}

// Pricing per million tokens (USD)
const MODEL_PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-haiku-4-5':          { input: 0.80, output: 4.00 },
  'claude-sonnet-4-6':         { input: 3.00, output: 15.00 },
  'claude-opus-4-8':           { input: 15.00, output: 75.00 },
}

function pricing(model) {
  return MODEL_PRICING[model] ?? { input: 0.80, output: 4.00 }
}

function sessionCost(stats) {
  if (!stats) return null
  const p = pricing(stats.model)
  return (stats.inputTokens * p.input + stats.outputTokens * p.output) / 1_000_000
}

function remainingBudget(stats) {
  const rem = stats?.rateLimit?.tokensRemaining
  const lim = stats?.rateLimit?.tokensLimit
  if (rem == null || lim == null) return null
  // Rate limit window is primarily input tokens; use input price as conservative estimate
  const p = pricing(stats.model)
  return (rem * p.input) / 1_000_000
}

function fmtUsd(n) {
  if (n == null) return '—'
  if (n < 0.01) return `<$0.01`
  return `$${n.toFixed(2)}`
}

function fmtTokens(n) {
  if (n == null) return '—'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function rateLimitColor(remaining, limit) {
  if (remaining == null || limit == null) return 'primary'
  const pct = remaining / limit
  if (pct < 0.1) return 'error'
  if (pct < 0.3) return 'warning'
  return 'success'
}

function rateLimitHex(remaining, limit) {
  if (remaining == null || limit == null) return 'rgba(255,255,255,0.9)'
  const pct = remaining / limit
  if (pct < 0.1) return '#fc8181'
  if (pct < 0.3) return '#f6ad55'
  return '#68d391'
}

onMounted(() => {
  loadMeta()
  refreshAiStats()
})
</script>

<template>
  <v-app theme="aflDark">
    <div class="app-shell">
      <header class="app-header">
        <v-toolbar flat density="compact" class="app-toolbar">
          <v-toolbar-title>
            <span class="text-h6 font-weight-bold">AFL Stats DB</span>
          </v-toolbar-title>

          <!-- DB status -->
          <div v-if="dbStatus" class="d-flex align-center ga-3 mr-4">
            <v-chip size="small" color="primary" variant="tonal" prepend-icon="mdi-database">{{ dbStatus.files_tracked.toLocaleString() }} files</v-chip>
            <span class="text-caption text-medium-emphasis d-none d-sm-inline">Last import: {{ formatImportTime(dbStatus.last_import) }}</span>
          </div>

          <!-- Claude usage -->
          <v-menu v-if="aiStats?.enabled" location="bottom end" :open-on-hover="true" :close-delay="150" :open-delay="100">
            <template #activator="{ props }">
              <div v-bind="props" class="d-flex align-center ga-2 mr-4" style="cursor:default">
                <v-chip size="small" color="secondary" variant="tonal" prepend-icon="mdi-creation">
                  {{ aiStats.requestCount }} req · {{ fmtTokens(aiStats.inputTokens + aiStats.outputTokens) }} tok
                </v-chip>
                <v-icon
                  v-if="aiStats.rateLimit"
                  size="14"
                  :color="rateLimitColor(aiStats.rateLimit.tokensRemaining, aiStats.rateLimit.tokensLimit)"
                >mdi-circle</v-icon>
              </div>
            </template>
            <v-card min-width="260" color="surface" elevation="4" rounded="lg">
              <v-card-text class="pa-3">
                <div class="text-body-2 font-weight-bold mb-3" style="color: rgba(255,255,255,0.9)">Claude · {{ aiStats.model }}</div>

                <div class="text-caption font-weight-medium mb-1" style="color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.05em">Session usage</div>
                <div class="d-flex justify-space-between text-body-2 mb-1">
                  <span style="color: rgba(255,255,255,0.6)">Requests</span>
                  <span style="color: rgba(255,255,255,0.9)">{{ aiStats.requestCount }}</span>
                </div>
                <div class="d-flex justify-space-between text-body-2 mb-1">
                  <span style="color: rgba(255,255,255,0.6)">Input tokens</span>
                  <span style="color: rgba(255,255,255,0.9)">{{ aiStats.inputTokens.toLocaleString() }}</span>
                </div>
                <div class="d-flex justify-space-between text-body-2 mb-1">
                  <span style="color: rgba(255,255,255,0.6)">Output tokens</span>
                  <span style="color: rgba(255,255,255,0.9)">{{ aiStats.outputTokens.toLocaleString() }}</span>
                </div>
                <div class="d-flex justify-space-between text-body-2 mb-3">
                  <span style="color: rgba(255,255,255,0.6)">Session cost</span>
                  <span style="color: #ecc94b; font-weight: 600">{{ fmtUsd(sessionCost(aiStats)) }}</span>
                </div>

                <template v-if="aiStats.rateLimit?.tokensLimit">
                  <v-divider class="mb-3" style="border-color: rgba(255,255,255,0.1)" />
                  <div class="text-caption font-weight-medium mb-1" style="color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.05em">Rate limit window</div>
                  <div class="d-flex justify-space-between text-body-2 mb-1">
                    <span style="color: rgba(255,255,255,0.6)">Tokens remaining</span>
                    <span :style="`color: ${rateLimitHex(aiStats.rateLimit.tokensRemaining, aiStats.rateLimit.tokensLimit)}; font-weight: 600`">
                      {{ fmtTokens(aiStats.rateLimit.tokensRemaining) }} / {{ fmtTokens(aiStats.rateLimit.tokensLimit) }}
                    </span>
                  </div>
                  <div class="d-flex justify-space-between text-body-2 mb-1">
                    <span style="color: rgba(255,255,255,0.6)">Credits remaining</span>
                    <span :style="`color: ${rateLimitHex(aiStats.rateLimit.tokensRemaining, aiStats.rateLimit.tokensLimit)}; font-weight: 600`">
                      {{ fmtUsd(remainingBudget(aiStats)) }}
                    </span>
                  </div>
                  <div class="d-flex justify-space-between text-body-2 mb-1">
                    <span style="color: rgba(255,255,255,0.6)">Requests remaining</span>
                    <span style="color: rgba(255,255,255,0.9)">{{ aiStats.rateLimit.requestsRemaining }} / {{ aiStats.rateLimit.requestsLimit }}</span>
                  </div>
                  <div v-if="aiStats.rateLimit.tokensReset" class="d-flex justify-space-between text-body-2">
                    <span style="color: rgba(255,255,255,0.6)">Resets</span>
                    <span style="color: rgba(255,255,255,0.9)">{{ new Date(aiStats.rateLimit.tokensReset).toLocaleTimeString('en-AU', { timeStyle: 'short' }) }}</span>
                  </div>
                </template>
              </v-card-text>
            </v-card>
          </v-menu>

          <v-progress-circular v-if="loading" indeterminate color="primary" size="20" class="mr-3" />
        </v-toolbar>

        <v-tabs
          :model-value="currentTab"
          color="primary"
          density="compact"
          class="app-tabs"
        >
          <v-tab
            v-for="tab in TABS"
            :key="tab.name"
            :value="tab.name"
            :to="{ name: tab.name }"
            :prepend-icon="tab.icon"
          >
            {{ tab.label }}
          </v-tab>
        </v-tabs>
      </header>

      <div class="px-6 py-5">
        <RouterView v-slot="{ Component }">
          <KeepAlive>
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </div>
    </div>
  </v-app>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: rgb(var(--v-theme-background));
}

.app-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
}

.app-toolbar {
  background: rgb(var(--v-theme-surface)) !important;
}

.app-tabs {
  background: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
