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
        </tr>
      </thead>
      <tbody>
        <template v-for="(row, i) in ladder" :key="row.teamId">
          <!-- Finals cut-off separator -->
          <tr v-if="i === 8" class="border-t-2 border-gray-400" aria-hidden="true">
            <td colspan="8" class="py-0" />
          </tr>
          <tr
            :class="[
              'border-b border-gray-100 transition-colors',
              row.isFinalist
                ? 'bg-green-50 hover:bg-green-100'
                : 'hover:bg-gray-50',
            ]"
          >
            <td class="py-1.5 text-center text-gray-500 text-xs">{{ i + 1 }}</td>
            <td class="py-1.5 pl-2">
              <span :class="['font-medium', row.isFinalist ? 'text-green-800' : 'text-gray-800']">
                {{ row.teamName }}
              </span>
            </td>
            <td class="py-1.5 text-center text-gray-600">{{ row.played }}</td>
            <td class="py-1.5 text-center" :class="row.isFinalist ? 'text-green-700 font-semibold' : 'text-gray-600'">
              {{ row.wins }}
            </td>
            <td class="py-1.5 text-center text-gray-600">{{ row.losses }}</td>
            <td class="py-1.5 text-center text-gray-600">{{ row.draws }}</td>
            <td class="py-1.5 text-center font-bold" :class="row.isFinalist ? 'text-green-700' : 'text-gray-700'">
              {{ row.pts }}
            </td>
            <td class="py-1.5 text-center text-gray-600 text-xs">{{ row.percentage.toFixed(1) }}</td>
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
import type { LadderRow } from '../types/afl'

defineProps<{
  ladder: LadderRow[]
  title?: string
  isLoading?: boolean
}>()
</script>
