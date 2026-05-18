<template>
  <!-- Palmy popup -->
  <Teleport to="body">
    <div
      v-if="hoveredTeamId !== null && selectedId === 'palmy'"
      class="fixed z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl text-xs overflow-hidden"
      :style="popupStyle"
      @click.stop
    >
      <!-- Header -->
      <div class="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60">
        <div class="flex items-center justify-between mb-2">
          <span class="font-bold text-gray-800 dark:text-gray-100 text-sm">{{ hoveredTeamName }}</span>
          <button
            @click="closePopup"
            class="ml-2 flex size-5 items-center justify-center rounded text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            aria-label="Close"
          >✕</button>
        </div>
        <!-- Tabs -->
        <div class="flex gap-1">
          <button
            v-for="tab in POPUP_TABS"
            :key="tab.id"
            @click="popupTab = tab.id"
            class="px-2.5 py-1 rounded-md font-semibold transition-colors"
            :class="popupTab === tab.id
              ? 'bg-blue-600 text-white'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
          >{{ tab.label }}</button>
        </div>
      </div>

      <!-- Tab: Opponent Ladder -->
      <template v-if="popupTab === 'own'">
        <div class="px-3 py-1.5 text-gray-400 dark:text-gray-500 border-b border-gray-50 dark:border-gray-800">
          Opponents ranked by their margin vs {{ hoveredTeamName }}
        </div>
        <div class="overflow-y-auto" style="max-height: 380px">
          <div v-if="hoveredLadder.length === 0" class="px-3 py-4 text-gray-400 dark:text-gray-500 text-center">
            No concluded matches
          </div>
          <div
            v-for="entry in hoveredLadder"
            :key="`${entry.teamId}-${entry.roundNumber}`"
            class="flex items-center gap-2 px-3 py-1.5 border-b border-gray-50 dark:border-gray-800/60 last:border-0"
          >
            <span class="w-5 text-right text-gray-400 dark:text-gray-500 shrink-0 tabular-nums">{{ entry.rank }}</span>
            <svg class="size-5 shrink-0"><use :href="`${BASE_URL}icons.svg#${entry.iconId}`" /></svg>
            <span class="flex-1 text-gray-800 dark:text-gray-100 font-medium truncate">{{ entry.teamName }}</span>
            <span
              class="shrink-0 tabular-nums font-semibold w-10 text-right"
              :class="entry.differential > 0 ? 'text-red-500 dark:text-red-400' : entry.differential < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400'"
            >{{ entry.differential > 0 ? '+' : '' }}{{ entry.differential }}</span>
            <span class="shrink-0 text-gray-400 dark:text-gray-500 w-7 text-right">R{{ entry.roundNumber }}</span>
          </div>
        </div>
        <div class="px-3 py-1.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 text-gray-400 dark:text-gray-500">
          <span class="text-red-500">+</span> = opponent won &nbsp;·&nbsp; <span class="text-green-600">−</span> = {{ hoveredTeamName }} won
        </div>
      </template>

      <!-- Tab: League Positions -->
      <template v-else>
        <div class="px-3 py-1.5 border-b border-gray-50 dark:border-gray-800 text-gray-400 dark:text-gray-500">
          <span v-if="hoveredTeamPositions.length > 0">
            Avg position:
            <span class="font-bold text-gray-700 dark:text-gray-200">{{ hoveredAvgPosition }}</span>
            across {{ hoveredTeamPositions.length }} appearance{{ hoveredTeamPositions.length === 1 ? '' : 's' }}
          </span>
          <span v-else>No appearances yet</span>
        </div>
        <div class="overflow-y-auto" style="max-height: 380px">
          <div v-if="hoveredTeamPositions.length === 0" class="px-3 py-4 text-gray-400 dark:text-gray-500 text-center">
            No concluded matches
          </div>
          <div
            v-for="(pos, i) in hoveredTeamPositions"
            :key="i"
            class="flex items-center gap-2 px-3 py-1.5 border-b border-gray-50 dark:border-gray-800/60 last:border-0"
          >
            <!-- Rank in that team's ladder -->
            <span
              class="w-12 text-right tabular-nums font-bold shrink-0"
              :class="positionClass(pos.rank, pos.ladderSize)"
            >#{{ pos.rank }}<span class="font-normal text-gray-300 dark:text-gray-600">/{{ pos.ladderSize }}</span></span>
            <svg class="size-5 shrink-0"><use :href="`${BASE_URL}icons.svg#${pos.ownerIconId}`" /></svg>
            <span class="flex-1 text-gray-800 dark:text-gray-100 font-medium truncate">{{ pos.ownerName }}</span>
            <!-- Y's margin in that match -->
            <span
              class="shrink-0 tabular-nums font-semibold w-10 text-right"
              :class="pos.differential > 0 ? 'text-green-600 dark:text-green-400' : pos.differential < 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-400'"
            >{{ pos.differential > 0 ? '+' : '' }}{{ pos.differential }}</span>
            <span class="shrink-0 text-gray-400 dark:text-gray-500 w-7 text-right">R{{ pos.roundNumber }}</span>
          </div>
        </div>
        <div class="px-3 py-1.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 text-gray-400 dark:text-gray-500">
          #rank/size in that team's ladder &nbsp;·&nbsp; <span class="text-green-600">+</span> = {{ hoveredTeamName }} won
        </div>
      </template>
    </div>
  </Teleport>

  <main class="max-w-4xl mx-auto px-4 py-6">
    <div class="mb-6">
      <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Over complicated Ladders</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Different statistical methods for ranking teams when schedules are uneven. Each algorithm uses only concluded match results.
      </p>
    </div>

    <!-- Algorithm selector -->
    <div data-tour="rankings-algo-selector" class="flex flex-wrap gap-2 mb-4">
      <button
        v-for="algo in ALGORITHMS"
        :key="algo.id"
        @click="selectedId = algo.id"
        class="px-3 py-1.5 rounded-full text-sm font-semibold transition-colors border"
        :class="selectedId === algo.id
          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
          : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400'"
      >
        {{ algo.name }}
      </button>
    </div>

    <!-- Algorithm description + view toggle -->
    <div class="flex items-start gap-3 mb-5">
      <div class="flex-1 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-300">
        {{ selectedAlgo.description }}
        <span v-if="selectedAlgo.creditName" class="block mt-1.5 text-xs text-blue-500 dark:text-blue-400">
          <a
            v-if="selectedAlgo.creditUrl"
            :href="selectedAlgo.creditUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="underline underline-offset-2 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >{{ selectedAlgo.creditName }}</a>
          <span v-else>{{ selectedAlgo.creditName }}</span>
        </span>
      </div>
      <!-- Table / Graph toggle -->
      <div class="shrink-0 flex overflow-hidden rounded border border-gray-300 dark:border-gray-600 self-center">
        <button
          @click="activeView = 'table'"
          class="px-3 py-1.5 text-xs font-semibold transition-colors"
          :class="activeView === 'table'
            ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900'
            : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
        >Table</button>
        <button
          @click="activeView = 'graph'"
          class="border-l border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-semibold transition-colors"
          :class="activeView === 'graph'
            ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900'
            : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'"
        >Graph</button>
      </div>
    </div>

    <!-- Nerd stuff (collapsible) -->
    <div class="mb-5">
      <button
        @click="showNerdStuff = !showNerdStuff"
        class="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors select-none"
      >
        <svg class="size-2.5 transition-transform duration-150" :class="showNerdStuff ? 'rotate-90' : ''" viewBox="0 0 10 10" fill="currentColor">
          <path d="M2 1.5l6 3.5-6 3.5V1.5z"/>
        </svg>
        Nerd stuff
      </button>

      <div
        v-if="showNerdStuff"
        class="mt-2 rounded-lg border border-gray-800 overflow-hidden text-xs"
        style="background:#0d1117; color:#c9d1d9; font-family:ui-monospace,'Cascadia Code','Source Code Pro',monospace"
      >
        <!-- Win% -->
        <div v-if="selectedId === 'winpct'" class="p-5 space-y-4">
          <div class="text-center">
            <svg viewBox="0 0 290 76" class="w-56 mx-auto">
              <text x="30" y="44" fill="#8b949e" font-size="12" font-family="inherit">Win% =</text>
              <text x="162" y="28" text-anchor="middle" fill="#79c0ff" font-size="13" font-family="inherit">W + 0.5 × D</text>
              <line x1="106" y1="36" x2="218" y2="36" stroke="#30363d" stroke-width="1.5"/>
              <text x="162" y="56" text-anchor="middle" fill="#79c0ff" font-size="13" font-family="inherit">GP</text>
              <text x="230" y="44" fill="#8b949e" font-size="11" font-family="inherit">× 100</text>
            </svg>
          </div>
          <div class="rounded-md px-4 py-3 space-y-1.5" style="background:#161b22">
            <div><span style="color:#79c0ff">W</span> = wins &nbsp;·&nbsp; <span style="color:#79c0ff">D</span> = draws &nbsp;·&nbsp; <span style="color:#79c0ff">GP</span> = games played</div>
            <div class="pt-1"><span style="color:#8b949e">e.g.</span> <span style="color:#56d364">10W 4L 2D</span> (16 games) → <span style="color:#79c0ff">(10 + 1) / 16 = 68.75</span></div>
            <div style="color:#8b949e">Ignores who you beat or by how much — only count matters.</div>
          </div>
        </div>

        <!-- SRS -->
        <div v-else-if="selectedId === 'srs'" class="p-5 space-y-4">
          <div class="rounded-md px-4 py-3 space-y-2" style="background:#161b22">
            <div><span style="color:#ff7b72">init:</span>   r[t] = <span style="color:#79c0ff">avgMargin[t]</span></div>
            <div><span style="color:#ff7b72">loop:</span>   r[t] = <span style="color:#79c0ff">avgMargin[t]</span> + mean( r[opp] )</div>
            <div class="pt-1" style="color:#8b949e">↺  repeat until max|Δr| &lt; 0.0001  (~1000 iterations max)</div>
          </div>
          <div class="rounded-md px-4 py-3 space-y-1.5" style="background:#161b22">
            <div style="color:#8b949e">Convergence example (3 teams, simplified):</div>
            <div class="pt-1 grid gap-y-1" style="grid-template-columns:5ch 1fr">
              <span style="color:#8b949e">step 0</span><span>A=+15 &nbsp; B=−5 &nbsp; C=+0</span>
              <span style="color:#8b949e">step 1</span><span>A=+20 &nbsp; B=−8 &nbsp; C=+3 &nbsp;<span style="color:#8b949e">(opps updated)</span></span>
              <span style="color:#8b949e">step n</span><span style="color:#56d364">converged ✓</span>
            </div>
          </div>
        </div>

        <!-- Colley Matrix -->
        <div v-else-if="selectedId === 'colley'" class="p-5 space-y-4">
          <div style="color:#8b949e">Builds 18 equations (one per team) and solves them simultaneously:</div>
          <div class="rounded-md px-4 py-3 space-y-1.5" style="background:#161b22">
            <div class="text-center text-base py-1" style="color:#c9d1d9;letter-spacing:0.1em">C · r = b</div>
          </div>
          <div class="rounded-md px-4 py-3 space-y-1.5" style="background:#161b22">
            <div>C<span style="color:#8b949e">_ii</span>  =  2 + <span style="color:#79c0ff">games_played(i)</span>  &nbsp;<span style="color:#8b949e">(diagonal)</span></div>
            <div>C<span style="color:#8b949e">_ij</span>  =  −<span style="color:#f97583">matchups(i, j)</span>  &nbsp;<span style="color:#8b949e">(off-diagonal)</span></div>
            <div>b<span style="color:#8b949e">_i</span>&nbsp;&nbsp;  =  1 + ( <span style="color:#56d364">W_i</span> − <span style="color:#f97583">L_i</span> ) / 2</div>
          </div>
          <div class="rounded-md px-4 py-3" style="background:#161b22;color:#8b949e">
            Solved with Gaussian elimination. Uses only wins/losses — margins don't matter. Every result cascades through all 18 equations.
          </div>
        </div>

        <!-- Massey -->
        <div v-else-if="selectedId === 'massey'" class="p-5 space-y-4">
          <div style="color:#8b949e">For each game, the rating difference should equal the score margin:</div>
          <div class="rounded-md px-4 py-3 space-y-2" style="background:#161b22">
            <div>r[<span style="color:#79c0ff">home</span>] − r[<span style="color:#f97583">away</span>] ≈ score[<span style="color:#79c0ff">home</span>] − score[<span style="color:#f97583">away</span>]</div>
            <div class="pt-1" style="color:#8b949e">More games than unknowns → overdetermined → least squares:</div>
            <div class="pt-1">min&nbsp; Σ <span style="color:#e6c07b">( r_i − r_j − margin_ij )²</span></div>
          </div>
          <div class="rounded-md px-4 py-3 space-y-1.5" style="background:#161b22">
            <div style="color:#8b949e">Normal equations:&nbsp;<span style="color:#c9d1d9">MᵀM · r = Mᵀ · p</span></div>
            <div class="pt-1">A win by 80 carries far more weight than a win by 1.</div>
          </div>
        </div>

        <!-- Win Flow -->
        <div v-else-if="selectedId === 'winflow'" class="p-5 space-y-4">
          <div class="flex gap-5 items-start flex-wrap">
            <!-- Directed graph -->
            <svg viewBox="0 0 160 140" class="w-40 shrink-0 rounded-md" style="background:#161b22">
              <defs>
                <marker id="nerd-arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0.5 L0,5.5 L5.5,3 z" fill="#56d364"/>
                </marker>
              </defs>
              <!-- Nodes -->
              <circle cx="80" cy="22" r="14" fill="#0d1117" stroke="#79c0ff" stroke-width="1.5"/>
              <text x="80" y="27" text-anchor="middle" font-size="11" fill="#79c0ff" font-family="inherit" font-weight="bold">A</text>
              <text x="80" y="12" text-anchor="middle" font-size="7.5" fill="#56d364" font-family="inherit">0.38</text>

              <circle cx="138" cy="80" r="14" fill="#0d1117" stroke="#c9d1d9" stroke-width="1"/>
              <text x="138" y="85" text-anchor="middle" font-size="11" fill="#c9d1d9" font-family="inherit">B</text>
              <text x="153" y="73" font-size="7.5" fill="#c9d1d9" font-family="inherit">0.27</text>

              <circle cx="80" cy="124" r="14" fill="#0d1117" stroke="#c9d1d9" stroke-width="1"/>
              <text x="80" y="129" text-anchor="middle" font-size="11" fill="#c9d1d9" font-family="inherit">C</text>
              <text x="80" y="115" text-anchor="middle" font-size="7.5" fill="#f97583" font-family="inherit">0.11</text>

              <circle cx="22" cy="80" r="14" fill="#0d1117" stroke="#c9d1d9" stroke-width="1"/>
              <text x="22" y="85" text-anchor="middle" font-size="11" fill="#c9d1d9" font-family="inherit">D</text>
              <text x="4" y="73" font-size="7.5" fill="#c9d1d9" font-family="inherit">0.24</text>

              <!-- Arrows: A beats B, B beats C, D beats B, C beats D, A beats C -->
              <line x1="92" y1="31" x2="127" y2="68" stroke="#56d364" stroke-width="1.5" marker-end="url(#nerd-arr)"/>
              <line x1="127" y1="91" x2="92" y2="113" stroke="#56d364" stroke-width="1.5" marker-end="url(#nerd-arr)"/>
              <line x1="35"  y1="70" x2="125" y2="69" stroke="#56d364" stroke-width="1"   marker-end="url(#nerd-arr)"/>
              <line x1="69"  y1="114" x2="34" y2="92" stroke="#56d364" stroke-width="1.5" marker-end="url(#nerd-arr)"/>
              <line x1="80"  y1="36" x2="80" y2="110" stroke="#56d364" stroke-width="1" stroke-dasharray="3,2" marker-end="url(#nerd-arr)"/>
            </svg>

            <div class="flex-1 min-w-0 space-y-3">
              <div class="rounded-md px-3 py-2.5 space-y-2" style="background:#161b22">
                <div style="color:#8b949e">Each loss donates rating to the winner:</div>
                <div class="pt-1 leading-5">r(T) = <span style="color:#e6c07b">(1−d)/N</span> + d × Σ <span style="color:#79c0ff">w(T,X)/GP(X)</span> × r(X)</div>
              </div>
              <div class="rounded-md px-3 py-2.5 space-y-1" style="background:#161b22">
                <div><span style="color:#e6c07b">d</span> = 0.85 &nbsp;(damping factor)</div>
                <div><span style="color:#e6c07b">N</span> = 18 teams</div>
                <div class="pt-1" style="color:#8b949e">Beating a team everyone else also beats is worth less than beating someone who wins elsewhere.</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Palmy -->
        <div v-else class="p-5 space-y-4">
          <div style="color:#8b949e">Build a ranked opponent ladder for each team, then average Team Y's fractional position across every ladder they appear in:</div>
          <div class="flex gap-3 flex-wrap">
            <!-- Ladder X -->
            <div class="flex-1 min-w-[140px] rounded-md px-3 py-2.5" style="background:#161b22">
              <div style="color:#8b949e" class="mb-2">Team X's ladder</div>
              <div class="space-y-1">
                <div class="flex gap-2"><span style="color:#8b949e">1.</span><span>Carlton</span><span style="color:#f97583" class="ml-auto">+45</span></div>
                <div class="flex gap-2" style="color:#79c0ff"><span style="color:#8b949e">2.</span><span>Team Y ●</span><span style="color:#f97583" class="ml-auto">+12</span></div>
                <div class="flex gap-2"><span style="color:#8b949e">3.</span><span>Geelong</span><span style="color:#56d364" class="ml-auto">−8</span></div>
                <div class="flex gap-2"><span style="color:#8b949e">4.</span><span>Hawks</span><span style="color:#56d364" class="ml-auto">−22</span></div>
              </div>
              <div class="mt-2 pt-2 border-t text-right" style="border-color:#30363d;color:#8b949e">
                Y = <span style="color:#79c0ff">2</span>/4 = <span style="color:#79c0ff">0.500</span>
              </div>
            </div>
            <!-- Ladder Z -->
            <div class="flex-1 min-w-[140px] rounded-md px-3 py-2.5" style="background:#161b22">
              <div style="color:#8b949e" class="mb-2">Team Z's ladder</div>
              <div class="space-y-1">
                <div class="flex gap-2" style="color:#79c0ff"><span style="color:#8b949e">1.</span><span>Team Y ●</span><span style="color:#f97583" class="ml-auto">+30</span></div>
                <div class="flex gap-2"><span style="color:#8b949e">2.</span><span>Port</span><span style="color:#56d364" class="ml-auto">−15</span></div>
                <div class="flex gap-2"><span style="color:#8b949e">3.</span><span>Sydney</span><span style="color:#56d364" class="ml-auto">−22</span></div>
              </div>
              <div class="mt-2 pt-2 border-t text-right" style="border-color:#30363d;color:#8b949e">
                Y = <span style="color:#79c0ff">1</span>/3 = <span style="color:#79c0ff">0.333</span>
              </div>
            </div>
          </div>
          <div class="rounded-md px-4 py-3 space-y-1.5" style="background:#161b22">
            <div>avg fraction = (0.500 + 0.333) / 2 = <span style="color:#e6c07b">0.417</span></div>
            <div>Score(Y) = (1 − <span style="color:#e6c07b">0.417</span>) × 100 = <span style="color:#56d364">58.3</span></div>
            <div class="pt-1" style="color:#8b949e">Lower avg fraction → opponents rated you highly → higher score. Fractional rank (not raw) keeps smaller ladders fair.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Ranking table -->
    <div ref="tableEl" v-if="activeView === 'table'" data-tour="rankings-table" class="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div v-if="isLoading" class="space-y-px p-1">
        <div v-for="n in 18" :key="n" class="h-9 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      </div>

      <table v-else class="w-full text-sm table-fixed border-collapse">
        <thead>
          <tr class="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">
            <th class="w-8 py-2 text-center font-semibold">#</th>
            <th class="py-2 text-left pl-3 font-semibold">Team</th>
            <th class="w-8 py-2 text-center font-semibold hidden sm:table-cell">W</th>
            <th class="w-8 py-2 text-center font-semibold hidden sm:table-cell">L</th>
            <th class="w-8 py-2 text-center font-semibold hidden sm:table-cell">D</th>
            <th class="w-20 py-2 text-center font-semibold">{{ selectedAlgo.ratingLabel }}</th>
            <th class="w-14 py-2 text-center font-semibold text-gray-400 dark:text-gray-500" title="vs official AFL ladder">vs AFL</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in currentRanking"
            :key="row.teamId"
            class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            :class="{
              'border-b-2 border-orange-400': i === 5,
              'border-b-2 border-blue-400': i === 9,
              'border-b border-gray-100 dark:border-gray-800': i !== 5 && i !== 9,
            }"
            @click="selectedId === 'palmy' ? onRowClick(row.teamId, $event) : undefined"
          >
            <td class="py-2 text-center text-gray-500 dark:text-gray-500 text-xs">{{ row.rank }}</td>
            <td class="py-2 pl-3 font-medium text-gray-800 dark:text-gray-200">
              <span class="flex items-center gap-1.5">
                <svg class="size-6 shrink-0">
                  <use :href="`${BASE_URL}icons.svg#${row.iconId}`" />
                </svg>
                <span class="hidden sm:inline">{{ row.teamName }}</span>
                <span class="sm:hidden">{{ row.abbreviation }}</span>
              </span>
            </td>
            <td class="py-2 text-center text-gray-600 dark:text-gray-400 hidden sm:table-cell">{{ row.wins }}</td>
            <td class="py-2 text-center text-gray-600 dark:text-gray-400 hidden sm:table-cell">{{ row.losses }}</td>
            <td class="py-2 text-center text-gray-600 dark:text-gray-400 hidden sm:table-cell">{{ row.draws }}</td>
            <td class="py-2 text-center font-semibold tabular-nums text-gray-800 dark:text-gray-200 text-xs">
              {{ formatRating(row.rating) }}
            </td>
            <td class="py-2 text-center text-xs font-bold tabular-nums">
              <span v-if="vsAflDelta(row) > 0" class="text-green-600 dark:text-green-400">▲{{ vsAflDelta(row) }}</span>
              <span v-else-if="vsAflDelta(row) < 0" class="text-red-500 dark:text-red-400">▼{{ Math.abs(vsAflDelta(row)) }}</span>
              <span v-else class="text-gray-300 dark:text-gray-600">—</span>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="!isLoading && currentRanking.length === 0" class="text-gray-400 dark:text-gray-600 text-sm text-center py-10">
        No concluded matches yet
      </p>
    </div>

    <!-- Graph view -->
    <div
      v-else
      data-tour="rankings-table"
      class="rounded-lg overflow-hidden select-none"
      style="background: #0a0d14"
    >
      <div v-if="concludedRounds.length < 2" class="py-12 text-center text-sm text-gray-500">
        Need at least 2 rounds of concluded matches to show the graph
      </div>

      <svg
        v-else
        viewBox="0 0 600 450"
        class="w-full"
        style="overflow: visible"
        aria-label="Algorithm rankings worm chart"
      >
        <!-- Top 6 reference line (finals qualified) -->
        <line
          :x1="CHART.x0" :y1="yRef6" :x2="CHART.x1" :y2="yRef6"
          stroke="rgba(251,146,60,0.3)" stroke-width="1" stroke-dasharray="4,3"
        />
        <!-- Top 10 reference line (wildcard cut-off) -->
        <line
          :x1="CHART.x0" :y1="yRef10" :x2="CHART.x1" :y2="yRef10"
          stroke="rgba(59,130,246,0.3)" stroke-width="1" stroke-dasharray="4,3"
        />

        <!-- Y-axis position labels -->
        <text
          v-for="pos in [1, 6, 7, 10, 11, 14, 18]"
          :key="pos"
          :x="CHART.x0 - 4"
          :y="yScale(pos) + 3.5"
          text-anchor="end"
          font-size="8"
          font-family="system-ui,sans-serif"
          fill="rgba(255,255,255,0.3)"
        >{{ pos }}</text>

        <!-- X-axis gridlines + round labels -->
        <g v-for="(r, idx) in concludedRounds" :key="`xcol-${r}`">
          <line
            :x1="xScale(idx)" :y1="CHART.y0"
            :x2="xScale(idx)" :y2="CHART.y1"
            stroke="rgba(255,255,255,0.05)" stroke-width="1"
          />
          <text
            :x="xScale(idx)"
            :y="CHART.y1 + 5"
            text-anchor="end"
            font-size="8"
            font-family="system-ui,sans-serif"
            fill="rgba(255,255,255,0.3)"
            :transform="`rotate(-45, ${xScale(idx)}, ${CHART.y1 + 5})`"
          >Rd {{ r }}</text>
        </g>

        <!-- Team worm lines -->
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

        <!-- Team logos at final position -->
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
    </div>

    <!-- Legend -->
    <div class="mt-3 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
      <span class="flex items-center gap-1.5">
        <span class="inline-block w-4 border-b-2 border-orange-400"></span>
        Top 6 (finals qualified)
      </span>
      <span class="flex items-center gap-1.5">
        <span class="inline-block w-4 border-b-2 border-blue-400"></span>
        Top 10 (wildcard)
      </span>
      <span v-if="activeView === 'table'">vs AFL = difference from the official points-based ladder position</span>
      <span v-if="selectedId === 'palmy' && activeView === 'table'">Hover a team to see their Palmy data</span>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAFLData, TEAMS } from '../composables/useAFLData'
