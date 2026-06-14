<script setup>
import { ref, nextTick, inject } from 'vue'

const emit = defineEmits(['sql', 'error', 'focus'])
const refreshAiStats = inject('refreshAiStats', () => {})

const prompt      = ref('')
const loading     = ref(false)
const textareaRef = ref(null)

// Terminal-style prompt history
const promptHistory = ref([])  // oldest → newest
const historyIdx    = ref(-1)  // -1 = editing draft; 0 = newest; n-1 = oldest
const draft         = ref('')  // saved in-progress text while browsing history
const inHistory     = ref(false)

function ta() {
  return textareaRef.value?.$el?.querySelector('textarea')
}

function navigateHistory(dir) {
  if (promptHistory.value.length === 0) return
  const len = promptHistory.value.length

  if (dir === 'up') {
    if (historyIdx.value === -1) draft.value = prompt.value
    const next = historyIdx.value + 1
    if (next < len) {
      historyIdx.value = next
      prompt.value = promptHistory.value[len - 1 - historyIdx.value]
      inHistory.value = true
    }
  } else {
    if (historyIdx.value === -1) return
    const next = historyIdx.value - 1
    if (next < 0) {
      historyIdx.value = -1
      prompt.value = draft.value
      inHistory.value = false
    } else {
      historyIdx.value = next
      prompt.value = promptHistory.value[len - 1 - historyIdx.value]
    }
  }

  nextTick(() => {
    const el = ta()
    if (el) el.selectionStart = el.selectionEnd = el.value.length
  })
}

function insert(text) {
  const el = ta()
  if (!el) { prompt.value += text; return }
  const start = el.selectionStart ?? prompt.value.length
  const end   = el.selectionEnd   ?? prompt.value.length
  prompt.value = prompt.value.substring(0, start) + text + prompt.value.substring(end)
  nextTick(() => {
    el.selectionStart = el.selectionEnd = start + text.length
    el.focus()
  })
}

function setPrompt(text) {
  prompt.value = text ?? ''
  historyIdx.value = -1
  inHistory.value = false
  draft.value = ''
}

defineExpose({ insert, setPrompt })

async function ask() {
  const text = prompt.value.trim()
  if (!text) return

  // Push to history if different from last entry
  if (promptHistory.value[promptHistory.value.length - 1] !== text) {
    promptHistory.value.push(text)
  }
  historyIdx.value = -1
  draft.value = ''
  inHistory.value = false

  loading.value = true
  try {
    const res = await fetch('/api/ai/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text }),
    })
    const data = await res.json()
    if (data.sql) {
      emit('sql', { sql: data.sql, prompt: text, title: data.title })
    } else {
      emit('error', data.error ?? 'Unknown error from Claude')
    }
  } catch (e) {
    emit('error', e.message)
  } finally {
    loading.value = false
    refreshAiStats()
  }
}

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    ask()
    return
  }

  const el = ta()
  if (!el) return

  if (e.key === 'ArrowUp') {
    // Only intercept when cursor is on the first line
    const onFirstLine = !el.value.substring(0, el.selectionStart).includes('\n')
    if (!onFirstLine) return
    e.preventDefault()
    navigateHistory('up')
    return
  }

  if (e.key === 'ArrowDown') {
    // Only intercept when cursor is on the last line
    const onLastLine = !el.value.substring(el.selectionEnd).includes('\n')
    if (!onLastLine) return
    e.preventDefault()
    navigateHistory('down')
  }
}
</script>

<template>
  <v-card variant="tonal" color="secondary" rounded="lg">
    <v-card-text class="pb-2">
      <v-textarea
        ref="textareaRef"
        v-model="prompt"
        label="Ask Claude to build a query"
        placeholder="e.g. 'Top 10 players by average disposals in 2026'"
        :rows="2"
        variant="outlined"
        density="compact"
        hide-details
        auto-grow
        bg-color="surface"
        base-color="on-surface"
        color="primary"
        @keydown="onKeydown"
        @focus="emit('focus')"
      />
    </v-card-text>
    <v-card-actions class="pt-0 px-4 pb-3 d-flex align-center justify-space-between">
      <span v-if="inHistory" class="text-caption text-medium-emphasis font-mono" style="opacity:0.6">
        {{ promptHistory.length - historyIdx }}/{{ promptHistory.length }}
      </span>
      <span v-else />
      <v-btn
        @click="ask"
        :loading="loading"
        color="secondary"
        variant="filled"
        prepend-icon="mdi-creation"
        size="small"
      >
        Ask Claude
      </v-btn>
    </v-card-actions>
  </v-card>
</template>
