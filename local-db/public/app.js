/* AFL Stats DB — frontend app */

// ── Stat column metadata (must match STAT_COLS in db.js) ──────────────────────
const STAT_BASES = [
  'goals','behinds','super_goals','kicks','handballs','disposals','marks',
  'bounces','tackles','contested_possessions','uncontested_possessions',
  'total_possessions','inside50s','marks_inside50','contested_marks','hitouts',
  'one_percenters','disposal_efficiency','clangers','frees_for','frees_against',
  'dream_team_points','rebound50s','goal_assists','goal_accuracy','rating_points',
  'turnovers','intercepts','tackles_inside50','shots_at_goal','score_involvements',
  'metres_gained','centre_clearances','stoppage_clearances','total_clearances',
  'effective_kicks','kick_efficiency','kick_to_handball_ratio','effective_disposals',
  'marks_on_lead','intercept_marks','contested_possession_rate','hitouts_to_advantage',
  'hitout_win_percentage','hitout_to_advantage_rate','ground_ball_gets',
  'f50_ground_ball_gets','score_launches','pressure_acts','def_half_pressure_acts',
  'spoils','ruck_contests','contest_def_one_on_ones','contest_def_losses',
  'contest_def_loss_percentage','contest_off_one_on_ones','contest_off_wins',
  'contest_off_wins_percentage','centre_bounce_attendances','kickins','kickins_playon',
  'time_on_ground_percentage',
];

