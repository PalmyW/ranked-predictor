import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AflMatch } from '../types/afl'
import { SEASON_REGISTRY } from '../config/seasons'
import { fetchSeasonMatches } from '../composables/useAFLData'

export type H2HResult = 'W' | 'L' | 'D'

export interface H2HMeeting {
  matchId: number
  year: number
  roundName: string
  homeTeamName: string
  awayTeamName: string
  homeScore: number
  awayScore: number
  /** Outcome from team A's perspective */
  result: H2HResult
}

export interface HeadToHead {
  total: number
  /** Wins for the perspective team (team A) */
  aWins: number
  /** Wins for the opponent (team B) */
  bWins: number
  draws: number
  /** Year of the earliest recorded meeting, or null when there are none */
  firstYear: number | null
  /** Up to 8 most recent meetings, newest first, from team A's perspective */
  lastEight: H2HMeeting[]
}

/**
 * Owns every season's fixtures (2012–present), fetched from the static
 * public/data/{year}/fixture.json files. Used as the data source for the
 * head-to-head modal on the home-page fixture list.
 */
export const useFixturesStore = defineStore('fixtures', () => {
  const seasonsByYear = ref<Record<string, AflMatch[]>>({})
  const loaded = ref(false)
  const isLoading = ref(false)
  let inFlight: Promise<void> | null = null

  /** Fetch and store every season's fixtures. Idempotent + dedupes concurrent calls. */
  function loadAllSeasons(): Promise<void> {
    if (loaded.value) return Promise.resolve()
    if (inFlight) return inFlight

    isLoading.value = true
    const years = Object.keys(SEASON_REGISTRY)
    inFlight = Promise.all(years.map(async (year) => {
      seasonsByYear.value[year] = await fetchSeasonMatches(year)
    }))
      .then(() => { loaded.value = true })
      .finally(() => {
        isLoading.value = false
        inFlight = null
      })

    return inFlight
  }

  /** All concluded matches across every loaded season, deduped by match id. */
  const allConcludedMatches = computed<AflMatch[]>(() => {
    const byId = new Map<number, AflMatch>()
    for (const matches of Object.values(seasonsByYear.value)) {
      for (const m of matches) {
        if (m.status === 'CONCLUDED' && m.homeScore && m.awayScore) {
          byId.set(m.id, m)
        }
      }
    }
    return Array.from(byId.values())
  })

  /** Head-to-head history between two teams, from teamAId's perspective. */
  function getHeadToHead(teamAId: number, teamBId: number): HeadToHead {
    const meetings = allConcludedMatches.value
      .filter((m) => {
        const ids = [m.homeTeamId, m.awayTeamId]
        return ids.includes(teamAId) && ids.includes(teamBId)
      })
      .sort((a, b) => new Date(a.utcStartTime).getTime() - new Date(b.utcStartTime).getTime())

    let aWins = 0
    let bWins = 0
    let draws = 0

    for (const m of meetings) {
      const homeTotal = m.homeScore!.totalScore
      const awayTotal = m.awayScore!.totalScore
      if (homeTotal === awayTotal) {
        draws++
        continue
      }
      const winnerId = homeTotal > awayTotal ? m.homeTeamId : m.awayTeamId
      if (winnerId === teamAId) aWins++
      else bWins++
    }

    const lastEight: H2HMeeting[] = meetings
      .slice(-8)
      .reverse()
      .map((m) => {
        const homeScore = m.homeScore!.totalScore
        const awayScore = m.awayScore!.totalScore
        let result: H2HResult
        if (homeScore === awayScore) {
          result = 'D'
        } else {
          const winnerId = homeScore > awayScore ? m.homeTeamId : m.awayTeamId
          result = winnerId === teamAId ? 'W' : 'L'
        }
        return {
          matchId: m.id,
          year: new Date(m.utcStartTime).getFullYear(),
          roundName: m.roundName,
          homeTeamName: m.homeTeamName,
          awayTeamName: m.awayTeamName,
          homeScore,
          awayScore,
          result,
        }
      })

    const firstYear = meetings.length
      ? new Date(meetings[0].utcStartTime).getFullYear()
      : null

    return { total: meetings.length, aWins, bWins, draws, firstYear, lastEight }
  }

  return { seasonsByYear, loaded, isLoading, loadAllSeasons, allConcludedMatches, getHeadToHead }
})
