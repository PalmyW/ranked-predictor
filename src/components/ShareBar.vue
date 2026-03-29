<template>
  <div class="flex gap-2 items-center">
    <input
      ref="inputEl"
      type="text"
      :value="shareUrl"
      readonly
      class="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-xs font-mono text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 truncate cursor-text"
      @click="selectAll"
    />
    <button
      @click="copy"
      class="shrink-0 px-3 py-1.5 text-sm font-medium rounded border transition-colors"
      :class="
        copied
          ? 'bg-green-600 border-green-600 text-white'
          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
      "
    >
      {{ copied ? 'Copied!' : 'Copy Link' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAnalytics } from '../composables/useAnalytics'

defineProps<{ shareUrl: string }>()

const analytics = useAnalytics()

const inputEl = ref<HTMLInputElement | null>(null)
const copied = ref(false)

function selectAll() {
  inputEl.value?.select()
}

async function copy() {
  const url = inputEl.value?.value
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    // Fallback: select the text
    inputEl.value?.select()
    document.execCommand('copy')
  }
  analytics.trackShareCopy()
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>
