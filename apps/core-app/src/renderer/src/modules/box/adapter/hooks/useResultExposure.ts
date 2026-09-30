import type { TuffItem } from '@talex-touch/utils'
import type { CoreBoxRecommendationExposureRequest } from '@talex-touch/utils/transport/events/types'
import type { Ref } from 'vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { subscribeRendererActivity } from '~/modules/telemetry/renderer-activity'

interface ResultExposureOptions {
  items: Readonly<Ref<TuffItem[]>>
  root: Readonly<Ref<HTMLElement | null>>
  query: Readonly<Ref<string>>
  kind: Readonly<Ref<'search' | 'recommendation'>>
  surface: () => string
}

function identity(item: TuffItem): string {
  return `${item.meta?._originalSourceId ?? item.source.id}\0${item.meta?._originalItemId ?? item.id}`
}

/** Visibility is a native-window fact, not a result-publication or document.hidden fact. */
export function useResultExposure(options: ResultExposureOptions): void {
  const transport = useTuffTransport()
  let sessionId = crypto.randomUUID()
  const seen = new Set<string>()
  const pending = new Set<string>()
  let nativeVisible = false
  let nativeKnown = false
  let activityVersion = 0
  let mounted = false
  let disposed = false
  let observer: IntersectionObserver | null = null
  let observerGeneration = 0
  let reportFrame: number | null = null

  function disconnect(cancelReport = true): void {
    observerGeneration++
    observer?.disconnect()
    observer = null
    if (cancelReport) {
      if (reportFrame !== null) cancelAnimationFrame(reportFrame)
      reportFrame = null
    }
  }

  function resetSession(): void {
    disconnect()
    sessionId = crypto.randomUUID()
    seen.clear()
    pending.clear()
  }

  function queueReport(): void {
    if (reportFrame !== null) return
    reportFrame = requestAnimationFrame(() => {
      reportFrame = null
      if (disposed || !nativeKnown || !nativeVisible || document.hidden) return
      const items: CoreBoxRecommendationExposureRequest['items'] = []
      const included = new Set<string>()
      for (const item of options.items.value) {
        const key = identity(item)
        if (!pending.has(key) || included.has(key)) continue
        included.add(key)
        items.push({
          sourceId: item.meta?._originalSourceId ?? item.source.id,
          itemId: item.meta?._originalItemId ?? item.id,
          sourceType: item.source.type,
          pinned: item.meta?.pinned?.isPinned === true
        })
      }
      pending.clear()
      if (!items.length) return
      void transport
        .send(CoreBoxEvents.recommendation.reportExposure, {
          sessionId,
          kind: options.kind.value,
          items,
          surface: options.surface()
        })
        .catch(() => {})
    })
  }

  function observe(): void {
    disconnect(false)
    const root = options.root.value
    if (!mounted || disposed || !root || !nativeKnown || !nativeVisible || document.hidden) return
    if (typeof IntersectionObserver === 'undefined') return
    const generation = observerGeneration
    const renderedItems = new Map(options.items.value.map((item) => [item.id, item]))
    observer = new IntersectionObserver(
      (entries) => {
        if (generation !== observerGeneration || disposed || !nativeVisible || document.hidden)
          return
        let changed = false
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue
          const item = renderedItems.get(entry.target.getAttribute('data-corebox-item-id') ?? '')
          if (!item || item.kind === 'notification' || item.kind === 'preview') continue
          const key = identity(item)
          if (seen.has(key)) continue
          seen.add(key)
          pending.add(key)
          changed = true
          observer?.unobserve(entry.target)
        }
        if (changed) queueReport()
      },
      { root, threshold: 0.5 }
    )
    for (const element of root.querySelectorAll('[data-corebox-item-id]')) observer.observe(element)
  }

  function handleShown(): void {
    resetSession()
    void nextTick().then(observe)
  }

  let initialActivity = true
  const unsubscribeActivity = subscribeRendererActivity((visible) => {
    nativeVisible = visible
    activityVersion++
    if (!initialActivity) nativeKnown = true
    if (!visible) resetSession()
    else void nextTick().then(observe)
  })
  initialActivity = false

  watch([options.items, options.root], observe, { flush: 'post' })
  watch(
    [options.query, options.kind],
    () => {
      resetSession()
      observe()
    },
    { flush: 'post' }
  )

  onMounted(() => {
    mounted = true
    window.addEventListener('corebox:shown', handleShown)
    document.addEventListener('visibilitychange', observe)
    const version = activityVersion
    void transport
      .send(CoreBoxEvents.ui.getVisibility)
      .then((response) => {
        if (disposed || version !== activityVersion || typeof response?.visible !== 'boolean')
          return
        nativeVisible = response.visible
        nativeKnown = true
        observe()
      })
      .catch(() => {})
    observe()
  })

  onBeforeUnmount(() => {
    disposed = true
    disconnect()
    unsubscribeActivity()
    window.removeEventListener('corebox:shown', handleShown)
    document.removeEventListener('visibilitychange', observe)
  })
}
