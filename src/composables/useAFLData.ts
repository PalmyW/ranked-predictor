import { ref, readonly } from 'vue'
import type { AflTeam, AflMatch, MatchStatus } from '../types/afl'
import { getActiveSeasonYear, ACTIVE_CURRENT_SEASON_YEAR } from '../config/seasons'
import { DATA_BASE, LEAGUE } from '../config/league'

const SEASON = getActiveSeasonYear()

export const AFL_TEAMS: AflTeam[] = [
  { id: 1,  name: 'Adelaide Crows',    abbreviation: 'ADEL', letter: 'A', iconId: 'icn-aflc-adel', teamProviderId: 'CD_T10'   },
  { id: 2,  name: 'Brisbane Lions',    abbreviation: 'BL',   letter: 'B', iconId: 'icn-aflc-bl',   teamProviderId: 'CD_T20'   },
  { id: 5,  name: 'Carlton',           abbreviation: 'CARL', letter: 'C', iconId: 'icn-aflc-carl', teamProviderId: 'CD_T30'   },
  { id: 3,  name: 'Collingwood',       abbreviation: 'COLL', letter: 'D', iconId: 'icn-aflc-coll', teamProviderId: 'CD_T40'   },
  { id: 12, name: 'Essendon',          abbreviation: 'ESS',  letter: 'E', iconId: 'icn-aflc-ess',  teamProviderId: 'CD_T50'   },
  { id: 14, name: 'Fremantle',         abbreviation: 'FRE',  letter: 'F', iconId: 'icn-aflc-fre',  teamProviderId: 'CD_T60'   },
  { id: 10, name: 'Geelong Cats',      abbreviation: 'GEEL', letter: 'G', iconId: 'icn-aflc-geel', teamProviderId: 'CD_T70'   },
  { id: 4,  name: 'Gold Coast SUNS',   abbreviation: 'GCS',  letter: 'H', iconId: 'icn-aflc-gcs',  teamProviderId: 'CD_T1000' },
  { id: 15, name: 'GWS GIANTS',        abbreviation: 'GWS',  letter: 'I', iconId: 'icn-aflc-gws',  teamProviderId: 'CD_T1010' },
  { id: 9,  name: 'Hawthorn',          abbreviation: 'HAW',  letter: 'J', iconId: 'icn-aflc-haw',  teamProviderId: 'CD_T80'   },
  { id: 17, name: 'Melbourne',         abbreviation: 'MELB', letter: 'K', iconId: 'icn-aflc-melb', teamProviderId: 'CD_T90'   },
  { id: 6,  name: 'North Melbourne',   abbreviation: 'NMFC', letter: 'L', iconId: 'icn-aflc-nmfc', teamProviderId: 'CD_T100'  },
  { id: 7,  name: 'Port Adelaide',     abbreviation: 'PORT', letter: 'M', iconId: 'icn-aflc-port', teamProviderId: 'CD_T110'  },
  { id: 16, name: 'Richmond',          abbreviation: 'RICH', letter: 'N', iconId: 'icn-aflc-rich', teamProviderId: 'CD_T120'  },
  { id: 11, name: 'St Kilda',          abbreviation: 'STK',  letter: 'O', iconId: 'icn-aflc-stk',  teamProviderId: 'CD_T130'  },
  { id: 13, name: 'Sydney Swans',      abbreviation: 'SYD',  letter: 'P', iconId: 'icn-aflc-syd',  teamProviderId: 'CD_T160'  },
  { id: 18, name: 'West Coast Eagles', abbreviation: 'WCE',  letter: 'Q', iconId: 'icn-aflc-wce',  teamProviderId: 'CD_T150'  },
  { id: 8,  name: 'Western Bulldogs',  abbreviation: 'WB',   letter: 'R', iconId: 'icn-aflc-wb',   teamProviderId: 'CD_T140'  },
]

