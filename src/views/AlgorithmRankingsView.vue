<template>
  <!-- Palmy popup -->
  <!-- XPalmy popup -->
  <Teleport to="body">
    <div
      v-if="xpalmyHoveredId !== null && selectedId === 'xpalmy'"
      class="fixed z-50 overflow-hidden rounded-xl border border-gray-200 bg-white text-xs shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      :style="xpalmyPopupStyle"
      @click.stop
    >
      <!-- Header -->
      <div
        class="border-b border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/60"
      >
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-bold text-gray-800 dark:text-gray-100">{{
            xpalmyHoveredName
          }}</span>
          <button
            @click="xpalmyHoveredId = null"
            class="ml-2 flex size-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <!-- Two rows of tabs: X row then Y row -->
        <div class="mb-1 flex gap-1">
          <button
            @click="xpalmyPopupTab = 'x-own'"
            class="rounded-md px-2 py-1 font-semibold text-orange-600 transition-colors dark:text-orange-400"
            :class="
              xpalmyPopupTab === 'x-own'
                ? 'bg-orange-500 !text-white'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            "
          >
            X — My Ladder
          </button>
          <button
            @click="xpalmyPopupTab = 'x-pos'"
            class="rounded-md px-2 py-1 font-semibold text-orange-600 transition-colors dark:text-orange-400"
            :class="
              xpalmyPopupTab === 'x-pos'
                ? 'bg-orange-500 !text-white'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            "
          >
            X — In others
          </button>
        </div>
        <div class="flex gap-1">
          <button
            @click="xpalmyPopupTab = 'y-own'"
            class="rounded-md px-2 py-1 font-semibold text-blue-600 transition-colors dark:text-blue-400"
            :class="
              xpalmyPopupTab === 'y-own'
                ? 'bg-blue-600 !text-white'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            "
          >
            Y — My Ladder
          </button>
          <button
            @click="xpalmyPopupTab = 'y-pos'"
            class="rounded-md px-2 py-1 font-semibold text-blue-600 transition-colors dark:text-blue-400"
            :class="
              xpalmyPopupTab === 'y-pos'
                ? 'bg-blue-600 !text-white'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            "
          >
            Y — In others
          </button>
        </div>
      </div>

      <!-- X — My Ladder: opponents sorted by what they scored against this team (most → least) -->
      <template v-if="xpalmyPopupTab === 'x-own'">
        <div
          class="border-b border-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:text-gray-500"
        >
          Opponents ranked by their score vs {{ xpalmyHoveredName }} — most
          first
        </div>
        <div class="overflow-y-auto" style="max-height: 340px">
          <div
            v-if="xpalmyHoveredXLadder.length === 0"
            class="px-3 py-4 text-center text-gray-400"
          >
            No concluded matches
          </div>
          <div
            v-for="entry in xpalmyHoveredXLadder"
            :key="`x-${entry.teamId}-${entry.roundNumber}`"
            class="flex items-center gap-2 border-b border-gray-50 px-3 py-1.5 last:border-0 dark:border-gray-800/60"
          >
            <span
              class="w-5 shrink-0 text-right tabular-nums text-gray-400 dark:text-gray-500"
              >{{ entry.rank }}</span
            >
            <svg class="size-5 shrink-0">
              <use :href="`${BASE_URL}icons.svg#${entry.iconId}`" />
            </svg>
            <span
              class="flex-1 truncate font-medium text-gray-800 dark:text-gray-100"
              >{{ entry.teamName }}</span
            >
            <span
              class="w-10 shrink-0 text-right font-semibold tabular-nums text-orange-500 dark:text-orange-400"
              >{{ entry.oppScore }}</span
            >
            <span
              class="w-7 shrink-0 text-right text-gray-400 dark:text-gray-500"
              >R{{ entry.roundNumber }}</span
            >
          </div>
        </div>
        <div
          class="border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500"
        >
          Score = what that opponent scored against {{ xpalmyHoveredName }}
        </div>
      </template>

      <!-- X — In others: where this team appears in every other team's X-ladder -->
      <template v-else-if="xpalmyPopupTab === 'x-pos'">
        <div
          class="border-b border-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:text-gray-500"
        >
          <span v-if="xpalmyHoveredXPositions.length > 0">
            Attack avg:
            <span class="font-bold text-gray-700 dark:text-gray-200">{{
              xpalmyHoveredXAvg
            }}</span>
            across {{ xpalmyHoveredXPositions.length }} ladder{{
              xpalmyHoveredXPositions.length === 1 ? '' : 's'
            }}
          </span>
          <span v-else>No appearances yet</span>
        </div>
        <div class="overflow-y-auto" style="max-height: 340px">
          <div
            v-if="xpalmyHoveredXPositions.length === 0"
            class="px-3 py-4 text-center text-gray-400"
          >
            No concluded matches
          </div>
          <div
            v-for="(pos, i) in xpalmyHoveredXPositions"
            :key="i"
            class="flex items-center gap-2 border-b border-gray-50 px-3 py-1.5 last:border-0 dark:border-gray-800/60"
          >
            <span
              class="w-12 shrink-0 text-right font-bold tabular-nums"
              :class="positionClass(pos.rank, pos.ladderSize)"
              >#{{ pos.rank
              }}<span class="font-normal text-gray-300 dark:text-gray-600"
                >/{{ pos.ladderSize }}</span
              ></span
            >
            <svg class="size-5 shrink-0">
              <use :href="`${BASE_URL}icons.svg#${pos.ownerIconId}`" />
            </svg>
            <span
              class="flex-1 truncate font-medium text-gray-800 dark:text-gray-100"
              >{{ pos.ownerName }}</span
            >
            <span
              class="w-10 shrink-0 text-right font-semibold tabular-nums text-orange-500 dark:text-orange-400"
              >{{ pos.score }}</span
            >
            <span
              class="w-7 shrink-0 text-right text-gray-400 dark:text-gray-500"
              >R{{ pos.roundNumber }}</span
            >
          </div>
        </div>
        <div
          class="border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500"
        >
          #rank/size in that team's X-ladder &nbsp;·&nbsp; score = what
          {{ xpalmyHoveredName }} scored against them
        </div>
      </template>

      <!-- Y — My Ladder: opponents sorted by what this team scored against them (least → most) -->
      <template v-else-if="xpalmyPopupTab === 'y-own'">
        <div
          class="border-b border-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:text-gray-500"
        >
          Opponents ranked by {{ xpalmyHoveredName }}'s score against them —
          least first
        </div>
        <div class="overflow-y-auto" style="max-height: 340px">
          <div
            v-if="xpalmyHoveredYLadder.length === 0"
            class="px-3 py-4 text-center text-gray-400"
          >
            No concluded matches
          </div>
          <div
            v-for="entry in xpalmyHoveredYLadder"
            :key="`y-${entry.teamId}-${entry.roundNumber}`"
            class="flex items-center gap-2 border-b border-gray-50 px-3 py-1.5 last:border-0 dark:border-gray-800/60"
          >
            <span
              class="w-5 shrink-0 text-right tabular-nums text-gray-400 dark:text-gray-500"
              >{{ entry.rank }}</span
            >
            <svg class="size-5 shrink-0">
              <use :href="`${BASE_URL}icons.svg#${entry.iconId}`" />
            </svg>
            <span
              class="flex-1 truncate font-medium text-gray-800 dark:text-gray-100"
              >{{ entry.teamName }}</span
            >
            <span
              class="w-10 shrink-0 text-right font-semibold tabular-nums text-blue-500 dark:text-blue-400"
              >{{ entry.ownScore }}</span
            >
            <span
              class="w-7 shrink-0 text-right text-gray-400 dark:text-gray-500"
              >R{{ entry.roundNumber }}</span
            >
          </div>
        </div>
        <div
          class="border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500"
        >
          Score = what {{ xpalmyHoveredName }} scored against that opponent
        </div>
      </template>

      <!-- Y — In others: where this team appears in every other team's Y-ladder -->
      <template v-else>
        <div
          class="border-b border-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:text-gray-500"
        >
          <span v-if="xpalmyHoveredYPositions.length > 0">
            Defense avg:
            <span class="font-bold text-gray-700 dark:text-gray-200">{{
              xpalmyHoveredYAvg
            }}</span>
            across {{ xpalmyHoveredYPositions.length }} ladder{{
              xpalmyHoveredYPositions.length === 1 ? '' : 's'
            }}
          </span>
          <span v-else>No appearances yet</span>
        </div>
        <div class="overflow-y-auto" style="max-height: 340px">
          <div
            v-if="xpalmyHoveredYPositions.length === 0"
            class="px-3 py-4 text-center text-gray-400"
          >
            No concluded matches
          </div>
          <div
            v-for="(pos, i) in xpalmyHoveredYPositions"
            :key="i"
            class="flex items-center gap-2 border-b border-gray-50 px-3 py-1.5 last:border-0 dark:border-gray-800/60"
          >
            <span
              class="w-12 shrink-0 text-right font-bold tabular-nums"
              :class="positionClass(pos.rank, pos.ladderSize)"
              >#{{ pos.rank
              }}<span class="font-normal text-gray-300 dark:text-gray-600"
                >/{{ pos.ladderSize }}</span
              ></span
            >
            <svg class="size-5 shrink-0">
              <use :href="`${BASE_URL}icons.svg#${pos.ownerIconId}`" />
            </svg>
            <span
              class="flex-1 truncate font-medium text-gray-800 dark:text-gray-100"
              >{{ pos.ownerName }}</span
            >
            <span
              class="w-10 shrink-0 text-right font-semibold tabular-nums text-blue-500 dark:text-blue-400"
              >{{ pos.score }}</span
            >
            <span
              class="w-7 shrink-0 text-right text-gray-400 dark:text-gray-500"
              >R{{ pos.roundNumber }}</span
            >
          </div>
        </div>
        <div
          class="border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500"
        >
          #rank/size in that team's Y-ladder &nbsp;·&nbsp; score = what they
          scored against {{ xpalmyHoveredName }}
        </div>
      </template>
    </div>
  </Teleport>

  <!-- Palmy popup -->
  <Teleport to="body">
    <div
      v-if="hoveredTeamId !== null && selectedId === 'palmy'"
      class="fixed z-50 overflow-hidden rounded-xl border border-gray-200 bg-white text-xs shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      :style="popupStyle"
      @click.stop
    >
      <!-- Header -->
      <div
        class="border-b border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/60"
      >
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-bold text-gray-800 dark:text-gray-100">{{
            hoveredTeamName
          }}</span>
          <button
            @click="closePopup"
            class="ml-2 flex size-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <!-- Tabs -->
        <div class="flex gap-1">
          <button
            v-for="tab in POPUP_TABS"
            :key="tab.id"
            @click="popupTab = tab.id"
            class="rounded-md px-2.5 py-1 font-semibold transition-colors"
            :class="
              popupTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
            "
          >
            {{
              tab.id === 'own'
                ? `${hoveredTeamName}'s Ladder`
                : `Ladders ${hoveredTeamName} are in`
            }}
          </button>
        </div>
      </div>

      <!-- Tab: Opponent Ladder -->
      <template v-if="popupTab === 'own'">
        <div
          class="border-b border-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:text-gray-500"
        >
          Opponents ranked by their margin vs {{ hoveredTeamName }}
        </div>
        <div class="overflow-y-auto" style="max-height: 380px">
          <div
            v-if="hoveredLadder.length === 0"
            class="px-3 py-4 text-center text-gray-400 dark:text-gray-500"
          >
            No concluded matches
          </div>
          <div
            v-for="entry in hoveredLadder"
            :key="`${entry.teamId}-${entry.roundNumber}`"
            class="flex items-center gap-2 border-b border-gray-50 px-3 py-1.5 last:border-0 dark:border-gray-800/60"
          >
            <span
              class="w-5 shrink-0 text-right tabular-nums text-gray-400 dark:text-gray-500"
              >{{ entry.rank }}</span
            >
            <svg class="size-5 shrink-0">
              <use :href="`${BASE_URL}icons.svg#${entry.iconId}`" />
            </svg>
            <span
              class="flex-1 truncate font-medium text-gray-800 dark:text-gray-100"
              >{{ entry.teamName }}</span
            >
            <span
              class="w-10 shrink-0 text-right font-semibold tabular-nums"
              :class="
                entry.differential > 0
                  ? 'text-red-500 dark:text-red-400'
                  : entry.differential < 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-400'
              "
              >{{ entry.differential > 0 ? '+' : ''
              }}{{ entry.differential }}</span
            >
            <span
              class="w-7 shrink-0 text-right text-gray-400 dark:text-gray-500"
              >R{{ entry.roundNumber }}</span
            >
          </div>
        </div>
        <div
          class="border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500"
        >
          <span class="text-red-500">+</span> = opponent won &nbsp;·&nbsp;
          <span class="text-green-600">−</span> = {{ hoveredTeamName }} won
        </div>
      </template>

      <!-- Tab: League Positions -->
      <template v-else>
        <div
          class="border-b border-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:text-gray-500"
        >
          <span v-if="hoveredTeamPositions.length > 0">
            Avg position:
            <span class="font-bold text-gray-700 dark:text-gray-200">{{
              hoveredAvgPosition
            }}</span>
            across {{ hoveredTeamPositions.length }} appearance{{
              hoveredTeamPositions.length === 1 ? '' : 's'
            }}
          </span>
          <span v-else>No appearances yet</span>
        </div>
        <div class="overflow-y-auto" style="max-height: 380px">
          <div
            v-if="hoveredTeamPositions.length === 0"
            class="px-3 py-4 text-center text-gray-400 dark:text-gray-500"
          >
            No concluded matches
          </div>
          <div
            v-for="(pos, i) in hoveredTeamPositions"
            :key="i"
            class="flex items-center gap-2 border-b border-gray-50 px-3 py-1.5 last:border-0 dark:border-gray-800/60"
          >
            <!-- Rank in that team's ladder -->
            <span
              class="w-12 shrink-0 text-right font-bold tabular-nums"
              :class="positionClass(pos.rank, pos.ladderSize)"
              >#{{ pos.rank
              }}<span class="font-normal text-gray-300 dark:text-gray-600"
                >/{{ pos.ladderSize }}</span
              ></span
            >
            <svg class="size-5 shrink-0">
              <use :href="`${BASE_URL}icons.svg#${pos.ownerIconId}`" />
            </svg>
            <span
              class="flex-1 truncate font-medium text-gray-800 dark:text-gray-100"
              >{{ pos.ownerName }}</span
            >
            <!-- Y's margin in that match -->
            <span
              class="w-10 shrink-0 text-right font-semibold tabular-nums"
              :class="
                pos.differential > 0
                  ? 'text-green-600 dark:text-green-400'
                  : pos.differential < 0
                    ? 'text-red-500 dark:text-red-400'
                    : 'text-gray-400'
              "
              >{{ pos.differential > 0 ? '+' : '' }}{{ pos.differential }}</span
            >
            <span
              class="w-7 shrink-0 text-right text-gray-400 dark:text-gray-500"
              >R{{ pos.roundNumber }}</span
            >
          </div>
        </div>
        <div
          class="border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500"
        >
          #rank/size in that team's ladder &nbsp;·&nbsp;
          <span class="text-green-600">+</span> = {{ hoveredTeamName }} won
        </div>
      </template>
    </div>
  </Teleport>

  <main class="mx-auto max-w-4xl px-4 py-6">
    <div class="mb-6">
      <h1 class="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">
        Over complicated Ladders
      </h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Different statistical methods for ranking teams when schedules are
        uneven. Each algorithm uses only concluded match results.
      </p>
    </div>

    <!-- Algorithm selector -->
    <div data-tour="rankings-algo-selector" class="mb-4 flex flex-wrap gap-2">
      <button
        v-for="algo in ALGORITHMS"
        :key="algo.id"
        @click="selectedId = algo.id"
        class="rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors"
        :class="
          selectedId === algo.id
            ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
            : 'border-gray-300 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-blue-500 dark:hover:text-blue-400'
        "
      >
        {{ algo.name }}
      </button>
    </div>

    <!-- Algorithm description + view toggle -->
    <div class="mb-5 flex items-start gap-3">
      <div
        class="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
      >
        {{ selectedAlgo.description }}
        <span
          v-if="selectedAlgo.creditName"
          class="mt-1.5 block text-xs text-blue-500 dark:text-blue-400"
        >
          <a
            v-if="selectedAlgo.creditUrl"
            :href="selectedAlgo.creditUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="underline underline-offset-2 transition-colors hover:text-blue-700 dark:hover:text-blue-300"
            >{{ selectedAlgo.creditName }}</a
          >
          <span v-else>{{ selectedAlgo.creditName }}</span>
        </span>
      </div>
      <!-- Recent form window + Table / Graph toggle + download -->
      <div class="flex shrink-0 items-center gap-2 self-center">
        <select
          v-model.number="recentLimit"
          :title="
            recentLimit
              ? `Ranking each team on their last ${recentLimit} games`
              : `Rank on each team's last X games only`
          "
          class="rounded border px-2 py-1.5 text-xs font-semibold transition-colors"
          :class="
            recentLimit
              ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
              : 'border-gray-300 bg-white text-gray-500 hover:border-blue-400 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-blue-500 dark:hover:text-blue-400'
          "
        >
          <option :value="0">Full Season</option>
          <option v-for="n in RECENT_OPTIONS" :key="n" :value="n">Last {{ n }}</option>
        </select>
        <button
          v-if="activeView === 'graph' && !graphCapturing"
          @click="screenshotGraph"
          title="Save as image"
          class="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <div
          class="flex overflow-hidden rounded border border-gray-300 dark:border-gray-600"
        >
          <button
            @click="activeView = 'table'"
            class="px-3 py-1.5 text-xs font-semibold transition-colors"
            :class="
              activeView === 'table'
                ? 'bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900'
                : 'bg-white text-gray-500 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
            "
          >
            Table
          </button>
          <button
            @click="activeView = 'graph'"
            class="border-l border-gray-300 px-3 py-1.5 text-xs font-semibold transition-colors dark:border-gray-600"
            :class="
              activeView === 'graph'
                ? 'bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900'
                : 'bg-white text-gray-500 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
            "
          >
            Graph
          </button>
        </div>
      </div>
    </div>

    <!-- Venue filter (Palmy / XPalmy only) -->
    <div
      v-if="selectedId === 'palmy' || selectedId === 'xpalmy'"
      class="mb-4 flex items-center gap-2"
    >
      <span class="text-xs text-gray-500 dark:text-gray-400">Games:</span>
      <div
        class="flex overflow-hidden rounded border border-gray-300 text-xs font-semibold dark:border-gray-600"
      >
        <button
          @click="palmyVenueFilter = 'home'"
          class="px-3 py-1.5 transition-colors"
          :class="
            palmyVenueFilter === 'home'
              ? 'bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900'
              : 'bg-white text-gray-500 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
          "
        >
          Home
        </button>
        <button
          @click="palmyVenueFilter = 'both'"
          class="border-l border-gray-300 px-3 py-1.5 transition-colors dark:border-gray-600"
          :class="
            palmyVenueFilter === 'both'
              ? 'bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900'
              : 'bg-white text-gray-500 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
          "
        >
          Both
        </button>
        <button
          @click="palmyVenueFilter = 'away'"
          class="border-l border-gray-300 px-3 py-1.5 transition-colors dark:border-gray-600"
          :class="
            palmyVenueFilter === 'away'
              ? 'bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900'
              : 'bg-white text-gray-500 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
          "
        >
          Away
        </button>
      </div>
    </div>

    <!-- Nerd stuff (collapsible) -->
    <div class="mb-5">
      <button
        @click="showNerdStuff = !showNerdStuff"
        class="flex select-none items-center gap-1.5 text-xs font-semibold text-gray-400 transition-colors hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
      >
        <svg
          class="size-2.5 transition-transform duration-150"
          :class="showNerdStuff ? 'rotate-90' : ''"
          viewBox="0 0 10 10"
          fill="currentColor"
        >
          <path d="M2 1.5l6 3.5-6 3.5V1.5z" />
        </svg>
        Nerd stuff
      </button>

      <div
        v-if="showNerdStuff"
        class="mt-2 overflow-hidden rounded-lg border border-gray-800 text-xs"
        style="
          background: #0d1117;
          color: #c9d1d9;
          font-family:
            ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace;
        "
      >
        <!-- SRS -->
        <div v-if="selectedId === 'srs'" class="space-y-4 p-5">
          <div
            class="space-y-2 rounded-md px-4 py-3"
            style="background: #161b22"
          >
            <div>
              <span style="color: #ff7b72">init:</span> r[t] =
              <span style="color: #79c0ff">avgMargin[t]</span>
            </div>
            <div>
              <span style="color: #ff7b72">loop:</span> r[t] =
              <span style="color: #79c0ff">avgMargin[t]</span> + mean( r[opp] )
            </div>
            <div class="pt-1" style="color: #8b949e">
              ↺ repeat until max|Δr| &lt; 0.0001 (~1000 iterations max)
            </div>
          </div>
          <div
            class="space-y-1.5 rounded-md px-4 py-3"
            style="background: #161b22"
          >
            <div style="color: #8b949e">
              Convergence example (3 teams, simplified):
            </div>
            <div
              class="grid gap-y-1 pt-1"
              style="grid-template-columns: 5ch 1fr"
            >
              <span style="color: #8b949e">step 0</span
              ><span>A=+15 &nbsp; B=−5 &nbsp; C=+0</span>
              <span style="color: #8b949e">step 1</span
              ><span
                >A=+20 &nbsp; B=−8 &nbsp; C=+3 &nbsp;<span
                  style="color: #8b949e"
                  >(opps updated)</span
                ></span
              >
              <span style="color: #8b949e">step n</span
              ><span style="color: #56d364">converged ✓</span>
            </div>
          </div>
        </div>

        <!-- Colley Matrix -->
        <div v-else-if="selectedId === 'colley'" class="space-y-4 p-5">
          <div style="color: #8b949e">
            Builds 18 equations (one per team) and solves them simultaneously:
          </div>
          <div
            class="space-y-1.5 rounded-md px-4 py-3"
            style="background: #161b22"
          >
            <div
              class="py-1 text-center text-base"
              style="color: #c9d1d9; letter-spacing: 0.1em"
            >
              C · r = b
            </div>
          </div>
          <div
            class="space-y-1.5 rounded-md px-4 py-3"
            style="background: #161b22"
          >
            <div>
              C<span style="color: #8b949e">_ii</span> = 2 +
              <span style="color: #79c0ff">games_played(i)</span> &nbsp;<span
                style="color: #8b949e"
                >(diagonal)</span
              >
            </div>
            <div>
              C<span style="color: #8b949e">_ij</span> = −<span
                style="color: #f97583"
                >matchups(i, j)</span
              >
              &nbsp;<span style="color: #8b949e">(off-diagonal)</span>
            </div>
            <div>
              b<span style="color: #8b949e">_i</span>&nbsp;&nbsp; = 1 + (
              <span style="color: #56d364">W_i</span> −
              <span style="color: #f97583">L_i</span> ) / 2
            </div>
          </div>
          <div
            class="rounded-md px-4 py-3"
            style="background: #161b22; color: #8b949e"
          >
            Solved with Gaussian elimination. Uses only wins/losses — margins
            don't matter. Every result cascades through all 18 equations.
          </div>
        </div>

        <!-- Massey -->
        <div v-else-if="selectedId === 'massey'" class="space-y-4 p-5">
          <div style="color: #8b949e">
            For each game, the rating difference should equal the score margin:
          </div>
          <div
            class="space-y-2 rounded-md px-4 py-3"
            style="background: #161b22"
          >
            <div>
              r[<span style="color: #79c0ff">home</span>] − r[<span
                style="color: #f97583"
                >away</span
              >] ≈ score[<span style="color: #79c0ff">home</span>] − score[<span
                style="color: #f97583"
                >away</span
              >]
            </div>
            <div class="pt-1" style="color: #8b949e">
              More games than unknowns → overdetermined → least squares:
            </div>
            <div class="pt-1">
              min&nbsp; Σ
              <span style="color: #e6c07b">( r_i − r_j − margin_ij )²</span>
            </div>
          </div>
          <div
            class="space-y-1.5 rounded-md px-4 py-3"
            style="background: #161b22"
          >
            <div style="color: #8b949e">
              Normal equations:&nbsp;<span style="color: #c9d1d9"
                >MᵀM · r = Mᵀ · p</span
              >
            </div>
            <div class="pt-1">
              A win by 80 carries far more weight than a win by 1.
            </div>
          </div>
        </div>

        <!-- Win Flow -->
        <div v-else-if="selectedId === 'winflow'" class="space-y-4 p-5">
          <div class="flex flex-wrap items-start gap-5">
            <!-- Directed graph -->
            <svg
              viewBox="0 0 160 140"
              class="w-40 shrink-0 rounded-md"
              style="background: #161b22"
            >
              <defs>
                <marker
                  id="nerd-arr"
                  markerWidth="6"
                  markerHeight="6"
                  refX="5"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0.5 L0,5.5 L5.5,3 z" fill="#56d364" />
                </marker>
              </defs>
              <!-- Nodes -->
              <circle
                cx="80"
                cy="22"
                r="14"
                fill="#0d1117"
                stroke="#79c0ff"
                stroke-width="1.5"
              />
              <text
                x="80"
                y="27"
                text-anchor="middle"
                font-size="11"
                fill="#79c0ff"
                font-family="inherit"
                font-weight="bold"
              >
                A
              </text>
              <text
                x="80"
                y="12"
                text-anchor="middle"
                font-size="7.5"
                fill="#56d364"
                font-family="inherit"
              >
                0.38
              </text>

              <circle
                cx="138"
                cy="80"
                r="14"
                fill="#0d1117"
                stroke="#c9d1d9"
                stroke-width="1"
              />
              <text
                x="138"
                y="85"
                text-anchor="middle"
                font-size="11"
                fill="#c9d1d9"
                font-family="inherit"
              >
                B
              </text>
              <text
                x="153"
                y="73"
                font-size="7.5"
                fill="#c9d1d9"
                font-family="inherit"
              >
                0.27
              </text>

              <circle
                cx="80"
                cy="124"
                r="14"
                fill="#0d1117"
                stroke="#c9d1d9"
                stroke-width="1"
              />
              <text
                x="80"
                y="129"
                text-anchor="middle"
                font-size="11"
                fill="#c9d1d9"
                font-family="inherit"
              >
                C
              </text>
              <text
                x="80"
                y="115"
                text-anchor="middle"
                font-size="7.5"
                fill="#f97583"
                font-family="inherit"
              >
                0.11
              </text>

              <circle
                cx="22"
                cy="80"
                r="14"
                fill="#0d1117"
                stroke="#c9d1d9"
                stroke-width="1"
              />
              <text
                x="22"
                y="85"
                text-anchor="middle"
                font-size="11"
                fill="#c9d1d9"
                font-family="inherit"
              >
                D
              </text>
              <text
                x="4"
                y="73"
                font-size="7.5"
                fill="#c9d1d9"
                font-family="inherit"
              >
                0.24
              </text>

              <!-- Arrows: A beats B, B beats C, D beats B, C beats D, A beats C -->
              <line
                x1="92"
                y1="31"
                x2="127"
                y2="68"
                stroke="#56d364"
                stroke-width="1.5"
                marker-end="url(#nerd-arr)"
              />
              <line
                x1="127"
                y1="91"
                x2="92"
                y2="113"
                stroke="#56d364"
                stroke-width="1.5"
                marker-end="url(#nerd-arr)"
              />
              <line
                x1="35"
                y1="70"
                x2="125"
                y2="69"
                stroke="#56d364"
                stroke-width="1"
                marker-end="url(#nerd-arr)"
              />
              <line
                x1="69"
                y1="114"
                x2="34"
                y2="92"
                stroke="#56d364"
                stroke-width="1.5"
                marker-end="url(#nerd-arr)"
              />
              <line
                x1="80"
                y1="36"
                x2="80"
                y2="110"
                stroke="#56d364"
                stroke-width="1"
                stroke-dasharray="3,2"
                marker-end="url(#nerd-arr)"
              />
            </svg>

            <div class="min-w-0 flex-1 space-y-3">
              <div
                class="space-y-2 rounded-md px-3 py-2.5"
                style="background: #161b22"
              >
                <div style="color: #8b949e">
                  Each loss donates rating to the winner:
                </div>
                <div class="pt-1 leading-5">
                  r(T) = <span style="color: #e6c07b">(1−d)/N</span> + d × Σ
                  <span style="color: #79c0ff">w(T,X)/GP(X)</span> × r(X)
                </div>
              </div>
              <div
                class="space-y-1 rounded-md px-3 py-2.5"
                style="background: #161b22"
              >
                <div>
                  <span style="color: #e6c07b">d</span> = 0.85 &nbsp;(damping
                  factor)
                </div>
                <div><span style="color: #e6c07b">N</span> = 18 teams</div>
                <div class="pt-1" style="color: #8b949e">
                  Beating a team everyone else also beats is worth less than
                  beating someone who wins elsewhere.
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Palmy -->
        <div v-else class="space-y-4 p-5">
          <div style="color: #8b949e">
            Build a ranked opponent ladder for each team, then average Team Y's
            fractional position across every ladder they appear in:
          </div>
          <div class="flex flex-wrap gap-3">
            <!-- Ladder X -->
            <div
              class="min-w-[140px] flex-1 rounded-md px-3 py-2.5"
              style="background: #161b22"
            >
              <div style="color: #8b949e" class="mb-2">Team X's ladder</div>
              <div class="space-y-1">
                <div class="flex gap-2">
                  <span style="color: #8b949e">1.</span><span>Carlton</span
                  ><span style="color: #f97583" class="ml-auto">+45</span>
                </div>
                <div class="flex gap-2" style="color: #79c0ff">
                  <span style="color: #8b949e">2.</span><span>Team Y ●</span
                  ><span style="color: #f97583" class="ml-auto">+12</span>
                </div>
                <div class="flex gap-2">
                  <span style="color: #8b949e">3.</span><span>Geelong</span
                  ><span style="color: #56d364" class="ml-auto">−8</span>
                </div>
                <div class="flex gap-2">
                  <span style="color: #8b949e">4.</span><span>Hawks</span
                  ><span style="color: #56d364" class="ml-auto">−22</span>
                </div>
              </div>
              <div
                class="mt-2 border-t pt-2 text-right"
                style="border-color: #30363d; color: #8b949e"
              >
                Y = <span style="color: #79c0ff">2</span>/4 =
                <span style="color: #79c0ff">0.500</span>
              </div>
            </div>
            <!-- Ladder Z -->
            <div
              class="min-w-[140px] flex-1 rounded-md px-3 py-2.5"
              style="background: #161b22"
            >
              <div style="color: #8b949e" class="mb-2">Team Z's ladder</div>
              <div class="space-y-1">
                <div class="flex gap-2" style="color: #79c0ff">
                  <span style="color: #8b949e">1.</span><span>Team Y ●</span
                  ><span style="color: #f97583" class="ml-auto">+30</span>
                </div>
                <div class="flex gap-2">
                  <span style="color: #8b949e">2.</span><span>Port</span
                  ><span style="color: #56d364" class="ml-auto">−15</span>
                </div>
                <div class="flex gap-2">
                  <span style="color: #8b949e">3.</span><span>Sydney</span
                  ><span style="color: #56d364" class="ml-auto">−22</span>
                </div>
              </div>
              <div
                class="mt-2 border-t pt-2 text-right"
                style="border-color: #30363d; color: #8b949e"
              >
                Y = <span style="color: #79c0ff">1</span>/3 =
                <span style="color: #79c0ff">0.333</span>
              </div>
            </div>
          </div>
          <div
            class="space-y-1.5 rounded-md px-4 py-3"
            style="background: #161b22"
          >
            <div>
              avg fraction = (0.500 + 0.333) / 2 =
              <span style="color: #e6c07b">0.417</span>
            </div>
            <div>
              Score(Y) = (1 − <span style="color: #e6c07b">0.417</span>) × 100 =
              <span style="color: #56d364">58.3</span>
            </div>
            <div class="pt-1" style="color: #8b949e">
              Lower avg fraction → opponents rated you highly → higher score.
              Fractional rank (not raw) keeps smaller ladders fair.
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Ranking table -->
    <div
      ref="tableEl"
      v-if="activeView === 'table'"
      data-tour="rankings-table"
      class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    >
      <div v-if="isLoading" class="space-y-px p-1">
        <div
          v-for="n in 18"
          :key="n"
          class="h-9 animate-pulse rounded bg-gray-100 dark:bg-gray-800"
        />
      </div>

      <table v-else class="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr
            class="bg-gray-100 text-xs uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-400"
          >
            <th class="w-8 py-2 text-center font-semibold">#</th>
            <th class="py-2 pl-3 text-left font-semibold">Team</th>
            <th class="hidden w-8 py-2 text-center font-semibold sm:table-cell">
              W
            </th>
            <th class="hidden w-8 py-2 text-center font-semibold sm:table-cell">
              L
            </th>
            <th class="hidden w-8 py-2 text-center font-semibold sm:table-cell">
              D
            </th>
            <template v-if="selectedId === 'xpalmy'">
              <th
                class="w-16 py-2 text-center font-semibold text-orange-500 dark:text-orange-400"
              >
                Attack
              </th>
              <th
                class="w-16 py-2 text-center font-semibold text-blue-500 dark:text-blue-400"
              >
                Defense
              </th>
              <th class="w-20 py-2 text-center font-semibold">Group</th>
            </template>
            <th v-else class="w-20 py-2 text-center font-semibold">
              {{ selectedAlgo.ratingLabel }}
            </th>
            <th
              class="w-14 py-2 text-center font-semibold text-gray-400 dark:text-gray-500"
              title="vs official AFL ladder"
            >
              vs AFL
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in currentRanking"
            :key="row.teamId"
            class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
            :class="{
              'border-b-2 border-orange-400': i === FINALS_BOUNDARY_INDEXES[0],
              'border-b-2 border-blue-400': i === FINALS_BOUNDARY_INDEXES[1],
              'border-b border-gray-100 dark:border-gray-800':
                !FINALS_BOUNDARY_INDEXES.includes(i),
            }"
            @click="
              selectedId === 'palmy'
                ? onRowClick(row.teamId, $event)
                : selectedId === 'xpalmy'
                  ? onXpalmyRowClick(row.teamId, $event)
                  : undefined
            "
            :style="selectedId === 'xpalmy' ? 'cursor: pointer' : ''"
          >
            <td
              class="py-2 text-center text-xs text-gray-500 dark:text-gray-500"
            >
              {{ row.rank }}
            </td>
            <td class="py-2 pl-3 font-medium text-gray-800 dark:text-gray-200">
              <span class="flex items-center gap-1.5">
                <svg class="size-6 shrink-0">
                  <use :href="`${BASE_URL}icons.svg#${row.iconId}`" />
                </svg>
                <span class="hidden sm:inline">{{ row.teamName }}</span>
                <span class="sm:hidden">{{ row.abbreviation }}</span>
              </span>
            </td>
            <td
              class="hidden py-2 text-center text-gray-600 dark:text-gray-400 sm:table-cell"
            >
              {{ row.wins }}
            </td>
            <td
              class="hidden py-2 text-center text-gray-600 dark:text-gray-400 sm:table-cell"
            >
              {{ row.losses }}
            </td>
            <td
              class="hidden py-2 text-center text-gray-600 dark:text-gray-400 sm:table-cell"
            >
              {{ row.draws }}
            </td>
            <template v-if="selectedId === 'xpalmy'">
              <td
                class="py-2 text-center text-xs font-semibold tabular-nums text-orange-500 dark:text-orange-400"
              >
                {{ xpalmyAttack(row.teamId) }}
              </td>
              <td
                class="py-2 text-center text-xs font-semibold tabular-nums text-blue-500 dark:text-blue-400"
              >
                {{ xpalmyDefense(row.teamId) }}
              </td>
              <td
                class="py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                {{ xpalmyGroup(row.teamId) }}
              </td>
            </template>
            <td
              v-else
              class="py-2 text-center text-xs font-semibold tabular-nums text-gray-800 dark:text-gray-200"
            >
              {{ formatRating(row.rating) }}
            </td>
            <td class="py-2 text-center text-xs font-bold tabular-nums">
              <span
                v-if="vsAflDelta(row) > 0"
                class="text-green-600 dark:text-green-400"
                >▲{{ vsAflDelta(row) }}</span
              >
              <span
                v-else-if="vsAflDelta(row) < 0"
                class="text-red-500 dark:text-red-400"
                >▼{{ Math.abs(vsAflDelta(row)) }}</span
              >
              <span v-else class="text-gray-300 dark:text-gray-600">—</span>
            </td>
          </tr>
        </tbody>
      </table>

      <p
        v-if="!isLoading && currentRanking.length === 0"
        class="py-10 text-center text-sm text-gray-400 dark:text-gray-600"
      >
        No concluded matches yet
      </p>
    </div>

    <!-- Graph view -->
    <div
      v-else
      ref="graphCaptureEl"
      data-tour="rankings-table"
      class="select-none overflow-hidden rounded-lg"
      :style="
        selectedId === 'xpalmy' ? 'background: #f8fafc' : 'background: #0a0d14'
      "
    >
      <!-- XPalmy scatter plot -->
      <template v-if="selectedId === 'xpalmy'">
        <div
          v-if="champions.length > 0 && !graphCapturing"
          class="flex justify-end px-3 pb-1 pt-3"
        >
          <button
            @click="showChampions = !showChampions"
            class="rounded border px-2.5 py-1 text-xs font-semibold transition-colors"
            :class="
              showChampions
                ? 'border-yellow-400 bg-yellow-400 text-gray-900'
                : 'border-gray-300 bg-transparent text-gray-500 hover:border-yellow-400 hover:text-yellow-500 dark:border-gray-600 dark:text-gray-400'
            "
          >
            🏆 Past champions
          </button>
        </div>
        <svg
          viewBox="0 0 560 510"
          class="w-full"
          style="overflow: visible"
          aria-label="XPalmy scatter chart"
        >
          <!-- Title (visible in screenshot) -->
          <text
            x="280"
            y="18"
            text-anchor="middle"
            font-size="11"
            font-family="system-ui,sans-serif"
            fill="rgba(0,0,0,0.5)"
            font-weight="700"
            letter-spacing="2"
          >
            XPALMY RATINGS · {{ currentSeasonYear }}
          </text>
          <!-- Quadrant backgrounds (rotated dividers → non-rectangular polygons) -->
          <polygon
            :points="`${scatterDividerPoints.cx},${scatterDividerPoints.cy} ${scatterDividerPoints.vTop.x},${scatterDividerPoints.vTop.y} ${SC.x1},${SC.y0} ${SC.x1},${scatterDividerPoints.hRight.y}`"
            fill="rgba(34,197,94,0.08)"
          />
          <polygon
            :points="`${scatterDividerPoints.cx},${scatterDividerPoints.cy} ${scatterDividerPoints.hLeft.x},${scatterDividerPoints.hLeft.y} ${SC.x0},${SC.y0} ${scatterDividerPoints.vTop.x},${scatterDividerPoints.vTop.y}`"
            fill="rgba(59,130,246,0.08)"
          />
          <polygon
            :points="`${scatterDividerPoints.cx},${scatterDividerPoints.cy} ${SC.x1},${scatterDividerPoints.hRight.y} ${SC.x1},${SC.y1} ${scatterDividerPoints.vBot.x},${scatterDividerPoints.vBot.y}`"
            fill="rgba(251,146,60,0.08)"
          />
          <polygon
            :points="`${scatterDividerPoints.cx},${scatterDividerPoints.cy} ${scatterDividerPoints.vBot.x},${scatterDividerPoints.vBot.y} ${SC.x0},${SC.y1} ${scatterDividerPoints.hLeft.x},${scatterDividerPoints.hLeft.y}`"
            fill="rgba(239,68,68,0.08)"
          />

          <!-- Chart border -->
          <rect
            :x="SC.x0"
            :y="SC.y0"
            :width="SC_W"
            :height="SC_H"
            fill="none"
            stroke="rgba(0,0,0,0.1)"
            stroke-width="1"
          />

          <!-- Quadrant dividers (4 independent half-lines, each anchored to the centre) -->
          <line
            :x1="scatterDividerPoints.cx"
            :y1="scatterDividerPoints.cy"
            :x2="scatterDividerPoints.vTop.x"
            :y2="scatterDividerPoints.vTop.y"
            stroke="rgba(0,0,0,0.12)"
            stroke-width="1"
            stroke-dasharray="4,3"
          />
          <line
            :x1="scatterDividerPoints.cx"
            :y1="scatterDividerPoints.cy"
            :x2="scatterDividerPoints.vBot.x"
            :y2="scatterDividerPoints.vBot.y"
            stroke="rgba(0,0,0,0.12)"
            stroke-width="1"
            stroke-dasharray="4,3"
          />
          <line
            :x1="scatterDividerPoints.cx"
            :y1="scatterDividerPoints.cy"
            :x2="scatterDividerPoints.hLeft.x"
            :y2="scatterDividerPoints.hLeft.y"
            stroke="rgba(0,0,0,0.12)"
            stroke-width="1"
            stroke-dasharray="4,3"
          />
          <line
            :x1="scatterDividerPoints.cx"
            :y1="scatterDividerPoints.cy"
            :x2="scatterDividerPoints.hRight.x"
            :y2="scatterDividerPoints.hRight.y"
            stroke="rgba(0,0,0,0.12)"
            stroke-width="1"
            stroke-dasharray="4,3"
          />

          <!-- Quadrant labels -->
          <text
            :x="SC.x1 - 6"
            :y="SC.y0 + 14"
            text-anchor="end"
            font-size="9"
            font-family="system-ui,sans-serif"
            fill="rgba(22,163,74,0.7)"
            font-weight="600"
          >
            ELITE
          </text>
          <text
            :x="SC.x0 + 6"
            :y="SC.y1 - 6"
            text-anchor="start"
            font-size="9"
            font-family="system-ui,sans-serif"
            fill="rgba(220,38,38,0.7)"
            font-weight="600"
          >
            BUMS
          </text>

          <!-- Best-direction labels -->
          <text
            :x="(SC.x0 + SC.x1) / 2"
            :y="SC.y0 + 14"
            text-anchor="middle"
            font-size="9"
            font-family="system-ui,sans-serif"
            fill="rgba(0,0,0,0.4)"
            font-weight="600"
          >
            BEST DEFENSE
          </text>
          <text
            :x="SC.x1 + 10"
            :y="(SC.y0 + SC.y1) / 2"
            text-anchor="middle"
            font-size="9"
            font-family="system-ui,sans-serif"
            fill="rgba(0,0,0,0.4)"
            font-weight="600"
            :transform="`rotate(90, ${SC.x1 + 10}, ${(SC.y0 + SC.y1) / 2})`"
          >
            BEST ATTACK
          </text>

          <!-- X axis label -->
          <text
            x="270"
            y="497"
            text-anchor="middle"
            font-size="9"
            font-family="system-ui,sans-serif"
            fill="rgba(0,0,0,0.35)"
          >
            ← Poor Attack · Good Attack →
          </text>

          <!-- Y axis label (rotated) -->
          <text
            x="11"
            y="240"
            text-anchor="middle"
            font-size="9"
            font-family="system-ui,sans-serif"
            fill="rgba(0,0,0,0.35)"
            transform="rotate(-90,11,240)"
          >
            ← Poor Defense · Good Defense →
          </text>

          <!-- Mid circle -->
          <circle
            :cx="scatterMidX"
            :cy="scatterMidY"
            :r="scatterMidR"
            fill="rgba(0,0,0,0.04)"
            stroke="rgba(0,0,0,0.15)"
            stroke-width="1"
            stroke-dasharray="4,3"
          />
          <text
            :x="scatterMidX"
            :y="scatterMidY + 4"
            text-anchor="middle"
            font-size="9"
            font-family="system-ui,sans-serif"
            fill="rgba(0,0,0,0.3)"
            font-weight="600"
          >
            MID
          </text>

          <!-- Historical champion ghost dots -->
          <template v-if="showChampions">
            <g v-for="c in championsScatter" :key="`champ-${c.year}`">
              <circle
                :cx="c.plotX"
                :cy="c.plotY"
                r="10"
                fill="rgba(250,204,21,0.15)"
                stroke="rgba(250,204,21,0.6)"
                stroke-width="1"
                stroke-dasharray="3,2"
              />
              <svg
                :x="c.plotX - 7"
                :y="c.plotY - 7"
                width="14"
                height="14"
                opacity="0.5"
              >
                <use :href="`${BASE_URL}icons.svg#${c.iconId}`" />
              </svg>
              <text
                :x="c.plotX"
                :y="c.plotY - 12"
                text-anchor="middle"
                font-size="7"
                font-family="system-ui,sans-serif"
                fill="rgba(250,204,21,0.8)"
                font-weight="600"
              >
                {{ c.year }}
              </text>
            </g>
          </template>

          <!-- Trail path + dots for the hovered team (rendered before dots so logos sit on top) -->
          <g v-if="xpalmyHoverTeamId !== null" pointer-events="none">
            <path
              :d="xpalmyTrailPath"
              fill="none"
              stroke="rgba(0,0,0,0.22)"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <g v-for="pt in xpalmyTrailPoints" :key="pt.round">
              <circle
                :cx="pt.plotX"
                :cy="pt.plotY"
                r="3"
                fill="white"
                :fill-opacity="pt.opacity * 0.85"
                stroke="rgba(0,0,0,1)"
                :stroke-opacity="pt.opacity * 0.35"
                stroke-width="1"
              />
              <text
                :x="pt.plotX"
                :y="pt.plotY - 5.5"
                text-anchor="middle"
                font-size="7"
                font-family="system-ui,sans-serif"
                fill="rgba(0,0,0,1)"
                :fill-opacity="pt.opacity * 0.5"
              >
                R{{ pt.round }}
              </text>
            </g>
          </g>

          <!-- Team dots + logos (hovered team sorted last = on top in SVG) -->
          <g
            v-for="p in xpalmyScatterSorted"
            :key="p.teamId"
            :style="{
              cursor: 'pointer',
              opacity:
                xpalmyHoverTeamId !== null && xpalmyHoverTeamId !== p.teamId
                  ? 0.12
                  : 1,
              transition: 'opacity 0.15s',
            }"
            @mouseenter="xpalmyHoverTeamId = p.teamId"
            @mouseleave="xpalmyHoverTeamId = null"
            @click.stop="onScatterDotClick(p.teamId, $event)"
          >
            <circle :cx="p.plotX" :cy="p.plotY" r="11" fill="white" />
            <svg :x="p.plotX - 9" :y="p.plotY - 9" width="18" height="18">
              <use :href="`${BASE_URL}icons.svg#${p.iconId}`" />
            </svg>
            <circle
              :cx="p.plotX"
              :cy="p.plotY"
              r="11"
              fill="none"
              :stroke="
                xpalmyHoverTeamId === p.teamId || xpalmyHoveredId === p.teamId
                  ? '#1f2937'
                  : 'rgba(0,0,0,0.18)'
              "
              :stroke-width="
                xpalmyHoverTeamId === p.teamId || xpalmyHoveredId === p.teamId
                  ? 1.5
                  : 1
              "
            />
          </g>
        </svg>
      </template>

      <!-- Standard worm chart for all other algorithms -->
      <template v-else>
        <div
          v-if="concludedRounds.length < 2"
          class="py-12 text-center text-sm text-gray-500"
        >
          Need at least 2 rounds of concluded matches to show the graph
        </div>

        <svg
          v-else
          viewBox="0 0 600 450"
          class="w-full"
          style="overflow: visible"
          aria-label="Algorithm rankings worm chart"
        >
          <text
            x="300"
            y="14"
            text-anchor="middle"
            font-size="11"
            font-family="system-ui,sans-serif"
            fill="rgba(255,255,255,0.5)"
            font-weight="700"
            letter-spacing="2"
          >
            {{ selectedAlgo.name.toUpperCase() }} RANKINGS ·
            {{ currentSeasonYear }}
          </text>
          <line
            :x1="CHART.x0"
            :y1="yRef6"
            :x2="CHART.x1"
            :y2="yRef6"
            stroke="rgba(251,146,60,0.3)"
            stroke-width="1"
            stroke-dasharray="4,3"
          />
          <line
            :x1="CHART.x0"
            :y1="yRef10"
            :x2="CHART.x1"
            :y2="yRef10"
            stroke="rgba(59,130,246,0.3)"
            stroke-width="1"
            stroke-dasharray="4,3"
          />
          <text
            v-for="pos in [1, 6, 7, 10, 11, 14, 18]"
            :key="pos"
            :x="CHART.x0 - 4"
            :y="yScale(pos) + 3.5"
            text-anchor="end"
            font-size="8"
            font-family="system-ui,sans-serif"
            fill="rgba(255,255,255,0.3)"
          >
            {{ pos }}
          </text>
          <g v-for="(r, idx) in concludedRounds" :key="`xcol-${r}`">
            <line
              :x1="xScale(idx)"
              :y1="CHART.y0"
              :x2="xScale(idx)"
              :y2="CHART.y1"
              stroke="rgba(255,255,255,0.05)"
              stroke-width="1"
            />
            <text
              :x="xScale(idx)"
              :y="CHART.y1 + 5"
              text-anchor="end"
              font-size="8"
              font-family="system-ui,sans-serif"
              fill="rgba(255,255,255,0.3)"
              :transform="`rotate(-45, ${xScale(idx)}, ${CHART.y1 + 5})`"
            >
              {{ roundLabels[r] ?? `Rd ${r}` }}
            </text>
          </g>
          <path
            v-for="d in wormData"
            :key="`line-${d.team.id}`"
            :d="buildWormPath(d.points)"
            fill="none"
            :stroke="d.color"
            stroke-width="2"
            stroke-opacity="0.85"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <g v-for="d in wormData" :key="`logo-${d.team.id}`">
            <template v-if="d.points.length">
              <circle
                :cx="CHART.x1 + 16"
                :cy="d.points[d.points.length - 1].y"
                r="13"
                fill="#0a0d14"
              />
              <circle
                :cx="CHART.x1 + 16"
                :cy="d.points[d.points.length - 1].y"
                r="12"
                fill="none"
                :stroke="d.color"
                stroke-width="1"
                stroke-opacity="0.5"
              />
              <svg
                :x="CHART.x1 + 4"
                :y="d.points[d.points.length - 1].y - 12"
                width="24"
                height="24"
                overflow="visible"
              >
                <use :href="`${BASE_URL}icons.svg#${d.team.iconId}`" />
              </svg>
            </template>
          </g>
        </svg>
      </template>
    </div>

    <!-- Legend -->
    <div
      class="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-400 dark:text-gray-500"
    >
      <span v-if="LEAGUE === 'aflw'" class="flex items-center gap-1.5">
        <span class="inline-block w-4 border-b-2 border-orange-400"></span>
        Top 8 (finals qualified)
      </span>
      <template v-else>
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-4 border-b-2 border-orange-400"></span>
          Top 6 (finals qualified)
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-4 border-b-2 border-blue-400"></span>
          Top 10 (wildcard)
        </span>
      </template>
      <span
        v-if="recentLimit"
        class="font-semibold text-blue-500 dark:text-blue-400"
        >Form mode: each team's last {{ recentLimit }} games only</span
      >
      <span v-if="activeView === 'table'"
        >vs AFL = difference from the official points-based ladder
        position</span
      >
      <span v-if="selectedId === 'palmy' && activeView === 'table'"
        >Hover a team to see their Palmy data</span
      >
      <span v-if="selectedId === 'xpalmy'"
        >Click a team to see their X and Y ladders</span
      >
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toPng } from 'html-to-image'
import { useAFLData, teamsInMatches } from '../composables/useAFLData'
import {
  useAlgorithmRankings,
  ALGORITHMS,
  computeAlgorithmRanking,
  runPalmy,
  runXPalmy,
  toRows,
  buildBasicStats,
  buildOfficialRankMap,
  filterRecentMatches,
} from '../composables/useAlgorithmRankings'
import type {
  AlgorithmId,
  AlgorithmRankRow,
  XPalmyLadderEntry,
  VenueFilter,
} from '../composables/useAlgorithmRankings'
import type { AflMatch, AflTeam } from '../types/afl'
import { titleToFilename } from '../composables/usePowerRankingsTitle'
import { getActiveSeasonYear } from '../config/seasons'
import { LEAGUE } from '../config/league'
import { FINALS_BOUNDARY_INDEXES } from '../composables/useFinalsBoundary'

