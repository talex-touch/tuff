import type {
  DivisionBoxConfig,
  FlowTargetInfo,
  IProviderActivate,
  ITuffIcon,
  TuffItem
} from '@talex-touch/utils'
import type { MetaFlowSelection } from '@talex-touch/utils/transport/events/types/meta-overlay'
import type { ComputedRef, Ref } from 'vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents, DivisionBoxEvents, FlowEvents } from '@talex-touch/utils/transport/events'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { onBeforeUnmount, onMounted, reactive, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { createRendererLogger } from '../../../../utils/renderer-log'
import {
  buildCoreBoxFlowPayload,
  resolveCoreBoxFlowActorPluginId,
  resolveFeaturePluginId
} from '../../meta-actions/core-box-flow-payload'
import { showCoreBoxFooterFeedback } from '../../meta-actions/footer-feedback'
import { buildCoreBoxMetaShowRequest, isCoreBoxFooterShown } from './useKeyboard'

export {
  buildCoreBoxFlowPayload,
  resolveCoreBoxFlowActorPluginId
} from '../../meta-actions/core-box-flow-payload'

const DETACHED_PAYLOAD_STATE_KEY = 'detachedPayload'
const COREBOX_HEADER_HEIGHT = 56
const detachLog = createRendererLogger('useDetach')

interface UseDetachOptions {
  searchVal: Ref<string>
  res: Ref<TuffItem[]>
  boxOptions: { focus: number; data?: unknown }
  isUIMode: ComputedRef<boolean>
  activeActivations: ComputedRef<IProviderActivate[] | undefined>
  deactivateProvider: (id?: string) => Promise<void>
}

interface DetachedFeatureInteraction {
  type?: 'widget' | 'webcontent' | 'index'
  path?: string
  showInput?: boolean
}

function resolveIcon(item: TuffItem): string | ITuffIcon | undefined {
  const icon = item.render?.basic?.icon
  if (!icon) return undefined
  if (typeof icon === 'string') return { type: 'class', value: icon }
  if (typeof icon === 'object' && 'value' in icon) return icon
  return undefined
}

function buildDetachedFeatureUrl(item: TuffItem, query: string, pluginId: string): string {
  const params = new URLSearchParams({
    itemId: item.id,
    query: query || '',
    source: pluginId,
    providerSource: item.source?.id || ''
  })
  return `tuff://detached?${params.toString()}`
}

function buildDetachedPayload(item: TuffItem, query: string): { item: TuffItem; query: string } {
  return {
    item: JSON.parse(JSON.stringify(item)) as TuffItem,
    query
  }
}

function resolveDetachedContentBounds(
  bounds?: { x: number; y: number; width: number; height: number } | null
): DivisionBoxConfig['initialBounds'] | undefined {
  if (!bounds) return undefined
  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return undefined

  return {
    width: bounds.width,
    height: Math.max(0, bounds.height - COREBOX_HEADER_HEIGHT)
  }
}

export function buildDetachedFeatureConfig(
  item: TuffItem,
  query: string,
  sourceBounds?: { x: number; y: number; width: number; height: number } | null
): { config: DivisionBoxConfig; isWidget: boolean } | null {
  const interaction = item.meta?.interaction as DetachedFeatureInteraction | undefined
  const showInput =
    typeof interaction?.showInput === 'boolean'
      ? interaction.showInput
      : interaction?.type !== 'widget'
  const pluginId = resolveFeaturePluginId(item)
  if (!pluginId) {
    return null
  }

  const isWidget = interaction?.type === 'widget'
  const path =
    interaction?.type === 'webcontent' && interaction.path ? interaction.path : 'index.html'
  const initialState = isWidget
    ? { [DETACHED_PAYLOAD_STATE_KEY]: buildDetachedPayload(item, query) }
    : undefined

  return {
    isWidget,
    config: {
      url: isWidget
        ? buildDetachedFeatureUrl(item, query, pluginId)
        : `plugin://${pluginId}/${path}`,
      title: item.render?.basic?.title || 'Detached Item',
      icon: resolveIcon(item),
      size: 'medium',
      keepAlive: true,
      pluginId,
      ui: { showInput, initialInput: showInput ? query : '' },
      initialBounds: resolveDetachedContentBounds(sourceBounds),
      initialState
    }
  }
}

