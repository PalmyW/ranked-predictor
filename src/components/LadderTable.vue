<template>
  <div>
    <h2 v-if="title" class="text-lg font-bold mb-3 text-gray-800">{{ title }}</h2>

    <div v-if="isLoading" class="space-y-1">
      <div v-for="n in 18" :key="n" class="h-8 bg-gray-100 rounded animate-pulse" />
    </div>

    <table v-else class="w-full text-sm table-fixed border-collapse">
      <thead>
        <tr class="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide">
          <th class="w-8 py-2 text-center font-semibold">#</th>
          <th class="py-2 text-left pl-2 font-semibold">Team</th>
          <th class="w-8 py-2 text-center font-semibold">P</th>
          <th class="w-8 py-2 text-center font-semibold">W</th>
          <th class="w-8 py-2 text-center font-semibold">L</th>
          <th class="w-8 py-2 text-center font-semibold">D</th>
          <th class="w-10 py-2 text-center font-semibold">Pts</th>
          <th class="w-16 py-2 text-center font-semibold">%</th>
          <th class="w-14 py-2 text-center font-semibold">
            <span class="inline-flex items-center gap-0.5">
              Diff
              <span
                class="text-gray-400 hover:text-gray-600 cursor-default"
                title="Schedule difficulty score (1–18). Calculated as the average ladder position of each team's remaining opponents, normalised so 1 = easiest draw and 18 = hardest draw."
              >ⓘ</span>
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(row, i) in ladder" :key="row.teamId">
          <tr
            class="hover:bg-gray-50 transition-colors"
            :class="{
              'border-b-2 border-red-400': i === 5,
              'border-b-2 border-blue-400': i === 9,
              'border-b border-gray-100': i !== 5 && i !== 9,
            }"
          >
            <td class="py-1.5 text-center text-gray-500 text-xs">{{ i + 1 }}</td>
            <td class="py-1.5 pl-2 font-medium text-gray-800">{{ row.teamName }}</td>
            <td class="py-1.5 text-center text-gray-600">{{ row.played }}</td>
            <td class="py-1.5 text-center text-gray-600">{{ row.wins }}</td>
            <td class="py-1.5 text-center text-gray-600">{{ row.losses }}</td>
            <td class="py-1.5 text-center text-gray-600">{{ row.draws }}</td>
            <td class="py-1.5 text-center font-bold text-gray-700">{{ row.pts }}</td>
            <td class="py-1.5 text-center text-gray-600 text-xs">{{ row.percentage.toFixed(1) }}</td>
            <td
              class="py-1.5 text-center text-xs font-semibold"
              :class="normalizedDiffClass(row.teamId)"
              :title="diffTooltip(row)"
            >
              {{ normalizedDiff(row.teamId) }}
            </td>
          </tr>
        </template>
      </tbody>
    </table>

    <p v-if="!isLoading && ladder.length === 0" class="text-gray-400 text-sm text-center py-8">
      No data available
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { LadderRow } from '../types/afl'

const props = defineProps<{
  ladder: LadderRow[]
  title?: string
  isLoading?: boolean
}>()

// Min-max normalise raw difficulty values across all teams to a 1–18 scale.
// Raw difficulty = avg opponent rank: lower raw = harder schedule.
// We invert so that 1 = easiest, 18 = hardest.
const normalizedMap = computed<Map<number, number>>(() => {
  const withDiff = props.ladder.filter((r) => r.difficulty !== null)
  if (withDiff.length < 2) return new Map()

  const raws = withDiff.map((r) => r.difficulty as number)
  const minRaw = Math.min(...raws)  // smallest avg opp rank = hardest
  const maxRaw = Math.max(...raws)  // largest avg opp rank = easiest
  const range = maxRaw - minRaw

  const map = new Map<number, number>()
  for (const row of withDiff) {
    const raw = row.difficulty as number
    // Invert: high raw (easy) → low normalised; low raw (hard) → high normalised
    const normalised = range === 0 ? 9.5 : 1 + ((maxRaw - raw) / range) * 17
    map.set(row.teamId, normalised)
  }
  return map
})

function normalizedDiff(teamId: number): string {
  const v = normalizedMap.value.get(teamId)
  return v !== undefined ? v.toFixed(1) : '—'
}

function normalizedDiffClass(teamId: number): string {
  const v = normalizedMap.value.get(teamId)
  if (v === undefined) return 'text-gray-300'
  if (v >= 14) return 'text-red-600'
  if (v >= 10) return 'text-orange-500'
  if (v >= 6)  return 'text-gray-500'
  return 'text-green-600'
}

function diffTooltip(row: LadderRow): string {
  if (!row.remainingOpponents || row.remainingOpponents.length === 0) return 'No remaining games'
  const avg = row.difficulty !== null ? row.difficulty.toFixed(1) : '—'
  const lines = row.remainingOpponents.map((o) => `· ${o.name} (${o.rank})`)
  return `Avg opponent position: ${avg}\n${lines.join('\n')}`
}
</script>