const BASE_URL = import.meta.env.BASE_URL

const route = useRoute()
const router = useRouter()

const { matches, isLoading } = useAFLData()

// "Last X" form select — restrict every ladder to each team's most recent N games.
// 0 = full season. Legacy links used recent=1 for the old fixed last-8 toggle.
const RECENT_OPTIONS = Array.from({ length: 22 }, (_, i) => i + 2)
const queryRecent = Number(route.query.recent)
const recentLimit = ref(
  route.query.recent === '1'
    ? 8
    : RECENT_OPTIONS.includes(queryRecent)
      ? queryRecent
      : 0,
)
const rankingMatches = computed<readonly AflMatch[]>(() =>
  recentLimit.value
    ? filterRecentMatches(matches.value, recentLimit.value)
    : matches.value,
)

const {
  officialRankMap: compositeOfficialRankMap,
  srsRanking,
  colleyRanking,
  masseyRanking,
  winFlowRanking,
} = useAlgorithmRankings(rankingMatches)

const palmyVenueFilter = ref<VenueFilter>('both')

const palmyConcluded = computed(() =>
  rankingMatches.value.filter(
    (m) => m.status === 'CONCLUDED' && m.homeScore && m.awayScore,
  ),
)
const palmyBasicStats = computed(() =>
  buildBasicStats(rankingMatches.value, palmyVenueFilter.value),
)

