import { ref } from 'vue'

const stats = ref(null)

export function useAiStats() {
  async function refresh() {
    try {
      const r = await fetch('/api/ai/stats')
      if (r.ok) stats.value = await r.json()
    } catch {}
  }

  return { stats, refresh }
}
