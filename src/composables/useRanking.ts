import { ref, computed, watch } from 'vue'
import type { TeamRanking, LadderRow } from '../types/afl'
import { TEAMS } from './useAFLData'
import { LEAGUE_CONFIG } from '../config/league'

const STORAGE_KEY = `afl-ranking-2026${LEAGUE_CONFIG.lsSuffix}`
const HISTORY_KEY = `afl-ranking-history-2026${LEAGUE_CONFIG.lsSuffix}`

// Default tier sizes: S=1, A=2, B-F=3 each (total 18)
export const DEFAULT_TIER_SIZES = [1, 2, 3, 3, 3, 3, 3]

// Letter ↔ team ID maps — derived from the active league's TEAMS so a share
// URL/localStorage ranking round-trips correctly for whichever league it was
// encoded in.
const LETTER_TO_ID: Record<string, number> = Object.fromEntries(TEAMS.map((t) => [t.letter, t.id]))
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
    if (allLetters.length !== TEAMS.length) return null
    const ids = allLetters.split('').map((ch) => LETTER_TO_ID[ch])
    if (ids.some((id) => !id)) return null
    if (new Set(ids).size !== TEAMS.length) return null
    return { ranking: ids, tierSizes }
  }

  // Legacy format: plain N-char string, use default tier sizes
  if (upper.length !== TEAMS.length) return null
  const ids = upper.split('').map((ch) => LETTER_TO_ID[ch])
  if (ids.some((id) => !id)) return null
  if (new Set(ids).size !== TEAMS.length) return null
  return { ranking: ids, tierSizes: [...DEFAULT_TIER_SIZES] }
}

const defaultRanking = (): TeamRanking => TEAMS.map((t) => t.id)

interface StoredState { ranking: TeamRanking; tierSizes: number[] }

function loadInitialState(): {
  ranking: TeamRanking
  tierSizes: number[]
  source: 'url' | 'storage' | 'default'
  stored: StoredState | null
} {
  // Always read localStorage first so we can offer to restore it later
  const storedRaw = localStorage.getItem(STORAGE_KEY)
  const stored = storedRaw ? decodeRanking(storedRaw) : null

  // 1. URL param
  const params = new URLSearchParams(window.location.search)
  const urlParam = params.get('r')
  if (urlParam) {
    const decoded = decodeRanking(urlParam)
    if (decoded) return { ...decoded, source: 'url', stored }
  }
  // 2. localStorage
  if (stored) return { ...stored, source: 'storage', stored }
  // 3. Default (alphabetical, default tier sizes)
  return { ranking: defaultRanking(), tierSizes: [...DEFAULT_TIER_SIZES], source: 'default', stored: null }
}

function loadHistory(): { rankings: Record<number, TeamRanking>; tierSizesHistory: Record<number, number[]> } {
  const raw = localStorage.getItem(HISTORY_KEY)
  if (!raw) return { rankings: {}, tierSizesHistory: {} }
  try {
    const stored: Record<string, string> = JSON.parse(raw)
    const rankings: Record<number, TeamRanking> = {}
    const tierSizesHistory: Record<number, number[]> = {}
    for (const [key, encoded] of Object.entries(stored)) {
      const decoded = decodeRanking(encoded)
      if (decoded) {
        rankings[Number(key)] = decoded.ranking
        tierSizesHistory[Number(key)] = decoded.tierSizes
      }
    }
    return { rankings, tierSizesHistory }
  } catch {
    return { rankings: {}, tierSizesHistory: {} }
  }
}

const { ranking: initialRanking, tierSizes: initialTierSizes, source: initialSource, stored: initialStored } = loadInitialState()

const ranking = ref<TeamRanking>(initialRanking)
const tierSizes = ref<number[]>(initialTierSizes)
const rankedFromUrl = initialSource === 'url'
const rankedFromStorage = initialSource === 'storage'
const { rankings: initialHistory, tierSizesHistory: initialTierSizesHistory } = loadHistory()
const rankingHistory = ref<Record<number, TeamRanking>>(initialHistory)
const tierSizesHistory = ref<Record<number, number[]>>(initialTierSizesHistory)

type LadderSource = 'live' | 'shared' | 'mine' | 'imported'
const ladderSource = ref<LadderSource>(
  initialSource === 'url' ? 'shared' : initialSource === 'storage' ? 'mine' : 'live'
)
const savedState = ref<StoredState | null>(initialStored)
const preImportSnapshot = ref<{ ranking: TeamRanking; tierSizes: number[]; source: LadderSource } | null>(null)