function statLabel(base) {
  return base.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Tab routing + URL state ───────────────────────────────────────────────────
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const VALID_TABS = ['matches', 'match-stats', 'season-stats', 'query'];

function activateTab(id) {
  if (!VALID_TABS.includes(id)) id = 'matches';
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${id}`));
}

// Write current tab + filter state into the URL without a page reload
function updateUrl(tabId, params = {}) {
  const p = new URLSearchParams({ tab: tabId });
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v != null) p.set(k, String(v));
  }
  history.replaceState(null, '', '?' + p.toString());
}

// Read URL params → restore form values → call the right load function.
// Called after loadMeta() has populated all <select> options.
function restoreFromUrl() {
  const p = new URLSearchParams(window.location.search);
  const tab = VALID_TABS.includes(p.get('tab')) ? p.get('tab') : 'matches';
  activateTab(tab);

  if (tab === 'matches') {
    if (p.has('year'))   document.getElementById('m-year').value   = p.get('year');
    if (p.has('round'))  document.getElementById('m-round').value  = p.get('round');
    if (p.has('team'))   document.getElementById('m-team').value   = p.get('team');
    if (p.has('status')) document.getElementById('m-status').value = p.get('status');
    loadMatches();

  } else if (tab === 'match-stats') {
    if (p.has('year'))  document.getElementById('pms-year').value  = p.get('year');
    if (p.has('round')) document.getElementById('pms-round').value = p.get('round');
    if (p.has('team'))  document.getElementById('pms-team').value  = p.get('team');
    if (p.has('match')) document.getElementById('pms-match').value = p.get('match');
    if (p.has('sort'))  document.getElementById('pms-sort').value  = p.get('sort');
    if (p.has('dir'))   document.getElementById('pms-dir').value   = p.get('dir');
    loadPMS();

  } else if (tab === 'season-stats') {
    if (p.has('mode')) {
      const mode = p.get('mode');
      document.getElementById('pss-mode').value = mode;
      // rebuild sort select with the saved prefix before setting the sort value
      document.getElementById('pss-sort').innerHTML = STAT_BASES.map(b =>
        `<option value="${mode}_${b}">${statLabel(b)}</option>`
      ).join('');
    }
    if (p.has('year'))      document.getElementById('pss-year').value      = p.get('year');
    if (p.has('team'))      document.getElementById('pss-team').value      = p.get('team');
    if (p.has('min_games')) document.getElementById('pss-min-games').value = p.get('min_games');
    if (p.has('sort'))      document.getElementById('pss-sort').value      = p.get('sort');
    if (p.has('dir'))       document.getElementById('pss-dir').value       = p.get('dir');
    loadPSS();

  } else if (tab === 'query') {
    if (p.has('q')) {
      document.getElementById('sql-input').value = p.get('q');
      runQuery();
    }

  } else {
    loadMatches();
  }
}

// Immediate tab activation from URL so the right panel shows before loadMeta resolves
activateTab(new URLSearchParams(window.location.search).get('tab') || 'matches');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    history.replaceState(null, '', '?tab=' + btn.dataset.tab);
    activateTab(btn.dataset.tab);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function api(path, opts) {
  const r = await fetch(path, opts);
  return r.json();
}

function fmt(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? v : v.toFixed(1);
  return v;
}

function numCol(field, title, width = 80) {
  return {
    title,
    field,
    hozAlign: 'right',
    headerHozAlign: 'right',
    width,
    formatter: cell => fmt(cell.getValue()),
    sorter: 'number',
  };
}

const STAT_GROUPS = [
  { title: 'Core', fields: ['goals','behinds','super_goals','kicks','handballs','disposals','marks','bounces','tackles','contested_possessions','uncontested_possessions','total_possessions','inside50s','marks_inside50','contested_marks','hitouts','one_percenters','disposal_efficiency','clangers','frees_for','frees_against','dream_team_points','rebound50s','goal_assists','goal_accuracy','rating_points','turnovers','intercepts','tackles_inside50','shots_at_goal','score_involvements','metres_gained'] },
  { title: 'Clearances', fields: ['centre_clearances','stoppage_clearances','total_clearances'] },
  { title: 'Extended', fields: ['effective_kicks','kick_efficiency','kick_to_handball_ratio','effective_disposals','marks_on_lead','intercept_marks','contested_possession_rate','hitouts_to_advantage','hitout_win_percentage','hitout_to_advantage_rate','ground_ball_gets','f50_ground_ball_gets','score_launches','pressure_acts','def_half_pressure_acts','spoils','ruck_contests','contest_def_one_on_ones','contest_def_losses','contest_def_loss_percentage','contest_off_one_on_ones','contest_off_wins','contest_off_wins_percentage','centre_bounce_attendances','kickins','kickins_playon'] },
  { title: 'TOG', fields: ['time_on_ground_percentage'] },
];

function makeStatCols(prefix) {
  return STAT_GROUPS.map(g => ({
    title: g.title,
    columns: g.fields.map(f => numCol(`${prefix}${f}`, statLabel(f), 90)),
  }));
}

// ── Column visibility toggle ──────────────────────────────────────────────────

// sections: [{ title?, flat?, cols: [{key, label}] }]
// flat=true → individual rows with no group header (matches, query)
// otherwise  → collapsible group with master checkbox (stat tables)
// storageKey: localStorage key, or null for no persistence
// Returns { applyVis(prefix='') } — call after setColumns with the active prefix
function buildColToggle(containerId, table, sections, storageKey) {
  const container = document.getElementById(containerId);
  if (!container) return { applyVis: () => {} };

  function loadVis() {
    if (!storageKey) return {};
    try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}'); } catch { return {}; }
  }
  function saveVis(vis) {
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(vis));
  }

  let activePrefix = '';

  function applyVis(prefix = '') {
    activePrefix = prefix;
    const vis = loadVis();
    for (const sec of sections) {
      for (const { key } of sec.cols) {
        const show = vis[key] !== false;
        try { show ? table.showColumn(prefix + key) : table.hideColumn(prefix + key); } catch {}
      }
    }
  }

  const btn = document.createElement('button');
  btn.className = 'btn secondary';
  btn.textContent = 'Columns';

  const panel = document.createElement('div');
  panel.className = 'col-toggle-panel';
  panel.style.display = 'none';

  let rendered = false;
  function renderPanel() {
    if (rendered) return;
    rendered = true;
    const vis = loadVis();

    panel.innerHTML = sections.map((sec, si) => {
      if (sec.flat) {
        return sec.cols.map(({ key, label }) =>
          `<label class="ctg-flat-row"><input type="checkbox" data-key="${key}" ${vis[key] !== false ? 'checked' : ''}> ${label}</label>`
        ).join('');
      }
      const allOn  = sec.cols.every(c => vis[c.key] !== false);
      const allOff = sec.cols.every(c => vis[c.key] === false);
      const colsHtml = sec.cols.map(({ key, label }) =>
        `<label class="ctg-col-label"><input type="checkbox" data-key="${key}" ${vis[key] !== false ? 'checked' : ''}> ${label}</label>`
      ).join('');
      return `<div class="ctg-group" data-si="${si}">
        <div class="ctg-group-header">
          <input type="checkbox" class="ctg-group-cb" ${allOn ? 'checked' : ''}${!allOn && !allOff ? ' data-ind' : ''}>
          <span>${sec.title}</span>
          <span class="ctg-expand">▾</span>
        </div>
        <div class="ctg-cols-grid" style="display:none">${colsHtml}</div>
      </div>`;
    }).join('');

    panel.querySelectorAll('[data-ind]').forEach(cb => { cb.indeterminate = true; });

    panel.querySelectorAll('.ctg-group').forEach(groupEl => {
      const groupCb = groupEl.querySelector('.ctg-group-cb');
      const grid    = groupEl.querySelector('.ctg-cols-grid');
      const expand  = groupEl.querySelector('.ctg-expand');

      groupEl.querySelector('.ctg-group-header').addEventListener('click', e => {
        if (e.target === groupCb) return;
        const open = grid.style.display !== 'none';
        grid.style.display = open ? 'none' : 'grid';
        expand.textContent = open ? '▾' : '▴';
      });

      groupCb.addEventListener('change', () => {
        const vis = loadVis();
        groupEl.querySelectorAll('input[data-key]').forEach(cb => {
          cb.checked = groupCb.checked;
          cb.indeterminate = false;
          vis[cb.dataset.key] = groupCb.checked;
          try { groupCb.checked ? table.showColumn(activePrefix + cb.dataset.key) : table.hideColumn(activePrefix + cb.dataset.key); } catch {}
        });
        saveVis(vis);
      });
    });

    panel.querySelectorAll('input[data-key]').forEach(cb => {
      if (cb.classList.contains('ctg-group-cb')) return;
      cb.addEventListener('change', () => {
        const vis = loadVis();
        vis[cb.dataset.key] = cb.checked;
        saveVis(vis);
        try { cb.checked ? table.showColumn(activePrefix + cb.dataset.key) : table.hideColumn(activePrefix + cb.dataset.key); } catch {}
        const groupEl = cb.closest('.ctg-group');
        if (groupEl) {
          const groupCb = groupEl.querySelector('.ctg-group-cb');
          const siblings = [...groupEl.querySelectorAll('input[data-key]:not(.ctg-group-cb)')];
          groupCb.checked = siblings.every(c => c.checked);
          groupCb.indeterminate = !groupCb.checked && siblings.some(c => c.checked);
        }
      });
    });
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = panel.style.display === 'none';
    document.querySelectorAll('.col-toggle-panel').forEach(p => { p.style.display = 'none'; });
    if (willOpen) { renderPanel(); panel.style.display = 'block'; }
  });
  panel.addEventListener('click', e => e.stopPropagation());

  const wrap = document.createElement('div');
  wrap.className = 'col-toggle-wrap';
  wrap.appendChild(btn);
  wrap.appendChild(panel);
  container.innerHTML = '';
  container.appendChild(wrap);

  return { applyVis };
}

// Close all col-toggle panels when clicking elsewhere
document.addEventListener('click', () => {
  document.querySelectorAll('.col-toggle-panel').forEach(p => { p.style.display = 'none'; });
});

// ── Populate season/team selects ──────────────────────────────────────────────
let seasons = [];
let teams = [];
let teamMap = {};   // team_id → full name, populated after loadMeta()

async function loadMeta() {
  [seasons, teams] = await Promise.all([api('/api/seasons'), api('/api/teams')]);
  teamMap = Object.fromEntries(teams.map(t => [t.team_id, t.name]));

  const seasonOpt = s => `<option value="${s.year}">${s.year}</option>`;
  const teamOpt = t => `<option value="${t.team_id}">${t.name}</option>`;

  const allSeasons = seasons.map(seasonOpt).join('');
  const allTeams = teams.map(teamOpt).join('');

  ['m-year','pms-year','pss-year'].forEach(id => {
    document.getElementById(id).insertAdjacentHTML('beforeend', allSeasons);
  });
  ['m-team','pms-team','pss-team'].forEach(id => {
    document.getElementById(id).insertAdjacentHTML('beforeend', allTeams);
  });

  // Default season selects to most recent year
  if (seasons.length) {
    ['m-year','pms-year','pss-year'].forEach(id => {
      document.getElementById(id).value = seasons[0].year;
    });
  }

  // Populate round selects
  for (let r = 0; r <= 27; r++) {
    const label = r === 0 ? 'Opening Round' : `Round ${r}`;
    const opt = `<option value="${r}">${label}</option>`;
    ['m-round','pms-round'].forEach(id => {
      document.getElementById(id).insertAdjacentHTML('beforeend', opt);
    });
  }

  // Populate sort selects
  buildSortSelects();

  // DB status
  const status = await api('/api/import-status');
  const ts = status.last_import ? new Date(status.last_import).toLocaleString() : 'never';
  document.getElementById('db-status').innerHTML =
    `<span>${status.files_tracked.toLocaleString()} files</span> &nbsp;·&nbsp; last import: ${ts}`;

  restoreFromUrl();
}

function buildSortSelects() {
  const pmsOpts = STAT_BASES.map(b =>
    `<option value="stat_${b}"${b==='disposals'?' selected':''}>${statLabel(b)}</option>`
  ).join('');
  document.getElementById('pms-sort').innerHTML = pmsOpts;

  const avgOpts = STAT_BASES.map(b =>
    `<option value="avg_${b}"${b==='disposals'?' selected':''}>${statLabel(b)}</option>`
  ).join('');
  document.getElementById('pss-sort').innerHTML = avgOpts;
}

// ── Matches tab ───────────────────────────────────────────────────────────────
let matchesTable = null;
let matchesToggle = null;

const MATCH_SECTIONS = [{ flat: true, cols: [
  { key: 'round_number', label: 'Round' },
  { key: 'utc_start_time', label: 'Date' },
  { key: 'home_team_name', label: 'Home' },
  { key: 'home_score', label: 'Score' },
  { key: 'away_team_name', label: 'Away' },
  { key: 'venue_name', label: 'Venue' },
  { key: 'status', label: 'Status' },
]}];

async function loadMatches() {
  const params = new URLSearchParams();
  const y = document.getElementById('m-year').value;
  const r = document.getElementById('m-round').value;
  const t = document.getElementById('m-team').value;
  const s = document.getElementById('m-status').value;
  if (y) params.set('year', y);
  if (r) params.set('round', r);
  if (t) params.set('team', t);
  if (s) params.set('status', s);
  params.set('limit', 500);

  const rows = await api(`/api/matches?${params}`);
  document.getElementById('m-count').innerHTML = `<strong>${rows.length.toLocaleString()}</strong> matches`;
  updateUrl('matches', { year: y, round: r, team: t, status: s });

  const columns = [
    { title: 'Rd', field: 'round_number', width: 50, hozAlign: 'center' },
    { title: 'Date', field: 'utc_start_time', width: 130,
      formatter: cell => {
        const v = cell.getValue();
        return v ? new Date(v).toLocaleDateString('en-AU', { day:'numeric',month:'short',year:'numeric' }) : '—';
      }
    },
    { title: 'Home', field: 'home_team_name', minWidth: 140 },
    { title: 'Score', field: 'home_score', minWidth: 215, hozAlign: 'center',
      formatter: cell => {
        const r = cell.getRow().getData();
        if (r.home_score == null) return '—';
        const hw = r.home_score > r.away_score;
        const aw = r.away_score > r.home_score;
        return `<span class="score ${hw?'score-win':''}">${r.home_goals}.${r.home_behinds}&nbsp;(${r.home_score})</span>` +
               `<span style="color:var(--text-muted)"> – </span>` +
               `<span class="score ${aw?'score-win':''}">${r.away_goals}.${r.away_behinds}&nbsp;(${r.away_score})</span>`;
      }
    },
    { title: 'Away', field: 'away_team_name', minWidth: 140 },
    { title: 'Venue', field: 'venue_name', minWidth: 120 },
    { title: 'Status', field: 'status', width: 110,
      formatter: cell => {
        const v = cell.getValue();
        const cls = v === 'CONCLUDED' ? 'concluded' : v === 'SCHEDULED' ? 'scheduled' : 'live';
        return `<span class="tag tag-${cls}">${v}</span>`;
      }
    },
  ];

  if (matchesTable) {
    matchesTable.setData(rows);
    matchesTable.setColumns(columns);
    matchesToggle.applyVis();
  } else {
    matchesTable = new Tabulator('#matches-table', {
      data: rows,
      columns,
      layout: 'fitColumns',
      pagination: true,
      paginationSize: 50,
      paginationCounter: 'rows',
      height: 'calc(100vh - 200px)',
    });
    matchesTable.on('rowClick', (e, row) => {
      const matchId = row.getData().match_id;
      document.getElementById('pms-year').value = '';
      document.getElementById('pms-round').value = '';
      document.getElementById('pms-team').value = '';
      document.getElementById('pms-match').value = matchId;
      updateUrl('match-stats', { match: matchId });
      activateTab('match-stats');
      loadPMS();
    });
    matchesToggle = buildColToggle('m-col-toggle', matchesTable, MATCH_SECTIONS, 'afl_col_vis_matches');
    matchesToggle.applyVis();
  }
}

document.getElementById('m-load').addEventListener('click', loadMatches);
document.getElementById('m-export').addEventListener('click', () => matchesTable?.download('csv', 'afl-matches.csv'));

// ── Player Match Stats tab ────────────────────────────────────────────────────
let pmsTable = null;
let pmsToggle = null;

const STAT_SECTIONS = STAT_GROUPS.map(g => ({
  title: g.title,
  cols: g.fields.map(f => ({ key: f, label: statLabel(f) })),
}));

async function loadPMS() {
  const params = new URLSearchParams();
  const y = document.getElementById('pms-year').value;
  const r = document.getElementById('pms-round').value;
  const t = document.getElementById('pms-team').value;
  const m = document.getElementById('pms-match').value.trim();
  const sort = document.getElementById('pms-sort').value;
  const dir = document.getElementById('pms-dir').value;
  if (y) params.set('year', y);
  if (r) params.set('round', r);
  if (t) params.set('team', t);
  if (m) params.set('match', m);
  params.set('sort', sort);
  params.set('dir', dir);
  params.set('limit', 1000);

  const rows = await api(`/api/player-match-stats?${params}`);
  document.getElementById('pms-count').innerHTML = `<strong>${rows.length.toLocaleString()}</strong> rows`;
  updateUrl('match-stats', { year: y, round: r, team: t, match: m, sort, dir });

  const idCols = [
    { title: 'Player', field: 'surname', minWidth: 120,
      formatter: cell => {
        const r = cell.getRow().getData();
        return `${r.given_name} ${r.surname}`;
      }
    },
    { title: 'Team', field: 'team_name', minWidth: 130 },
    { title: 'Pos', field: 'position', width: 55 },
    { title: '#', field: 'jumper_number', width: 45, hozAlign: 'center' },
    { title: 'Yr', field: 'year', width: 55 },
    { title: 'Rd', field: 'round_number', width: 50, hozAlign: 'center' },
    { title: 'Match', field: 'match_id', width: 170 },
  ];

  const statCols = makeStatCols('stat_');

  if (pmsTable) {
    pmsTable.setColumns([...idCols, ...statCols]);
    pmsTable.setData(rows);
    pmsToggle.applyVis('stat_');
  } else {
    pmsTable = new Tabulator('#pms-table', {
      data: rows,
      columns: [...idCols, ...statCols],
      layout: 'fitDataStretch',
      pagination: true,
      paginationSize: 50,
      paginationCounter: 'rows',
      height: 'calc(100vh - 220px)',
      columnDefaults: { resizable: true },
    });
    pmsToggle = buildColToggle('pms-col-toggle', pmsTable, STAT_SECTIONS, 'afl_col_vis_pms');
    pmsToggle.applyVis('stat_');
  }
}

document.getElementById('pms-load').addEventListener('click', loadPMS);
document.getElementById('pms-export').addEventListener('click', () => pmsTable?.download('csv', 'afl-player-match-stats.csv'));

// ── Season Averages tab ───────────────────────────────────────────────────────
let pssTable = null;
let pssToggle = null;

async function loadPSS() {
  const params = new URLSearchParams();
  const y = document.getElementById('pss-year').value;
  const t = document.getElementById('pss-team').value;
  const g = document.getElementById('pss-min-games').value;
  const mode = document.getElementById('pss-mode').value;
  const sortBase = document.getElementById('pss-sort').value.replace(/^avg_|^tot_/, '');
  const dir = document.getElementById('pss-dir').value;
  const sortCol = `${mode}_${sortBase}`;

  if (y) params.set('year', y);
  if (t) params.set('team', t);
  params.set('min_games', g || 1);
  params.set('sort', sortCol);
  params.set('dir', dir);
  params.set('limit', 1000);

  const rows = await api(`/api/player-season-stats?${params}`);
  document.getElementById('pss-count').innerHTML = `<strong>${rows.length.toLocaleString()}</strong> players`;
  updateUrl('season-stats', { year: y, team: t, min_games: g, mode, sort: sortCol, dir });

  const idCols = [
    { title: 'Player', field: 'surname', minWidth: 130,
      formatter: cell => {
        const r = cell.getRow().getData();
        return `${r.given_name} ${r.surname}`;
      }
    },
    { title: 'Team', field: 'team_name', minWidth: 130 },
    { title: 'Pos', field: 'position', width: 55 },
    { title: 'Yr', field: 'year', width: 55 },
    { title: 'GP', field: 'games_played', width: 50, hozAlign: 'right' },
  ];

  const statCols = makeStatCols(`${mode}_`);

  if (pssTable) {
    pssTable.setColumns([...idCols, ...statCols]);
    pssTable.setData(rows);
    pssToggle.applyVis(`${mode}_`);
  } else {
    pssTable = new Tabulator('#pss-table', {
      data: rows,
      columns: [...idCols, ...statCols],
      layout: 'fitDataStretch',
      pagination: true,
      paginationSize: 50,
      paginationCounter: 'rows',
      height: 'calc(100vh - 220px)',
      columnDefaults: { resizable: true },
    });
    pssToggle = buildColToggle('pss-col-toggle', pssTable, STAT_SECTIONS, 'afl_col_vis_pss');
    pssToggle.applyVis(`${mode}_`);
  }
}

// When mode changes, update the sort select prefix
document.getElementById('pss-mode').addEventListener('change', () => {
  const mode = document.getElementById('pss-mode').value;
  const currentBase = document.getElementById('pss-sort').value.replace(/^avg_|^tot_/, '');
  const opts = STAT_BASES.map(b =>
    `<option value="${mode}_${b}"${b===currentBase?' selected':''}>${statLabel(b)}</option>`
  ).join('');
  document.getElementById('pss-sort').innerHTML = opts;
});

document.getElementById('pss-load').addEventListener('click', loadPSS);
document.getElementById('pss-export').addEventListener('click', () => pssTable?.download('csv', 'afl-season-averages.csv'));

// ── Query history (localStorage) ──────────────────────────────────────────────
const HISTORY_KEY = 'afl_query_history';
const HISTORY_MAX = 50;

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)));
}

function pushHistory(entry) {
  const history = getHistory().filter(h => h.sql !== entry.sql);
  history.unshift(entry);
  saveHistory(history);
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  const badge = document.getElementById('history-badge');
  const clearAll = document.getElementById('history-clear-all');
  const list = document.getElementById('query-history');

  badge.textContent = history.length || '';
  badge.style.display = history.length ? 'inline' : 'none';
  clearAll.style.display = history.length ? 'inline-block' : 'none';

  if (!history.length) {
    list.innerHTML = '<div class="history-empty">No queries yet</div>';
    return;
  }

  list.innerHTML = history.map((h, i) => {
    const preview = h.sql.replace(/\s+/g, ' ').trim().slice(0, 90);
    const ts = new Date(h.ts).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' });
    const meta = [h.rowCount != null ? `${h.rowCount.toLocaleString()} rows` : null, `${h.executionMs}ms`]
      .filter(Boolean).join(' · ');
    return `
      <div class="history-item" data-index="${i}">
        <div class="history-sql">${preview}</div>
        <div class="history-meta">
          <span>${ts}</span>
          <span>${meta}</span>
          <button data-index="${i}" title="Remove">×</button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.tagName === 'BUTTON') return;
      const h = getHistory()[+el.dataset.index];
      if (h) document.getElementById('sql-input').value = h.sql;
    });
  });

  list.querySelectorAll('.history-meta button').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const history = getHistory();
      history.splice(+btn.dataset.index, 1);
      saveHistory(history);
      renderHistory();
    });
  });
}

