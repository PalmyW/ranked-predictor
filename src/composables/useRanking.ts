import { ref, computed, watch } from 'vue'
import type { TeamRanking, LadderRow } from '../types/afl'
import { TEAMS } from './useAFLData'

const STORAGE_KEY = 'afl-ranking-2026'

// Default tier sizes: S=1, A=2, B-F=3 each (total 18)
export const DEFAULT_TIER_SIZES = [1, 2, 3, 3, 3, 3, 3]

// Letter ↔ team ID maps
const LETTER_TO_ID: Record<string, number> = {
  A: 1, B: 2, C: 5, D: 3, E: 12, F: 14, G: 10, H: 4,
  I: 15, J: 9, K: 17, L: 6, M: 7, N: 16, O: 11, P: 13,
  Q: 18, R: 8,
}
const ID_TO_LETTER: Record<number, string> = Object.fromEntries(
  Object.entries(LETTER_TO_ID).map(([l, id]) => [id, l])
)

// Encode ranking + tier boundaries as hyphen-separated letter segments
// e.g. "A-BC-DEF-GHI-JKL-MNO-PQR"
export function encodeRanking(ids: TeamRanking, tierSizes: number[]): string {
  const letters = ids.map((id) => ID_TO_LETTER[id] ?? '?')
  let offset = 0
  const segments = tierSizes.map((size) => {
    const seg = letters.slice(offset, offset + size).join('')
    offset += size
    return seg
  })
  return segments.join('-')
}

// Decode a hyphen-separated string (new format), pipe-separated (legacy v2), or plain 18-char string (legacy v1)
export function decodeRanking(s: string): { ranking: TeamRanking; tierSizes: number[] } | null {
  const upper = s.toUpperCase()
  const sep = upper.includes('-') ? '-' : upper.includes('|') ? '|' : null

  if (sep) {
    const segments = upper.split(sep)
    if (segments.length !== 7) return null
    const tierSizes = segments.map((seg) => seg.length)
    const allLetters = segments.join('')
    if (allLetters.length !== 18) return null
    const ids = allLetters.split('').map((ch) => LETTER_TO_ID[ch])
    if (ids.some((id) => !id)) return null
    if (new Set(ids).size !== 18) return null
    return { ranking: ids, tierSizes }
  }

  // Legacy format: plain 18-char string, use default tier sizes
  if (upper.length !== 18) return null
  const ids = upper.split('').map((ch) => LETTER_TO_ID[ch])
  if (ids.some((id) => !id)) return null
  if (new Set(ids).size !== 18) return null
  return { ranking: ids, tierSizes: [...DEFAULT_TIER_SIZES] }
}

const defaultRanking = (): TeamRanking => TEAMS.map((t) => t.id)

function loadInitialState(): {
  ranking: TeamRanking
  tierSizes: number[]
  source: 'url' | 'storage' | 'default'
} {
  // 1. URL param
  const params = new URLSearchParams(window.location.search)
  const urlParam = params.get('r')
  if (urlParam) {
    const decoded = decodeRanking(urlParam)
    if (decoded) return { ...decoded, source: 'url' }
  }
  // 2. localStorage
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    const decoded = decodeRanking(stored)
    if (decoded) return { ...decoded, source: 'storage' }
  }
  // 3. Default (alphabetical, default tier sizes)
  return { ranking: defaultRanking(), tierSizes: [...DEFAULT_TIER_SIZES], source: 'default' }
}

const { ranking: initialRanking, tierSizes: initialTierSizes, source: initialSource } = loadInitialState()

const ranking = ref<TeamRanking>(initialRanking)
const tierSizes = ref<number[]>(initialTierSizes)
const rankedFromUrl = initialSource === 'url'
const rankedFromStorage = initialSource === 'storage'

export function useRanking() {
  const encodedRanking = computed(() => encodeRanking(ranking.value, tierSizes.value))

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

  function setTierSizes(newSizes: number[]) {
    tierSizes.value = [...newSizes]
  }

  function resetToLadder(ladder: LadderRow[]) {
    ranking.value = ladder.map((row) => row.teamId)
    tierSizes.value = [...DEFAULT_TIER_SIZES]
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
    tierSizes,
    encodedRanking,
    shareUrl,
    rankedFromUrl,
    rankedFromStorage,
    setRanking,
    setTierSizes,
    resetToLadder,
    moveTeam,
  }
}
