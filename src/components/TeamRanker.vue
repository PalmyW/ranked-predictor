<template>
  <div>
    <div class="flex items-center justify-between mb-3">
      <p class="text-xs text-gray-500">Drag teams between tiers or within a tier</p>
      <button
        @click="$emit('reset')"
        class="text-xs text-blue-600 hover:text-blue-800 underline"
      >
        Reset to ladder
      </button>
    </div>

    <div class="space-y-1.5">
      <div v-for="tier in tiers" :key="tier.name" class="flex gap-2">
        <!-- Tier label -->
        <div
          class="w-7 shrink-0 flex items-center justify-center rounded font-black text-sm self-stretch min-h-[38px]"
          :class="TIER_STYLES[tier.name].label"
        >
          {{ tier.name }}
        </div>

        <!-- Draggable zone -->
        <draggable
          v-model="tier.teams"
          item-key="id"
          handle=".drag-handle"
          :group="{ name: 'teams' }"
          :animation="150"
          ghost-class="ranker-drop-ghost"
          chosen-class="ranker-chosen"
          @end="onDragEnd"
          class="flex-1 min-h-[38px] rounded border-2 border-dashed p-1 space-y-1"
          :class="TIER_STYLES[tier.name].zone"
        >
          <template #item="{ element }">
            <div
              class="flex items-center gap-2 px-2 py-1.5 rounded border transition-colors select-none"
              :class="TIER_STYLES[tier.name].item"
            >
              <span class="drag-handle cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 shrink-0 text-lg leading-none touch-none">
                ⠿
              </span>
              <span class="w-5 text-center text-xs font-bold text-gray-400 shrink-0">
                {{ rankMap[element.id] }}
              </span>
              <span class="flex-1 text-sm font-medium min-w-0 truncate" :class="TIER_STYLES[tier.name].text">
                {{ element.name }}
              </span>
            </div>
          </template>
        </draggable>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import draggable from 'vuedraggable'
import type { AflTeam, TeamRanking } from '../types/afl'
import { DEFAULT_TIER_SIZES } from '../composables/useRanking'

const TIER_NAMES = ['S', 'A', 'B', 'C', 'D', 'E', 'F'] as const
type TierName = (typeof TIER_NAMES)[number]

const TIER_STYLES: Record<TierName, { label: string; zone: string; item: string; text: string }> = {
  S: { label: 'bg-amber-400 text-white',   zone: 'border-amber-300 bg-amber-50',   item: 'bg-white border-amber-200',   text: 'text-amber-900' },
  A: { label: 'bg-green-500 text-white',    zone: 'border-green-300 bg-green-50',   item: 'bg-white border-green-200',   text: 'text-green-900' },
  B: { label: 'bg-teal-500 text-white',     zone: 'border-teal-300 bg-teal-50',     item: 'bg-white border-teal-200',    text: 'text-teal-900' },
  C: { label: 'bg-blue-500 text-white',     zone: 'border-blue-300 bg-blue-50',     item: 'bg-white border-blue-200',    text: 'text-blue-900' },
  D: { label: 'bg-purple-500 text-white',   zone: 'border-purple-300 bg-purple-50', item: 'bg-white border-purple-200',  text: 'text-purple-900' },
  E: { label: 'bg-orange-500 text-white',   zone: 'border-orange-300 bg-orange-50', item: 'bg-white border-orange-200',  text: 'text-orange-900' },
  F: { label: 'bg-red-500 text-white',      zone: 'border-red-300 bg-red-50',       item: 'bg-white border-red-200',     text: 'text-red-900' },
}

const props = defineProps<{
  teams: AflTeam[]
  ranking: TeamRanking
  tierSizes: number[]
}>()

const emit = defineEmits<{
  (e: 'update:ranking', value: TeamRanking): void
  (e: 'update:tierSizes', value: number[]): void
  (e: 'reset'): void
}>()

const teamMap = computed(() =>
  Object.fromEntries(props.teams.map((t) => [t.id, t]))
)

interface Tier {
  name: TierName
  teams: AflTeam[]
}

function splitIntoTiers(teamList: AflTeam[], sizes: number[]): Tier[] {
  let offset = 0
  return TIER_NAMES.map((name, i) => {
    const count = sizes[i] ?? DEFAULT_TIER_SIZES[i]
    const teams = teamList.slice(offset, offset + count)
    offset += count
    return { name, teams }
  })
}

const tiers = ref<Tier[]>(TIER_NAMES.map((name) => ({ name, teams: [] })))

let ignoreNext = false
watch(
  () => [props.ranking, props.tierSizes] as const,
  ([ids, sizes]) => {
    if (ignoreNext) { ignoreNext = false; return }
    const teamList = ids.map((id) => teamMap.value[id]).filter((t): t is AflTeam => Boolean(t))
    tiers.value = splitIntoTiers(teamList, sizes)
  },
  { immediate: true, deep: true }
)

// Global rank across all tiers (1 = best)
const rankMap = computed<Record<number, number>>(() => {
  const flat = tiers.value.flatMap((t) => t.teams)
  return Object.fromEntries(flat.map((team, i) => [team.id, i + 1]))
})

function onDragEnd() {
  ignoreNext = true
  const flat = tiers.value.flatMap((t) => t.teams).map((t) => t.id)
  const newTierSizes = tiers.value.map((t) => t.teams.length)
  emit('update:ranking', flat)
  emit('update:tierSizes', newTierSizes)
}
</script>

<!-- Unscoped: sortablejs adds these classes directly to DOM elements, bypassing Vue scoping -->
<style>
.ranker-drop-ghost {
  background-color: #eff6ff !important;
  border: 2px dashed #93c5fd !important;
  border-radius: 0.375rem;
  opacity: 1 !important;
}
.ranker-drop-ghost > * {
  visibility: hidden;
}
.ranker-chosen {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
  border-color: #93c5fd !important;
  z-index: 9999;
}
</style>