// History panel toggle
const historyToggle = document.getElementById('history-toggle');
const historyList = document.getElementById('query-history');
const historyChevron = historyToggle.querySelector('.history-chevron');

historyToggle.addEventListener('click', e => {
  if (e.target.id === 'history-clear-all') return;
  const open = historyList.style.display !== 'none';
  historyList.style.display = open ? 'none' : 'block';
  historyChevron.classList.toggle('open', !open);
});

document.getElementById('history-clear-all').addEventListener('click', e => {
  e.stopPropagation();
  saveHistory([]);
  renderHistory();
  historyList.style.display = 'none';
  historyChevron.classList.remove('open');
});

// ── SQL Query tab ─────────────────────────────────────────────────────────────
let queryTable = null;

const SAMPLE_QUERY =
  `SELECT given_name, surname, year, team_id, games_played,\n` +
  `  avg_disposals, avg_kicks, avg_handballs, avg_marks,\n` +
  `  avg_tackles, avg_goals\n` +
  `FROM player_season_stats\n` +
  `WHERE year = 2026 AND games_played >= 5\n` +
  `ORDER BY avg_disposals DESC\n` +
  `LIMIT 20`;

document.getElementById('sql-input').value = SAMPLE_QUERY;

async function runQuery() {
  const sql = document.getElementById('sql-input').value.trim();
  if (!sql) return;

  document.getElementById('query-error').style.display = 'none';
  document.getElementById('query-time').textContent = 'Running…';
  document.getElementById('query-count').textContent = '';
  document.getElementById('query-export').style.display = 'none';

  const result = await api('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });

  if (result.error) {
    document.getElementById('query-error').textContent = result.error;
    document.getElementById('query-error').style.display = 'block';
    document.getElementById('query-time').textContent = '';
    if (queryTable) { queryTable.destroy(); queryTable = null; }
    return;
  }

  document.getElementById('query-time').textContent = `${result.executionMs}ms`;
  document.getElementById('query-count').innerHTML =
    `<strong>${result.rowCount.toLocaleString()}</strong> rows`;
  document.getElementById('query-export').style.display = result.rowCount ? 'inline-block' : 'none';

  pushHistory({ sql, ts: Date.now(), rowCount: result.rowCount, executionMs: result.executionMs });
  updateUrl('query', { q: sql });

  const columns = result.columns.map(c => {
    const isTeamId = /team_id$/i.test(c);
    const firstVal = result.rows[0]?.[c];
    const isNum = typeof firstVal === 'number';
    return {
      title: c,
      field: c,
      formatter: cell => {
        const v = cell.getValue();
        if (isTeamId && v != null) return teamMap[v] ?? v;
        return fmt(v);
      },
      sorter: isNum ? 'number' : 'string',
      hozAlign: isNum ? 'right' : 'left',
      headerHozAlign: isNum ? 'right' : 'left',
      minWidth: isTeamId ? 130 : 90,
    };
  });

  if (queryTable) {
    queryTable.setColumns(columns);
    queryTable.setData(result.rows);
  } else {
    queryTable = new Tabulator('#query-table', {
      data: result.rows,
      columns,
      layout: 'fitDataStretch',
      pagination: result.rowCount > 100,
      paginationSize: 100,
      height: 'calc(100vh - 420px)',
      columnDefaults: { resizable: true },
    });
  }

  if (result.rowCount > 0) {
    buildColToggle('query-col-toggle', queryTable,
      [{ flat: true, cols: result.columns.map(c => ({ key: c, label: c })) }],
      null
    );
  } else {
    document.getElementById('query-col-toggle').innerHTML = '';
  }

  const hasMatchId = result.columns.includes('match_id');
  document.getElementById('query-table').classList.toggle('clickable-rows', hasMatchId);
  queryTable.off('rowClick');
  if (hasMatchId) {
    queryTable.on('rowClick', (e, row) => {
      const matchId = row.getData().match_id;
      if (!matchId) return;
      if (e.metaKey || e.ctrlKey) {
        window.open(`${window.location.pathname}?tab=match-stats&match=${encodeURIComponent(matchId)}`, '_blank');
        return;
      }
      document.getElementById('pms-year').value = '';
      document.getElementById('pms-round').value = '';
      document.getElementById('pms-team').value = '';
      document.getElementById('pms-match').value = matchId;
      updateUrl('match-stats', { match: matchId });
      activateTab('match-stats');
      loadPMS();
    });
  }
}

document.getElementById('sql-run').addEventListener('click', runQuery);
document.getElementById('sql-clear').addEventListener('click', () => {
  document.getElementById('sql-input').value = '';
  document.getElementById('query-error').style.display = 'none';
  document.getElementById('query-time').textContent = '';
  document.getElementById('query-count').textContent = '';
  document.getElementById('query-export').style.display = 'none';
  document.getElementById('query-col-toggle').innerHTML = '';
  document.getElementById('query-table').classList.remove('clickable-rows');
  if (queryTable) { queryTable.destroy(); queryTable = null; }
});
document.getElementById('query-export').addEventListener('click', () =>
  queryTable?.download('csv', 'afl-query-results.csv')
);

document.getElementById('sql-input').addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runQuery();
  }
});

