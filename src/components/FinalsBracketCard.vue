<template>
  <div class="w-64 shrink-0 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
    <div class="border-b border-gray-100 px-3 py-1.5 text-[11px] text-gray-400 dark:border-gray-800 dark:text-gray-500">
      Date: {{ dateLabel }} · Stadium: {{ venueLabel }}
    </div>

    <div class="divide-y divide-gray-100 dark:divide-gray-800">
      <div
        v-for="slot in [match.home, match.away]"
        :key="slot.teamId ?? slot.placeholderLabel"
        class="flex items-center gap-2 px-3 py-2"
        :class="[
          isWinner(slot) ? 'bg-gray-50 dark:bg-gray-800/60' : '',
          isClickable(slot) ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20' : '',
        ]"
        :data-row="slot === match.home ? 'home' : 'away'"
        @click="onSlotClick(slot)"
      >
        <span
          v-if="slot.seed !== null"
          class="w-4 shrink-0 text-right text-xs font-semibold text-gray-400 dark:text-gray-500"
        >{{ slot.seed }}</span>
        <span v-else class="w-4 shrink-0"></span>

        <svg v-if="iconId(slot)" class="size-6 shrink-0"><use :href="`/ranked-predictor/icons.svg#${iconId(slot)}`" /></svg>
        <span
          v-else
          class="flex size-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-400 dark:bg-gray-800 dark:text-gray-500"
        >?</span>

        <span
          class="min-w-0 flex-1 truncate text-sm"
          :class="slot.teamId !== null
            ? (isWinner(slot) ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300')
            : 'italic text-gray-400 dark:text-gray-500'"
        >{{ slot.teamId !== null ? teamName(slot) : slot.placeholderLabel }}</span>

        <span
          v-if="isWinner(slot) && match.isSimulated"
          class="shrink-0 rounded bg-purple-500 px-1 text-[10px] font-bold leading-tight text-white"
          title="Simulated winner"
        >S</span>
        <span
          v-if="isWinner(slot) && match.isManualPick"
          class="shrink-0 rounded bg-blue-500 px-1 text-[10px] font-bold leading-tight text-white"
          title="Your pick"
        >P</span>
        <span
          v-if="slot.teamId !== null && match.homeScore !== null && match.awayScore !== null"
          class="shrink-0 text-xs font-mono font-semibold tabular-nums text-gray-600 dark:text-gray-400"
        >{{ slot === match.home ? match.homeScore : match.awayScore }}</span>
      </div>
    </div>

    <div class="border-t border-gray-100 px-3 py-1.5 text-[11px] font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
      {{ match.finalsMatchLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FinalsBracketMatch, FinalsSlot } from '../types/afl'
import { teamById } from '../composables/useAFLData'

const props = defineProps<{ match: FinalsBracketMatch; interactive?: boolean }>()
const emit = defineEmits<{ pick: [matchId: number, teamId: number] }>()

function teamName(slot: FinalsSlot): string {
  return slot.teamId !== null ? (teamById(slot.teamId)?.name ?? slot.placeholderLabel) : slot.placeholderLabel
}

function iconId(slot: FinalsSlot): string | null {
  return slot.teamId !== null ? (teamById(slot.teamId)?.iconId ?? null) : null
}

function isWinner(slot: FinalsSlot): boolean {
  return props.match.winnerTeamId !== null && slot.teamId === props.match.winnerTeamId
}

// A team can be manually picked once both slots are known and the match
// hasn't actually been played yet.
function isClickable(slot: FinalsSlot): boolean {
  return !!props.interactive && props.match.status !== 'CONCLUDED' && slot.teamId !== null
}

function onSlotClick(slot: FinalsSlot) {
  if (!isClickable(slot) || slot.teamId === null) return
  emit('pick', props.match.matchId, slot.teamId)
}

const venueLabel = computed(() =>
  props.match.venueName && props.match.venueName !== 'To Be Confirmed' ? props.match.venueName : 'TBC',
)

// Unconfirmed teams or an unconfirmed stadium both mean the match's actual
// timeslot isn't locked in yet either (the AFL only fixes it once both
// finalists — and the venue — are known), so show "TBC" rather than a date
// that may still move.
const dateLabel = computed(() => {
  if (props.match.home.teamId === null || props.match.away.teamId === null) return 'TBC'
  if (venueLabel.value === 'TBC') return 'TBC'
  try {
    const d = new Date(props.match.utcStartTime)
    if (Number.isNaN(d.getTime())) return 'TBC'
    return d.toLocaleString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'Australia/Melbourne',
    })
  } catch {
    return 'TBC'
  }
})
</script>
