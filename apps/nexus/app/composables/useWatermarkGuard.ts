import { onBeforeUnmount, onMounted } from 'vue'
import { useWatermarkRisk } from './useWatermarkRisk'

interface WatermarkGuardOptions {
  target: () => HTMLElement | null
  minOpacity: number
  source: string
}

export function useWatermarkGuard(options: WatermarkGuardOptions) {
  const { reportTamper } = useWatermarkRisk()
  let observer: MutationObserver | null = null
  let guardTimer: ReturnType<typeof setInterval> | null = null
  let restoring = false

  function ensureInDom(element: HTMLElement) {
    if (element.isConnected)
      return
    restoring = true
    document.body.appendChild(element)
    reportTamper(`${options.source}:removed`)
    restoring = false
  }

  function checkElement() {
    if (restoring || !import.meta.client)
      return
    const element = options.target()
    if (!element)
      return
    ensureInDom(element)
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden')
      reportTamper(`${options.source}:hidden`)
    const opacity = Number.parseFloat(style.opacity || '1')
    if (Number.isFinite(opacity) && opacity < options.minOpacity)
      reportTamper(`${options.source}:opacity`)
  }

  onMounted(() => {
    if (!import.meta.client)
      return
    observer = new MutationObserver(() => checkElement())
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    })
    guardTimer = setInterval(checkElement, 2500)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
    if (guardTimer) {
      clearInterval(guardTimer)
      guardTimer = null
    }
  })
}
