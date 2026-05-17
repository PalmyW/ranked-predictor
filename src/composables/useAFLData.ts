import { ref, readonly } from 'vue'
import type { AflTeam, AflMatch, MatchStatus } from '../types/afl'

export const TEAMS: AflTeam[] = [
  { id: 1,  name: 'Kuwarna',           abbreviation: 'ADEL', letter: 'A', iconId: 'icn-aflc-adel', teamProviderId: 'CD_T10'   },
  { id: 2,  name: 'Brisbane Lions',    abbreviation: 'BL',   letter: 'B', iconId: 'icn-aflc-bl',   teamProviderId: 'CD_T20'   },
  { id: 5,  name: 'Carlton',           abbreviation: 'CARL', letter: 'C', iconId: 'icn-aflc-carl', teamProviderId: 'CD_T30'   },
  { id: 3,  name: 'Collingwood',       abbreviation: 'COLL', letter: 'D', iconId: 'icn-aflc-coll', teamProviderId: 'CD_T40'   },
  { id: 12, name: 'Essendon',          abbreviation: 'ESS',  letter: 'E', iconId: 'icn-aflc-ess',  teamProviderId: 'CD_T50'   },
  { id: 14, name: 'Walyalup',          abbreviation: 'FRE',  letter: 'F', iconId: 'icn-aflc-fre',  teamProviderId: 'CD_T60'   },
  { id: 10, name: 'Geelong Cats',      abbreviation: 'GEEL', letter: 'G', iconId: 'icn-aflc-geel', teamProviderId: 'CD_T70'   },
  { id: 4,  name: 'Gold Coast SUNS',   abbreviation: 'GCS',  letter: 'H', iconId: 'icn-aflc-gcs',  teamProviderId: 'CD_T1000' },
  { id: 15, name: 'GWS GIANTS',        abbreviation: 'GWS',  letter: 'I', iconId: 'icn-aflc-gws',  teamProviderId: 'CD_T1010' },
  { id: 9,  name: 'Hawthorn',          abbreviation: 'HAW',  letter: 'J', iconId: 'icn-aflc-haw',  teamProviderId: 'CD_T80'   },
  { id: 17, name: 'Narrm',             abbreviation: 'MELB', letter: 'K', iconId: 'icn-aflc-melb', teamProviderId: 'CD_T90'   },
  { id: 6,  name: 'North Melbourne',   abbreviation: 'NMFC', letter: 'L', iconId: 'icn-aflc-nmfc', teamProviderId: 'CD_T100'  },
  { id: 7,  name: 'Yartapuulti',       abbreviation: 'PORT', letter: 'M', iconId: 'icn-aflc-port', teamProviderId: 'CD_T110'  },
  { id: 16, name: 'Richmond',          abbreviation: 'RICH', letter: 'N', iconId: 'icn-aflc-rich', teamProviderId: 'CD_T120'  },
  { id: 11, name: 'Euro-Yroke',        abbreviation: 'STK',  letter: 'O', iconId: 'icn-aflc-stk',  teamProviderId: 'CD_T130'  },
  { id: 13, name: 'Sydney Swans',      abbreviation: 'SYD',  letter: 'P', iconId: 'icn-aflc-syd',  teamProviderId: 'CD_T160'  },
  { id: 18, name: 'Waalitj Marawar',   abbreviation: 'WCE',  letter: 'Q', iconId: 'icn-aflc-wce',  teamProviderId: 'CD_T150'  },
  { id: 8,  name: 'Western Bulldogs',  abbreviation: 'WB',   letter: 'R', iconId: 'icn-aflc-wb',   teamProviderId: 'CD_T140'  },
]

const VALID_STATUSES = new Set<MatchStatus>([
  'CONCLUDED', 'LIVE', 'SCHEDULED', 'PLACEHOLDER', 'UNCONFIRMED_TEAMS', 'CONFIRMED_TEAMS',
])

function parseMatch(raw: Record<string, unknown>): AflMatch | null {
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

  return {
    id: raw.id as number,
    providerId: raw.providerId as string,
    roundNumber: round.roundNumber as number,
    roundName: round.name as string,
    homeTeamId: homeId,
    homeTeamName: homeTeam?.name as string,
    awayTeamId: awayId,
    awayTeamName: awayTeam?.name as string,
    homeScore: homeScore ?? null,
    awayScore: awayScore ?? null,
    status: resolvedStatus,
    utcStartTime,
    byeTeamIds,
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
  const url = `${import.meta.env.BASE_URL}data/fixture.json`
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
  const tsUrl = `${import.meta.env.BASE_URL}data/last-updated.json`
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