export function useRanking() {
  const encodedRanking = computed(() => encodeRanking(ranking.value, tierSizes.value))

  const shareUrl = computed(() => {
    return window.location.origin + import.meta.env.BASE_URL + '?r=' + encodedRanking.value
  })

  // Persist to localStorage on every change (except when viewing a shared or imported ladder before any interaction)
  watch(encodedRanking, (encoded) => {
    if (ladderSource.value === 'imported') return
    localStorage.setItem(STORAGE_KEY, encoded)
    // Any reorder while viewing a shared ladder claims it as the user's own
    if (ladderSource.value === 'shared') {
      ladderSource.value = 'mine'
    }
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
    ladderSource.value = 'live'
  }

  function moveTeam(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= ranking.value.length) return
    const next = [...ranking.value]
    const [item] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, item)
    ranking.value = next
  }

  function loadSavedRanking() {
    if (!savedState.value) return
    ranking.value = [...savedState.value.ranking]
    tierSizes.value = [...savedState.value.tierSizes]
    ladderSource.value = 'mine'
  }

  function importRanking(newRanking: TeamRanking) {
    preImportSnapshot.value = {
      ranking: [...ranking.value],
      tierSizes: [...tierSizes.value],
      source: ladderSource.value,
    }
    ranking.value = [...newRanking]
    tierSizes.value = [...DEFAULT_TIER_SIZES]
    ladderSource.value = 'imported'
  }

  function revertImport() {
    if (!preImportSnapshot.value) return
    ranking.value = [...preImportSnapshot.value.ranking]
    tierSizes.value = [...preImportSnapshot.value.tierSizes]
    ladderSource.value = preImportSnapshot.value.source
    preImportSnapshot.value = null
  }

  function saveToMyLadder() {
    const encoded = encodedRanking.value
    localStorage.setItem(STORAGE_KEY, encoded)
    savedState.value = { ranking: [...ranking.value], tierSizes: [...tierSizes.value] }
    ladderSource.value = 'mine'
  }

  // If the user has a saved ranking but no history yet, seed the previous round with it.
  // This gives the power rankings a baseline to diff against on first load.
  function seedHistoryFromSavedRanking(currentRound: number) {
    if (Object.keys(rankingHistory.value).length > 0) return // already has history
    if (!savedState.value) return // no saved ranking to seed from
    if (currentRound < 1) return // need round >= 1 so round - 1 is valid

    const previousRound = currentRound - 1
    const seedRanking = savedState.value.ranking
    const seedEncoded = encodeRanking(seedRanking, savedState.value.tierSizes)

    let stored: Record<string, string> = {}
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (raw) stored = JSON.parse(raw)
    } catch { /* ignore */ }

    stored[String(previousRound)] = seedEncoded
    localStorage.setItem(HISTORY_KEY, JSON.stringify(stored))
    rankingHistory.value = { ...rankingHistory.value, [previousRound]: [...seedRanking] }
    tierSizesHistory.value = { ...tierSizesHistory.value, [previousRound]: [...savedState.value.tierSizes] }
  }

  function saveHistoryRanking(roundNumber: number, newRanking: TeamRanking, newTierSizes: number[]) {
    const encoded = encodeRanking(newRanking, newTierSizes)
    let stored: Record<string, string> = {}
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (raw) stored = JSON.parse(raw)
    } catch { /* ignore */ }
    stored[String(roundNumber)] = encoded
    localStorage.setItem(HISTORY_KEY, JSON.stringify(stored))
    rankingHistory.value = { ...rankingHistory.value, [roundNumber]: [...newRanking] }
    tierSizesHistory.value = { ...tierSizesHistory.value, [roundNumber]: [...newTierSizes] }
  }

  // Always overwrite the snapshot for a given round with the current ranking.
  // Used to keep the current round's history entry in sync as the user edits.
  function updateRoundSnapshot(roundNumber: number) {
    let stored: Record<string, string> = {}
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (raw) stored = JSON.parse(raw)
    } catch { /* ignore */ }
    stored[String(roundNumber)] = encodedRanking.value
    localStorage.setItem(HISTORY_KEY, JSON.stringify(stored))
    rankingHistory.value = { ...rankingHistory.value, [roundNumber]: [...ranking.value] }
    tierSizesHistory.value = { ...tierSizesHistory.value, [roundNumber]: [...tierSizes.value] }
  }

  // Save a snapshot of the current ranking for the given round, if not already stored.
  // Skips shared ladders so a viewed-but-not-saved shared ranking doesn't pollute history.
  function snapshotRoundRanking(roundNumber: number) {
    if (ladderSource.value === 'shared') return
    if (rankingHistory.value[roundNumber]) return
    let stored: Record<string, string> = {}
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (raw) stored = JSON.parse(raw)
    } catch {
      // Malformed history — start fresh rather than propagating an error
    }
    stored[String(roundNumber)] = encodedRanking.value
    localStorage.setItem(HISTORY_KEY, JSON.stringify(stored))
    rankingHistory.value = { ...rankingHistory.value, [roundNumber]: [...ranking.value] }
    tierSizesHistory.value = { ...tierSizesHistory.value, [roundNumber]: [...tierSizes.value] }
  }

  return {
    ranking,
    tierSizes,
    encodedRanking,
    shareUrl,
    rankedFromUrl,
    rankedFromStorage,
    ladderSource,
    savedState,
    rankingHistory,
    tierSizesHistory,
    setRanking,
    setTierSizes,
    resetToLadder,
    moveTeam,
    loadSavedRanking,
    saveToMyLadder,
    importRanking,
    revertImport,
    preImportSnapshot,
    seedHistoryFromSavedRanking,
    snapshotRoundRanking,
    updateRoundSnapshot,
    saveHistoryRanking,
  }
}
