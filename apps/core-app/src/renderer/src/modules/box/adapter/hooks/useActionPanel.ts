import type { TuffItem } from '@talex-touch/utils'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { ClipboardEvents, CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

interface UseActionPanelOptions {
  openFlowSelector?: (item: TuffItem) => void
  refreshSearch?: () => void
}

export function useActionPanel(options: UseActionPanelOptions = {}) {
  const { openFlowSelector, refreshSearch } = options
  const { t } = useI18n()
  const transport = useTuffTransport()
  const appSdk = useAppSdk()
  const openActionPanelEvent = defineRawEvent<{ item?: TuffItem }, void>(
    'corebox:open-action-panel'
  )

  const visible = ref(false)
  const item = ref<TuffItem | null>(null)
  const isPinned = ref(false)

  function open(targetItem: TuffItem): void {
    item.value = targetItem
    isPinned.value = Boolean(targetItem.meta?.pinned?.isPinned)
    visible.value = true
  }

  function close(): void {
    visible.value = false
    item.value = null
  }

  async function togglePin(targetItem: TuffItem): Promise<void> {
    try {
      const response = await transport.send(CoreBoxEvents.item.togglePin, {
        sourceId: targetItem.source.id,
        itemId: targetItem.id,
        sourceType: targetItem.source.type
      })
      if (response?.success) {
        const pinned = response.isPinned
        toast.success(pinned ? t('corebox.pinned', '已固定') : t('corebox.unpinned', '已取消固定'))
        if (targetItem.meta) {
          targetItem.meta.pinned = pinned ? { isPinned: true, pinnedAt: Date.now() } : undefined
        }
        // Refresh search results to reflect pin state change
        refreshSearch?.()
      } else {
        throw new Error(response?.error || 'Failed')
      }
    } catch (error) {
      console.error('[useActionPanel] Failed to toggle pin:', error)
      toast.error(t('corebox.pinFailed', '固定失败'))
    }
  }

  async function handleAction(actionId: string): Promise<void> {
    const targetItem = item.value
    if (!targetItem) return
    close()

    switch (actionId) {
      case 'toggle-pin':
        await togglePin(targetItem)
        break
      case 'copy-title':
        if (targetItem.render?.basic?.title) {
          await transport.send(ClipboardEvents.write, {
            type: 'text',
            value: targetItem.render.basic.title
          })
          toast.success(t('corebox.copied', '已复制'))
        }
        break
      case 'reveal-in-finder': {
        const path = targetItem.meta?.app?.path || targetItem.meta?.file?.path
        if (path) await appSdk.showInFolder(path)
        break
      }
      case 'flow-transfer':
        if (openFlowSelector) openFlowSelector(targetItem)
        break
    }
  }

  // Channel listener for action panel
  const unregOpen = transport.on(openActionPanelEvent, (data) => {
    if (data?.item) open(data.item)
  })

  // Window event listener for ⌘K - opens ActionPanel
  function handleTogglePinEvent(event: Event): void {
    console.log('[useActionPanel] ⌘K event received')
    const detail = (event as CustomEvent).detail
    if (detail?.item) {
      console.log('[useActionPanel] opening action panel for item:', detail.item.id)
      open(detail.item)
    }
  }

  onMounted(() => {
    window.addEventListener('corebox:toggle-pin', handleTogglePinEvent)
  })

  onBeforeUnmount(() => {
    unregOpen()
    window.removeEventListener('corebox:toggle-pin', handleTogglePinEvent)
  })

  return reactive({ visible, item, isPinned, open, close, handleAction, togglePin })
}
