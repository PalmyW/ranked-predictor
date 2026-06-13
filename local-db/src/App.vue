<script setup>
import { provide, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTeamMap } from '@/composables/useTeamMap.js'

const { teamMap, seasons, teams, dbStatus, loading, loadMeta } = useTeamMap()

provide('teamMap', teamMap)
provide('seasons', seasons)
provide('teams', teams)

const route = useRoute()

const TABS = [
  { name: 'matches',      label: 'Matches',           icon: 'mdi-calendar-month-outline' },
  { name: 'match-stats',  label: 'Player Match Stats', icon: 'mdi-account-group-outline' },
  { name: 'season-stats', label: 'Season Stats',       icon: 'mdi-chart-bar' },
  { name: 'query',        label: 'SQL Query',           icon: 'mdi-database-search-outline' },
]

const currentTab = computed(() => route.name)

function formatImportTime(ts) {
  if (!ts) return 'never'
  return new Date(ts).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })
}

onMounted(loadMeta)
</script>

<template>
  <v-app theme="aflDark">
    <div class="app-shell">
      <!-- Static header — scrolls with the page -->
      <header class="app-header">
        <v-toolbar flat density="compact" class="app-toolbar">
          <v-toolbar-title>
            <span class="text-h6 font-weight-bold">AFL Stats DB</span>
          </v-toolbar-title>
          <div v-if="dbStatus" class="d-flex align-center gap-2 mr-3">
            <v-chip size="small" color="primary" variant="tonal" prepend-icon="mdi-database">
              {{ dbStatus.files_tracked.toLocaleString() }} files
            </v-chip>
            <span class="text-caption text-medium-emphasis d-none d-sm-inline">
              Last import: {{ formatImportTime(dbStatus.last_import) }}
            </span>
          </div>
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

      <!-- Content -->
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
