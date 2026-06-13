import { ref } from 'vue'

const HISTORY_KEY = 'afl_query_history'
const HISTORY_MAX = 50

export function useQueryHistory() {
  const history = ref([])

  function load() {
    try {
      history.value = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    } catch {
      history.value = []
    }
  }

  function save() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value.slice(0, HISTORY_MAX)))
  }

  function push(entry) {
    history.value = [entry, ...history.value.filter(h => h.sql !== entry.sql)]
      .slice(0, HISTORY_MAX)
    save()
  }

  function remove(index) {
    history.value = history.value.filter((_, i) => i !== index)
    save()
  }

  function clear() {
    history.value = []
    localStorage.removeItem(HISTORY_KEY)
  }

  load()
  return { history, push, remove, clear }
}
