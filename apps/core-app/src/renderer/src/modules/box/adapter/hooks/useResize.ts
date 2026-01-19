import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import type { CoreBoxLayoutUpdateRequest } from '@talex-touch/utils/transport/events/types'
import type { ComputedRef, Ref } from 'vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { appSetting } from '~/modules/channel/storage'

interface UseResizeOptions {
  results: ComputedRef<TuffItem[]>
  activeActivations: Ref<IProviderActivate[] | null>
  loading: Ref<boolean>
  recommendationPending?: Ref<boolean>
}

const SCROLLBAR_WIDTH_ESTIMATE = 12
const HEIGHT_SAFETY_PADDING = 10
const HEADER_HEIGHT = 60
const MIN_HEIGHT = 60
const MAX_HEIGHT = 600

function clampHeight(height: number): number {
  return Math.max(MIN_HEIGHT, Math.min(height, MAX_HEIGHT))
}

function calculateDesiredHeight(resultCount: number): number {
  if (resultCount === 0) return MIN_HEIGHT

  const scrollRoot = document.querySelector('.CoreBoxRes-Main .touch-scroll')
  if (!scrollRoot) return MIN_HEIGHT

  const nativeWrap = scrollRoot.querySelector(
    '.native-scroll-wrapper, .tx-scroll__native'
  ) as HTMLElement | null
  const legacyElWrap = scrollRoot.querySelector(
    '.el-scroll-wrapper .el-scrollbar__wrap'
  ) as HTMLElement | null
  const txWrapper = scrollRoot.querySelector('.tx-scroll__wrapper') as HTMLElement | null
  const txContent = scrollRoot.querySelector('.tx-scroll__content') as HTMLElement | null
  const wrap = nativeWrap ?? legacyElWrap ?? txWrapper ?? txContent
  if (!wrap) return MIN_HEIGHT

  const scrollHeight = txContent?.scrollHeight ?? wrap.scrollHeight
  const clientHeight = wrap.clientHeight
  const extraBuffer = scrollHeight > clientHeight ? SCROLLBAR_WIDTH_ESTIMATE : 0

  return clampHeight(scrollHeight + HEADER_HEIGHT + extraBuffer + HEIGHT_SAFETY_PADDING)
}

export function useResize(options: UseResizeOptions): void {
  const { results, activeActivations, loading, recommendationPending } = options
  const transport = useTuffTransport()

  let lastPayload: CoreBoxLayoutUpdateRequest | null = null
  let rafId = 0
  let pendingSource: string | null = null

  function sendLayoutUpdate(source: string): void {
    const activationCount = activeActivations.value?.length ?? 0
    const resultCount = results.value.length
    const isLoading = loading.value
    const recommendationEnabled = appSetting.recommendation?.enabled !== false
    const isRecommendationPending = recommendationEnabled
      ? (recommendationPending?.value ?? false)
      : false

    const height = calculateDesiredHeight(resultCount)

    const payload: CoreBoxLayoutUpdateRequest = {
      height,
      resultCount,
      loading: isLoading,
      recommendationPending: isRecommendationPending,
      activationCount,
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

  onBeforeUnmount(() => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
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
    },
    { deep: true }
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
