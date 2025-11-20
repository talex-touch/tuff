import type { TuffItem } from '@talex-touch/utils'
import type { ComputedRef, Ref } from 'vue'

/**
 * useBoxItems 返回类型
 */
export interface UseBoxItemsReturn {
  /** 响应式 items 列表（只读） */
  items: Readonly<Ref<TuffItem[]>>

  /** 创建新 item */
  create: (item: TuffItem) => void

  /** 更新 item 部分字段 */
  update: (id: string, updates: Partial<TuffItem>) => void

  /** 创建或更新 item（推荐） */
  upsert: (item: TuffItem) => void

  /** 删除 item */
  remove: (id: string) => void

  /** 批量 upsert */
  batchUpsert: (items: TuffItem[]) => void

  /** 批量删除 */
  batchDelete: (ids: string[]) => void

  /** 清空所有或指定来源 */
  clear: (source?: string) => void

  /** 请求同步 */
  sync: () => void

  /** items 数量 */
  count: Readonly<ComputedRef<number>>

  /** 根据 id 查找 item */
  getById: (id: string) => TuffItem | undefined
}
