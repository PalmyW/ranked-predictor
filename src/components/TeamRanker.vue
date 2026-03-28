<template>
  <div>
    <div class="flex items-center justify-between mb-3">
      <p class="text-xs text-gray-500">Drag to reorder, or use ▲▼ buttons</p>
      <button
        @click="$emit('reset')"
        class="text-xs text-blue-600 hover:text-blue-800 underline"
      >
        Reset to ladder
      </button>
    </div>

    <draggable
      v-model="localList"
      item-key="id"
      handle=".drag-handle"
      :animation="150"
      ghost-class="opacity-50"
      chosen-class="shadow-lg"
      @end="emitRanking"
    >
      <template #item="{ element, index }">
        <div
          class="flex items-center gap-2 px-2 py-1.5 mb-1 rounded border transition-colors select-none"
          :class="[
            index < 8
              ? 'bg-green-50 border-green-200 hover:bg-green-100'
              : 'bg-white border-gray-200 hover:bg-gray-50',
          ]"
        >
          <!-- Rank number -->
          <span
            class="w-6 text-center text-xs font-bold shrink-0"
            :class="index < 8 ? 'text-green-700' : 'text-gray-400'"
          >
            {{ index + 1 }}
          </span>

          <!-- Drag handle -->
          <span class="drag-handle cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 shrink-0 text-lg leading-none">
            ⠿
          </span>

          <!-- Letter badge -->
          <span class="bg-gray-200 text-gray-700 rounded px-1 py-0.5 font-mono text-xs font-bold shrink-0 w-5 text-center">
            {{ element.letter }}
          </span>

          <!-- Team name -->
          <span
            class="flex-1 text-sm font-medium min-w-0 truncate"
            :class="index < 8 ? 'text-green-800' : 'text-gray-700'"
          >
            {{ element.name }}
          </span>

          <!-- Up/Down buttons -->
          <div class="flex gap-0.5 shrink-0">
            <button
              @click="move(index, index - 1)"
              :disabled="index === 0"
              class="w-6 h-6 flex items-center justify-center text-xs rounded hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed text-gray-600"
              aria-label="Move up"
            >
              ▲
            </button>
            <button
              @click="move(index, index + 1)"
              :disabled="index === localList.length - 1"
              class="w-6 h-6 flex items-center justify-center text-xs rounded hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed text-gray-600"
              aria-label="Move down"
            >
              ▼
            </button>
          </div>
        </div>
      </template>
    </draggable>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import draggable from 'vuedraggable'
import type { AflTeam, TeamRanking } from '../types/afl'

const props = defineProps<{
  teams: AflTeam[]
  ranking: TeamRanking
}>()

const emit = defineEmits<{
  (e: 'update:ranking', value: TeamRanking): void
  (e: 'reset'): void
}>()

const teamMap = computed(() =>
  Object.fromEntries(props.teams.map((t) => [t.id, t]))
)

const localList = computed<AflTeam[]>({
  get() {
    return props.ranking
      .map((id) => teamMap.value[id])
      .filter((t): t is AflTeam => Boolean(t))
  },
  set(newList) {
    emit('update:ranking', newList.map((t) => t.id))
  },
})

function emitRanking() {
  emit('update:ranking', localList.value.map((t) => t.id))
}

function move(fromIndex: number, toIndex: number) {
  if (toIndex < 0 || toIndex >= localList.value.length) return
  const newList = [...localList.value]
  const [item] = newList.splice(fromIndex, 1)
  newList.splice(toIndex, 0, item)
  emit('update:ranking', newList.map((t) => t.id))
}
</script>
