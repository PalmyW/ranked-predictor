<script setup>
import { ref } from 'vue'

const emit = defineEmits(['sql', 'error'])

const prompt  = ref('')
const loading = ref(false)

async function ask() {
  const text = prompt.value.trim()
  if (!text) return
  loading.value = true
  try {
    const res = await fetch('/api/ai/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text }),
    })
    const data = await res.json()
    if (data.sql) {
      emit('sql', { sql: data.sql, prompt: text })
    } else {
      emit('error', data.error ?? 'Unknown error from Claude')
    }
  } catch (e) {
    emit('error', e.message)
  } finally {
    loading.value = false
  }
}

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    ask()
  }
}
</script>

<template>
  <v-card variant="tonal" color="secondary" rounded="lg">
    <v-card-text class="pb-2">
      <v-textarea
        v-model="prompt"
        label="Ask Claude to build a query"
        placeholder="e.g. 'Top 10 players by average disposals in 2026'"
        :rows="2"
        variant="outlined"
        density="compact"
        hide-details
        auto-grow
        @keydown="onKeydown"
      />
    </v-card-text>
    <v-card-actions class="pt-0 px-4 pb-3 justify-end">
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