const palmyData = computed(() =>
  runPalmy(
    palmyConcluded.value,
    palmyBasicStats.value,
    compositeOfficialRankMap.value,
    palmyVenueFilter.value,
  ),
)
const palmyRanking = computed(() => palmyData.value.ranking)
const palmyOpponentLadders = computed(() => palmyData.value.opponentLadders)

const xpalmyData = computed(() =>
  runXPalmy(
    palmyConcluded.value,
    palmyBasicStats.value,
    compositeOfficialRankMap.value,
    palmyVenueFilter.value,
  ),
)
const xpalmyPoints = computed(() => xpalmyData.value.points)
const xpalmyXLadders = computed(() => xpalmyData.value.xLadders)
const xpalmyYLadders = computed(() => xpalmyData.value.yLadders)
const xpalmyRanking = computed(() => {
  const ratings: Record<number, number> = {}
  for (const p of xpalmyData.value.points)
    ratings[p.teamId] = -(p.xRating + p.yRating) / 2
  return toRows(ratings, palmyBasicStats.value, compositeOfficialRankMap.value)
})

const validAlgoIds = ALGORITHMS.map((a) => a.id) as AlgorithmId[]

const selectedId = ref<AlgorithmId>(
  validAlgoIds.includes(route.query.algo as AlgorithmId)
    ? (route.query.algo as AlgorithmId)
    : 'palmy',
)
const activeView = ref<'table' | 'graph'>(
  route.query.view === 'graph' ? 'graph' : 'table',
)
const showNerdStuff = ref(false)

