/**
 * BoxItem SDK Channel 常量
 * 统一命名空间：box-item:*
 */
export const BOX_ITEM_CHANNELS = {
  /** 创建新 item */
  CREATE: 'box-item:create',
  /** 更新 item 部分字段 */
  UPDATE: 'box-item:update',
  /** 创建或更新 item（推荐使用） */
  UPSERT: 'box-item:upsert',
  /** 删除 item */
  DELETE: 'box-item:delete',
  /** 批量 upsert */
  BATCH_UPSERT: 'box-item:batch-upsert',
  /** 批量删除 */
  BATCH_DELETE: 'box-item:batch-delete',
  /** 清空所有或指定来源的 items */
  CLEAR: 'box-item:clear',
  /** 请求同步所有 items */
  SYNC: 'box-item:sync',
  /** 同步响应 */
  SYNC_RESPONSE: 'box-item:sync-response',
} as const

export type BoxItemChannel = (typeof BOX_ITEM_CHANNELS)[keyof typeof BOX_ITEM_CHANNELS]
