<template>
  <!-- Team detail popup -->
  <Teleport to="body">
    <div
      v-if="popupRow !== null"
      class="fixed z-50 overflow-hidden rounded-xl border border-gray-200 bg-white text-xs shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      :style="popupStyle"
      @click.stop
    >
      <!-- Header -->
      <div class="border-b border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/60">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <svg class="size-6 shrink-0"><use :href="`${BASE_URL}icons.svg#${popupRow.iconId}`" /></svg>
            <span class="text-sm font-bold text-gray-800 dark:text-gray-100">{{ popupRow.teamName }}</span>
          </div>
          <button
            @click="closePopup"
            class="flex size-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            aria-label="Close"
          >✕</button>
        </div>
      </div>

      <!-- Stats summary -->
      <div class="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
        <!-- Header row labels -->
        <div class="mb-1 flex items-center justify-end gap-2 text-gray-400 dark:text-gray-500">
          <span class="w-14 text-right">All</span>
          <span class="w-14 text-right">Home</span>
          <span class="w-14 text-right">Away</span>
        </div>
        <!-- Avg attack -->
        <div class="flex items-center justify-between gap-2 py-0.5">
          <span class="text-gray-500 dark:text-gray-400">Avg attack</span>
          <div class="flex items-center gap-2 tabular-nums">
            <span class="w-14 text-right font-semibold text-gray-800 dark:text-gray-200">{{ popupRow.avgFor.toFixed(1) }}</span>
            <span class="w-14 text-right text-gray-600 dark:text-gray-400">{{ popupRow.playedHome > 0 ? popupRow.avgForHome.toFixed(1) : '–' }}</span>
            <span class="w-14 text-right text-gray-600 dark:text-gray-400">{{ popupRow.playedAway > 0 ? popupRow.avgForAway.toFixed(1) : '–' }}</span>
          </div>
        </div>
        <!-- Avg conceded -->
        <div class="flex items-center justify-between gap-2 py-0.5">
          <span class="text-gray-500 dark:text-gray-400">Avg conceded</span>
          <div class="flex items-center gap-2 tabular-nums">
            <span class="w-14 text-right font-semibold text-gray-800 dark:text-gray-200">{{ popupRow.avgAgainst.toFixed(1) }}</span>
            <span class="w-14 text-right text-gray-600 dark:text-gray-400">{{ popupRow.playedHome > 0 ? popupRow.avgAgainstHome.toFixed(1) : '–' }}</span>
            <span class="w-14 text-right text-gray-600 dark:text-gray-400">{{ popupRow.playedAway > 0 ? popupRow.avgAgainstAway.toFixed(1) : '–' }}</span>
          </div>
        </div>
        <!-- Defence adj -->
        <div class="flex items-center justify-between gap-2 py-0.5">
          <span class="text-gray-500 dark:text-gray-400">Defence adj</span>
          <div class="flex items-center gap-2 tabular-nums">
            <span
              class="w-14 text-right font-semibold"
              :class="popupRow.defenceAdjustment < 0 ? 'text-green-600 dark:text-green-400' : popupRow.defenceAdjustment > 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'"
            >{{ popupRow.defenceAdjustment > 0 ? '+' : '' }}{{ popupRow.defenceAdjustment.toFixed(1) }}</span>
            <span
              class="w-14 text-right font-semibold"
              :class="popupRow.defenceAdjHome < 0 ? 'text-green-600 dark:text-green-400' : popupRow.defenceAdjHome > 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'"
            >{{ popupRow.playedHome > 0 ? (popupRow.defenceAdjHome > 0 ? '+' : '') + popupRow.defenceAdjHome.toFixed(1) : '–' }}</span>
            <span
              class="w-14 text-right font-semibold"
              :class="popupRow.defenceAdjAway < 0 ? 'text-green-600 dark:text-green-400' : popupRow.defenceAdjAway > 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'"
            >{{ popupRow.playedAway > 0 ? (popupRow.defenceAdjAway > 0 ? '+' : '') + popupRow.defenceAdjAway.toFixed(1) : '–' }}</span>
          </div>
        </div>
      </div>

      <!-- Match breakdown subtitle -->
      <div class="border-b border-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:text-gray-500">
        Opponent score vs their own season avg
      </div>

      <!-- Per-match rows -->
      <div class="overflow-y-auto" style="max-height: 280px">
        <div
          v-if="popupMatchBreakdown.length === 0"
          class="px-3 py-4 text-center text-gray-400 dark:text-gray-500"
        >
          No concluded matches
        </div>
        <div
          v-for="m in popupMatchBreakdown"
          :key="m.matchId"
          class="flex items-center gap-2 border-b border-gray-50 px-3 py-1.5 last:border-0 dark:border-gray-800/60"
        >
          <span class="w-7 shrink-0 text-right tabular-nums text-gray-400 dark:text-gray-500">R{{ m.roundNumber }}</span>
          <svg class="size-5 shrink-0"><use :href="`${BASE_URL}icons.svg#${m.opponentIconId}`" /></svg>
          <span class="flex-1 truncate font-medium text-gray-800 dark:text-gray-100">{{ m.opponentName }}</span>
          <span class="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">{{ m.opponentScore }}</span>
          <span
            class="w-10 shrink-0 text-right tabular-nums font-semibold"
            :class="
              m.differential > 0
                ? 'text-red-500 dark:text-red-400'
                : m.differential < 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-400'
            "
          >{{ m.differential > 0 ? '+' : '' }}{{ m.differential.toFixed(0) }}</span>
        </div>
      </div>

      <!-- Footer legend -->
      <div class="border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500">
        <span class="text-red-500">+</span> = opponent above avg &nbsp;·&nbsp;
        <span class="text-green-600">−</span> = below avg
      </div>
    </div>
  </Teleport>

  <main class="mx-auto max-w-4xl px-4 py-6 space-y-6">
    <!-- Page heading -->
    <div>
      <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">PalmyScore™</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Each team's attack and defence rating is derived from their season averages. The defence
        adjustment measures how many points above or below their average opponents score when facing
        that team. Predictions apply each team's attack average adjusted by the opponent's defence
        rating.
      </p>
    </div>

    <!-- No-data banner -->
    <div
      v-if="!isLoading && !hasEnoughData"
      class="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
    >
      No concluded matches yet — predictions will appear once the season begins.
    </div>

    <!-- Predicted Scores card -->
    <div
      v-if="hasEnoughData || isLoading"
      data-tour="score-predictor-predictions"
      class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    >
      <div
        class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700"
      >
        <div>
          <h2 class="text-sm font-bold text-gray-800 dark:text-gray-100">PalmyScore™ Predictions</h2>
          <p v-if="nextRoundName" class="text-xs text-gray-400 dark:text-gray-500">
            {{ nextRoundName }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <!-- Venue toggle -->
          <div class="flex overflow-hidden rounded border border-gray-300 text-xs font-semibold dark:border-gray-600">
            <button
              @click="venueAdjusted = false"
              class="px-3 py-1 transition-colors"
              :class="
                !venueAdjusted
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              "
            >All Games</button>
            <button
              @click="venueAdjusted = true"
              class="px-3 py-1 transition-colors"
              :class="
                venueAdjusted
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              "
            >Home/Away</button>
          </div>
          <!-- Recent form window select -->
          <select
            v-model.number="recentLimit"
            :title="recentLimit ? `Rating each team on their last ${recentLimit} games` : `Rate each team on their last X games only`"
            class="rounded border px-2 py-1 text-xs font-semibold transition-colors"
            :class="
              recentLimit
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            "
          >
            <option :value="0">Full Season</option>
            <option v-for="n in RECENT_OPTIONS" :key="n" :value="n">Last {{ n }}</option>
          </select>
          <!-- Round toggle -->
          <div
            v-if="allUpcomingPredictions.length > 0"
            class="flex overflow-hidden rounded border border-gray-300 text-xs font-semibold dark:border-gray-600"
          >
            <button
              @click="showAllUpcoming = false"
              class="px-3 py-1 transition-colors"
              :class="
                !showAllUpcoming
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              "
            >
              Next Round
            </button>
            <button
              @click="showAllUpcoming = true"
              class="px-3 py-1 transition-colors"
              :class="
                showAllUpcoming
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              "
            >
              All Upcoming
            </button>
          </div>
          <!-- Team filter (all upcoming only) -->
          <select
            v-if="showAllUpcoming && upcomingTeams.length > 0"
            v-model="teamFilter"
            class="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
          >
            <option :value="null">All Teams</option>
            <option v-for="t in upcomingTeams" :key="t.id" :value="t.id">
              {{ t.name }}
            </option>
          </select>
        </div>
      </div>

      <!-- Loading skeleton -->
      <div v-if="isLoading" class="space-y-px p-2">
        <div
          v-for="n in 5"
          :key="n"
          class="h-12 animate-pulse rounded bg-gray-100 dark:bg-gray-800"
        />
      </div>

      <!-- Match rows -->
      <template v-else>
        <div
          v-if="activePredictions.length === 0"
          class="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500"
        >
          No upcoming matches scheduled.
        </div>

        <template v-for="(group, gIdx) in roundGroups" :key="group.roundNumber">
          <!-- Round header (collapsible when more than one round is shown) -->
          <button
            v-if="roundGroups.length > 1"
            type="button"
            @click="toggleRound(group.roundNumber, gIdx)"
            class="flex w-full items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2 text-left transition-colors hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-800/40 dark:hover:bg-gray-800/70"
          >
            <span class="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
              <svg
                class="size-3.5 shrink-0 text-gray-400 transition-transform"
                :class="isRoundExpanded(group.roundNumber, gIdx) ? 'rotate-90' : ''"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              {{ group.roundName }}
              <span class="font-normal text-gray-400 dark:text-gray-500">
                ({{ group.matches.length }} {{ group.matches.length === 1 ? 'match' : 'matches' }})
              </span>
            </span>
            <span
              v-if="!isRoundExpanded(group.roundNumber, gIdx) && group.avgMargin !== null"
              class="whitespace-nowrap text-xs font-semibold text-gray-500 dark:text-gray-400"
              title="Average predicted winning margin this round"
            >
              Avg margin: {{ group.avgMargin.toFixed(1) }}
            </span>
          </button>

        <template v-if="roundGroups.length === 1 || isRoundExpanded(group.roundNumber, gIdx)">
        <div
          v-for="m in group.matches"
          :key="m.matchId"
          class="flex items-center gap-2 border-b border-gray-100 px-4 py-3 last:border-0 dark:border-gray-800"
        >
          <!-- Home side -->
          <div
            class="flex flex-1 cursor-pointer items-center justify-end gap-2 rounded px-1 py-0.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            :class="popupTeamId === m.homeTeamId ? 'bg-blue-50 dark:bg-blue-900/10' : ''"
            @click.stop="onRowClick(m.homeTeamId, $event)"
          >
            <span class="hidden text-sm text-gray-800 dark:text-gray-200 sm:inline" :class="nameWeight(m, true)">
              {{ m.homeTeamName }}
            </span>
            <span class="text-sm text-gray-800 dark:text-gray-200 sm:hidden" :class="nameWeight(m, true)">
              {{ m.homeTeamAbbreviation }}
            </span>
            <svg class="size-6 shrink-0">
              <use :href="`${BASE_URL}icons.svg#${m.homeTeamIconId}`" />
            </svg>
          </div>

          <!-- Scores (large) + calculation + win % -->
          <div class="flex shrink-0 flex-col items-center">
            <div class="flex items-start gap-1.5 tabular-nums">
              <!-- Home -->
              <div class="flex flex-col items-end">
                <span
                  class="text-xl font-bold leading-none"
                  :class="
                    m.hasStrengthData
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-300 dark:text-gray-600'
                  "
                >
                  {{ m.hasStrengthData ? m.predictedHomeScore : '–' }}
                </span>
                <span
                  v-if="scoreBreakdownById[m.matchId]"
                  class="mt-1 whitespace-nowrap text-[10px]"
                  :class="adjClass(scoreBreakdownById[m.matchId].home.adj)"
                  title="Home team average ± opponent's defence adjustment"
                >{{ scoreBreakdownById[m.matchId].home.eq }}</span>
              </div>
              <span class="mt-1.5 text-xs text-gray-400 dark:text-gray-500">vs</span>
              <!-- Away -->
              <div class="flex flex-col items-start">
                <span
                  class="text-xl font-bold leading-none"
                  :class="
                    m.hasStrengthData
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-gray-300 dark:text-gray-600'
                  "
                >
                  {{ m.hasStrengthData ? m.predictedAwayScore : '–' }}
                </span>
                <span
                  v-if="scoreBreakdownById[m.matchId]"
                  class="mt-1 whitespace-nowrap text-[10px]"
                  :class="adjClass(scoreBreakdownById[m.matchId].away.adj)"
                  title="Away team average ± opponent's defence adjustment"
                >{{ scoreBreakdownById[m.matchId].away.eq }}</span>
              </div>
            </div>
            <div
              v-if="winInfoById[m.matchId]"
              class="mt-1 whitespace-nowrap text-[11px] font-semibold text-gray-500 dark:text-gray-400"
              title="Historical win rate for this predicted margin"
            >
              {{ winInfoById[m.matchId].abbr }} {{ winInfoById[m.matchId].pct }}%
            </div>
          </div>

          <!-- Away side -->
          <div
            class="flex flex-1 cursor-pointer items-center justify-start gap-2 rounded px-1 py-0.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            :class="popupTeamId === m.awayTeamId ? 'bg-blue-50 dark:bg-blue-900/10' : ''"
            @click.stop="onRowClick(m.awayTeamId, $event)"
          >
            <svg class="size-6 shrink-0">
              <use :href="`${BASE_URL}icons.svg#${m.awayTeamIconId}`" />
            </svg>
            <span class="hidden text-sm text-gray-800 dark:text-gray-200 sm:inline" :class="nameWeight(m, false)">
              {{ m.awayTeamName }}
            </span>
            <span class="text-sm text-gray-800 dark:text-gray-200 sm:hidden" :class="nameWeight(m, false)">
              {{ m.awayTeamAbbreviation }}
            </span>
          </div>
        </div>
        </template>
        </template>
      </template>
    </div>

    <!-- Team Strength table card -->
    <div
      v-if="hasEnoughData || isLoading"
      data-tour="score-predictor-strength"
      class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    >
      <div
        class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700"
      >
        <h2 class="text-sm font-bold text-gray-800 dark:text-gray-100">Attack &amp; Defence</h2>
        <div
          class="flex overflow-hidden rounded border border-gray-300 text-xs font-semibold dark:border-gray-600"
        >
          <button
            @click="sortKey = 'attackRank'"
            class="px-3 py-1 transition-colors"
            :class="
              sortKey === 'attackRank'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            "
          >
            Attack
          </button>
          <button
            @click="sortKey = 'defenceRank'"
            class="px-3 py-1 transition-colors"
            :class="
              sortKey === 'defenceRank'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            "
          >
            Defence
          </button>
        </div>
      </div>

      <!-- Loading skeleton -->
      <div v-if="isLoading" class="space-y-px p-2">
        <div
          v-for="n in 18"
          :key="n"
          class="h-9 animate-pulse rounded bg-gray-100 dark:bg-gray-800"
        />
      </div>

      <table v-else class="w-full table-fixed text-sm">
        <thead>
          <tr class="border-b border-gray-100 text-xs text-gray-400 dark:border-gray-800 dark:text-gray-500">
            <th class="w-8 py-2 pl-4 text-left font-medium">#</th>
            <th class="py-2 pl-2 text-left font-medium">Team</th>
            <th class="w-24 py-2 pr-1 text-right font-medium">Avg Score</th>
            <th class="hidden w-20 py-2 pr-1 text-right font-medium sm:table-cell">Atk Rank</th>
            <th class="w-28 py-2 pr-1 text-right font-medium">Avg Conceded</th>
            <th class="w-28 py-2 pr-4 text-right font-medium">Def Adj</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in sortedStrengthRows"
            :key="row.teamId"
            class="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50 dark:border-gray-800/50 dark:hover:bg-gray-800/30"
            :class="popupTeamId === row.teamId ? 'bg-blue-50 dark:bg-blue-900/10' : ''"
            @click="onRowClick(row.teamId, $event)"
          >
            <td class="py-2 pl-4 text-xs text-gray-400 dark:text-gray-500">{{ i + 1 }}</td>
            <td class="py-2 pl-2">
              <div class="flex items-center gap-2">
                <svg class="size-5 shrink-0">
                  <use :href="`${BASE_URL}icons.svg#${row.iconId}`" />
                </svg>
                <span class="hidden font-medium text-gray-800 dark:text-gray-200 sm:inline">
                  {{ row.teamName }}
                </span>
                <span class="font-medium text-gray-800 dark:text-gray-200 sm:hidden">
                  {{ row.abbreviation }}
                </span>
                <span v-if="row.played === 0" class="text-xs text-gray-300 dark:text-gray-600">no data</span>
              </div>
            </td>
            <td class="py-2 pr-1 text-right tabular-nums">
              <span class="font-semibold text-gray-800 dark:text-gray-200">
                {{ row.played > 0 ? row.avgFor.toFixed(1) : '–' }}
              </span>
            </td>
            <td class="hidden py-2 pr-1 text-right tabular-nums sm:table-cell">
              <span :class="rankClass(row.attackRank)">
                {{ row.played > 0 ? row.attackRank : '–' }}
              </span>
            </td>
            <td class="py-2 pr-1 text-right tabular-nums">
              <span class="text-gray-600 dark:text-gray-400">
                {{ row.played > 0 ? row.avgAgainst.toFixed(1) : '–' }}
              </span>
            </td>
            <td class="py-2 pr-4 text-right tabular-nums">
              <span
                v-if="row.played > 0"
                :class="
                  row.defenceAdjustment < 0
                    ? 'font-semibold text-green-600 dark:text-green-400'
                    : row.defenceAdjustment > 0
                      ? 'font-semibold text-red-500 dark:text-red-400'
                      : 'text-gray-400 dark:text-gray-500'
                "
              >
                {{ row.defenceAdjustment > 0 ? '+' : '' }}{{ row.defenceAdjustment.toFixed(1) }}
              </span>
              <span v-else class="text-gray-300 dark:text-gray-600">–</span>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Legend -->
      <div
        v-if="!isLoading"
        class="flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 px-4 py-2 text-xs text-gray-400 dark:border-gray-800 dark:text-gray-500"
      >
        <span>Def Adj = avg pts opponents score above their own average against this team</span>
        <span>Negative = strong defence</span>
      </div>
    </div>

    <!-- Tipping accuracy (retrospective backtest) -->
    <TippingAccuracy
      :round-results="roundResults"
      :tally="tally"
      :loading="tipsLoading"
      :venue-adjusted="venueAdjusted"
    />

    <!-- Nerd stuff: win-probability calibration curve -->
    <div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <button
        class="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
        @click="showNerd = !showNerd"
      >
        <span class="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-100">
          🤓 Nerd stuff
          <span class="font-normal text-xs text-gray-400 dark:text-gray-500">Win % by predicted margin</span>
        </span>
        <svg
          class="size-4 shrink-0 text-gray-400 transition-transform"
          :class="showNerd ? 'rotate-90' : ''"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <div v-if="showNerd" class="border-t border-gray-100 px-3 py-3 dark:border-gray-800">
        <p class="mb-2 px-1 text-xs text-gray-500 dark:text-gray-400">
          Across every past match, how often the PalmyScore favourite actually won at each predicted margin.
          Small margins are near coin-flips; the edge only becomes reliable past ~20 points.
        </p>
        <WinProbChart :variant="venueAdjusted ? 'ha' : 'all'" />
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAFLData } from '../composables/useAFLData'
import { useScorePredictor } from '../composables/useScorePredictor'
import { filterRecentMatches } from '../composables/useAlgorithmRankings'
import type { AflMatch } from '../types/afl'
import type { StrengthSortKey, TeamStrengthRow, UpcomingMatchPrediction } from '../composables/useScorePredictor'
import { favouriteWinProb } from '../utils/palmyWinProb'
import { useTipsBacktest } from '../composables/useTipsBacktest'
import { getActiveSeasonYear } from '../config/seasons'
import TippingAccuracy from '../components/TippingAccuracy.vue'
import WinProbChart from '../components/WinProbChart.vue'

