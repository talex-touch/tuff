import type { ComputedRef, Ref } from 'vue'
import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import { useDebounceFn } from '@vueuse/core'
import { nextTick, onMounted, watch } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'

interface UseResizeOptions {
  results: ComputedRef<TuffItem[]>
  activeActivations: Ref<IProviderActivate[] | null>
  loading: Ref<boolean>
  recommendationPending?: Ref<boolean>
}

const COLLAPSE_DEBOUNCE_MS = 60
const HEIGHT_UPDATE_DEBOUNCE_MS = 40
const ITEM_ANIMATION_BASE_MS = 300
const STAGGER_DELAY_PER_ITEM_MS = 55
const MAX_ANIMATION_WAIT_MS = 500
const SCROLLBAR_WIDTH_ESTIMATE = 12

function sendExpandCommand(length: number, forceMax: boolean = false): void {
  if (forceMax) {
    touchChannel.sendSync('core-box:expand', { mode: 'max' })
  } else {
    touchChannel.sendSync('core-box:expand', { length })
  }
}

function sendCollapseCommand(): void {
  touchChannel.sendSync('core-box:expand', { mode: 'collapse' })
}

function calculateActualHeight(): number {
  const scrollRoot = document.querySelector('.CoreBoxRes-Main .touch-scroll')
  if (!scrollRoot) return 0

  const nativeWrap = scrollRoot.querySelector('.native-scroll-wrapper') as HTMLElement | null
  const elWrap = scrollRoot.querySelector('.el-scroll-wrapper .el-scrollbar__wrap') as HTMLElement | null
  const wrap = nativeWrap ?? elWrap
  if (!wrap) return 0

  const scrollHeight = wrap.scrollHeight
  const clientHeight = wrap.clientHeight
  const headerHeight = 60
  const footerHeight = 44
  const extraBuffer = scrollHeight > clientHeight ? SCROLLBAR_WIDTH_ESTIMATE : 0
  
  return Math.min(scrollHeight + headerHeight + footerHeight + extraBuffer, 600)
}

function calculateAnimationWaitTime(itemCount: number): number {
  if (itemCount <= 0) return 0
  const totalStaggerDelay = Math.min(itemCount, 12) * STAGGER_DELAY_PER_ITEM_MS
  return Math.min(ITEM_ANIMATION_BASE_MS + totalStaggerDelay, MAX_ANIMATION_WAIT_MS)
}

export function useResize(options: UseResizeOptions): void {
  const { results, activeActivations, loading, recommendationPending } = options

  let animationHeightTimer: ReturnType<typeof setTimeout> | null = null
  let lastHeightUpdate = 0

  function clearAnimationTimer(): void {
    if (animationHeightTimer) {
      clearTimeout(animationHeightTimer)
      animationHeightTimer = null
    }
  }

  function checkShouldCollapse(): boolean {
    if (activeActivations.value?.length) return false
    if (results.value.length > 0) return false
    if (loading.value) return false
    return !recommendationPending?.value
  }

  const debouncedCollapse = useDebounceFn(() => {
    if (checkShouldCollapse()) {
      sendCollapseCommand()
    }
  }, COLLAPSE_DEBOUNCE_MS)

  const debouncedSetHeight = useDebounceFn((height: number) => {
    if (height === lastHeightUpdate) return
    lastHeightUpdate = height
    touchChannel.sendSync('core-box:set-height', { height })
  }, HEIGHT_UPDATE_DEBOUNCE_MS)

  function updateHeight(): void {
    if (activeActivations.value?.length) {
      sendExpandCommand(0, true)
      return
    }

    const resultCount = results.value.length
    if (resultCount === 0) return

    clearAnimationTimer()

    // Fast path: expand by count immediately so window does not stay short.
    sendExpandCommand(resultCount)

    // Single unified height update after animation completes
    const animationWaitTime = calculateAnimationWaitTime(resultCount)
    animationHeightTimer = setTimeout(() => {
      nextTick(() => {
        const finalHeight = calculateActualHeight()
        if (finalHeight > 60) {
          debouncedSetHeight(finalHeight)
        } else {
          sendExpandCommand(resultCount)
        }
        animationHeightTimer = null
      })
    }, animationWaitTime)
  }

  onMounted(() => {
    setTimeout(() => {
      if (checkShouldCollapse()) sendCollapseCommand()
    }, 100)
  })

  watch(
    () => results.value,
    (newResults, oldResults) => {
      if (newResults.length > 0) {
        // Skip update if only order changed but same items
        if (oldResults && newResults.length === oldResults.length) {
          const newIds = new Set(newResults.map(r => r.id))
          const oldIds = new Set(oldResults.map(r => r.id))
          if ([...newIds].every(id => oldIds.has(id))) return
        }
        updateHeight()
      } else {
        clearAnimationTimer()
        sendCollapseCommand()
      }
    },
    { deep: true }
  )

  watch(
    () => loading.value,
    (isLoading) => {
      if (!isLoading) {
        if (results.value.length === 0) {
          clearAnimationTimer()
          sendCollapseCommand()
        } else {
          debouncedCollapse()
        }
      }
    }
  )

  watch(
    () => activeActivations.value,
    (activations) => {
      if (activations?.length) {
        sendExpandCommand(0, true)
      } else {
        debouncedCollapse()
      }
    }
  )
}
