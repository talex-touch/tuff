import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import type { CoreBoxLayoutUpdateRequest } from '@talex-touch/utils/transport/events/types'
import type { ComputedRef, Ref } from 'vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { appSetting } from '~/modules/channel/storage'
import { devLog } from '~/utils/dev-log'

interface UseResizeOptions {
  results: ComputedRef<TuffItem[]>
  activeActivations: Ref<IProviderActivate[] | null>
  loading: Ref<boolean>
  recommendationPending?: Ref<boolean>
}

const SCROLLBAR_WIDTH_ESTIMATE = 12
const HEIGHT_SAFETY_PADDING = 10
const HEADER_HEIGHT = 64
const MIN_HEIGHT = 64
const MAX_HEIGHT = 600
const RESULT_LAYOUT_SETTLE_MS = 220

const shouldLog = () => appSetting.searchEngine?.logsEnabled || appSetting.diagnostics?.verboseLogs

const logResizeDebug = (...args: unknown[]) => {
  if (!shouldLog()) return
  devLog('[CoreBoxResize]', ...args)
}

function clampHeight(height: number): number {
  return Math.max(MIN_HEIGHT, Math.min(height, MAX_HEIGHT))
}

function getHeaderHeight(): number {
  const header = document.querySelector('.CoreBox') as HTMLElement | null
  if (!header) return HEADER_HEIGHT
  const rect = header.getBoundingClientRect()
  if (!Number.isFinite(rect.height) || rect.height <= 0) return HEADER_HEIGHT
  return rect.height
}

