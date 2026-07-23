import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { ClipboardEvents, CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import {
  COREBOX_PRIMARY_ACTION_ID,
  COREBOX_SCREENSHOT_TRANSLATE_ACTION_ID,
  COREBOX_SCREENSHOT_TRANSLATE_PIN_ACTION_ID,
  coreBoxImageTranslateEvent
} from '../../../../../../shared/events/corebox-scenes'
import {
  CLIPBOARD_HISTORY_SOURCE_ID,
  resolveClipboardHistoryRecordId
} from './clipboard-history-item'
import { devLog } from '~/utils/dev-log'

function getActionPayloadString(payload: unknown, key: string): string {
  if (!payload || typeof payload !== 'object') return ''
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

function getItemOpenTarget(targetItem: TuffItem): string {
  return (
    targetItem.meta?.app?.path || targetItem.meta?.file?.path || targetItem.meta?.web?.url || ''
  )
}

interface UseActionPanelOptions {
  openFlowSelector?: (item: TuffItem) => void
  refreshSearch?: () => void
  navigate?: (path: string) => void
  onActivationState?: (activations: IProviderActivate[] | null) => void
  /**
   * Runs the item's primary action — the same path as pressing Enter on the
   * item in the main list. Wired to `handleExecute` by the CoreBox view so the
   * MetaOverlay (⌘K) Enter target stays consistent with the main list.
   */
  onPrimaryExecute?: (item: TuffItem) => void | Promise<void>
}

export function useActionPanel(options: UseActionPanelOptions = {}) {
  const { openFlowSelector, refreshSearch, navigate, onActivationState, onPrimaryExecute } = options
  const { t } = useI18n()
  const transport = useTuffTransport()
  const appSdk = useAppSdk()

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

  /**
   * Routes a clipboard-history item through the clipboard apply pipeline.
   * `autoPaste` true pastes into the active app (Enter/Paste); false only
   * writes to the system clipboard (Copy). Correctly handles text/image/files
   * unlike the generic copy-title fallback.
   */
  async function applyClipboardHistoryItem(
    targetItem: TuffItem,
    autoPaste: boolean
  ): Promise<boolean> {
    const recordId = resolveClipboardHistoryRecordId(targetItem)
    if (recordId == null) return false

    try {
      await transport.send(ClipboardEvents.apply, { id: recordId, autoPaste })
      if (!autoPaste) {
        toast.success(t('corebox.copied', '已复制'))
      }
    } catch (error) {
      devLog('[useActionPanel] Clipboard apply failed:', error)
      toast.error(t('corebox.actionUnsupported', '暂不支持该操作'))
    }
    return true
  }

  async function executeAction(actionId: string, targetItem: TuffItem): Promise<void> {
    // Primary action mirrors pressing Enter on the item in the main list.
    if (actionId === COREBOX_PRIMARY_ACTION_ID) {
      await onPrimaryExecute?.(targetItem)
      return
    }

    const itemAction = targetItem.actions?.find((action) => action.id === actionId)

    // Clipboard-history items have no execute provider; route their paste/copy
    // actions through the clipboard apply pipeline instead.
    if (
      targetItem.source?.id === CLIPBOARD_HISTORY_SOURCE_ID &&
      (itemAction?.type === 'copy' || itemAction?.type === 'execute')
    ) {
      const handled = await applyClipboardHistoryItem(targetItem, itemAction.type !== 'copy')
      if (handled) return
    }

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
        if (itemAction?.type === 'navigate') {
          const path = getActionPayloadString(itemAction.payload, 'path')
          if (path) {
            navigate?.(path)
            return
          }
        }
        if (itemAction?.type === 'copy') {
          const value =
            getActionPayloadString(itemAction.payload, 'value') ||
            getActionPayloadString(itemAction.payload, 'text') ||
            targetItem.render?.basic?.title ||
            ''
          if (value) {
            await transport.send(ClipboardEvents.write, {
              type: 'text',
              value
            })
            toast.success(t('corebox.copied', '已复制'))
            return
          }
        }
        if (itemAction?.type === 'open') {
          const target =
            getActionPayloadString(itemAction.payload, 'path') ||
            getActionPayloadString(itemAction.payload, 'url') ||
            getItemOpenTarget(targetItem)
          if (target) {
            if (/^https?:\/\//i.test(target)) {
              await appSdk.openExternal(target)
            } else if (targetItem.kind === 'app') {
              await appSdk.openApp({ path: target })
            } else {
              await appSdk.showInFolder(target)
            }
            return
          }
        }
        if (itemAction?.type === 'execute') {
          const activationState = await transport.send(CoreBoxEvents.item.execute, {
            item: JSON.parse(JSON.stringify(targetItem)),
            actionId
          })
          applyActivationState(activationState)
          return
        }
        devLog('[useActionPanel] Fallback execute for MetaOverlay action:', actionId, targetItem.id)
        try {
          const activationState = await transport.send(CoreBoxEvents.item.execute, {
            item: JSON.parse(JSON.stringify(targetItem)),
            actionId
          })
          applyActivationState(activationState)
        } catch (error) {
          devLog('[useActionPanel] Fallback execute failed:', error)
          toast.error(t('corebox.actionUnsupported', '暂不支持该操作'))
        }
        break
    }
  }

  function applyActivationState(state: unknown): void {
    if (!onActivationState) return
    onActivationState(normalizeActivationState(state))
  }

  function normalizeActivationState(state: unknown): IProviderActivate[] | null {
    if (!state) return null
    if (Array.isArray(state)) return state.length > 0 ? (state as IProviderActivate[]) : null
    if (typeof state !== 'object') return null

    const activeProviders = (state as { activeProviders?: unknown }).activeProviders
    if (!Array.isArray(activeProviders) || activeProviders.length === 0) return null

    const activations = activeProviders
      .map<IProviderActivate | null>((provider) => {
        if (
          provider &&
          typeof provider === 'object' &&
          typeof (provider as { id?: unknown }).id === 'string'
        ) {
          return provider as IProviderActivate
        }

        if (typeof provider !== 'string' || provider.length === 0) {
          return null
        }

        if (provider.startsWith('plugin-features:')) {
          const pluginName = provider.slice('plugin-features:'.length)
          return {
            id: 'plugin-features',
            meta: pluginName ? { pluginName } : undefined
          }
        }
        return { id: provider }
      })
      .filter((activation): activation is IProviderActivate => Boolean(activation))

    return activations.length > 0 ? activations : null
  }

  // MetaOverlay (⌘K) routes built-in and item actions back to the CoreBox
  // renderer through this channel.
  const metaOverlayActionHandler = (data: { actionId?: string; item?: TuffItem }) => {
    if (!data?.item || !data.actionId) return
    void executeAction(data.actionId, data.item)
  }
  const unregMetaOverlayAction = transport.on(
    CoreBoxEvents.metaOverlay.itemAction,
    metaOverlayActionHandler
  )

  onBeforeUnmount(() => {
    unregMetaOverlayAction()
  })

  return {
    executeAction
  }
}
