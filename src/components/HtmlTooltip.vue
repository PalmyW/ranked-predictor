<template>
  <div class="relative inline-block" ref="wrapperRef">
    <!-- Trigger -->
    <slot name="trigger" :toggle="toggle" :isOpen="isOpen" />

    <!-- Popup -->
    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="popupRef"
        class="absolute z-[9999] w-max max-w-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-xs text-gray-700 dark:text-gray-200"
        :style="popupStyle"
      >
        <!-- Border caret (behind, slightly larger) -->
        <div
          class="absolute size-0 pointer-events-none"
          :class="resolvedPlacement === 'above'
            ? 'top-full border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[8px] border-t-gray-200 dark:border-t-gray-700'
            : 'bottom-full -translate-y-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-b-[8px] border-b-gray-200 dark:border-b-gray-700'"
          :style="{ left: caretLeft, transform: resolvedPlacement === 'above' ? 'translate(-50%, 1px)' : 'translate(-50%, -1px)' }"
        />
        <!-- Fill caret (front) -->
        <div
          class="absolute size-0 pointer-events-none"
          :class="resolvedPlacement === 'above'
            ? 'top-full border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[7px] border-t-white dark:border-t-gray-800'
            : 'bottom-full border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[7px] border-b-white dark:border-b-gray-800'"
          :style="{ left: caretLeft, transform: 'translateX(-50%)' }"
        />
        <slot name="content" />
      </div>
    </Teleport>

    <!-- Click-outside backdrop -->
    <Teleport to="body">
      <div v-if="isOpen" class="fixed inset-0 z-[9998]" @click="isOpen = false" @scroll.passive="isOpen = false" />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  placement?: 'above' | 'below'
}>(), {
  placement: 'below',
})

const isOpen = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)
const popupRef = ref<HTMLElement | null>(null)
const popupStyle = ref<Record<string, string>>({})
const caretLeft = ref('50%')
const resolvedPlacement = ref<'above' | 'below'>(props.placement)

function onScroll() { isOpen.value = false }

async function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    await nextTick()
    position()
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
  } else {
    window.removeEventListener('scroll', onScroll, { capture: true })
  }
}

onUnmounted(() => window.removeEventListener('scroll', onScroll, { capture: true }))

function position() {
  if (!wrapperRef.value || !popupRef.value) return
  const trigger = wrapperRef.value.getBoundingClientRect()
  const popup = popupRef.value.getBoundingClientRect()
  const gap = 10
  const margin = 8
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Horizontal: center on trigger, clamp to viewport edges
  let left = trigger.left + trigger.width / 2 - popup.width / 2
  left = Math.max(margin, Math.min(left, vw - popup.width - margin))

  // Caret: always points at trigger center, clamped within popup bounds
  const triggerCenterX = trigger.left + trigger.width / 2
  const caretX = triggerCenterX - left
  caretLeft.value = `${Math.max(14, Math.min(caretX, popup.width - 14))}px`

  // Vertical: try preferred placement, flip if it would go off-screen
  const spaceAbove = trigger.top - gap - margin
  const spaceBelow = vh - trigger.bottom - gap - margin
  const fitsAbove = popup.height <= spaceAbove
  const fitsBelow = popup.height <= spaceBelow

  let placement = props.placement
  if (placement === 'above' && !fitsAbove && fitsBelow) placement = 'below'
  else if (placement === 'below' && !fitsBelow && fitsAbove) placement = 'above'
  // If neither fits perfectly, use whichever has more space
  else if (!fitsAbove && !fitsBelow) placement = spaceAbove >= spaceBelow ? 'above' : 'below'

  resolvedPlacement.value = placement

  // Convert viewport coords to document coords by adding scroll offset
  const scrollX = window.scrollX
  const scrollY = window.scrollY

  let top: number
  if (placement === 'above') {
    top = trigger.top - popup.height - gap
    top = Math.max(margin, top)
  } else {
    top = trigger.bottom + gap
    top = Math.min(top, vh - popup.height - margin)
  }

  popupStyle.value = { top: `${top + scrollY}px`, left: `${left + scrollX}px` }
}
</script>