// The same 18 clubs as AFL_TEAMS (as of the 2022b/Season 7 expansion — see
// src/config/seasons.ts's '2022a'/'2022b' note), with their own AFLW provider
// IDs (from public/data/aflw/2025/fixture.json) and letters kept aligned with
// AFL_TEAMS's alphabetical A-R assignment since it's the same club. Crest
// icons are shared with AFL_TEAMS — icons.svg has no separate AFLW crest set,
// only the 3 league-logo symbols (icn-aflw-logo*).
export const AFLW_TEAMS: AflTeam[] = [
  { id: 19,  name: 'Adelaide Crows',    abbreviation: 'ADEL', letter: 'A', iconId: 'icn-aflc-adel', teamProviderId: 'CD_T8098' },
  { id: 21,  name: 'Brisbane Lions',    abbreviation: 'BL',   letter: 'B', iconId: 'icn-aflc-bl',   teamProviderId: 'CD_T7887' },
  { id: 22,  name: 'Carlton',           abbreviation: 'CARL', letter: 'C', iconId: 'icn-aflc-carl', teamProviderId: 'CD_T8096' },
  { id: 24,  name: 'Collingwood',       abbreviation: 'COLL', letter: 'D', iconId: 'icn-aflc-coll', teamProviderId: 'CD_T8097' },
  { id: 118, name: 'Essendon',          abbreviation: 'ESS',  letter: 'E', iconId: 'icn-aflc-ess',  teamProviderId: 'CD_T9406' },
  { id: 25,  name: 'Fremantle',         abbreviation: 'FRE',  letter: 'F', iconId: 'icn-aflc-fre',  teamProviderId: 'CD_T7886' },
  { id: 26,  name: 'Geelong Cats',      abbreviation: 'GEEL', letter: 'G', iconId: 'icn-aflc-geel', teamProviderId: 'CD_T8467' },
  { id: 33,  name: 'Gold Coast SUNS',   abbreviation: 'GCFC', letter: 'H', iconId: 'icn-aflc-gcs',  teamProviderId: 'CD_T8786' },
  { id: 28,  name: 'GWS GIANTS',        abbreviation: 'GWS',  letter: 'I', iconId: 'icn-aflc-gws',  teamProviderId: 'CD_T7889' },
  { id: 119, name: 'Hawthorn',          abbreviation: 'HAW',  letter: 'J', iconId: 'icn-aflc-haw',  teamProviderId: 'CD_T9407' },
  { id: 29,  name: 'Melbourne',         abbreviation: 'MELB', letter: 'K', iconId: 'icn-aflc-melb', teamProviderId: 'CD_T7386' },
  { id: 30,  name: 'North Melbourne',   abbreviation: 'NMFC', letter: 'L', iconId: 'icn-aflc-nmfc', teamProviderId: 'CD_T8466' },
  { id: 120, name: 'Port Adelaide',     abbreviation: 'PORT', letter: 'M', iconId: 'icn-aflc-port', teamProviderId: 'CD_T9409' },
  { id: 34,  name: 'Richmond',          abbreviation: 'RICH', letter: 'N', iconId: 'icn-aflc-rich', teamProviderId: 'CD_T8788' },
  { id: 36,  name: 'St Kilda',          abbreviation: 'STK',  letter: 'O', iconId: 'icn-aflc-stk',  teamProviderId: 'CD_T8796' },
  { id: 121, name: 'Sydney Swans',      abbreviation: 'SYD',  letter: 'P', iconId: 'icn-aflc-syd',  teamProviderId: 'CD_T9408' },
  { id: 35,  name: 'West Coast Eagles', abbreviation: 'WCE',  letter: 'Q', iconId: 'icn-aflc-wce',  teamProviderId: 'CD_T8787' },
  { id: 32,  name: 'Western Bulldogs',  abbreviation: 'WB',   letter: 'R', iconId: 'icn-aflc-wb',   teamProviderId: 'CD_T7387' },
]

/** The active league's 18 teams — every consumer imports this, not AFL_TEAMS/AFLW_TEAMS directly. */
export const TEAMS: AflTeam[] = LEAGUE === 'aflw' ? AFLW_TEAMS : AFL_TEAMS

// Defunct/historical clubs that appear only in scraped pre-2012 seasons. They are
// kept OUT of TEAMS (so they never pollute the current-season ranker) but are
// resolvable for display via teamById/ALL_TEAMS. No crest exists in the sprite, so
// iconId is empty and callers fall back to the abbreviation/name.
export const HISTORICAL_TEAMS: AflTeam[] = [
  { id: 9001, name: 'Fitzroy',        abbreviation: 'FITZ', letter: '', iconId: '', teamProviderId: 'PW_T901' },
  { id: 9002, name: 'Brisbane Bears', abbreviation: 'BB',   letter: '', iconId: '', teamProviderId: 'PW_T902' },
  { id: 9003, name: 'University',     abbreviation: 'UNI',  letter: '', iconId: '', teamProviderId: 'PW_T903' },
]

/**
 * TEAMS plus historical clubs — use for display lookups, not for the ranker.
 * HISTORICAL_TEAMS are pre-2012 defunct AFL (men's) clubs, so they're only
 * mixed in for the AFL league — AFLW's own history doesn't include them.
 */
export const ALL_TEAMS: AflTeam[] = LEAGUE === 'aflw' ? TEAMS : [...TEAMS, ...HISTORICAL_TEAMS]

/** Resolve a team (current or historical) by its internal numeric id. */
export function teamById(id: number): AflTeam | undefined {
  return ALL_TEAMS.find((t) => t.id === id)
}

// The roster that actually appears in a set of matches — e.g. a past season's
// fixture — rather than the fixed current-season TEAMS list. Resolves through
// ALL_TEAMS so defunct clubs (Fitzroy, Brisbane Bears, University) show up for
// the seasons they played, and current teams that didn't exist yet (Gold
// Coast, GWS) don't appear for seasons before they were admitted.
export function teamsInMatches(matches: readonly AflMatch[]): AflTeam[] {
  const ids = new Set<number>()
  for (const m of matches) {
    ids.add(m.homeTeamId)
    ids.add(m.awayTeamId)
  }
  const teams: AflTeam[] = []
  for (const id of ids) {
    const team = teamById(id)
    if (team) teams.push(team)
  }
  return teams
}

