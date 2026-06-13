import { ref } from 'vue'

export function useColVisibility(storageKey) {
  const visibility = ref({})

  function load() {
    if (!storageKey) return
    try {
      visibility.value = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    } catch {
      visibility.value = {}
    }
  }

  function save() {
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(visibility.value))
  }

  function isVisible(key) {
    return visibility.value[key] !== false
  }

  function toggle(key, val) {
    visibility.value = { ...visibility.value, [key]: val }
    save()
  }

  function setGroup(keys, val) {
    const next = { ...visibility.value }
    for (const k of keys) next[k] = val
    visibility.value = next
    save()
  }

  function applyToTable(tabulatorInstance, prefix = '') {
    if (!tabulatorInstance) return
    for (const [key, visible] of Object.entries(visibility.value)) {
      try {
        if (visible !== false) {
          tabulatorInstance.showColumn(prefix + key)
        } else {
          tabulatorInstance.hideColumn(prefix + key)
        }
      } catch {
        // column may not exist with this prefix
      }
    }
  }

  load()
  return { visibility, isVisible, toggle, setGroup, applyToTable, reload: load }
}
