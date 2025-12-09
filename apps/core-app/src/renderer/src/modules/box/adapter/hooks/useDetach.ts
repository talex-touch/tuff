import type { TuffItem } from '@talex-touch/utils'
import { onBeforeUnmount, reactive, ref, type ComputedRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { touchChannel } from '~/modules/channel/channel-core'

interface UseDetachOptions {
  searchVal: Ref<string>
  res: Ref<TuffItem[]>
  boxOptions: { focus: number }
  isUIMode: ComputedRef<boolean>
  activeActivations: ComputedRef<any[] | undefined>
  deactivateProvider: (id?: string) => Promise<void>
}

function buildUrl(item: TuffItem, query: string): string {
  if (item.meta?.interaction?.type === 'webcontent' && item.meta.interaction.path) {
    return `plugin://${item.source?.id}/${item.meta.interaction.path}`
  }
  if (item.meta?.interaction?.type === 'index') {
    return `plugin://${item.source?.id}/index.html`
  }
  if (item.kind === 'url' && item.meta?.web?.url) {
    return item.meta.web.url
  }
  if (item.kind === 'file' && item.meta?.file?.path) {
    return `file://${item.meta.file.path}`
  }
  const params = new URLSearchParams({ itemId: item.id, query: query || '', source: item.source?.id || '' })
  return `tuff://detached?${params.toString()}`
}

function resolveIcon(item: TuffItem): string | undefined {
  const icon = item.render?.basic?.icon
  if (!icon) return undefined
  if (typeof icon === 'string') return icon
  if (typeof icon === 'object' && 'value' in icon) return icon.value
  return undefined
}

export function useDetach(options: UseDetachOptions) {
  const { searchVal, res, boxOptions, isUIMode, activeActivations, deactivateProvider } = options
  const { t } = useI18n()

  const flowVisible = ref(false)
  const flowPayload = ref<any>(null)
  const flowSessionId = ref('')

  async function detachItem(item: TuffItem): Promise<void> {
    try {
      const config = {
        url: buildUrl(item, searchVal.value),
        title: item.render?.basic?.title || 'Detached Item',
        icon: resolveIcon(item),
        size: 'medium' as const,
        keepAlive: true,
        pluginId: item.source?.id
      }
      const response = await touchChannel.send('division-box:open', config)
      if (response?.success) {
        toast.success(t('corebox.detached', '已分离到独立窗口'))
      } else {
        throw new Error(response?.error?.message || 'Failed')
      }
    } catch (error) {
      console.error('[useDetach] Failed:', error)
      toast.error(t('corebox.detachFailed', '分离失败'))
    }
  }

  async function detachUIMode(activation: any): Promise<void> {
    try {
      const config = {
        url: `plugin://${activation.id}/index.html`,
        title: activation.name || activation.id,
        icon: activation.icon?.value,
        size: 'medium' as const,
        keepAlive: true,
        pluginId: activation.id,
        ui: { showInput: true, initialInput: searchVal.value }
      }
      const response = await touchChannel.send('division-box:open', config)
      if (response?.success) {
        await deactivateProvider(activation.id)
        toast.success(t('corebox.detached', '已分离到独立窗口'))
      } else {
        throw new Error(response?.error?.message || 'Failed')
      }
    } catch (error) {
      console.error('[useDetach] Failed:', error)
      toast.error(t('corebox.detachFailed', '分离失败'))
    }
  }

  function openFlowSelector(item: TuffItem): void {
    flowPayload.value = {
      type: 'json',
      data: { item, query: searchVal.value },
      context: { sourcePluginId: item.source?.id || 'corebox', sourceFeatureId: item.meta?.featureId }
    }
    flowVisible.value = true
  }

  function closeFlowSelector(): void {
    flowVisible.value = false
    flowPayload.value = null
    flowSessionId.value = ''
  }

  async function dispatchFlow(targetId: string): Promise<void> {
    if (!flowPayload.value) return
    try {
      const response = await touchChannel.send('flow:dispatch', {
        senderId: 'corebox',
        payload: flowPayload.value,
        options: { preferredTarget: targetId, skipSelector: true }
      })
      if (response?.success) {
        toast.success(t('corebox.flowSent', '已发送到目标插件'))
      } else {
        throw new Error(response?.error?.message || 'Flow failed')
      }
    } catch (error) {
      console.error('[useDetach] Flow failed:', error)
      toast.error(t('corebox.flowFailed', '流转失败'))
    } finally {
      closeFlowSelector()
    }
  }

  // Channel listeners
  const unregDetach = touchChannel.regChannel('flow:trigger-detach', () => {
    if (isUIMode.value && activeActivations.value?.length) {
      detachUIMode(activeActivations.value[0])
      return
    }
    const currentItem = res.value[boxOptions.focus]
    if (currentItem) detachItem(currentItem)
  })

  const unregFlow = touchChannel.regChannel('flow:trigger-transfer', () => {
    const currentItem = res.value[boxOptions.focus]
    if (currentItem) openFlowSelector(currentItem)
  })

  onBeforeUnmount(() => {
    unregDetach()
    unregFlow()
  })

  return reactive({
    flowVisible,
    flowPayload,
    flowSessionId,
    detachItem,
    detachUIMode,
    openFlowSelector,
    closeFlowSelector,
    dispatchFlow
  })
}
