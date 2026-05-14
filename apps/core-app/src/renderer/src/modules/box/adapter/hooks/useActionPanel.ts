import type { TuffItem } from '@talex-touch/utils'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import {
  ClipboardEvents,
  CoreBoxEvents,
  CoreBoxRetainedEvents
} from '@talex-touch/utils/transport/events'
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import {
  COREBOX_SCREENSHOT_TRANSLATE_ACTION_ID,
  COREBOX_SCREENSHOT_TRANSLATE_PIN_ACTION_ID,
  coreBoxImageTranslateEvent
} from '../../../../../../shared/events/corebox-scenes'
import { devLog } from '~/utils/dev-log'

interface UseActionPanelOptions {
  openFlowSelector?: (item: TuffItem) => void
  refreshSearch?: () => void
}

export function useActionPanel(options: UseActionPanelOptions = {}) {
  const { openFlowSelector, refreshSearch } = options
  const { t } = useI18n()
  const transport = useTuffTransport()
  const appSdk = useAppSdk()

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
      devLog('[useActionPanel] Failed to toggle pin:', error)
      toast.error(t('corebox.pinFailed', '固定失败'))
    }
  }

  async function executeAction(actionId: string, targetItem: TuffItem): Promise<void> {
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
      case COREBOX_SCREENSHOT_TRANSLATE_ACTION_ID: {
        const response = await transport.send(coreBoxImageTranslateEvent, {
          item: JSON.parse(JSON.stringify(targetItem)),
          targetLang: 'zh'
        })
        if (response?.success) {
          toast.success(t('corebox.imageTranslated', '图片翻译已写入剪贴板'))
        } else {
          toast.error(response?.error || t('corebox.imageTranslateFailed', '图片翻译失败'))
        }
        break
      }
      case COREBOX_SCREENSHOT_TRANSLATE_PIN_ACTION_ID: {
        const response = await transport.send(coreBoxImageTranslateEvent, {
          item: JSON.parse(JSON.stringify(targetItem)),
          targetLang: 'zh',
          openPinWindow: true
        })
        if (response?.success) {
          toast.success(t('corebox.imageTranslatePinned', '图片翻译已置顶'))
        } else {
          toast.error(response?.error || t('corebox.imageTranslateFailed', '图片翻译失败'))
        }
        break
      }
      default:
        devLog('[useActionPanel] Fallback execute for MetaOverlay action:', actionId, targetItem.id)
        try {
          await transport.send(CoreBoxEvents.item.execute, {
            item: JSON.parse(JSON.stringify(targetItem))
          })
        } catch (error) {
          devLog('[useActionPanel] Fallback execute failed:', error)
          toast.error(t('corebox.actionUnsupported', '暂不支持该操作'))
        }
        break
    }
  }

  async function handleAction(actionId: string): Promise<void> {
    const targetItem = item.value
    if (!targetItem) return
    close()
    await executeAction(actionId, targetItem)
  }

  // Channel listener for action panel
  const openActionPanelHandler = (data: { item?: TuffItem }) => {
    if (data?.item) open(data.item)
  }
  let lastMetaOverlayActionKey = ''
  const metaOverlayActionHandler = (data: { actionId?: string; item?: TuffItem }) => {
    if (!data?.item || !data.actionId) return
    const actionKey = `${data.actionId}:${data.item.id ?? ''}:${data.item.source?.id ?? ''}`
    if (actionKey === lastMetaOverlayActionKey) return
    lastMetaOverlayActionKey = actionKey
    queueMicrotask(() => {
      if (lastMetaOverlayActionKey === actionKey) lastMetaOverlayActionKey = ''
    })
    void executeAction(data.actionId, data.item)
  }
  const unregOpen = transport.on(CoreBoxRetainedEvents.actionPanel.open, openActionPanelHandler)
  const unregLegacyOpen = transport.on(
    CoreBoxRetainedEvents.legacy.openActionPanel,
    openActionPanelHandler
  )
  const unregMetaOverlayAction = transport.on(
    CoreBoxRetainedEvents.metaOverlay.itemAction,
    metaOverlayActionHandler
  )
  const unregLegacyMetaOverlayAction = transport.on(
    CoreBoxRetainedEvents.legacy.metaOverlayItemAction,
    metaOverlayActionHandler
  )

  // Window event listener for ⌘K - opens ActionPanel
  function handleTogglePinEvent(event: Event): void {
    devLog('[useActionPanel] ⌘K event received')
    const detail = (event as CustomEvent).detail
    if (detail?.item) {
      devLog('[useActionPanel] opening action panel for item:', detail.item.id)
      open(detail.item)
    }
  }

  onMounted(() => {
    window.addEventListener('corebox:toggle-pin', handleTogglePinEvent)
  })

  onBeforeUnmount(() => {
    unregOpen()
    unregLegacyOpen()
    unregMetaOverlayAction()
    unregLegacyMetaOverlayAction()
    window.removeEventListener('corebox:toggle-pin', handleTogglePinEvent)
  })

  return reactive({ visible, item, isPinned, open, close, handleAction, togglePin })
}
