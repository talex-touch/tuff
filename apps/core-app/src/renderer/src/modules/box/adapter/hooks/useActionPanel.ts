import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import type { CoreBoxMetaActionEventDetail } from '../../meta-actions/meta-action-model'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { ClipboardEvents, CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { showCoreBoxFooterFeedback } from '../../meta-actions/footer-feedback'
import { COREBOX_META_ACTION_EVENT } from '../../meta-actions/meta-action-model'
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
import { createRendererLogger } from '~/utils/renderer-log'

const actionPanelLog = createRendererLogger('CoreBoxActionPanel')

/** A stable code the failure carries, such as a permission denial's; never its message. */
function resolveErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null | undefined)?.code
  return typeof code === 'string' ? code : undefined
}

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
        showCoreBoxFooterFeedback(
          pinned ? t('corebox.pinned', '已固定') : t('corebox.unpinned', '已取消固定')
        )
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
      showCoreBoxFooterFeedback(t('corebox.pinFailed', '固定失败'), 'error')
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
      const result = await transport.send(ClipboardEvents.apply, { id: recordId, autoPaste })
      if (result?.success === false) {
        showCoreBoxFooterFeedback(
          result.message || t('corebox.actionUnsupported', '暂不支持该操作'),
          'error'
        )
        return true
      }
      if (!autoPaste) {
        showCoreBoxFooterFeedback(t('corebox.copied', '已复制'))
      }
    } catch (error) {
      devLog('[useActionPanel] Clipboard apply failed:', error)
      showCoreBoxFooterFeedback(t('corebox.actionUnsupported', '暂不支持该操作'), 'error')
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
          showCoreBoxFooterFeedback(t('corebox.copied', '已复制'))
        }
        break
      case 'reveal-in-finder': {
        const path = targetItem.meta?.app?.path || targetItem.meta?.file?.path
        // Select it, never open it: opening a directory would launch an .app or open a folder.
        if (path) await appSdk.showInFolder(path, { reveal: true })
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
          showCoreBoxFooterFeedback(t('corebox.imageTranslated', '图片翻译已写入剪贴板'))
        } else {
          showCoreBoxFooterFeedback(
            response?.error || t('corebox.imageTranslateFailed', '图片翻译失败'),
            'error'
          )
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
          showCoreBoxFooterFeedback(t('corebox.imageTranslatePinned', '图片翻译已置顶'))
        } else {
          showCoreBoxFooterFeedback(
            response?.error || t('corebox.imageTranslateFailed', '图片翻译失败'),
            'error'
          )
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
            showCoreBoxFooterFeedback(t('corebox.copied', '已复制'))
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
          showCoreBoxFooterFeedback(t('corebox.actionUnsupported', '暂不支持该操作'), 'error')
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

  /**
   * Runs an action nothing awaits: one chosen in the ⌘K panel (relayed by main) or a result-list
   * shortcut. A failure the action does not report itself would otherwise surface as an unhandled
   * rejection with nothing on screen, so it is logged and the footer says the action failed.
   */
  function runUnawaitedAction(actionId: string, targetItem: TuffItem): void {
    void executeAction(actionId, targetItem).catch((error: unknown) => {
      // The action id and a projected code only: a raw error can carry the item's path.
      actionPanelLog.error('Action failed', { actionId, code: resolveErrorCode(error) })
      showCoreBoxFooterFeedback(t('corebox.actions.failed', '操作失败'), 'error')
    })
  }

  // MetaOverlay (⌘K) routes built-in and item actions back to the CoreBox
  // renderer through this channel.
  const metaOverlayActionHandler = (data: { actionId?: string; item?: TuffItem }) => {
    if (!data?.item || !data.actionId) return
    runUnawaitedAction(data.actionId, data.item)
  }
  const unregMetaOverlayAction = transport.on(
    CoreBoxEvents.metaOverlay.itemAction,
    metaOverlayActionHandler
  )

  // The same actions, from a shortcut pressed in the result list with the panel closed.
  const resultListActionHandler = (event: Event): void => {
    const detail = (event as CustomEvent<CoreBoxMetaActionEventDetail>).detail
    if (!detail?.item || !detail.actionId) return
    runUnawaitedAction(detail.actionId, detail.item)
  }
  window.addEventListener(COREBOX_META_ACTION_EVENT, resultListActionHandler)

  onBeforeUnmount(() => {
    unregMetaOverlayAction()
    window.removeEventListener(COREBOX_META_ACTION_EVENT, resultListActionHandler)
  })

  return {
    executeAction
  }
}