watch([selectedId, activeView, recentLimit], ([algo, view, recent]) => {
  router.replace({
    query: { algo, view, ...(recent ? { recent: String(recent) } : {}) },
  })
})
const selectedAlgo = computed(
  () => ALGORITHMS.find((a) => a.id === selectedId.value)!,
)

const xpalmyPointMap = computed(() => {
  const map = new Map<number, { xRating: number; yRating: number }>()
  for (const p of xpalmyPoints.value)
    map.set(p.teamId, { xRating: p.xRating, yRating: p.yRating })
  return map
})

function xpalmyAttack(teamId: number): string {
  const p = xpalmyPointMap.value.get(teamId)
  return p ? ((1 - p.xRating) * 100).toFixed(1) : '—'
}

function xpalmyDefense(teamId: number): string {
  const p = xpalmyPointMap.value.get(teamId)
  return p ? ((1 - p.yRating) * 100).toFixed(1) : '—'
}

function xpalmyGroup(teamId: number): string {
  const p = xpalmyPointMap.value.get(teamId)
  if (!p) return '—'
  const plotX = SC.x0 + (1 - p.xRating) * SC_W
  const plotY = SC.y0 + p.yRating * SC_H
  const { cx, cy } = scatterDividerPoints.value
  const dx = plotX - cx
  const dy = plotY - cy
  // The vertical/horizontal dividers are each bent at the centre into two
  // independently-angled half-lines, so pick whichever half the point sits
  // against before testing which side of it falls on.
  const vDeg = dy < 0 ? VERT_TOP_DEG : VERT_BOTTOM_DEG
  const hDeg = dx < 0 ? HORIZ_LEFT_DEG : HORIZ_RIGHT_DEG
  const cosV = Math.cos((vDeg * Math.PI) / 180)
  const sinV = Math.sin((vDeg * Math.PI) / 180)
  const cosH = Math.cos((hDeg * Math.PI) / 180)
  const sinH = Math.sin((hDeg * Math.PI) / 180)
  const goodAttack = cosV * dx - sinV * dy > 0
  const goodDefense = cosH * dy - sinH * dx < 0
  const base =
    goodAttack && goodDefense
      ? 'elite'
      : !goodAttack && goodDefense
        ? 'defensive'
        : goodAttack && !goodDefense
          ? 'offensive'
          : 'bum'
  const dist = Math.sqrt(dx ** 2 + dy ** 2)
  return dist < scatterMidR.value ? base + 'ish' : base
}