const VALID_STATUSES = new Set<MatchStatus>([
  'CONCLUDED', 'LIVE', 'SCHEDULED', 'PLACEHOLDER', 'UNCONFIRMED_TEAMS', 'CONFIRMED_TEAMS',
])

export function parseMatch(raw: Record<string, unknown>): AflMatch | null {
  const home = raw.home as Record<string, unknown> | undefined
  const away = raw.away as Record<string, unknown> | undefined
  const homeTeam = home?.team as Record<string, unknown> | undefined
  const awayTeam = away?.team as Record<string, unknown> | undefined

  const homeId = homeTeam?.id as number | undefined
  const awayId = awayTeam?.id as number | undefined
  if (!homeId || !awayId) return null

  const round = raw.round as Record<string, unknown>
  const rawStatus = raw.status as string
  // POSTGAME is a transitional state after the siren — treat as CONCLUDED
  const status = rawStatus === 'POSTGAME' ? 'CONCLUDED' : rawStatus
  if (!VALID_STATUSES.has(status as MatchStatus)) return null

  const homeScore = home?.score as { goals: number; behinds: number; totalScore: number } | undefined | null
  const awayScore = away?.score as { goals: number; behinds: number; totalScore: number } | undefined | null

  const utcStartTime = raw.utcStartTime as string
  let resolvedStatus = status as MatchStatus
  if (resolvedStatus !== 'CONCLUDED' && utcStartTime && Date.now() >= new Date(utcStartTime).getTime()) {
    resolvedStatus = 'LIVE'
  }

  const byes = round.byes as Array<{ id: number }> | undefined
  const byeTeamIds = byes?.map(b => b.id) ?? []

  const venue = raw.venue as Record<string, unknown> | undefined
  const metadata = raw.metadata as Record<string, unknown> | undefined

  return {
    id: raw.id as number,
    providerId: raw.providerId as string,
    roundNumber: round.roundNumber as number,
    roundName: round.name as string,
    roundAbbreviation: (round.abbreviation as string) ?? '',
    homeTeamId: homeId,
    homeTeamName: homeTeam?.name as string,
    awayTeamId: awayId,
    awayTeamName: awayTeam?.name as string,
    homeScore: homeScore ?? null,
    awayScore: awayScore ?? null,
    status: resolvedStatus,
    utcStartTime,
    venueName: (venue?.name as string) ?? null,
    finalsMatchLabel: (metadata?.finals_match_label as string) ?? null,
    byeTeamIds,
  }
}

// One-shot loader for an arbitrary season's fixture — used to pull previous-season
// matches as "form" for the tipping backtest. Returns [] if the season isn't on disk.
export async function fetchSeasonMatches(year: string): Promise<AflMatch[]> {
  const url = `${DATA_BASE}${year}/fixture.json`
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return []
    const data = (await res.json()) as { matches?: unknown[] }
    return (data.matches as Record<string, unknown>[] ?? [])
      .map(parseMatch)
      .filter((m): m is AflMatch => m !== null)
  } catch {
    return []
  }
}

// Module-level singleton state
const matches = ref<AflMatch[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const syncedAt = ref<Date | null>(null)
let fetched = false
let lastTimestamp: string | null = null
let pollingStarted = false
const POLL_INTERVAL_MS = 15_000

function fetchFixture(): Promise<void> {
  const url = `${DATA_BASE}${SEASON}/fixture.json`
  return fetch(url, { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    })
    .then((data: { matches?: unknown[] }) => {
      const raw = data.matches ?? []
      matches.value = (raw as Record<string, unknown>[])
        .map(parseMatch)
        .filter((m): m is AflMatch => m !== null)
    })
    .catch((err: unknown) => {
      error.value = err instanceof Error ? err.message : 'Failed to load fixture data'
    })
}

function fetchTimestamp(): Promise<void> {
  const tsUrl = `${DATA_BASE}${SEASON}/last-updated.json`
  return fetch(tsUrl, { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { updatedAt?: string } | null) => {
      const ts = data?.updatedAt ?? null
      if (ts) {
        if (lastTimestamp !== null && ts !== lastTimestamp) fetchFixture()
        lastTimestamp = ts
        syncedAt.value = new Date(ts)
      }
    })
    .catch(() => { /* silent — polling failure is non-critical */ })
}

function startPolling() {
  if (pollingStarted) return
  if (SEASON !== ACTIVE_CURRENT_SEASON_YEAR) return
  pollingStarted = true
  setInterval(fetchTimestamp, POLL_INTERVAL_MS)
}

export function useAFLData() {
  if (!fetched) {
    fetched = true
    isLoading.value = true
    Promise.all([fetchFixture(), fetchTimestamp()])
      .finally(() => {
        isLoading.value = false
        startPolling()
      })
  }

  return {
    matches: readonly(matches),
    teams: TEAMS,
    isLoading: readonly(isLoading),
    error: readonly(error),
    syncedAt: readonly(syncedAt),
  }
}
