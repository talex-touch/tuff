import type { TuffItem } from '@talex-touch/utils'
import type { UseBoxItemsReturn } from './types'
import { computed, onMounted, onUnmounted, readonly, ref } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'

/**
 * BoxItem SDK Channel 常量（与主进程保持一致）
 */
const BOX_ITEM_CHANNELS = {
  CREATE: 'box-item:create',
  UPDATE: 'box-item:update',
  UPSERT: 'box-item:upsert',
  DELETE: 'box-item:delete',
  BATCH_UPSERT: 'box-item:batch-upsert',
  BATCH_DELETE: 'box-item:batch-delete',
  CLEAR: 'box-item:clear',
  SYNC: 'box-item:sync',
  SYNC_RESPONSE: 'box-item:sync-response',
} as const

/**
 * BoxItems Composable
 * 管理 CoreBox items 的响应式状态
 *
 * @example
 * ```ts
 * const { items, upsert, remove, clear } = useBoxItems()
 *
 * // 添加或更新 item
 * upsert(myItem)
 *
 * // 删除 item
 * remove(itemId)
 *
 * // 清空所有
 * clear()
 * ```
 */
export function useBoxItems(): UseBoxItemsReturn {
  // ==================== 状态管理 ====================

  const items = ref<TuffItem[]>([])
  const itemsMap = new Map<string, number>() // id -> index 映射，优化查找

  // ==================== 辅助方法 ====================

  /**
   * 重建索引映射
   * 在删除或大量修改后调用
   */
  const rebuildIndex = (): void => {
    itemsMap.clear()
    items.value.forEach((item, idx) => {
      itemsMap.set(item.id, idx)
    })
  }

  /**
   * 根据 id 查找 item
   */
  const getById = (id: string): TuffItem | undefined => {
    const index = itemsMap.get(id)
    return index !== undefined ? items.value[index] : undefined
  }

  // ==================== 主进程通信 ====================

  /**
   * 创建新 item
   */
  const create = (item: TuffItem): void => {
    touchChannel.send(BOX_ITEM_CHANNELS.CREATE, { item })
  }

  /**
   * 更新 item 部分字段
   */
  const update = (id: string, updates: Partial<TuffItem>): void => {
    touchChannel.send(BOX_ITEM_CHANNELS.UPDATE, { id, updates })
  }

  /**
   * 创建或更新 item（推荐）
   */
  const upsert = (item: TuffItem): void => {
    touchChannel.send(BOX_ITEM_CHANNELS.UPSERT, { item })
  }

  /**
   * 删除 item
   */
  const remove = (id: string): void => {
    touchChannel.send(BOX_ITEM_CHANNELS.DELETE, { id })
  }

  /**
   * 批量 upsert
   */
  const batchUpsert = (itemsToUpsert: TuffItem[]): void => {
    touchChannel.send(BOX_ITEM_CHANNELS.BATCH_UPSERT, { items: itemsToUpsert })
  }

  /**
   * 批量删除
   */
  const batchDelete = (ids: string[]): void => {
    touchChannel.send(BOX_ITEM_CHANNELS.BATCH_DELETE, { ids })
  }

  /**
   * 清空所有或指定来源
   */
  const clear = (source?: string): void => {
    touchChannel.send(BOX_ITEM_CHANNELS.CLEAR, { source })
  }

  /**
   * 请求同步
   */
  const sync = (): void => {
    touchChannel.send(BOX_ITEM_CHANNELS.SYNC, {})
  }

  // ==================== 事件处理器 ====================

  /**
   * 处理 upsert 事件
   */
  const handleUpsert = ({ data }: { data: { item: TuffItem } }): void => {
    const { item } = data
    const index = itemsMap.get(item.id)

    if (index !== undefined) {
      // 更新：使用 splice 确保 Vue 响应式
      items.value.splice(index, 1, item)
      // 索引不变，无需更新 Map
    }
    else {
      // 新增
      const newIndex = items.value.length
      items.value.push(item)
      itemsMap.set(item.id, newIndex)
    }
  }

  /**
   * 处理 create 事件（与 upsert 逻辑相同）
   */
  const handleCreate = handleUpsert

  /**
   * 处理 update 事件
   */
  const handleUpdate = ({ data }: { data: { id: string, updates: Partial<TuffItem> } }): void => {
    const { id, updates } = data
    const index = itemsMap.get(id)

    if (index !== undefined) {
      const existing = items.value[index]
      // 深度合并（简化版）
      const updated = { ...existing, ...updates }
      items.value.splice(index, 1, updated)
    }
  }

  /**
   * 处理 delete 事件
   */
  const handleDelete = ({ data }: { data: { id: string } }): void => {
    const { id } = data
    const index = itemsMap.get(id)

    if (index !== undefined) {
      items.value.splice(index, 1)
      // 删除后需要重建索引，因为后续 item 的 index 都变了
      rebuildIndex()
    }
  }

  /**
   * 处理 batch-upsert 事件
   */
  const handleBatchUpsert = ({ data }: { data: { items: TuffItem[] } }): void => {
    data.items.forEach((item) => {
      const index = itemsMap.get(item.id)
      if (index !== undefined) {
        items.value.splice(index, 1, item)
      }
      else {
        const newIndex = items.value.length
        items.value.push(item)
        itemsMap.set(item.id, newIndex)
      }
    })
  }

  /**
   * 处理 batch-delete 事件
   */
  const handleBatchDelete = ({ data }: { data: { ids: string[] } }): void => {
    // 批量删除需要重建索引
    const idsToDelete = new Set(data.ids)
    items.value = items.value.filter(item => !idsToDelete.has(item.id))
    rebuildIndex()
  }

  /**
   * 处理 clear 事件
   */
  const handleClear = ({ data }: { data: { source?: string } }): void => {
    const { source } = data

    if (source) {
      // 清空指定来源
      items.value = items.value.filter(item => item.source?.id !== source)
    }
    else {
      // 清空所有
      items.value = []
    }

    rebuildIndex()
  }

  /**
   * 处理 sync-response 事件
   */
  const handleSyncResponse = ({ data }: { data: { items: TuffItem[] } }): void => {
    items.value = data.items
    rebuildIndex()
  }

  // ==================== 生命周期 ====================

  onMounted(() => {
    // 注册所有事件监听器
    touchChannel.regChannel(BOX_ITEM_CHANNELS.CREATE, handleCreate as any)
    touchChannel.regChannel(BOX_ITEM_CHANNELS.UPDATE, handleUpdate as any)
    touchChannel.regChannel(BOX_ITEM_CHANNELS.UPSERT, handleUpsert as any)
    touchChannel.regChannel(BOX_ITEM_CHANNELS.DELETE, handleDelete as any)
    touchChannel.regChannel(BOX_ITEM_CHANNELS.BATCH_UPSERT, handleBatchUpsert as any)
    touchChannel.regChannel(BOX_ITEM_CHANNELS.BATCH_DELETE, handleBatchDelete as any)
    touchChannel.regChannel(BOX_ITEM_CHANNELS.CLEAR, handleClear as any)
    touchChannel.regChannel(BOX_ITEM_CHANNELS.SYNC_RESPONSE, handleSyncResponse as any)

    // 请求初始同步
    sync()
  })

  onUnmounted(() => {
    // Vue 的 regChannel 实现可能需要手动清理
    // 这里假设 touchChannel 会自动清理，如需手动清理请添加
    // 清空本地状态
    items.value = []
    itemsMap.clear()
  })

  // ==================== Computed ====================

  const count = computed(() => items.value.length)

  // ==================== 返回 ====================

  return {
    items: readonly(items) as Readonly<Ref<TuffItem[]>>,
    create,
    update,
    upsert,
    remove,
    batchUpsert,
    batchDelete,
    clear,
    sync,
    count,
    getById,
  }
}