function getFlowPermissionMessage(
  error: { message?: string; code?: string; permissionId?: string } | undefined,
  t: ReturnType<typeof useI18n>['t']
): string | null {
  if (!error) {
    return null
  }
  const code = typeof error.code === 'string' ? error.code : ''
  if (code !== 'PERMISSION_DENIED') {
    return null
  }
  const permissionId = typeof error.permissionId === 'string' ? error.permissionId : ''
  // The catalogs' one missing-permission string sits under the setup page's namespace; a key
  // neither locale has would print itself in the footer.
  if (!permissionId) {
    return t('setupPermissions.requiredPermission', { permission: 'storage.shared' })
  }
  return t('setupPermissions.requiredPermission', { permission: permissionId })
}

function getActiveFeature(
  activations: IProviderActivate[] | undefined,
  boxData?: unknown
): TuffItem | null {
  const feature = activations?.find((activation) => activation?.id === 'plugin-features')?.meta
    ?.feature
  if (feature && typeof feature === 'object') {
    return (feature as TuffItem).source?.type === 'plugin' ? (feature as TuffItem) : null
  }

  const cachedFeature =
    boxData && typeof boxData === 'object' ? (boxData as { feature?: unknown }).feature : null
  if (!cachedFeature || typeof cachedFeature !== 'object') {
    return null
  }
  const item = cachedFeature as TuffItem
  return item.source?.type === 'plugin' ? item : null
}

