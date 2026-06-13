import { ref } from 'vue'
import { useApi } from './useApi.js'

const { api } = useApi()

export function useTeamMap() {
  const teamMap  = ref({})
  const seasons  = ref([])
  const teams    = ref([])
  const dbStatus = ref(null)
  const loading  = ref(true)

  async function loadMeta() {
    try {
      const [s, t, status] = await Promise.all([
        api('/api/seasons'),
        api('/api/teams'),
        api('/api/import-status'),
      ])
      seasons.value  = s
      teams.value    = t
      teamMap.value  = Object.fromEntries(t.map(tm => [tm.team_id, tm.name]))
      dbStatus.value = status
    } finally {
      loading.value = false
    }
  }

  return { teamMap, seasons, teams, dbStatus, loading, loadMeta }
}