const currentRanking = computed<AlgorithmRankRow[]>(() => {
  switch (selectedId.value) {
    case 'srs':
      return srsRanking.value
    case 'colley':
      return colleyRanking.value
    case 'massey':
      return masseyRanking.value
    case 'winflow':
      return winFlowRanking.value
    case 'palmy':
      return palmyRanking.value
    case 'xpalmy':
      return xpalmyRanking.value
  }
})

function vsAflDelta(row: AlgorithmRankRow): number {
  return row.officialRank - row.rank
}

function formatRating(v: number): string {
  switch (selectedId.value) {
    case 'srs':
    case 'massey':
      return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`
    case 'colley':
      return v.toFixed(3)
    case 'winflow':
      return v.toFixed(4)
    case 'palmy':
      return v === -999 ? '—' : ((1 + v) * 100).toFixed(1)
    case 'xpalmy':
      return ((1 + v) * 100).toFixed(1)
  }
}

// --- Worm chart ---

const TEAM_COLORS: Record<number, string> = {
  1: '#E6002D', // Adelaide Crows
  2: '#A52834', // Brisbane Lions
  5: '#1565C0', // Carlton
  3: '#C8C8C8', // Collingwood
  12: '#FF4136', // Essendon
  14: '#6A3688', // Fremantle
  10: '#1E6EB5', // Geelong Cats
  4: '#FFB703', // Gold Coast SUNS
  15: '#F15A22', // GWS GIANTS
  9: '#C8922A', // Hawthorn
  17: '#CC0000', // Melbourne
  6: '#1E88E5', // North Melbourne
  7: '#00B2C8', // Port Adelaide
  16: '#F4C430', // Richmond
  11: '#D50000', // St Kilda
  13: '#E53935', // Sydney Swans
  18: '#EFAB00', // West Coast Eagles
  8: '#4469DE', // Western Bulldogs
}

const CHART = { x0: 26, x1: 546, y0: 20, y1: 422 } as const

function yScale(pos: number): number {
  return CHART.y0 + ((pos - 1) * (CHART.y1 - CHART.y0)) / 17
}

const yRef6 = yScale(6.5)
const yRef10 = yScale(10.5)

function xScale(idx: number): number {
  const n = concludedRounds.value.length
  if (n <= 1) return (CHART.x0 + CHART.x1) / 2
  return CHART.x0 + (idx * (CHART.x1 - CHART.x0)) / (n - 1)
}

const concludedRounds = computed<number[]>(() => {
  const rounds = new Set<number>()
  for (const m of rankingMatches.value) {
    if (m.status === 'CONCLUDED' && m.homeScore && m.awayScore)
      rounds.add(m.roundNumber)
  }
  return [...rounds].sort((a, b) => a - b)
})

const roundLabels = computed<Record<number, string>>(() => {
  const map: Record<number, string> = {}
  for (const m of matches.value) {
    if (m.roundNumber in map) continue
    const n = m.roundName
    map[m.roundNumber] =
      n === 'Opening Round'
        ? 'OR'
        : n === 'Finals Week 1'
          ? 'F1'
          : n === 'Semi Finals'
            ? 'F2'
            : n === 'Preliminary Finals'
              ? 'PF'
              : n === 'Grand Final'
                ? 'GF'
                : `Rd ${m.roundNumber}`
  }
  return map
})

const roundHistory = computed<Map<number, AlgorithmRankRow[]>>(() => {
  if (activeView.value !== 'graph') return new Map()
  const result = new Map<number, AlgorithmRankRow[]>()
  for (const round of concludedRounds.value) {
    const matchesForRound = rankingMatches.value.filter(
      (m) => m.roundNumber <= round,
    )
    result.set(
      round,
      computeAlgorithmRanking(selectedId.value, matchesForRound),
    )
  }
  return result
})

interface WormPoint {
  x: number
  y: number
}
interface WormTeamData {
  team: AflTeam
  color: string
  points: WormPoint[]
}

const wormData = computed<WormTeamData[]>(() => {
  const rounds = concludedRounds.value
  if (rounds.length === 0) return []
  return teamsInMatches(rankingMatches.value).map((team) => {
    const points: WormPoint[] = []
    rounds.forEach((round, idx) => {
      const ranking = roundHistory.value.get(round)
      const row = ranking?.find((r) => r.teamId === team.id)
      if (!row) return
      points.push({ x: xScale(idx), y: yScale(row.rank) })
    })
    return { team, color: TEAM_COLORS[team.id] ?? '#888888', points }
  }).filter((d) => d.points.length > 0)
})

function buildWormPath(pts: WormPoint[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1]
    const p1 = pts[i]
    const dx = (p1.x - p0.x) / 3
    d += ` C ${p0.x + dx},${p0.y} ${p1.x - dx},${p1.y} ${p1.x},${p1.y}`
  }
  return d
}

// --- Graph screenshot ---

const graphCaptureEl = ref<HTMLElement | null>(null)
const graphCapturing = ref(false)

async function screenshotGraph() {
  if (!graphCaptureEl.value) return
  graphCapturing.value = true
  await new Promise((r) => setTimeout(r, 50))

  let spriteEl: Element | null = null
  const useEls: { el: Element; original: string }[] = []
  try {
    const spriteRes = await fetch(`${BASE_URL}icons.svg`)
    const spriteText = await spriteRes.text()
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
    wrapper.innerHTML = spriteText
    spriteEl = wrapper
    graphCaptureEl.value.prepend(wrapper)

    graphCaptureEl.value.querySelectorAll('use[href]').forEach((use) => {
      const href = use.getAttribute('href') ?? ''
      useEls.push({ el: use, original: href })
      const fragment = href.split('#')[1]
      if (fragment) use.setAttribute('href', `#${fragment}`)
    })

    const dataUrl = await toPng(graphCaptureEl.value, { pixelRatio: 2 })
    const link = document.createElement('a')
    link.download = titleToFilename(selectedAlgo.value.name)
    link.href = dataUrl
    link.click()
  } finally {
    useEls.forEach(({ el, original }) => el.setAttribute('href', original))
    spriteEl?.remove()
    graphCapturing.value = false
  }
}

