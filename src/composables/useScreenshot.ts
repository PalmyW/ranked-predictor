import { ref } from 'vue'
import { toPng } from 'html-to-image'

/**
 * Capture a DOM element to a downloadable PNG.
 *
 * Handles the team-icon sprite: rows render icons via external
 * `<use href="/ranked-predictor/icons.svg#id">` references, which html-to-image
 * can't resolve. We inline the sprite into the captured element and rewrite the
 * hrefs to local fragments for the duration of the capture, then restore them.
 */
export function useScreenshot() {
  const capturing = ref(false)

  async function screenshot(el: HTMLElement | null, filename: string) {
    if (!el || capturing.value) return
    capturing.value = true
    await new Promise((r) => setTimeout(r, 50))

    let spriteEl: Element | null = null
    const useEls: { el: Element; original: string }[] = []
    try {
      const spriteRes = await fetch('/ranked-predictor/icons.svg')
      const spriteText = await spriteRes.text()
      const wrapper = document.createElement('div')
      wrapper.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
      wrapper.innerHTML = spriteText
      spriteEl = wrapper
      el.prepend(wrapper)

      el.querySelectorAll('use[href]').forEach((use) => {
        const href = use.getAttribute('href') ?? ''
        useEls.push({ el: use, original: href })
        const fragment = href.split('#')[1]
        if (fragment) use.setAttribute('href', `#${fragment}`)
      })

      const dark = document.documentElement.classList.contains('dark')
      const pad = 16
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        width: el.scrollWidth + pad * 2,
        height: el.scrollHeight + pad * 2,
        style: {
          margin: '0',
          padding: `${pad}px`,
          background: dark ? '#111827' : '#ffffff',
          borderRadius: '8px',
          overflow: 'visible',
        },
      })
      const link = document.createElement('a')
      link.download = filename
      link.href = dataUrl
      link.click()
    } finally {
      useEls.forEach(({ el, original }) => el.setAttribute('href', original))
      spriteEl?.remove()
      capturing.value = false
    }
  }

  return { capturing, screenshot }
}
