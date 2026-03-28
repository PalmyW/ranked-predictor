import { ref, readonly } from 'vue'
import type { AflTeam, AflMatch, MatchStatus } from '../types/afl'

export const TEAMS: AflTeam[] = [
  { id: 1,  name: 'Adelaide Crows',    abbreviation: 'ADEL', letter: 'A' },
  { id: 2,  name: 'Brisbane Lions',    abbreviation: 'BL',   letter: 'B' },
  { id: 5,  name: 'Carlton',           abbreviation: 'CARL', letter: 'C' },
  { id: 3,  name: 'Collingwood',       abbreviation: 'COLL', letter: 'D' },
  { id: 12, name: 'Essendon',          abbreviation: 'ESS',  letter: 'E' },
  { id: 14, name: 'Fremantle',         abbreviation: 'FRE',  letter: 'F' },
  { id: 10, name: 'Geelong Cats',      abbreviation: 'GEEL', letter: 'G' },
  { id: 4,  name: 'Gold Coast SUNS',   abbreviation: 'GCS',  letter: 'H' },
  { id: 15, name: 'GWS GIANTS',        abbreviation: 'GWS',  letter: 'I' },
  { id: 9,  name: 'Hawthorn',          abbreviation: 'HAW',  letter: 'J' },
  { id: 17, name: 'Melbourne',         abbreviation: 'MELB', letter: 'K' },
  { id: 6,  name: 'North Melbourne',   abbreviation: 'NMFC', letter: 'L' },
  { id: 7,  name: 'Port Adelaide',     abbreviation: 'PORT', letter: 'M' },
  { id: 16, name: 'Richmond',          abbreviation: 'RICH', letter: 'N' },
  { id: 11, name: 'St Kilda',          abbreviation: 'STK',  letter: 'O' },
  { id: 13, name: 'Sydney Swans',      abbreviation: 'SYD',  letter: 'P' },
  { id: 18, name: 'West Coast Eagles', abbreviation: 'WCE',  letter: 'Q' },
  { id: 8,  name: 'Western Bulldogs',  abbreviation: 'WB',   letter: 'R' },
]

const VALID_STATUSES = new Set<MatchStatus>([
  'CONCLUDED', 'LIVE', 'SCHEDULED', 'PLACEHOLDER', 'UNCONFIRMED_TEAMS',
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
  const status = raw.status as string
  if (!VALID_STATUSES.has(status as MatchStatus)) return null

  const homeScore = home?.score as { goals: number; behinds: number; totalScore: number } | undefined | null
  const awayScore = away?.score as { goals: number; behinds: number; totalScore: number } | undefined | null

  return {
    id: raw.id as number,
    roundNumber: round.roundNumber as number,
    roundName: round.name as string,
    homeTeamId: homeId,
    homeTeamName: homeTeam?.name as string,
    awayTeamId: awayId,
    awayTeamName: awayTeam?.name as string,
    homeScore: homeScore ?? null,
    awayScore: awayScore ?? null,
    status: status as MatchStatus,
    utcStartTime: raw.utcStartTime as string,
  }
}

// Module-level singleton state
const matches = ref<AflMatch[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
let fetched = false

export function useAFLData() {
  if (!fetched) {
    fetched = true
    isLoading.value = true

    const url = `${import.meta.env.BASE_URL}data/fixture.json`
    fetch(url)
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
      .finally(() => {
        isLoading.value = false
      })
  }

  return {
    matches: readonly(matches),
    teams: TEAMS,
    isLoading: readonly(isLoading),
    error: readonly(error),
  }
}
