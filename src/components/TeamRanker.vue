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
      ghost-class="ranker-drop-ghost"
      chosen-class="ranker-chosen"
      drag-class="ranker-dragging"
      @end="onDragEnd"
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
          <span class="drag-handle cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 shrink-0 text-lg leading-none px-1 touch-none">
            ⠿
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
              @click.stop="move(index, index - 1)"
              :disabled="index === 0"
              class="w-6 h-6 flex items-center justify-center text-xs rounded hover:bg-gray-200 disabled:opacity-20 disabled:cursor-not-allowed text-gray-600"
              aria-label="Move up"
            >
              ▲
            </button>
            <button
              @click.stop="move(index, index + 1)"
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
import { ref, watch, computed } from 'vue'
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

// vuedraggable requires a plain ref (not computed) to mutate during drag
const localList = ref<AflTeam[]>([])

// Sync localList when ranking prop changes (but not when we triggered the change)
let ignoreNext = false
watch(
  () => props.ranking,
  (ids) => {
    if (ignoreNext) { ignoreNext = false; return }
    localList.value = ids
      .map((id) => teamMap.value[id])
      .filter((t): t is AflTeam => Boolean(t))
  },
  { immediate: true, deep: true }
)

function onDragEnd() {
  ignoreNext = true
  emit('update:ranking', localList.value.map((t) => t.id))
}

function move(fromIndex: number, toIndex: number) {
  if (toIndex < 0 || toIndex >= localList.value.length) return
  const next = [...localList.value]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  ignoreNext = true
  localList.value = next
  emit('update:ranking', next.map((t) => t.id))
}
</script>

<!-- Unscoped: sortablejs adds these classes directly to DOM elements, bypassing Vue scoping -->
<style>
/* Placeholder gap shown at the drop target position while dragging */
.ranker-drop-ghost {
  background-color: #eff6ff !important; /* blue-50 */
  border: 2px dashed #93c5fd !important; /* blue-300 */
  border-radius: 0.375rem;
  opacity: 1 !important;
}
.ranker-drop-ghost > * {
  visibility: hidden; /* keep the height/layout but hide content */
}

/* The item being held while dragging — elevated look */
.ranker-chosen {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
  border-color: #93c5fd !important; /* blue-300 */
  z-index: 9999;
}
</style>
