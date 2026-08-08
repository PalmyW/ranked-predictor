import { ref } from 'vue'
import { LEAGUE_CONFIG } from '../config/league'

const LABELS_KEY = `afl-power-rankings-labels-2026${LEAGUE_CONFIG.lsSuffix}`

function readTitleFromStorage(): string {
  try {
    const raw = localStorage.getItem(LABELS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>
      return parsed.title?.trim() || 'POWER RANKINGS'
    }
  } catch {
    /* ignore */
  }
  return 'POWER RANKINGS'
}

// Module-level reactive ref so all consumers share the same instance
export const powerRankingsTitle = ref(readTitleFromStorage())

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'but'])

export function firstMeaningfulWord(str: string): string {
  const words = str.trim().split(/\s+/)
  for (const word of words) {
    if (word && !STOP_WORDS.has(word.toLowerCase())) {
      // Title-case the word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    }
  }
  return words[0] ? words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase() : 'Power'
}

export function titleToFilename(str: string): string {
  const slug = str.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  return (slug || 'power-rankings') + '.png'
}