const BASE_URL = import.meta.env.BASE_URL

const { matches, isLoading } = useAFLData()

const venueAdjusted = ref(false)

// "Last X" form basis — rate each team on their most recent games only. Strength is
// built from concluded matches, so keep the recent window plus all unplayed fixtures
// (which the predictor needs to know what to predict). 0 = full season.
const RECENT_OPTIONS = Array.from({ length: 22 }, (_, i) => i + 2)
const recentLimit = ref(0)
const predictorMatches = computed<readonly AflMatch[]>(() => {
  if (!recentLimit.value) return matches.value
  const upcoming = matches.value.filter(
    (m) => !(m.status === 'CONCLUDED' && m.homeScore && m.awayScore),
  )
  return [...filterRecentMatches(matches.value, recentLimit.value), ...upcoming]
})

const {
  strengthRows,
  hasEnoughData,
  nextRoundName,
  nextRoundPredictions,
  allUpcomingPredictions,
} = useScorePredictor(predictorMatches, venueAdjusted)

const { roundResults, tally, loading: tipsLoading } = useTipsBacktest(
  matches,
  getActiveSeasonYear(),
  venueAdjusted,
)

const showAllUpcoming = ref(false)
const sortKey = ref<StrengthSortKey>('attackRank')
const showNerd = ref(false)
const teamFilter = ref<number | null>(null)