// ── AI query builder ──────────────────────────────────────────────────────────
const aiPromptEl = document.getElementById('ai-prompt');
const aiAskBtn   = document.getElementById('ai-ask');

async function askClaude() {
  const prompt = aiPromptEl.value.trim();
  if (!prompt) return;
  aiAskBtn.disabled = true;
  aiAskBtn.textContent = 'Thinking…';
  document.getElementById('query-error').style.display = 'none';
  try {
    const res = await fetch('/api/ai/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    if (data.sql) {
      document.getElementById('sql-input').value = data.sql;
    } else {
      document.getElementById('query-error').textContent = data.error ?? 'Unknown error from Claude';
      document.getElementById('query-error').style.display = 'block';
    }
  } catch (e) {
    document.getElementById('query-error').textContent = e.message;
    document.getElementById('query-error').style.display = 'block';
  } finally {
    aiAskBtn.disabled = false;
    aiAskBtn.textContent = 'Ask Claude';
  }
}

aiAskBtn.addEventListener('click', askClaude);
aiPromptEl.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    askClaude();
  }
});

renderHistory();

// ── Schema panel ──────────────────────────────────────────────────────────────
async function loadSchema() {
  const schema = await api('/api/schema');
  const container = document.getElementById('schema-list');
  container.innerHTML = Object.entries(schema).map(([table, cols]) => {
    const colList = cols.map(c => `<div>${c}</div>`).join('');
    return `
      <div class="schema-table">
        <div class="schema-table-name" onclick="this.nextElementSibling.classList.toggle('open')">
          ▸ ${table}
        </div>
        <div class="schema-cols">${colList}</div>
      </div>
    `;
  }).join('');
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadMeta();
loadSchema();