export function useDetach(options: UseDetachOptions) {
  const { searchVal, res, boxOptions, isUIMode, activeActivations, deactivateProvider } = options
  const { t } = useI18n()
  const transport = useTuffTransport()

  async function getCurrentCoreBoxBounds(): Promise<{
    x: number
    y: number
    width: number
    height: number
  } | null> {
    try {
      const response = await transport.send(CoreBoxEvents.layout.getBounds)
      const bounds = response?.bounds
      if (
        bounds &&
        typeof bounds.x === 'number' &&
        typeof bounds.y === 'number' &&
        typeof bounds.width === 'number' &&
        typeof bounds.height === 'number'
      ) {
        return bounds
      }
    } catch (error) {
      detachLog.warn('Failed to read CoreBox bounds before detach:', error)
    }
    return null
  }

  async function detachFeature(item: TuffItem): Promise<void> {
    try {
      const detached = buildDetachedFeatureConfig(
        item,
        searchVal.value,
        await getCurrentCoreBoxBounds()
      )
      if (!detached) {
        return
      }
      const response = await transport.send(DivisionBoxEvents.open, detached.config)
      if (response?.success) {
        const sessionId = response.data?.sessionId
        if (sessionId && detached.isWidget) {
          const detachedPayload = detached.config.initialState?.[DETACHED_PAYLOAD_STATE_KEY]
          await transport
            .send(DivisionBoxEvents.updateState, {
              sessionId,
              key: DETACHED_PAYLOAD_STATE_KEY,
              value: detachedPayload
            })
            .catch((error) => {
              detachLog.warn('Failed to persist widget payload:', error)
            })
        }
        toast.success(t('corebox.detached', '已分离到独立窗口'))
      } else {
        throw new Error(response?.error?.message || 'Failed')
      }
    } catch (error) {
      detachLog.error('Failed:', error)
      toast.error(t('corebox.detachFailed', '分离失败'))
    }
  }

  async function detachUIMode(activation: IProviderActivate): Promise<void> {
    try {
      const response = await transport.send(CoreBoxEvents.uiMode.detach, {
        initialInput: searchVal.value
      })
      if (response?.success) {
        await deactivateProvider(activation.id).catch((error) => {
          detachLog.warn('Detached UI view, but failed to deactivate provider:', error)
        })
        toast.success(t('corebox.detached', '已分离到独立窗口'))
      } else {
        throw new Error(response?.error?.message || 'Failed')
      }
    } catch (error) {
      detachLog.error('Failed:', error)
      toast.error(t('corebox.detachFailed', '分离失败'))
    }
  }

  /**
   * Opens the ⌘K card straight on its Flow page for the item (⌘⇧D, or the shortcut a plugin view
   * forwards). The card is drawn by the overlay view main keeps above the plugin view, so a transfer
   * started in plugin UI mode is seen as well. The targets are fetched first: main then grows the
   * window once, to the height they need. A failed fetch opens the page on none.
   *
   * Not from a DivisionBox, which has no ⌘K card: main hangs the overlay on the CoreBox window
   * alone, so the card would open there — whenever CoreBox is up — for the DivisionBox's item.
   */
  async function openFlowPanel(item: TuffItem): Promise<void> {
    if (document.body.classList.contains('division-box')) return

    // `toRaw`: an item taken from an activation, the box data or the results is a Proxy, which the
    // structured clone on the way to main rejects.
    const raw = toRaw(item)
    let flowTargets: FlowTargetInfo[] = []
    try {
      const response = await transport.send(FlowEvents.getTargets, {
        payloadType: buildCoreBoxFlowPayload(raw, searchVal.value).type
      })
      if (response?.success) {
        flowTargets = response.data || []
      } else {
        detachLog.error('Failed to load Flow targets:', response?.error)
      }
    } catch (error) {
      detachLog.error('Failed to load Flow targets:', error)
    }

    try {
      await transport.send(
        MetaOverlayEvents.ui.show,
        buildCoreBoxMetaShowRequest(raw, {
          footerShown: !isUIMode.value && isCoreBoxFooterShown(),
          page: 'flow',
          flowTargets
        })
      )
    } catch (error) {
      detachLog.error('Failed to open the Flow page:', error)
    }
  }

  /**
   * Sends the item to the target picked on the ⌘K card's Flow page, which relays the pick with the
   * transfer action (`useActionPanel`). The payload is built here, from the item and the query on
   * screen, as the card's consent check assumed (`buildCoreBoxFlowPayload`).
   *
   * The outcome goes to the footer, as a ⌘K action's does: CoreBox mounts no toast host, so a toast
   * never reached the screen and a transfer that failed looked like one that had not been tried.
   */
  async function dispatchFlow(item: TuffItem, selection: MetaFlowSelection): Promise<void> {
    // `toRaw`, and nothing reactive holding the payload: structured clone rejects Vue's proxies, and
    // every dispatch once failed with "An object could not be cloned".
    const payload = buildCoreBoxFlowPayload(toRaw(item), searchVal.value)
    try {
      const { targetId, consentToken, confirmationToken } = selection
      const actorPluginId = resolveCoreBoxFlowActorPluginId(payload)
      const response = await transport.send(FlowEvents.dispatch, {
        senderId: 'corebox',
        actorPluginId,
        payload,
        options: { preferredTarget: targetId, skipSelector: true, consentToken, confirmationToken }
      })
      if (response?.success) {
        showCoreBoxFooterFeedback(t('corebox.flowSent', '已发送到目标插件'))
      } else {
        const permissionMessage = getFlowPermissionMessage(response?.error, t)
        if (permissionMessage) {
          showCoreBoxFooterFeedback(permissionMessage, 'error')
          return
        }
        throw new Error(response?.error?.message || 'Flow failed')
      }
    } catch (error) {
      detachLog.error('Flow failed:', error)
      showCoreBoxFooterFeedback(t('corebox.flowFailed', '流转失败'), 'error')
    }
  }

  // Plugin WebContentsView shortcuts arrive through typed context notifications.
  const unregDetach = transport.on(FlowEvents.triggerDetach, () => {
    if (isUIMode.value && activeActivations.value?.length) {
      void detachUIMode(activeActivations.value[0])
      return
    }
    const activeFeature = getActiveFeature(activeActivations.value, boxOptions.data)
    if (activeFeature) {
      void detachFeature(activeFeature)
    }
  })

  const unregFlow = transport.on(FlowEvents.triggerTransfer, () => {
    const currentItem =
      getActiveFeature(activeActivations.value, boxOptions.data) ?? res.value[boxOptions.focus]
    if (currentItem) void openFlowPanel(currentItem)
  })

  function handleDetachShortcut(): void {
    if (isUIMode.value && activeActivations.value?.length) {
      void detachUIMode(activeActivations.value[0])
      return
    }
    const activeFeature = getActiveFeature(activeActivations.value, boxOptions.data)
    if (activeFeature) {
      void detachFeature(activeFeature)
    }
  }

  function handleFlowShortcut(event: Event): void {
    const detail = (event as CustomEvent<{ item?: TuffItem }>).detail
    // The key's own item first: `useKeyboard` resolves it from the live activations, then the
    // focused result. The box data keeps the last plugin feature after its view has gone; read
    // ahead of the key's item, it sent that feature instead of the result the user had picked.
    const currentItem =
      detail?.item ??
      getActiveFeature(activeActivations.value, boxOptions.data) ??
      res.value[boxOptions.focus]
    if (currentItem) void openFlowPanel(currentItem)
  }

  onMounted(() => {
    window.addEventListener('corebox:detach-item', handleDetachShortcut)
    window.addEventListener('corebox:flow-item', handleFlowShortcut)
  })

  onBeforeUnmount(() => {
    unregDetach()
    unregFlow()
    window.removeEventListener('corebox:detach-item', handleDetachShortcut)
    window.removeEventListener('corebox:flow-item', handleFlowShortcut)
  })

  return reactive({
    detachFeature,
    detachUIMode,
    openFlowPanel,
    dispatchFlow
  })
}
