import type { TuffItem } from '@talex-touch/utils'
import { onBeforeUnmount, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { touchChannel } from '~/modules/channel/channel-core'

interface UseActionPanelOptions {
  detachItem?: (item: TuffItem) => Promise<void>
}

export function useActionPanel(options: UseActionPanelOptions = {}) {
  const { detachItem } = options
  const { t } = useI18n()

  const visible = ref(false)
  const item = ref<TuffItem | null>(null)
  const isPinned = ref(false)

  function open(targetItem: TuffItem): void {
    item.value = targetItem
    isPinned.value = !!(targetItem.meta as any)?.pinned?.isPinned
    visible.value = true
  }

  function close(): void {
    visible.value = false
    item.value = null
  }

  async function togglePin(targetItem: TuffItem): Promise<void> {
    try {
      const response = await touchChannel.send('core-box:toggle-pin', {
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
          await touchChannel.send('clipboard:write-text', { text: targetItem.render.basic.title })
          toast.success(t('corebox.copied', '已复制'))
        }
        break
      case 'reveal-in-finder': {
        const path = targetItem.meta?.app?.path || targetItem.meta?.file?.path
        if (path) await touchChannel.send('shell:show-item-in-folder', { path })
        break
      }
      case 'detach':
        if (detachItem) await detachItem(targetItem)
        break
    }
  }

  // Channel listener for action panel
  const unregOpen = touchChannel.regChannel('corebox:open-action-panel', ({ data }) => {
    if (data?.item) open(data.item)
  })

  onBeforeUnmount(() => {
    unregOpen()
  })

  return reactive({ visible, item, isPinned, open, close, handleAction, togglePin })
}