// --- Palmy click popup ---

const POPUP_TABS = [
  { id: 'own' as const, label: 'Opponent Ladder' },
  { id: 'positions' as const, label: 'League Positions' },
]

const tableEl = ref<HTMLElement | null>(null)
const hoveredTeamId = ref<number | null>(null)
const popupTab = ref<'own' | 'positions'>('own')
const popupStyle = ref<Record<string, string>>({})
const palmyAnchorEl = ref<HTMLElement | null>(null)

function closePopup() {
  hoveredTeamId.value = null
}

onMounted(() => document.addEventListener('click', closePopup))
onUnmounted(() => document.removeEventListener('click', closePopup))

const teamInfoMap = computed(() => {
  const map = new Map<number, { teamName: string; iconId: string }>()
  for (const t of teamsInMatches(rankingMatches.value)) map.set(t.id, { teamName: t.name, iconId: t.iconId })
  return map
})

const hoveredTeamName = computed(() => {
  if (hoveredTeamId.value === null) return ''
  return teamInfoMap.value.get(hoveredTeamId.value)?.teamName ?? ''
})

const hoveredLadder = computed(() => {
  if (hoveredTeamId.value === null) return []
  const ladder = palmyOpponentLadders.value[hoveredTeamId.value] ?? []
  if (palmyVenueFilter.value === 'both') return ladder
  // wasTeamHome refers to the entry's team (the opponent).
  // Owner was home when opponent was away (!wasTeamHome), and vice-versa.
  const home = palmyVenueFilter.value === 'home'
  return ladder.filter((e) => (home ? !e.wasTeamHome : e.wasTeamHome))
})

