import type { ComputedRef, Ref } from 'vue'
import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import { useDebounceFn } from '@vueuse/core'
import { onMounted, watch } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'

interface UseResizeOptions {
  results: ComputedRef<TuffItem[]>
  activeActivations: Ref<IProviderActivate[] | null>
  loading: Ref<boolean>
  recommendationPending?: Ref<boolean>
}

const COLLAPSE_DEBOUNCE_MS = 60
const SCROLLBAR_WIDTH_ESTIMATE = 12
const HEIGHT_SAFETY_PADDING = 10

function sendExpandMax(): void {
  touchChannel.sendSync('core-box:expand', { mode: 'max' })
}

function sendCollapseCommand(): void {
  touchChannel.sendSync('core-box:expand', { mode: 'collapse' })
}

function sendHeight(height: number): void {
  touchChannel.sendSync('core-box:set-height', { height })
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
  
  return Math.min(scrollHeight + headerHeight + footerHeight + extraBuffer + HEIGHT_SAFETY_PADDING, 600)
}

export function useResize(options: UseResizeOptions): void {
  const { results, activeActivations, loading, recommendationPending } = options

  function checkShouldCollapse(): boolean {
    if (activeActivations.value?.length) return false
    if (results.value.length > 0) return false
    if (loading.value) return false
    return !recommendationPending?.value
  }

  const debouncedCollapse = useDebounceFn(() => {
    const shouldCollapse = checkShouldCollapse()
    if (shouldCollapse) {
      sendCollapseCommand()
    }
  }, COLLAPSE_DEBOUNCE_MS)

  function updateHeight(): void {
    if (activeActivations.value?.length) {
      sendExpandMax()
      return
    }

    const resultCount = results.value.length
    if (resultCount === 0) return

    // Measure and send height - backend handles deduplication via its own height check
    requestAnimationFrame(() => {
      const finalHeight = calculateActualHeight()
      if (finalHeight > 60) {
        sendHeight(finalHeight)
      }
    })
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
        if (oldResults && newResults.length === oldResults.length) {
          const newIds = new Set(newResults.map(r => r.id))
          const oldIds = new Set(oldResults.map(r => r.id))
          if ([...newIds].every(id => oldIds.has(id))) return
        }
        updateHeight()
      } else {
        debouncedCollapse()
      }
    },
    { deep: true }
  )

  watch(
    () => loading.value,
    (isLoading) => {
      if (!isLoading) {
        if (results.value.length === 0) {
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
        sendExpandMax()
      } else {
        debouncedCollapse()
      }
    }
  )
}
