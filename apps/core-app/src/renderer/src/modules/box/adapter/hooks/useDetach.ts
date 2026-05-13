import type {
  DivisionBoxConfig,
  FlowPayload,
  IProviderActivate,
  ITuffIcon,
  TuffItem
} from '@talex-touch/utils'
import type { ComputedRef, Ref } from 'vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { DivisionBoxEvents, FlowEvents } from '@talex-touch/utils/transport/events'
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { createRendererLogger } from '../../../../utils/renderer-log'

const DETACHED_PAYLOAD_STATE_KEY = 'detachedPayload'
const detachLog = createRendererLogger('useDetach')

interface UseDetachOptions {
  searchVal: Ref<string>
  res: Ref<TuffItem[]>
  boxOptions: { focus: number; data?: unknown }
  isUIMode: ComputedRef<boolean>
  activeActivations: ComputedRef<IProviderActivate[] | undefined>
  deactivateProvider: (id?: string) => Promise<void>
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

function resolveFeaturePluginId(item: TuffItem): string | undefined {
  const pluginName = item.meta?.pluginName
  if (typeof pluginName === 'string' && pluginName.trim()) {
    return pluginName
  }
  if (item.source?.type === 'plugin' && item.source.id !== 'plugin-features') {
    return item.source.id
  }
  return undefined
}

function buildDetachedPayload(item: TuffItem, query: string): { item: TuffItem; query: string } {
  return {
    item: JSON.parse(JSON.stringify(item)) as TuffItem,
    query
  }
}

export function buildDetachedFeatureConfig(
  item: TuffItem,
  query: string
): { config: DivisionBoxConfig; isWidget: boolean } | null {
  const interaction = item.meta?.interaction
  const showInput = interaction?.type !== 'widget'
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
      initialState
    }
  }
}

function resolveActorPluginId(payload: FlowPayload | null): string | undefined {
  if (!payload || payload.type !== 'json') {
    return undefined
  }
  const data = payload.data as { item?: TuffItem } | undefined
  const item = data?.item
  if (item?.source?.type !== 'plugin') {
    return undefined
  }
  return item.source.id
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
  if (!permissionId) {
    return t('systemPermission.requiredPermission', { permission: 'storage.shared' })
  }
  return t('systemPermission.requiredPermission', { permission: permissionId })
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

  const flowVisible = ref(false)
  const flowPayload = ref<FlowPayload | null>(null)
  const flowSessionId = ref('')

  async function detachFeature(item: TuffItem): Promise<void> {
    try {
      const detached = buildDetachedFeatureConfig(item, searchVal.value)
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
      const config = {
        url: `plugin://${activation.id}/index.html`,
        title: activation.name || activation.id,
        icon: activation.icon,
        size: 'medium' as const,
        keepAlive: true,
        pluginId: activation.id,
        ui: { showInput: true, initialInput: searchVal.value }
      }
      const response = await transport.send(DivisionBoxEvents.open, config)
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

  function openFlowSelector(item: TuffItem): void {
    flowPayload.value = {
      type: 'json',
      data: { item, query: searchVal.value },
      context: {
        sourcePluginId: item.source?.id || 'corebox',
        sourceFeatureId: item.meta?.featureId
      }
    }
    flowVisible.value = true
  }

  function closeFlowSelector(): void {
    flowVisible.value = false
    flowPayload.value = null
    flowSessionId.value = ''
  }

  async function dispatchFlow(payload: { targetId: string; consentToken?: string }): Promise<void> {
    if (!flowPayload.value) return
    try {
      const { targetId, consentToken } = payload
      const actorPluginId = resolveActorPluginId(flowPayload.value)
      const response = await transport.send(FlowEvents.dispatch, {
        senderId: 'corebox',
        actorPluginId,
        payload: flowPayload.value,
        options: { preferredTarget: targetId, skipSelector: true, consentToken }
      })
      if (response?.success) {
        toast.success(t('corebox.flowSent', '已发送到目标插件'))
      } else {
        const permissionMessage = getFlowPermissionMessage(response?.error, t)
        if (permissionMessage) {
          toast.warning(permissionMessage)
          return
        }
        throw new Error(response?.error?.message || 'Flow failed')
      }
    } catch (error) {
      detachLog.error('Flow failed:', error)
      toast.error(t('corebox.flowFailed', '流转失败'))
    } finally {
      closeFlowSelector()
    }
  }

  // Channel listeners
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
    if (currentItem) openFlowSelector(currentItem)
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
    const currentItem =
      getActiveFeature(activeActivations.value, boxOptions.data) ??
      detail?.item ??
      res.value[boxOptions.focus]
    if (currentItem) openFlowSelector(currentItem)
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
    flowVisible,
    flowPayload,
    flowSessionId,
    detachFeature,
    detachUIMode,
    openFlowSelector,
    closeFlowSelector,
    dispatchFlow
  })
}
