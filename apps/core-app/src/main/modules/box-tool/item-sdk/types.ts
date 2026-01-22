import type { TuffItem } from '@talex-touch/utils'

/**
 * BoxItem 事件类型
 */
export enum BoxItemEventType {
  /** 创建新 item */
  CREATE = 'create',
  /** 更新 item */
  UPDATE = 'update',
  /** 创建或更新 item（推荐） */
  UPSERT = 'upsert',
  /** 删除 item */
  DELETE = 'delete',
  /** 批量 upsert */
  BATCH_UPSERT = 'batch-upsert',
  /** 批量删除 */
  BATCH_DELETE = 'batch-delete',
  /** 清空 */
  CLEAR = 'clear',
  /** 同步请求 */
  SYNC = 'sync',
  /** 同步响应 */
  SYNC_RESPONSE = 'sync-response'
}

/**
 * BoxItem 事件数据
 */
export interface BoxItemEvent {
  type: BoxItemEventType
  data?: unknown
}

/**
 * Create 事件数据
 */
export interface BoxItemCreateEvent {
  item: TuffItem
}

/**
 * Update 事件数据
 */
export interface BoxItemUpdateEvent {
  id: string
  updates: Partial<TuffItem>
}

/**
 * Upsert 事件数据
 */
export interface BoxItemUpsertEvent {
  item: TuffItem
}

/**
 * Delete 事件数据
 */
export interface BoxItemDeleteEvent {
  id: string
}

/**
 * Batch Upsert 事件数据
 */
export interface BoxItemBatchUpsertEvent {
  items: TuffItem[]
}

/**
 * Batch Delete 事件数据
 */
export interface BoxItemBatchDeleteEvent {
  ids: string[]
}

/**
 * Clear 事件数据
 */
export interface BoxItemClearEvent {
  /** 可选：仅清空指定来源的 items */
  source?: string
}

/**
 * Sync Response 事件数据
 */
export interface BoxItemSyncResponseEvent {
  items: TuffItem[]
}

/**
 * BoxItemManager 配置选项
 */
export interface BoxItemManagerOptions {
  /** 是否启用日志 */
  enableLogging?: boolean
  /** 最大 item 数量限制（防止内存溢出） */
  maxItems?: number
}
