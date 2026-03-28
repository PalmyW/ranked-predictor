import { ref, computed, watch } from 'vue'
import type { TeamRanking, LadderRow } from '../types/afl'
import { TEAMS } from './useAFLData'

const STORAGE_KEY = 'afl-ranking-2026'

// Letter ↔ team ID maps
const LETTER_TO_ID: Record<string, number> = {
  A: 1, B: 2, C: 5, D: 3, E: 12, F: 14, G: 10, H: 4,
  I: 15, J: 9, K: 17, L: 6, M: 7, N: 16, O: 11, P: 13,
  Q: 18, R: 8,
}
const ID_TO_LETTER: Record<number, string> = Object.fromEntries(
  Object.entries(LETTER_TO_ID).map(([l, id]) => [id, l])
)

export function encodeRanking(ids: TeamRanking): string {
  return ids.map((id) => ID_TO_LETTER[id] ?? '?').join('')
}

export function decodeRanking(s: string): TeamRanking | null {
  if (!s || s.length !== 18) return null
  const ids = s.toUpperCase().split('').map((ch) => LETTER_TO_ID[ch])
  if (ids.some((id) => !id)) return null
  if (new Set(ids).size !== 18) return null
  return ids
}

const defaultRanking = (): TeamRanking => TEAMS.map((t) => t.id)

function loadInitialRanking(): { ranking: TeamRanking; source: 'url' | 'storage' | 'default' } {
  // 1. URL param
  const params = new URLSearchParams(window.location.search)
  const urlParam = params.get('r')
  if (urlParam) {
    const decoded = decodeRanking(urlParam)
    if (decoded) return { ranking: decoded, source: 'url' }
  }
  // 2. localStorage
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    const decoded = decodeRanking(stored)
    if (decoded) return { ranking: decoded, source: 'storage' }
  }
  // 3. Default (alphabetical)
  return { ranking: defaultRanking(), source: 'default' }
}

const { ranking: initialRanking, source: initialSource } = loadInitialRanking()

const ranking = ref<TeamRanking>(initialRanking)
const rankedFromUrl = initialSource === 'url'
const rankedFromStorage = initialSource === 'storage'

export function useRanking() {
  const encodedRanking = computed(() => encodeRanking(ranking.value))

  const shareUrl = computed(() => {
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('r', encodedRanking.value)
    return url.toString()
  })

  // Persist to localStorage on every change
  watch(encodedRanking, (encoded) => {
    localStorage.setItem(STORAGE_KEY, encoded)
  })

  function setRanking(newRanking: TeamRanking) {
    ranking.value = [...newRanking]
  }

  function resetToLadder(ladder: LadderRow[]) {
    ranking.value = ladder.map((row) => row.teamId)
  }

  function resetToDefault() {
    ranking.value = defaultRanking()
  }

  function moveTeam(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= ranking.value.length) return
    const next = [...ranking.value]
    const [item] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, item)
    ranking.value = next
  }

  return {
    ranking,
    encodedRanking,
    shareUrl,
    rankedFromUrl,
    rankedFromStorage,
    setRanking,
    resetToLadder,
    resetToDefault,
    moveTeam,
  }
}
