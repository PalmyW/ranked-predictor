import { ref, watch } from 'vue'

const STORAGE_KEY = 'afl-theme'

function getInitialDark(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark') return true
  if (stored === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

const isDark = ref(getInitialDark())

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
}

applyTheme(isDark.value)

watch(isDark, (dark) => {
  applyTheme(dark)
  localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
})

// Sync if browser preference changes and user hasn't manually overridden
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!localStorage.getItem(STORAGE_KEY)) {
    isDark.value = e.matches
  }
})

export function useDarkMode() {
  function toggle() {
    isDark.value = !isDark.value
  }
  return { isDark, toggle }
}