const hoveredTeamPositions = computed(() => {
  if (hoveredTeamId.value === null) return []
  const tid = hoveredTeamId.value
  const filter = palmyVenueFilter.value
  const result: Array<{
    ownerName: string
    ownerIconId: string
    rank: number
    ladderSize: number
    differential: number
    roundNumber: number
  }> = []

  for (const [ownerIdStr, ladder] of Object.entries(
    palmyOpponentLadders.value,
  )) {
    const ownerId = Number(ownerIdStr)
    if (ownerId === tid) continue
    const ownerInfo = teamInfoMap.value.get(ownerId)
    // Subset of the ladder matching the venue filter (wasTeamHome = opponent was home = owner was away)
    const subset =
      filter === 'both'
        ? ladder
        : ladder.filter((e) =>
            filter === 'home' ? e.wasTeamHome : !e.wasTeamHome,
          )
    const idx = subset.findIndex((e) => e.teamId === tid)
    if (idx === -1) continue
    const entry = subset[idx]
    result.push({
      ownerName: ownerInfo?.teamName ?? String(ownerId),
      ownerIconId: ownerInfo?.iconId ?? '',
      rank: idx + 1,
      ladderSize: subset.length,
      differential: entry.differential,
      roundNumber: entry.roundNumber,
    })
  }

  return result.sort((a, b) => a.rank - b.rank)
})

const hoveredAvgPosition = computed(() => {
  if (hoveredTeamPositions.value.length === 0) return '—'
  const avg =
    hoveredTeamPositions.value.reduce((s, p) => s + p.rank / p.ladderSize, 0) /
    hoveredTeamPositions.value.length
  return ((1 - avg) * 100).toFixed(1)
})

function positionClass(rank: number, size: number): string {
  const pct = rank / size
  if (pct <= 0.25) return 'text-green-600 dark:text-green-400'
  if (pct <= 0.5) return 'text-gray-600 dark:text-gray-300'
  if (pct <= 0.75) return 'text-orange-500 dark:text-orange-400'
  return 'text-red-500 dark:text-red-400'
}

function onRowClick(teamId: number, event: MouseEvent) {
  event.stopPropagation()
  if (hoveredTeamId.value !== teamId) popupTab.value = 'own'
  hoveredTeamId.value = teamId
  palmyAnchorEl.value = event.currentTarget as HTMLElement
  positionPopup()
}

