<script setup>
import { ref } from 'vue'

const props = defineProps({
  history: { type: Array, default: () => [] },
})

const emit = defineEmits(['select', 'remove', 'clear'])

const open = ref(false)

function formatTime(ts) {
  return new Date(ts).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })
}

function preview(sql) {
  return sql.replace(/\s+/g, ' ').trim().slice(0, 90)
}
</script>

<template>
  <v-expansion-panels v-model="open" variant="accordion">
    <v-expansion-panel value="history">
      <v-expansion-panel-title density="compact" class="text-body-2">
        <div class="d-flex align-center gap-2">
          <span>History</span>
          <v-chip v-if="history.length" size="x-small" color="primary">{{ history.length }}</v-chip>
        </div>
        <template #actions="{ expanded }">
          <div class="d-flex align-center gap-2">
            <v-btn
              v-if="history.length && expanded"
              size="x-small"
              variant="text"
              color="error"
              @click.stop="emit('clear')"
            >
              Clear all
            </v-btn>
            <v-icon>{{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
          </div>
        </template>
      </v-expansion-panel-title>

      <v-expansion-panel-text class="pa-0">
        <div v-if="!history.length" class="text-center text-medium-emphasis text-caption pa-3">
          No queries yet
        </div>
        <v-list v-else density="compact" lines="two" class="pa-0" style="max-height:220px; overflow-y:auto">
          <v-list-item
            v-for="(h, i) in history"
            :key="h.ts"
            @click="emit('select', h.sql)"
            class="cursor-pointer"
          >
            <v-list-item-title class="text-caption" :class="{ 'font-mono': !h.prompt }">
              {{ h.prompt || preview(h.sql) }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption">
              {{ formatTime(h.ts) }}
              <template v-if="h.rowCount != null"> · {{ h.rowCount.toLocaleString() }} rows</template>
              · {{ h.executionMs }}ms
            </v-list-item-subtitle>
            <template #append>
              <v-btn
                icon="mdi-close"
                size="x-small"
                variant="text"
                density="compact"
                @click.stop="emit('remove', i)"
              />
            </template>
          </v-list-item>
        </v-list>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>
