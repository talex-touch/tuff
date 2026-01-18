import type { TuffItem } from '@talex-touch/utils'
import type { UseBoxItemsReturn } from './types'
import { computed, onMounted, onUnmounted, readonly, ref } from 'vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

/**
 * BoxItem SDK Channel 常量（与主进程保持一致）
 */
const BOX_ITEM_EVENTS = {
  CREATE: defineRawEvent<{ item: TuffItem }, void>('box-item:create'),
  UPDATE: defineRawEvent<{ id: string; updates: Partial<TuffItem> }, void>('box-item:update'),
  UPSERT: defineRawEvent<{ item: TuffItem }, void>('box-item:upsert'),
  DELETE: defineRawEvent<{ id: string }, void>('box-item:delete'),
  BATCH_UPSERT: defineRawEvent<{ items: TuffItem[] }, void>('box-item:batch-upsert'),
  BATCH_DELETE: defineRawEvent<{ ids: string[] }, void>('box-item:batch-delete'),
  CLEAR: defineRawEvent<{ source?: string }, void>('box-item:clear'),
  SYNC: defineRawEvent<void, void>('box-item:sync'),
  SYNC_RESPONSE: defineRawEvent<{ items: TuffItem[] }, void>('box-item:sync-response')
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
  const transport = useTuffTransport()
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
    void transport.send(BOX_ITEM_EVENTS.CREATE, { item })
  }

  /**
   * 更新 item 部分字段
   */
  const update = (id: string, updates: Partial<TuffItem>): void => {
    void transport.send(BOX_ITEM_EVENTS.UPDATE, { id, updates })
  }

  /**
   * 创建或更新 item（推荐）
   */
  const upsert = (item: TuffItem): void => {
    void transport.send(BOX_ITEM_EVENTS.UPSERT, { item })
  }

  /**
   * 删除 item
   */
  const remove = (id: string): void => {
    void transport.send(BOX_ITEM_EVENTS.DELETE, { id })
  }

  /**
   * 批量 upsert
   */
  const batchUpsert = (itemsToUpsert: TuffItem[]): void => {
    void transport.send(BOX_ITEM_EVENTS.BATCH_UPSERT, { items: itemsToUpsert })
  }

  /**
   * 批量删除
   */
  const batchDelete = (ids: string[]): void => {
    void transport.send(BOX_ITEM_EVENTS.BATCH_DELETE, { ids })
  }

  /**
   * 清空所有或指定来源
   */
  const clear = (source?: string): void => {
    void transport.send(BOX_ITEM_EVENTS.CLEAR, { source })
  }

  /**
   * 请求同步
   */
  const sync = (): void => {
    void transport.send(BOX_ITEM_EVENTS.SYNC)
  }

  // ==================== 事件处理器 ====================

  /**
   * 处理 upsert 事件
   */
  const handleUpsert = ({ item }: { item: TuffItem }): void => {
    const index = itemsMap.get(item.id)

    if (index !== undefined) {
      // 更新：将更新项移动到最前（最新结果置顶），触发列表 FLIP
      items.value.splice(index, 1)
      items.value.unshift(item)
      rebuildIndex()
    } else {
      // 新增：插入到最前（最新结果置顶），触发列表 FLIP
      items.value.unshift(item)
      rebuildIndex()
    }
  }

  /**
   * 处理 create 事件（与 upsert 逻辑相同）
   */
  const handleCreate = handleUpsert

  /**
   * 处理 update 事件
   */
  const handleUpdate = ({ id, updates }: { id: string; updates: Partial<TuffItem> }): void => {
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
  const handleDelete = ({ id }: { id: string }): void => {
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
  const handleBatchUpsert = ({ items: batchItems }: { items: TuffItem[] }): void => {
    // Reverse iterate to preserve incoming order while unshifting
    // so the first item in data.items ends up before subsequent ones.
    for (let i = batchItems.length - 1; i >= 0; i--) {
      const item = batchItems[i]
      const index = itemsMap.get(item.id)
      if (index !== undefined) {
        items.value.splice(index, 1)
      }
      items.value.unshift(item)
    }
    rebuildIndex()
  }

  /**
   * 处理 batch-delete 事件
   */
  const handleBatchDelete = ({ ids }: { ids: string[] }): void => {
    // 批量删除需要重建索引
    const idsToDelete = new Set(ids)
    items.value = items.value.filter((item) => !idsToDelete.has(item.id))
    rebuildIndex()
  }

  /**
   * 处理 clear 事件
   */
  const handleClear = ({ source }: { source?: string }): void => {
    if (source) {
      // 清空指定来源
      items.value = items.value.filter((item) => item.source?.id !== source)
    } else {
      // 清空所有
      items.value = []
    }

    rebuildIndex()
  }

  /**
   * 处理 sync-response 事件
   */
  const handleSyncResponse = ({ items: syncedItems }: { items: TuffItem[] }): void => {
    items.value = syncedItems
    rebuildIndex()
  }

  // ==================== 生命周期 ====================

  onMounted(() => {
    // 注册所有事件监听器
    transport.on(BOX_ITEM_EVENTS.CREATE, handleCreate)
    transport.on(BOX_ITEM_EVENTS.UPDATE, handleUpdate)
    transport.on(BOX_ITEM_EVENTS.UPSERT, handleUpsert)
    transport.on(BOX_ITEM_EVENTS.DELETE, handleDelete)
    transport.on(BOX_ITEM_EVENTS.BATCH_UPSERT, handleBatchUpsert)
    transport.on(BOX_ITEM_EVENTS.BATCH_DELETE, handleBatchDelete)
    transport.on(BOX_ITEM_EVENTS.CLEAR, handleClear)
    transport.on(BOX_ITEM_EVENTS.SYNC_RESPONSE, handleSyncResponse)

    // 请求初始同步
    sync()
  })

  onUnmounted(() => {
    // transport.on 监听在窗口销毁后会自动释放，如需手动清理请补充
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
    getById
  }
}
