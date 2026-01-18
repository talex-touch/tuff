import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

export interface CalculationHistoryEntry {
  id?: string | number
  content: string
  timestamp?: string
  meta?: {
    expression?: string
    payload?: { title?: string; primaryValue?: string }
    abilityId?: string
    [key: string]: any
  }
}

interface UsePreviewHistoryOptions {
  searchVal: Ref<string>
  focusInput: () => void
  panelRef?: Ref<{ $el?: HTMLElement } | null>
}

export function usePreviewHistory(options: UsePreviewHistoryOptions) {
  const { searchVal, focusInput, panelRef } = options
  const transport = useTuffTransport()
  const coreboxShowHistoryEvent = defineRawEvent<void, void>('corebox:show-history')
  const coreboxHideHistoryEvent = defineRawEvent<void, void>('corebox:hide-history')
  const coreboxCopyPreviewEvent = defineRawEvent<{ value?: string }, void>('corebox:copy-preview')
  const clipboardQueryEvent = defineRawEvent<
    { category?: string; limit?: number },
    { data?: CalculationHistoryEntry[] } | CalculationHistoryEntry[]
  >('clipboard:query')
  const clipboardNewItemEvent = defineRawEvent<CalculationHistoryEntry, void>('clipboard:new-item')
  const clipboardWriteTextEvent = defineRawEvent<{ text: string }, void>('clipboard:write-text')

  const activeIndex = ref(-1)
  const visible = ref(false)
  const loading = ref(false)
  const items = ref<CalculationHistoryEntry[]>([])

  function ensureSelection(preferStart = false): void {
    if (!visible.value || !items.value.length) {
      activeIndex.value = -1
      return
    }
    if (preferStart || activeIndex.value < 0) {
      activeIndex.value = 0
      return
    }
    if (activeIndex.value > items.value.length - 1) {
      activeIndex.value = items.value.length - 1
    }
  }

  watch(
    visible,
    (val) => {
      window.__coreboxHistoryVisible = val
      if (!val) activeIndex.value = -1
      else ensureSelection(true)
    },
    { immediate: true }
  )

  watch(
    () => items.value.length,
    () => ensureSelection()
  )

  async function load(): Promise<void> {
    loading.value = true
    try {
      const response = await transport.send(clipboardQueryEvent, {
        category: 'preview',
        limit: 20
      })
      console.log('[usePreviewHistory] Query response:', response)
      items.value = Array.isArray(response) ? response : (response?.data ?? [])
      console.log('[usePreviewHistory] Loaded items:', items.value.length)
      ensureSelection()
    } catch (error) {
      console.error('[usePreviewHistory] Failed to load:', error)
      toast.error('加载最近处理失败')
    } finally {
      loading.value = false
    }
  }

  function open(): void {
    console.log('[usePreviewHistory] open() called, visible before:', visible.value)
    if (!visible.value) visible.value = true
    console.log('[usePreviewHistory] open() visible after:', visible.value)
    void load()
  }

  function close(opts?: { focusInput?: boolean }): void {
    if (!visible.value) return
    visible.value = false
    activeIndex.value = -1
    if (opts?.focusInput ?? true) focusInput()
  }

  function apply(entry: CalculationHistoryEntry): void {
    const expression = entry.meta?.expression ?? entry.meta?.payload?.title ?? entry.content ?? ''
    if (!expression) return
    searchVal.value = expression
    close({ focusInput: false })
    focusInput()
  }

  function applySelection(): void {
    const entry = items.value[activeIndex.value]
    if (entry) apply(entry)
  }

  function isClickInside(target: EventTarget | null): boolean {
    const el = panelRef?.value?.$el
    return !!(el && target instanceof Node && el.contains(target))
  }

  function handleMouseDown(event: MouseEvent): void {
    if (event.button !== 0 || !visible.value) return
    if (!document.body.classList.contains('core-box')) return
    if (isClickInside(event.target)) return
    close()
  }

  function handleKeydown(event: KeyboardEvent): void {
    // Debug: log ⌘← events
    if (event.metaKey && event.key === 'ArrowLeft') {
      console.log(
        '[usePreviewHistory] handleKeydown ⌘←, visible:',
        visible.value,
        'hasClass:',
        document.body.classList.contains('core-box')
      )
    }
    if (!visible.value || !document.body.classList.contains('core-box')) return
    const key = event.key
    if (key === 'Escape') {
      close()
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (key === 'ArrowDown' && items.value.length) {
      activeIndex.value =
        activeIndex.value < 0 ? 0 : Math.min(activeIndex.value + 1, items.value.length - 1)
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (key === 'ArrowUp' && items.value.length) {
      activeIndex.value =
        activeIndex.value < 0 ? items.value.length - 1 : Math.max(activeIndex.value - 1, 0)
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (key === 'Enter' && activeIndex.value >= 0) {
      applySelection()
      event.preventDefault()
      event.stopPropagation()
    }
  }

  function handleContextMenu(event: MouseEvent): void {
    if (!document.body.classList.contains('core-box')) return
    if (visible.value) return
    event.preventDefault()
    open()
  }

  // Channel listeners
  const unregShow = transport.on(coreboxShowHistoryEvent, () => open())
  const unregHide = transport.on(coreboxHideHistoryEvent, () => close())
  const unregCopy = transport.on(coreboxCopyPreviewEvent, async (payload) => {
    if (!payload?.value) return
    try {
      await transport.send(clipboardWriteTextEvent, { text: payload.value })
      toast.success('结果已复制')
    } catch {
      toast.error('复制失败')
    }
  })

  const unregNewItem = transport.on(clipboardNewItemEvent, (data) => {
    if (!data?.meta?.category) return
    if (data.meta.category === 'preview') {
      console.log('[usePreviewHistory] New preview item detected, refreshing if visible')
      if (visible.value) {
        void load()
      }
    }
  })

  // Window event listeners for show/hide history (from keyboard shortcuts and PreviewResultCard)
  function handleShowHistoryEvent(): void {
    console.log('[usePreviewHistory] show-calculation-history event received, calling open()')
    open()
  }
  function handleHideHistoryEvent(): void {
    console.log('[usePreviewHistory] hide-calculation-history event received, calling close()')
    close()
  }

  onMounted(() => {
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeydown, true)
    window.addEventListener('corebox:show-calculation-history', handleShowHistoryEvent)
    window.addEventListener('corebox:hide-calculation-history', handleHideHistoryEvent)
  })

  onBeforeUnmount(() => {
    unregShow()
    unregHide()
    unregCopy()
    unregNewItem()
    window.removeEventListener('mousedown', handleMouseDown)
    window.removeEventListener('keydown', handleKeydown, true)
    window.removeEventListener('corebox:show-calculation-history', handleShowHistoryEvent)
    window.removeEventListener('corebox:hide-calculation-history', handleHideHistoryEvent)
  })

  return reactive({
    visible,
    loading,
    items,
    activeIndex,
    open,
    close,
    apply,
    handleContextMenu
  })
}
