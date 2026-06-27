<script setup>
import { ref, computed, inject, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAsk } from '@/composables/useAsk.js'
import { useResultColumns } from '@/composables/useResultColumns.js'
import DataTable from '@/components/DataTable.vue'
import ResultChart from '@/components/ResultChart.vue'
import ColToggle from '@/components/ColToggle.vue'
import ExportImageModal from '@/components/ExportImageModal.vue'
import { tokenCost, fmtUsd } from '@/constants/pricing.js'

const router = useRouter()
const refreshAiStats = inject('refreshAiStats', () => {})
const { buildColumns } = useResultColumns()
const { chatId, turns, result, running, currentName, sessions, ask, newChat, openSession, deleteSession } = useAsk()

const prompt = ref('')
const feedRef = ref(null)
const view = ref('table')   // 'table' | 'chart'
const colVis = ref({})      // field -> false when hidden
const showExport = ref(false)

const columns = computed(() =>
  result.value ? buildColumns(result.value.columns, result.value.rows) : []
)
const visibleColumns = computed(() => columns.value.filter(c => colVis.value[c.field] !== false))
const colSections = computed(() =>
  columns.value.length
    ? [{ flat: true, cols: columns.value.map(c => ({ key: c.field, label: c.title })) }]
    : []
)
const hasMatchId  = computed(() => visibleColumns.value.some(c => c.field === 'match_id'))
const hasPlayerId = computed(() => visibleColumns.value.some(c => c.field === 'player_id'))
const isClickable = computed(() => hasMatchId.value || hasPlayerId.value)

// Reset column visibility whenever a different result loads.
watch(result, () => { colVis.value = {} })

function submit() {
  const text = prompt.value.trim()
  if (!text || running.value) return
  ask(text)
  prompt.value = ''
}

function onKeydown(e) {
  // Enter sends; Shift+Enter inserts a newline.
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submit()
  }
}

function onNewChat() {
  newChat()
  prompt.value = ''
}

function onOpenSession(id) {
  openSession(id)
  prompt.value = ''
}