function positionPopup() {
  const row = palmyAnchorEl.value
  if (!row) return
  const rowRect = row.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const POPUP_W = 310
  const POPUP_H = 500

  // Center horizontally on the table
  const tableRect = tableEl.value?.getBoundingClientRect()
  let left = tableRect
    ? tableRect.left + tableRect.width / 2 - POPUP_W / 2
    : rowRect.left + rowRect.width / 2 - POPUP_W / 2
  left = Math.max(8, Math.min(left, vw - POPUP_W - 8))

  // Show below the hovered row; flip above if not enough room
  let top = rowRect.bottom + 8
  if (top + POPUP_H > vh - 8) top = rowRect.top - POPUP_H - 8
  top = Math.max(8, Math.min(top, vh - POPUP_H - 8))

  popupStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${POPUP_W}px`,
  }
}

// --- XPalmy champions overlay ---

interface XPalmyChampion {
  year: string
  teamId: number
  teamName: string
  abbreviation: string
  iconId: string
  xRating: number
  yRating: number
  homeXRating?: number
  homeYRating?: number
  awayXRating?: number
  awayYRating?: number
}

const showChampions = ref(false)
const champions = ref<XPalmyChampion[]>([])
const currentSeasonYear = getActiveSeasonYear()

onMounted(async () => {
  if (LEAGUE !== 'afl') return // xpalmy-champions.json is an AFL-only overlay
  try {
    const res = await fetch(`${BASE_URL}data/xpalmy-champions.json`, {
      cache: 'no-store',
    })
    if (res.ok) champions.value = await res.json()
  } catch {
    /* non-critical */
  }
})

// --- XPalmy scatter plot ---

const SC = { x0: 60, x1: 480, y0: 30, y1: 450 } as const
const SC_W = SC.x1 - SC.x0
const SC_H = SC.y1 - SC.y0

const xpalmyHoverTeamId = ref<number | null>(null)

const xpalmyScatter = computed(() =>
  xpalmyPoints.value.map((p) => ({
    ...p,
    plotX: SC.x0 + (1 - p.xRating) * SC_W,
    plotY: SC.y0 + p.yRating * SC_H,
  })),
)

function champRatings(c: XPalmyChampion): { x: number; y: number } {
  if (
    palmyVenueFilter.value === 'home' &&
    c.homeXRating != null &&
    c.homeYRating != null
  )
    return { x: c.homeXRating, y: c.homeYRating }
  if (
    palmyVenueFilter.value === 'away' &&
    c.awayXRating != null &&
    c.awayYRating != null
  )
    return { x: c.awayXRating, y: c.awayYRating }
  return { x: c.xRating, y: c.yRating }
}

const championsScatter = computed(() =>
  champions.value
    .filter((c) => c.year !== currentSeasonYear)
    .map((c) => {
      const { x, y } = champRatings(c)
      return { ...c, plotX: SC.x0 + (1 - x) * SC_W, plotY: SC.y0 + y * SC_H }
    }),
)

// Hovered team rendered last so it sits on top in SVG z-order
const xpalmyScatterSorted = computed(() => {
  const hid = xpalmyHoverTeamId.value
  if (hid === null) return xpalmyScatter.value
  return [
    ...xpalmyScatter.value.filter((p) => p.teamId !== hid),
    ...xpalmyScatter.value.filter((p) => p.teamId === hid),
  ]
})

// Per-round trail positions for each team (only computed when viewing the xpalmy graph)
const xpalmyTrailHistory = computed(() => {
  const result = new Map<
    number,
    Array<{ round: number; plotX: number; plotY: number }>
  >()
  if (selectedId.value !== 'xpalmy' || activeView.value !== 'graph')
    return result
  for (const t of teamsInMatches(rankingMatches.value)) result.set(t.id, [])
  for (const round of concludedRounds.value) {
    const roundMatches = rankingMatches.value.filter(
      (m) => m.roundNumber <= round,
    )
    const roundConcluded = roundMatches.filter(
      (m) => m.status === 'CONCLUDED' && m.homeScore && m.awayScore,
    )
    const stats = buildBasicStats(roundMatches)
    const offMap = buildOfficialRankMap(stats)
    const { points } = runXPalmy(
      roundConcluded,
      stats,
      offMap,
      palmyVenueFilter.value,
    )
    for (const p of points) {
      if (p.played < 2) continue
      result.get(p.teamId)?.push({
        round,
        plotX: SC.x0 + (1 - p.xRating) * SC_W,
        plotY: SC.y0 + p.yRating * SC_H,
      })
    }
  }
  return result
})

// Trail points for the currently hovered team, with per-point opacity (old=faint, new=opaque)
const xpalmyTrailPoints = computed(() => {
  const tid = xpalmyHoverTeamId.value
  if (tid === null) return []
  const pts = xpalmyTrailHistory.value.get(tid) ?? []
  const n = pts.length
  return pts.map((pt, i) => ({
    ...pt,
    opacity: n <= 1 ? 1 : 0.2 + 0.8 * (i / (n - 1)),
  }))
})

// SVG path string — Catmull-Rom spline so control points are derived from neighbours,
// producing a smooth curve that actually bends through each historical position.
const xpalmyTrailPath = computed(() => {
  const pts = xpalmyTrailPoints.value
  if (pts.length < 2) return ''
  let d = `M ${pts[0].plotX} ${pts[0].plotY}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const cp1x = p1.plotX + (p2.plotX - p0.plotX) / 6
    const cp1y = p1.plotY + (p2.plotY - p0.plotY) / 6
    const cp2x = p2.plotX - (p3.plotX - p1.plotX) / 6
    const cp2y = p2.plotY - (p3.plotY - p1.plotY) / 6
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.plotX},${p2.plotY}`
  }
  return d
})

const CHAMP_PAD = 10

// Vertical divider: just left of the furthest-left champion (highest xRating = smallest plotX)
const scatterMidX = computed(() => {
  if (champions.value.length === 0) return SC.x0 + SC_W / 2
  const minPlotX = Math.min(
    ...champions.value.map((c) => SC.x0 + (1 - champRatings(c).x) * SC_W),
  )
  return minPlotX - CHAMP_PAD
})

// Horizontal divider: just below the lowest champion (highest yRating = largest plotY)
const scatterMidY = computed(() => {
  if (champions.value.length === 0) return SC.y0 + SC_H / 2
  const maxPlotY = Math.max(
    ...champions.value.map((c) => SC.y0 + champRatings(c).y * SC_H),
  )
  return maxPlotY + CHAMP_PAD
})

const scatterMidR = computed(() => {
  const cx = scatterMidX.value
  const cy = scatterMidY.value
  // Radius reaches the plot position of a 60/60 rated team (rating = 0.4)
  const plotX60 = SC.x0 + (1 - 0.4) * SC_W
  const plotY60 = SC.y0 + 0.4 * SC_H
  return Math.sqrt((plotX60 - cx) ** 2 + (plotY60 - cy) ** 2)
})

// Each quadrant divider is an independent half-line anchored to the centre point,
// so any one of the four can be rotated without affecting the others.
const VERT_TOP_DEG = -5 // top half: 11:30 o'clock, 15° CCW from vertical rotated 2° CW
const VERT_BOTTOM_DEG = 15 // bottom half: 5:30 o'clock, 15° CCW from vertical
const HORIZ_LEFT_DEG = 15 // left half: 9:30 o'clock, 15° CW from horizontal
const HORIZ_RIGHT_DEG = 0 // right half: 3:30 o'clock, 15° CW from horizontal

// Endpoints where the rotated divider half-lines hit the chart boundary.
const scatterDividerPoints = computed(() => {
  const cx = scatterMidX.value
  const cy = scatterMidY.value
  const tanVTop = Math.tan((VERT_TOP_DEG * Math.PI) / 180)
  const tanVBot = Math.tan((VERT_BOTTOM_DEG * Math.PI) / 180)
  const tanHLeft = Math.tan((HORIZ_LEFT_DEG * Math.PI) / 180)
  const tanHRight = Math.tan((HORIZ_RIGHT_DEG * Math.PI) / 180)
  return {
    vTop: { x: cx - (cy - SC.y0) * tanVTop, y: SC.y0 },
    vBot: { x: cx + (SC.y1 - cy) * tanVBot, y: SC.y1 },
    hLeft: { x: SC.x0, y: cy - (cx - SC.x0) * tanHLeft },
    hRight: { x: SC.x1, y: cy + (SC.x1 - cx) * tanHRight },
    cx,
    cy,
  }
})

// --- XPalmy popup ---

const xpalmyHoveredId = ref<number | null>(null)
const xpalmyPopupTab = ref<'x-own' | 'x-pos' | 'y-own' | 'y-pos'>('x-own')
const xpalmyPopupStyle = ref<Record<string, string>>({})
const xpalmyAnchorFn = ref<(() => DOMRect) | null>(null)

function closeXpalmyPopup() {
  xpalmyHoveredId.value = null
}

onMounted(() => document.addEventListener('click', closeXpalmyPopup))
onUnmounted(() => document.removeEventListener('click', closeXpalmyPopup))

const xpalmyHoveredName = computed(() => {
  if (xpalmyHoveredId.value === null) return ''
  return teamInfoMap.value.get(xpalmyHoveredId.value)?.teamName ?? ''
})

const xpalmyHoveredXLadder = computed((): XPalmyLadderEntry[] => {
  if (xpalmyHoveredId.value === null) return []
  const ladder = xpalmyXLadders.value[xpalmyHoveredId.value] ?? []
  if (palmyVenueFilter.value === 'both') return ladder
  const home = palmyVenueFilter.value === 'home'
  return ladder.filter((e) => (home ? !e.wasTeamHome : e.wasTeamHome))
})

const xpalmyHoveredYLadder = computed((): XPalmyLadderEntry[] => {
  if (xpalmyHoveredId.value === null) return []
  const ladder = xpalmyYLadders.value[xpalmyHoveredId.value] ?? []
  if (palmyVenueFilter.value === 'both') return ladder
  const home = palmyVenueFilter.value === 'home'
  return ladder.filter((e) => (home ? !e.wasTeamHome : e.wasTeamHome))
})

type XpalmyPosition = {
  ownerName: string
  ownerIconId: string
  rank: number
  ladderSize: number
  score: number
  roundNumber: number
}

const xpalmyHoveredXPositions = computed((): XpalmyPosition[] => {
  if (xpalmyHoveredId.value === null) return []
  const tid = xpalmyHoveredId.value
  const filter = palmyVenueFilter.value
  const result: XpalmyPosition[] = []
  for (const [ownerIdStr, ladder] of Object.entries(xpalmyXLadders.value)) {
    const ownerId = Number(ownerIdStr)
    if (ownerId === tid) continue
    const ownerInfo = teamInfoMap.value.get(ownerId)
    const subset =
      filter === 'both'
        ? ladder
        : ladder.filter((e) =>
            filter === 'home' ? e.wasTeamHome : !e.wasTeamHome,
          )
    const idx = subset.findIndex((e) => e.teamId === tid)
    if (idx === -1) continue
    const entry = subset[idx]
    result.push({
      ownerName: ownerInfo?.teamName ?? String(ownerId),
      ownerIconId: ownerInfo?.iconId ?? '',
      rank: idx + 1,
      ladderSize: subset.length,
      score: entry.oppScore,
      roundNumber: entry.roundNumber,
    })
  }
  return result.sort((a, b) => a.rank - b.rank)
})

const xpalmyHoveredYPositions = computed((): XpalmyPosition[] => {
  if (xpalmyHoveredId.value === null) return []
  const tid = xpalmyHoveredId.value
  const filter = palmyVenueFilter.value
  const result: XpalmyPosition[] = []
  for (const [ownerIdStr, ladder] of Object.entries(xpalmyYLadders.value)) {
    const ownerId = Number(ownerIdStr)
    if (ownerId === tid) continue
    const ownerInfo = teamInfoMap.value.get(ownerId)
    const subset =
      filter === 'both'
        ? ladder
        : ladder.filter((e) =>
            filter === 'home' ? e.wasTeamHome : !e.wasTeamHome,
          )
    const idx = subset.findIndex((e) => e.teamId === tid)
    if (idx === -1) continue
    const entry = subset[idx]
    result.push({
      ownerName: ownerInfo?.teamName ?? String(ownerId),
      ownerIconId: ownerInfo?.iconId ?? '',
      rank: idx + 1,
      ladderSize: subset.length,
      score: entry.ownScore,
      roundNumber: entry.roundNumber,
    })
  }
  return result.sort((a, b) => a.rank - b.rank)
})

const xpalmyHoveredXAvg = computed(() => {
  const pos = xpalmyHoveredXPositions.value
  if (pos.length === 0) return '—'
  return (
    (1 -
      pos.reduce(
        (s, p) => s + (p.rank - 1) / Math.max(p.ladderSize - 1, 1),
        0,
      ) /
        pos.length) *
    100
  ).toFixed(1)
})

const xpalmyHoveredYAvg = computed(() => {
  const pos = xpalmyHoveredYPositions.value
  if (pos.length === 0) return '—'
  return (
    (1 -
      pos.reduce(
        (s, p) => s + (p.rank - 1) / Math.max(p.ladderSize - 1, 1),
        0,
      ) /
        pos.length) *
    100
  ).toFixed(1)
})

function applyXpalmyPopup() {
  if (!xpalmyAnchorFn.value) return
  const anchorRect = xpalmyAnchorFn.value()
  const vw = window.innerWidth,
    vh = window.innerHeight
  const W = 340,
    H = 540
  let left = anchorRect.left + anchorRect.width / 2 - W / 2
  left = Math.max(8, Math.min(left, vw - W - 8))
  let top = anchorRect.bottom + 8
  if (top + H > vh - 8) top = anchorRect.top - H - 8
  top = Math.max(8, Math.min(top, vh - H - 8))
  xpalmyPopupStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${W}px`,
  }
}

function onScatterDotClick(teamId: number, event: MouseEvent) {
  event.stopPropagation()
  if (xpalmyHoveredId.value !== teamId) xpalmyPopupTab.value = 'x-own'
  xpalmyHoveredId.value = teamId
  const el = event.currentTarget as Element
  xpalmyAnchorFn.value = () => el.getBoundingClientRect()
  applyXpalmyPopup()
}

function onXpalmyRowClick(teamId: number, event: MouseEvent) {
  event.stopPropagation()
  if (xpalmyHoveredId.value !== teamId) xpalmyPopupTab.value = 'x-own'
  xpalmyHoveredId.value = teamId
  const rowEl = event.currentTarget as Element
  xpalmyAnchorFn.value = () => {
    const tableRect = tableEl.value?.getBoundingClientRect()
    const rowRect = rowEl.getBoundingClientRect()
    return tableRect
      ? new DOMRect(
          tableRect.left + tableRect.width / 2,
          rowRect.top,
          0,
          rowRect.height,
        )
      : rowRect
  }
  applyXpalmyPopup()
}

function handlePopupScroll() {
  if (hoveredTeamId.value !== null) positionPopup()
  if (xpalmyHoveredId.value !== null) applyXpalmyPopup()
}

onMounted(() =>
  window.addEventListener('scroll', handlePopupScroll, { passive: true }),
)
onUnmounted(() => window.removeEventListener('scroll', handlePopupScroll))
</script>