function toPx(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function measureResultContentHeight(resultContent: HTMLElement): number {
  const containerStyle = getComputedStyle(resultContent)
  const paddingTop = toPx(containerStyle.paddingTop)
  const paddingBottom = toPx(containerStyle.paddingBottom)

  let visualBottom = paddingTop
  const children = Array.from(resultContent.children) as HTMLElement[]
  for (const child of children) {
    const childStyle = getComputedStyle(child)
    const marginBottom = toPx(childStyle.marginBottom)
    const childBottom = child.offsetTop + child.offsetHeight + marginBottom
    if (childBottom > visualBottom) {
      visualBottom = childBottom
    }
  }

  const visualHeight = Math.ceil(visualBottom + paddingBottom)
  const scrollHeight = resultContent.scrollHeight
  // Keep whichever is larger to avoid under-measure during transition states.
  return Math.max(visualHeight, scrollHeight)
}

function calculateDesiredHeight(resultCount: number): number {
  const headerHeight = getHeaderHeight()
  if (resultCount === 0) return clampHeight(headerHeight)

  const scrollRoot = document.querySelector('.CoreBoxRes-Main .touch-scroll')
  if (!scrollRoot) {
    logResizeDebug('calculateDesiredHeight:scrollRootMissing', {
      resultCount,
      headerHeight
    })
    return MIN_HEIGHT
  }

  // Prefer measuring real result content first.
  // TxScroll content uses `min-height: 100%`, so measuring wrapper/content directly
  // can lock the next height to current viewport height and prevent shrinking.
  const resultContent = scrollRoot.querySelector('.CoreBoxRes-ScrollContent') as HTMLElement | null
  if (resultContent) {
    const contentHeight = measureResultContentHeight(resultContent)
    if (Number.isFinite(contentHeight) && contentHeight > 0) {
      return clampHeight(contentHeight + headerHeight + HEIGHT_SAFETY_PADDING)
    }
  }

  const nativeWrap = scrollRoot.querySelector(
    '.native-scroll-wrapper, .tx-scroll__native'
  ) as HTMLElement | null
  const legacyElWrap = scrollRoot.querySelector(
    '.el-scroll-wrapper .el-scrollbar__wrap'
  ) as HTMLElement | null
  const txWrapper = scrollRoot.querySelector('.tx-scroll__wrapper') as HTMLElement | null
  const txContent = scrollRoot.querySelector('.tx-scroll__content') as HTMLElement | null
  const wrap = nativeWrap ?? legacyElWrap ?? txWrapper ?? txContent
  if (!wrap) {
    logResizeDebug('calculateDesiredHeight:wrapMissing', { resultCount, headerHeight })
    return MIN_HEIGHT
  }

  const scrollHeight = txContent?.scrollHeight ?? wrap.scrollHeight
  const clientHeight = wrap.clientHeight
  const extraBuffer = scrollHeight > clientHeight ? SCROLLBAR_WIDTH_ESTIMATE : 0

  return clampHeight(scrollHeight + headerHeight + extraBuffer + HEIGHT_SAFETY_PADDING)
}

function hasWidgetActivation(activations: IProviderActivate[] | null | undefined): boolean {
  if (!activations || activations.length === 0) return false
  return activations.some((activation) => {
    const meta = activation?.meta as { feature?: { meta?: { interaction?: { type?: string } } } }
    return meta?.feature?.meta?.interaction?.type === 'widget'
  })
}

export function useResize(options: UseResizeOptions): void {
  const { results, activeActivations, loading, recommendationPending } = options
  const transport = useTuffTransport()

  let lastPayload: CoreBoxLayoutUpdateRequest | null = null
  let rafId = 0
  let pendingSource: string | null = null
  let settleTimer: ReturnType<typeof setTimeout> | null = null

  function sendLayoutUpdate(source: string): void {
    const activationCount = activeActivations.value?.length ?? 0
    const resultCount = results.value.length
    const isLoading = loading.value
    const recommendationEnabled = appSetting.recommendation?.enabled !== false
    const isRecommendationPending = recommendationEnabled
      ? (recommendationPending?.value ?? false)
      : false

    const height = calculateDesiredHeight(resultCount)
    const forceMax = hasWidgetActivation(activeActivations.value)

    const payload: CoreBoxLayoutUpdateRequest = {
      height,
      resultCount,
      loading: isLoading,
      recommendationPending: isRecommendationPending,
      activationCount,
      forceMax,
      source
    }

    if (
      lastPayload &&
      Math.abs(lastPayload.height - payload.height) < 2 &&
      lastPayload.resultCount === payload.resultCount &&
      lastPayload.loading === payload.loading &&
      lastPayload.recommendationPending === payload.recommendationPending &&
      lastPayload.activationCount === payload.activationCount
    ) {
      return
    }

    lastPayload = payload
    transport.send(CoreBoxEvents.layout.update, payload).catch(() => {})
  }

  function scheduleLayoutUpdate(source: string): void {
    pendingSource = source
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      sendLayoutUpdate(pendingSource ?? 'raf')
      pendingSource = null
    })
  }

  function scheduleSettledLayoutUpdate(source: string): void {
    if (settleTimer) {
      clearTimeout(settleTimer)
    }
    settleTimer = setTimeout(() => {
      settleTimer = null
      scheduleLayoutUpdate(source)
    }, RESULT_LAYOUT_SETTLE_MS)
  }

  onBeforeUnmount(() => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    if (settleTimer) {
      clearTimeout(settleTimer)
      settleTimer = null
    }

    window.removeEventListener('corebox:shown', handleCoreBoxShown)
    window.removeEventListener('corebox:layout-refresh', handleLayoutRefresh)
  })

  onMounted(() => {
    setTimeout(() => {
      scheduleLayoutUpdate('mounted')
    }, 100)

    window.addEventListener('corebox:shown', handleCoreBoxShown)
    window.addEventListener('corebox:layout-refresh', handleLayoutRefresh)
  })

  function handleCoreBoxShown(): void {
    scheduleLayoutUpdate('shown')
  }

  function handleLayoutRefresh(): void {
    scheduleLayoutUpdate('manual')
  }

  watch(
    () => results.value,
    (newResults, oldResults) => {
      if (newResults === oldResults) return
      scheduleLayoutUpdate('results')
      scheduleSettledLayoutUpdate('results:settled')
    },
    { deep: true, flush: 'post' }
  )

  watch(
    () => loading.value,
    (isLoading) => {
      scheduleLayoutUpdate(isLoading ? 'loading:start' : 'loading:end')
    }
  )

  watch(
    () => activeActivations.value,
    (activations) => {
      scheduleLayoutUpdate(activations?.length ? 'activation:on' : 'activation:off')
    }
  )

  if (recommendationPending) {
    watch(
      () => recommendationPending.value,
      () => {
        scheduleLayoutUpdate('recommendation:pending')
      }
    )
  }
}