function relTime(ts) {
  if (!ts) return ''
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function onRowClick({ event, data }) {
  if (data.match_id) {
    if (event.metaKey || event.ctrlKey) {
      const base = `${window.location.origin}${window.location.pathname}`
      window.open(`${base}#/match-stats?match=${encodeURIComponent(data.match_id)}`, '_blank')
      return
    }
    router.push({ name: 'match-stats', query: { match: data.match_id } })
  } else if (data.player_id) {
    router.push({ name: 'player', query: { id: data.player_id } })
  }
}

function turnTokens(t) {
  return t.tokens.input + t.tokens.output
}
function turnCost(t) {
  return t.tokens.model ? tokenCost(t.tokens.model, t.tokens.input, t.tokens.output) : null
}

// Keep the header usage chip in sync once a turn settles.
watch(running, (now, prev) => { if (prev && !now) refreshAiStats() })

// Auto-scroll the chat feed to the bottom as turns/events stream in.
watch(
  () => turns.value.map(t => t.events.length).reduce((a, b) => a + b, turns.value.length),
  () => nextTick(() => { const el = feedRef.value; if (el) el.scrollTop = el.scrollHeight }),
)

function iconFor(type) {
  switch (type) {
    case 'attempt': return 'mdi-play-circle-outline'
    case 'error':   return 'mdi-alert-circle-outline'
    case 'done':    return 'mdi-check-circle-outline'
    case 'failed':  return 'mdi-close-circle-outline'
    default:        return 'mdi-creation'
  }
}

function colorFor(type) {
  switch (type) {
    case 'error':  return 'warning'
    case 'done':   return 'success'
    case 'failed': return 'error'
    default:       return 'secondary'
  }
}
</script>

<template>
  <div class="ask-layout">
    <!-- Results (main area) -->
    <div class="ask-results">
      <div v-if="result">
        <div class="d-flex align-center mb-2 ga-2">
          <span class="text-body-2 text-medium-emphasis">
            {{ result.rowCount.toLocaleString() }} rows · {{ result.executionMs }}ms
          </span>
          <v-spacer />
          <template v-if="view === 'table'">
            <ColToggle :sections="colSections" v-model="colVis" />
            <v-btn @click="showExport = true" variant="tonal" size="small" prepend-icon="mdi-image-outline">
              Export Image
            </v-btn>
          </template>
          <v-btn-toggle v-model="view" mandatory density="comfortable" variant="outlined" divided>
            <v-btn value="table" size="small" title="Table"><v-icon>mdi-table</v-icon></v-btn>
            <v-btn value="chart" size="small" title="Graph"><v-icon>mdi-chart-bar</v-icon></v-btn>
          </v-btn-toggle>
        </div>
        <DataTable
          v-if="view === 'table'"
          :columns="visibleColumns"
          :data="result.rows"
          layout="fitDataStretch"
          :clickable="isClickable"
          @row-click="onRowClick"
        />
        <ResultChart
          v-else
          :columns="result.columns"
          :rows="result.rows"
        />
      </div>
      <div v-else class="ask-empty text-medium-emphasis">
        <v-icon size="48" class="mb-3">mdi-chat-question-outline</v-icon>
        <div class="text-body-1">Ask a question to get started</div>
        <div class="text-body-2" style="opacity:0.7">Claude builds and runs the query — results appear here.</div>
      </div>
    </div>

    <!-- Chat (pinned right column) -->
    <div class="ask-chat">
      <div class="ask-chat-header">
        <span class="text-subtitle-2 font-weight-bold text-truncate" :title="currentName || 'Ask'">
          {{ currentName || 'Ask' }}
        </span>
        <div class="d-flex align-center flex-shrink-0">
          <!-- Chat history -->
          <v-menu location="bottom end" :close-on-content-click="false">
            <template #activator="{ props }">
              <v-btn v-bind="props" icon="mdi-history" variant="text" size="small" title="Chat history" />
            </template>
            <v-card min-width="280" max-width="360" color="surface" elevation="6" rounded="lg">
              <v-list density="compact" max-height="380" class="py-1">
                <v-list-subheader>Chat history</v-list-subheader>
                <v-list-item v-if="!sessions.length" :title="'No previous chats'" class="text-medium-emphasis" />
                <v-list-item
                  v-for="s in sessions"
                  :key="s.chatId"
                  :active="s.chatId === chatId"
                  @click="onOpenSession(s.chatId)"
                >
                  <v-list-item-title>{{ s.name || 'Untitled' }}</v-list-item-title>
                  <v-list-item-subtitle>{{ relTime(s.updatedAt) }}</v-list-item-subtitle>
                  <template #append>
                    <v-btn
                      icon="mdi-delete-outline"
                      variant="text"
                      size="x-small"
                      title="Delete chat"
                      @click.stop="deleteSession(s.chatId)"
                    />
                  </template>
                </v-list-item>
              </v-list>
            </v-card>
          </v-menu>
          <!-- New chat -->
          <v-btn
            @click="onNewChat"
            :disabled="!turns.length || running"
            icon="mdi-plus"
            variant="text"
            size="small"
            title="New chat"
          />
        </div>
      </div>

      <div ref="feedRef" class="ask-chat-feed">
        <div v-for="t in turns" :key="t.id" class="ask-turn">
          <!-- User bubble -->
          <div class="ask-bubble ask-bubble-user">{{ t.prompt }}</div>

          <!-- Assistant bubble -->
          <div class="ask-bubble ask-bubble-assistant">
            <div v-for="(e, i) in t.events" :key="i" class="d-flex align-start mb-1">
              <v-icon :color="colorFor(e.type)" size="16" class="mr-2 mt-1">{{ iconFor(e.type) }}</v-icon>
              <span class="text-body-2" :class="{ 'text-medium-emphasis': e.type === 'status' }">{{ e.message }}</span>
            </div>
            <div v-if="t.running" class="d-flex align-center">
              <v-progress-circular indeterminate size="14" width="2" color="secondary" class="mr-2" />
              <span class="text-body-2 text-medium-emphasis">Working…</span>
            </div>
            <div v-if="turnTokens(t)" class="text-caption text-medium-emphasis mt-1">
              {{ turnTokens(t).toLocaleString() }} tokens<template v-if="turnCost(t) != null"> · {{ fmtUsd(turnCost(t)) }}</template>
            </div>
          </div>
        </div>
      </div>

      <div class="ask-chat-input">
        <v-textarea
          v-model="prompt"
          placeholder="Ask about AFL stats… (Enter to send, Shift+Enter for newline)"
          :rows="2"
          variant="outlined"
          density="compact"
          hide-details
          auto-grow
          max-rows="6"
          bg-color="surface"
          color="primary"
          :disabled="running"
          @keydown="onKeydown"
        />
        <div class="d-flex justify-end mt-2">
          <v-btn
            @click="submit"
            :loading="running"
            :disabled="!prompt.trim()"
            color="secondary"
            variant="filled"
            prepend-icon="mdi-creation"
            size="small"
          >
            Ask
          </v-btn>
        </div>
      </div>
    </div>

    <ExportImageModal
      v-if="result"
      v-model="showExport"
      :title="currentName"
      :columns="visibleColumns"
      :rows="result.rows"
    />
  </div>
</template>

<style scoped>
.ask-layout {
  display: flex;
  gap: 24px;
  align-items: stretch;
  height: calc(100vh - 150px);
}

.ask-results {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

.ask-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.ask-chat {
  width: 360px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
  overflow: hidden;
}

.ask-chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ask-chat-feed {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ask-turn {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ask-bubble {
  border-radius: 12px;
  padding: 8px 12px;
  max-width: 90%;
  white-space: pre-wrap;
  word-break: break-word;
}

.ask-bubble-user {
  align-self: flex-end;
  background: rgb(var(--v-theme-secondary));
  color: rgb(var(--v-theme-on-secondary));
}

.ask-bubble-assistant {
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.05);
  width: 100%;
}

.ask-chat-input {
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