import { useAlgorithmRankings, ALGORITHMS, computeAlgorithmRanking } from '../composables/useAlgorithmRankings'
import type { AlgorithmId, AlgorithmRankRow } from '../composables/useAlgorithmRankings'

const BASE_URL = import.meta.env.BASE_URL

const route = useRoute()
const router = useRouter()

const { matches, isLoading } = useAFLData()
const { winPctRanking, srsRanking, colleyRanking, masseyRanking, winFlowRanking, palmyRanking, palmyOpponentLadders } = useAlgorithmRankings(matches)

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

watch([selectedId, activeView], ([algo, view]) => {
  router.replace({ query: { algo, view } })
})
const selectedAlgo = computed(() => ALGORITHMS.find((a) => a.id === selectedId.value)!)

const currentRanking = computed<AlgorithmRankRow[]>(() => {
  switch (selectedId.value) {
    case 'winpct':  return winPctRanking.value
    case 'srs':     return srsRanking.value
    case 'colley':  return colleyRanking.value
    case 'massey':  return masseyRanking.value
    case 'winflow': return winFlowRanking.value
    case 'palmy':   return palmyRanking.value
  }
})

function vsAflDelta(row: AlgorithmRankRow): number {
  return row.officialRank - row.rank
}

function formatRating(v: number): string {
  switch (selectedId.value) {
    case 'winpct':  return `${(v * 100).toFixed(1)}%`
    case 'srs':
    case 'massey':  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`
    case 'colley':  return v.toFixed(3)
    case 'winflow': return v.toFixed(4)
    case 'palmy':   return v === -999 ? '—' : ((1 + v) * 100).toFixed(1)
  }
}

// --- Worm chart ---

const TEAM_COLORS: Record<number, string> = {
  1:  '#E6002D', // Adelaide Crows
  2:  '#A52834', // Brisbane Lions
  5:  '#1565C0', // Carlton
  3:  '#C8C8C8', // Collingwood
  12: '#FF4136', // Essendon
  14: '#6A3688', // Fremantle
  10: '#1E6EB5', // Geelong Cats
  4:  '#FFB703', // Gold Coast SUNS
  15: '#F15A22', // GWS GIANTS
  9:  '#C8922A', // Hawthorn
  17: '#CC0000', // Melbourne
  6:  '#1E88E5', // North Melbourne
  7:  '#00B2C8', // Port Adelaide
  16: '#F4C430', // Richmond
  11: '#D50000', // St Kilda
  13: '#E53935', // Sydney Swans
  18: '#EFAB00', // West Coast Eagles
  8:  '#4469DE', // Western Bulldogs
}

const CHART = { x0: 26, x1: 546, y0: 20, y1: 422 } as const

function yScale(pos: number): number {
  return CHART.y0 + ((pos - 1) * (CHART.y1 - CHART.y0)) / 17
}

const yRef6  = yScale(6.5)
const yRef10 = yScale(10.5)

function xScale(idx: number): number {
  const n = concludedRounds.value.length
  if (n <= 1) return (CHART.x0 + CHART.x1) / 2
  return CHART.x0 + (idx * (CHART.x1 - CHART.x0)) / (n - 1)
}

const concludedRounds = computed<number[]>(() => {
  const rounds = new Set<number>()
  for (const m of matches.value) {
    if (m.status === 'CONCLUDED' && m.homeScore && m.awayScore) rounds.add(m.roundNumber)
  }
  return [...rounds].sort((a, b) => a - b)
})

const roundHistory = computed<Map<number, AlgorithmRankRow[]>>(() => {
  if (activeView.value !== 'graph') return new Map()
  const result = new Map<number, AlgorithmRankRow[]>()
  for (const round of concludedRounds.value) {
    const matchesForRound = matches.value.filter((m) => m.roundNumber <= round)
    result.set(round, computeAlgorithmRanking(selectedId.value, matchesForRound))
  }
  return result
})

interface WormPoint { x: number; y: number }
interface WormTeamData { team: typeof TEAMS[0]; color: string; points: WormPoint[] }

const wormData = computed<WormTeamData[]>(() => {
  const rounds = concludedRounds.value
  if (rounds.length === 0) return []
  return TEAMS.map((team) => {
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

// --- Palmy click popup ---

const POPUP_TABS = [
  { id: 'own' as const, label: 'Opponent Ladder' },
  { id: 'positions' as const, label: 'League Positions' },
]

const tableEl = ref<HTMLElement | null>(null)
const hoveredTeamId = ref<number | null>(null)
const popupTab = ref<'own' | 'positions'>('own')
const popupStyle = ref<Record<string, string>>({})

function closePopup() { hoveredTeamId.value = null }

onMounted(() => document.addEventListener('click', closePopup))
onUnmounted(() => document.removeEventListener('click', closePopup))

const teamInfoMap = computed(() => {
  const map = new Map<number, { teamName: string; iconId: string }>()
  for (const t of TEAMS) map.set(t.id, { teamName: t.name, iconId: t.iconId })
  return map
})

const hoveredTeamName = computed(() => {
  if (hoveredTeamId.value === null) return ''
  return teamInfoMap.value.get(hoveredTeamId.value)?.teamName ?? ''
})

const hoveredLadder = computed(() =>
  hoveredTeamId.value !== null ? (palmyOpponentLadders.value[hoveredTeamId.value] ?? []) : [],
)

const hoveredTeamPositions = computed(() => {
  if (hoveredTeamId.value === null) return []
  const tid = hoveredTeamId.value
  const result: Array<{
    ownerName: string
    ownerIconId: string
    rank: number
    ladderSize: number
    differential: number
    roundNumber: number
  }> = []

  for (const [ownerIdStr, ladder] of Object.entries(palmyOpponentLadders.value)) {
    const ownerId = Number(ownerIdStr)
    if (ownerId === tid) continue
    const ownerInfo = teamInfoMap.value.get(ownerId)
    for (const entry of ladder) {
      if (entry.teamId === tid) {
        result.push({
          ownerName: ownerInfo?.teamName ?? String(ownerId),
          ownerIconId: ownerInfo?.iconId ?? '',
          rank: entry.rank,
          ladderSize: ladder.length,
          differential: entry.differential,
          roundNumber: entry.roundNumber,
        })
      }
    }
  }

  return result.sort((a, b) => a.rank - b.rank)
})

const hoveredAvgPosition = computed(() => {
  if (hoveredTeamPositions.value.length === 0) return '—'
  const avg = hoveredTeamPositions.value.reduce((s, p) => s + p.rank / p.ladderSize, 0) / hoveredTeamPositions.value.length
  return ((1 - avg) * 100).toFixed(1)
})

function positionClass(rank: number, size: number): string {
  const pct = rank / size
  if (pct <= 0.25) return 'text-green-600 dark:text-green-400'
  if (pct <= 0.5)  return 'text-gray-600 dark:text-gray-300'
  if (pct <= 0.75) return 'text-orange-500 dark:text-orange-400'
  return 'text-red-500 dark:text-red-400'
}

function onRowClick(teamId: number, event: MouseEvent) {
  event.stopPropagation()
  if (hoveredTeamId.value !== teamId) popupTab.value = 'own'
  hoveredTeamId.value = teamId
  positionPopup(event.currentTarget as HTMLElement)
}

function positionPopup(row: HTMLElement) {
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

  popupStyle.value = { left: `${left}px`, top: `${top}px`, width: `${POPUP_W}px` }
}
</script>
