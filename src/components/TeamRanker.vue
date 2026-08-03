<template>
  <div data-tour="team-ranker">
    <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">Drag teams between tiers or within a tier</p>

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
            <div class="relative">
              <div class="flex items-center gap-2 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-colors select-none">
                <span class="drag-handle cursor-grab active:cursor-grabbing text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 text-lg leading-none touch-none">
                  ⠿
                </span>
                <span class="w-5 text-center text-xs font-bold shrink-0" :class="TIER_STYLES[tier.name].rank">
                  {{ rankMap[element.id] }}
                </span>
                <span class="flex items-center gap-1.5 flex-1 min-w-0 truncate">
                  <svg class="size-5 shrink-0"><use :href="`/ranked-predictor/icons.svg#${element.iconId}`" /></svg>
                  <span class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    <TeamFixtureSummaryPopup :teamId="element.id" :teamName="element.name" />
                  </span>
                </span>
                <button
                  data-tour="team-fixture-icon"
                  @click.stop="toggleFixture(element.id)"
                  class="shrink-0 text-xs text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 px-1 transition-colors"
                  title="View remaining fixture"
                >
                  📅
                </button>
              </div>

              <TeamFixturePopover
                v-if="openFixtureTeamId === element.id"
                :teamName="element.name"
                :games="remainingFixture(element.id)"
                :byeRounds="byeRounds(element.id)"
                @close="openFixtureTeamId = null"
              />
            </div>
          </template>
        </draggable>
      </div>
    </div>

    <!-- Click-outside overlay -->
    <div v-if="openFixtureTeamId !== null" class="fixed inset-0 z-40" @click="openFixtureTeamId = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import draggable from 'vuedraggable'
import type { AflTeam, AflMatch, TeamRanking } from '../types/afl'
import { DEFAULT_TIER_SIZES } from '../composables/useRanking'
import { DRAW_RESULT } from '../composables/useSimulation'
import TeamFixturePopover from './TeamFixturePopover.vue'
import TeamFixtureSummaryPopup from './TeamFixtureSummaryPopup.vue'
import type { FixtureGame } from './TeamFixturePopover.vue'
import { useAnalytics } from '../composables/useAnalytics'

const TIER_NAMES = ['S', 'A', 'B', 'C', 'D', 'E', 'F'] as const
type TierName = (typeof TIER_NAMES)[number]

const TIER_STYLES: Record<TierName, { label: string; zone: string; rank: string }> = {
  S: { label: 'bg-amber-400 text-white',  zone: 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800',     rank: 'text-amber-400' },
  A: { label: 'bg-green-500 text-white',  zone: 'border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800',     rank: 'text-green-500' },
  B: { label: 'bg-teal-500 text-white',   zone: 'border-teal-300 bg-teal-50 dark:bg-teal-950/30 dark:border-teal-800',         rank: 'text-teal-500' },
  C: { label: 'bg-blue-500 text-white',   zone: 'border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800',         rank: 'text-blue-500' },
  D: { label: 'bg-purple-500 text-white', zone: 'border-purple-300 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-800', rank: 'text-purple-500' },
  E: { label: 'bg-orange-500 text-white', zone: 'border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800', rank: 'text-orange-500' },
  F: { label: 'bg-red-500 text-white',    zone: 'border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800',             rank: 'text-red-500' },
}

const props = defineProps<{
  teams: AflTeam[]
  ranking: TeamRanking
  tierSizes: number[]
  matches: readonly AflMatch[]
  simulatedMatchWinners: Record<number, number> | null
}>()

const emit = defineEmits<{
  (e: 'update:ranking', value: TeamRanking): void
  (e: 'update:tierSizes', value: number[]): void
  (e: 'reset'): void
}>()

const teamMap = computed(() => Object.fromEntries(props.teams.map((t) => [t.id, t])))

interface Tier { name: TierName; teams: AflTeam[] }

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

const rankMap = computed<Record<number, number>>(() => {
  const flat = tiers.value.flatMap((t) => t.teams)
  return Object.fromEntries(flat.map((team, i) => [team.id, i + 1]))
})

function onDragEnd() {
  ignoreNext = true
  analytics.trackRankingDrag()
  emit('update:ranking', tiers.value.flatMap((t) => t.teams).map((t) => t.id))
  emit('update:tierSizes', tiers.value.map((t) => t.teams.length))
}

const analytics = useAnalytics()

const openFixtureTeamId = ref<number | null>(null)

function toggleFixture(teamId: number) {
  const opening = openFixtureTeamId.value !== teamId
  openFixtureTeamId.value = opening ? teamId : null
  if (opening) {
    const team = teamMap.value[teamId]
    if (team) analytics.trackFixtureOpen(team.name)
  }
}

function remainingFixture(teamId: number): FixtureGame[] {
  const myRank = rankMap.value[teamId] ?? 999
  return props.matches
    .filter((m) => m.status !== 'CONCLUDED' && (m.homeTeamId === teamId || m.awayTeamId === teamId))
    .map((m): FixtureGame => {
      const isHome = m.homeTeamId === teamId
      const opponentId = isHome ? m.awayTeamId : m.homeTeamId
      const simWinner = props.simulatedMatchWinners?.[m.id] ?? null
      return {
        matchId: m.id,
        roundNumber: m.roundNumber,
        opponent: isHome ? m.awayTeamName : m.homeTeamName,
        isHome,
        predicted: myRank < (rankMap.value[opponentId] ?? 999) ? 'W' : 'L',
        simulated: simWinner === null ? null : simWinner === teamId ? 'W' : simWinner === DRAW_RESULT ? 'D' : 'L',
      }
    })
    .sort((a, b) => a.roundNumber - b.roundNumber)
}

function byeRounds(teamId: number): number[] {
  const gameRounds = new Set(
    props.matches
      .filter((m) => m.status !== 'CONCLUDED' && (m.homeTeamId === teamId || m.awayTeamId === teamId))
      .map((m) => m.roundNumber)
  )
  return props.matches
    .filter((m) => m.status !== 'CONCLUDED' && m.byeTeamIds.includes(teamId) && !gameRounds.has(m.roundNumber))
    .map((m) => m.roundNumber)
    .filter((r, i, arr) => arr.indexOf(r) === i)
    .sort((a, b) => a - b)
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
.ranker-drop-ghost > * { visibility: hidden; }
.ranker-chosen {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
  border-color: #93c5fd !important;
  z-index: 9999;
}
</style>
