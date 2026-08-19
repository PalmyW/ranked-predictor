import { ref } from 'vue'
import { toCanvas } from 'html-to-image'

/**
 * Capture a DOM element to a downloadable PNG.
 *
 * Handles the team-icon sprite: rows render icons via external
 * `<use href="/ranked-predictor/icons.svg#id">` references, which html-to-image
 * can't resolve. We inline the sprite into the captured element and rewrite the
 * hrefs to local fragments for the duration of the capture, then restore them.
 *
 * The padding/background border is composited onto a second canvas afterwards
 * rather than applied as CSS padding on `el` itself: absolutely positioned
 * descendants (e.g. the finals bracket's connector-line SVG) anchor to the
 * padding edge, not the content edge, so adding padding directly to `el`'s
 * style shifts normal-flow content but leaves them behind, misaligning them.
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
      const ratio = 2
      const contentCanvas = await toCanvas(el, {
        pixelRatio: ratio,
        width: el.scrollWidth,
        height: el.scrollHeight,
        style: { margin: '0', overflow: 'visible' },
      })

      const finalCanvas = document.createElement('canvas')
      finalCanvas.width = contentCanvas.width + pad * 2 * ratio
      finalCanvas.height = contentCanvas.height + pad * 2 * ratio
      const ctx = finalCanvas.getContext('2d')!
      const radius = 8 * ratio
      ctx.beginPath()
      ctx.roundRect(0, 0, finalCanvas.width, finalCanvas.height, radius)
      ctx.clip()
      ctx.fillStyle = dark ? '#111827' : '#ffffff'
      ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)
      ctx.drawImage(contentCanvas, pad * ratio, pad * ratio)

      const link = document.createElement('a')
      link.download = filename
      link.href = finalCanvas.toDataURL('image/png')
      link.click()
    } finally {
      useEls.forEach(({ el, original }) => el.setAttribute('href', original))
      spriteEl?.remove()
      capturing.value = false
    }
  }

  return { capturing, screenshot }
}