// Teams that appear in any upcoming match, sorted by name, for the filter dropdown.
const upcomingTeams = computed(() => {
  const seen = new Map<number, string>()
  for (const m of allUpcomingPredictions.value) {
    seen.set(m.homeTeamId, m.homeTeamName)
    seen.set(m.awayTeamId, m.awayTeamName)
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const activePredictions = computed(() => {
  const list = showAllUpcoming.value
    ? allUpcomingPredictions.value
    : nextRoundPredictions.value
  if (showAllUpcoming.value && teamFilter.value != null) {
    return list.filter(
      (m) => m.homeTeamId === teamFilter.value || m.awayTeamId === teamFilter.value,
    )
  }
  return list
})

// Group the active predictions by round. When more than one round is on screen
// (the "All Upcoming" view), each round becomes a collapsible section so users
// can scan a summary without every match in view.
interface RoundGroup {
  roundNumber: number
  roundName: string
  matches: UpcomingMatchPrediction[]
  avgMargin: number | null
}

const roundGroups = computed<RoundGroup[]>(() => {
  const groups = new Map<number, RoundGroup>()
  for (const m of activePredictions.value) {
    let g = groups.get(m.roundNumber)
    if (!g) {
      g = { roundNumber: m.roundNumber, roundName: m.roundName, matches: [], avgMargin: null }
      groups.set(m.roundNumber, g)
    }
    g.matches.push(m)
  }
  return [...groups.values()]
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map((g) => {
      const margins = g.matches
        .filter((m) => m.hasStrengthData)
        .map((m) => Math.abs(m.predictedHomeScore - m.predictedAwayScore))
      const avgMargin = margins.length > 0 ? margins.reduce((sum, v) => sum + v, 0) / margins.length : null
      return { ...g, avgMargin }
    })
})

// Explicit expand/collapse overrides, keyed by round number. Rounds default to
// expanded for the soonest round and collapsed for everything after it.
const roundExpandedOverride = ref(new Map<number, boolean>())

function isRoundExpanded(roundNumber: number, index: number): boolean {
  return roundExpandedOverride.value.get(roundNumber) ?? index === 0
}

function toggleRound(roundNumber: number, index: number) {
  roundExpandedOverride.value.set(roundNumber, !isRoundExpanded(roundNumber, index))
}

// Predicted winner + historical win % for each match, from the calibration curve
// matching the active ratings variant (all-games vs home/away).
const winInfoById = computed<Record<number, { abbr: string; pct: number }>>(() => {
  const variant = venueAdjusted.value ? 'ha' : 'all'
  const map: Record<number, { abbr: string; pct: number }> = {}
  for (const m of activePredictions.value) {
    if (!m.hasStrengthData || m.predictedHomeScore === m.predictedAwayScore) continue
    const homeFav = m.predictedHomeScore > m.predictedAwayScore
    map[m.matchId] = {
      abbr: homeFav ? m.homeTeamAbbreviation : m.awayTeamAbbreviation,
      pct: Math.round(favouriteWinProb(m.predictedHomeScore, m.predictedAwayScore, variant) * 100),
    }
  }
  return map
})

// Bold the predicted winner's name; medium weight otherwise (including ties and
// matches PalmyScore can't rate).
function nameWeight(m: UpcomingMatchPrediction, home: boolean): string {
  if (!m.hasStrengthData || m.predictedHomeScore === m.predictedAwayScore) return 'font-medium'
  const homeFav = m.predictedHomeScore > m.predictedAwayScore
  return home === homeFav ? 'font-bold' : 'font-medium'
}

// "avg ± adjustment" equation behind each predicted score, e.g. "82.3 − 4.1".
function eqStr(avg: number, adj: number): string {
  return `${avg.toFixed(1)} ${adj >= 0 ? '+' : '−'} ${Math.abs(adj).toFixed(1)}`
}

type ScoreBreakdown = { eq: string; adj: number }
const scoreBreakdownById = computed<Record<number, { home: ScoreBreakdown; away: ScoreBreakdown }>>(() => {
  const venue = venueAdjusted.value
  const map: Record<number, { home: ScoreBreakdown; away: ScoreBreakdown }> = {}
  for (const m of activePredictions.value) {
    if (!m.hasStrengthData) continue
    const home = strengthRowMap.value.get(m.homeTeamId)
    const away = strengthRowMap.value.get(m.awayTeamId)
    if (!home || !away) continue
    const homeAdj = venue ? away.defenceAdjAway : away.defenceAdjustment
    const awayAdj = venue ? home.defenceAdjHome : home.defenceAdjustment
    map[m.matchId] = {
      home: { eq: eqStr(venue ? home.avgForHome : home.avgFor, homeAdj), adj: homeAdj },
      away: { eq: eqStr(venue ? away.avgForAway : away.avgFor, awayAdj), adj: awayAdj },
    }
  }
  return map
})

function adjClass(adj: number): string {
  if (adj > 0) return 'text-green-600 dark:text-green-400'
  if (adj < 0) return 'text-red-500 dark:text-red-400'
  return 'text-gray-400 dark:text-gray-500'
}

const sortedStrengthRows = computed(() =>
  [...strengthRows.value].sort((a, b) => a[sortKey.value] - b[sortKey.value]),
)

function rankClass(rank: number): string {
  if (rank <= 6) return 'font-bold text-green-600 dark:text-green-400'
  if (rank >= 13) return 'font-bold text-red-500 dark:text-red-400'
  return 'text-gray-600 dark:text-gray-400'
}

// --- Team popup ---

const popupTeamId = ref<number | null>(null)
const popupStyle = ref<Record<string, string>>({})
const popupAnchorEl = ref<HTMLElement | null>(null)

const POPUP_W = 300
const POPUP_H = 440

function closePopup() {
  popupTeamId.value = null
}

onMounted(() => document.addEventListener('click', closePopup))
onUnmounted(() => document.removeEventListener('click', closePopup))

function onRowClick(teamId: number, event: MouseEvent) {
  event.stopPropagation()
  if (popupTeamId.value === teamId) {
    popupTeamId.value = null
    return
  }
  popupTeamId.value = teamId
  popupAnchorEl.value = event.currentTarget as HTMLElement
  positionPopup()
}

function positionPopup() {
  const row = popupAnchorEl.value
  if (!row) return
  const rowRect = row.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  let left = rowRect.left + rowRect.width / 2 - POPUP_W / 2
  left = Math.max(8, Math.min(left, vw - POPUP_W - 8))

  let top = rowRect.bottom + 8
  if (top + POPUP_H > vh - 8) top = rowRect.top - POPUP_H - 8
  top = Math.max(8, Math.min(top, vh - POPUP_H - 8))

  popupStyle.value = { left: `${left}px`, top: `${top}px`, width: `${POPUP_W}px` }
}

const strengthRowMap = computed(() => {
  const map = new Map<number, TeamStrengthRow>()
  for (const r of strengthRows.value) map.set(r.teamId, r)
  return map
})

const popupRow = computed<TeamStrengthRow | null>(() =>
  popupTeamId.value !== null ? (strengthRowMap.value.get(popupTeamId.value) ?? null) : null,
)

const popupMatchBreakdown = computed(() => {
  if (popupTeamId.value === null) return []
  const tid = popupTeamId.value
  return matches.value
    .filter(
      (m) =>
        m.status === 'CONCLUDED' &&
        m.homeScore &&
        m.awayScore &&
        (m.homeTeamId === tid || m.awayTeamId === tid),
    )
    .map((m) => {
      const isHome = m.homeTeamId === tid
      const opponentId = isHome ? m.awayTeamId : m.homeTeamId
      const opponentRow = strengthRowMap.value.get(opponentId)
      const opponentScore = isHome ? m.awayScore!.totalScore : m.homeScore!.totalScore
      const opponentAvgFor = opponentRow?.avgFor ?? 0
      return {
        matchId: m.id,
        roundNumber: m.roundNumber,
        opponentId,
        opponentName: isHome ? m.awayTeamName : m.homeTeamName,
        opponentIconId: opponentRow?.iconId ?? '',
        opponentScore,
        differential: opponentScore - opponentAvgFor,
      }
    })
    .sort((a, b) => a.roundNumber - b.roundNumber)
})
</script>
