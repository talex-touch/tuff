import type { TuffItem } from '@talex-touch/utils'
import type { BrowserWindow } from 'electron'
import type {
  BoxItemBatchDeleteEvent,
  BoxItemBatchUpsertEvent,
  BoxItemClearEvent,
  BoxItemCreateEvent,
  BoxItemDeleteEvent,
  BoxItemManagerOptions,
  BoxItemSyncResponseEvent,
  BoxItemUpdateEvent,
  BoxItemUpsertEvent,
} from './types'
import { ChannelType } from '@talex-touch/utils/channel'
import { genTouchChannel } from '../../../core/channel-core'
import { BOX_ITEM_CHANNELS } from './channels'

/**
 * BoxItem 管理器
 * 提供统一的 CRUD API，管理 CoreBox 中的所有 items
 */
export class BoxItemManager {
  private items = new Map<string, TuffItem>()
  private readonly options: Required<BoxItemManagerOptions>
  private readonly channel = genTouchChannel()

  constructor(options: BoxItemManagerOptions = {}) {
    this.options = {
      enableLogging: options.enableLogging ?? false,
      maxItems: options.maxItems ?? 10000,
    }

    this.log('BoxItemManager initialized')
  }

  // ==================== CRUD 操作 ====================

  /**
   * 创建新 item
   * @param item - 要创建的 item
   * @throws 如果 item.id 已存在
   */
  create(item: TuffItem): void {
    if (!this.validateItem(item)) {
      return
    }

    if (this.items.has(item.id)) {
      this.logWarn(`Item with id ${item.id} already exists. Use upsert() instead.`)
      return
    }

    if (this.items.size >= this.options.maxItems) {
      this.logWarn(`Max items limit (${this.options.maxItems}) reached. Cannot create new item.`)
      return
    }

    this.items.set(item.id, item)
    this.emitToRenderer<BoxItemCreateEvent>(BOX_ITEM_CHANNELS.CREATE, { item })
    this.log(`Created item: ${item.id}`)
  }

  /**
   * 更新 item 的部分字段
   * @param id - item id
   * @param updates - 要更新的字段
   */
  update(id: string, updates: Partial<TuffItem>): void {
    const existing = this.items.get(id)
    if (!existing) {
      this.logWarn(`Item ${id} not found. Cannot update.`)
      return
    }

    // 深度合并
    const updated = this.deepMerge(existing, updates)

    if (!this.validateItem(updated)) {
      return
    }

    this.items.set(id, updated)
    this.emitToRenderer<BoxItemUpdateEvent>(BOX_ITEM_CHANNELS.UPDATE, { id, updates })
    this.log(`Updated item: ${id}`)
  }

  /**
   * 创建或更新 item（推荐使用）
   * 如果 item.id 存在则更新，否则创建
   * @param item - 要 upsert 的 item
   */
  upsert(item: TuffItem): void {
    if (!this.validateItem(item)) {
      return
    }

    const exists = this.items.has(item.id)

    if (exists) {
      // 更新：深度合并
      const existing = this.items.get(item.id)!
      const merged = this.deepMerge(existing, item)
      this.items.set(item.id, merged)
    }
    else {
      // 创建
      if (this.items.size >= this.options.maxItems) {
        this.logWarn(`Max items limit (${this.options.maxItems}) reached. Cannot upsert new item.`)
        return
      }
      this.items.set(item.id, item)
    }

    this.emitToRenderer<BoxItemUpsertEvent>(BOX_ITEM_CHANNELS.UPSERT, { item: this.items.get(item.id)! })
    this.log(`Upserted item: ${item.id} (${exists ? 'updated' : 'created'})`)
  }

  /**
   * 删除 item
   * @param id - item id
   */
  delete(id: string): void {
    if (!this.items.has(id)) {
      this.logWarn(`Item ${id} not found. Cannot delete.`)
      return
    }

    this.items.delete(id)
    this.emitToRenderer<BoxItemDeleteEvent>(BOX_ITEM_CHANNELS.DELETE, { id })
    this.log(`Deleted item: ${id}`)
  }

  // ==================== 批量操作 ====================

  /**
   * 批量 upsert items
   * @param items - 要 upsert 的 items 数组
   */
  batchUpsert(items: TuffItem[]): void {
    if (items.length === 0) {
      return
    }

    const validItems = items.filter(item => this.validateItem(item, false))

    if (validItems.length === 0) {
      this.logWarn('No valid items to upsert in batch')
      return
    }

    // 检查空间是否足够
    const newItemsCount = validItems.filter(item => !this.items.has(item.id)).length
    if (this.items.size + newItemsCount > this.options.maxItems) {
      this.logWarn(
        `Batch upsert would exceed max items limit (${this.options.maxItems}). Operation cancelled.`,
      )
      return
    }

    // 执行 upsert
    validItems.forEach((item) => {
      const exists = this.items.has(item.id)
      if (exists) {
        const existing = this.items.get(item.id)!
        this.items.set(item.id, this.deepMerge(existing, item))
      }
      else {
        this.items.set(item.id, item)
      }
    })

    this.emitToRenderer<BoxItemBatchUpsertEvent>(BOX_ITEM_CHANNELS.BATCH_UPSERT, {
      items: validItems.map(item => this.items.get(item.id)!),
    this.emitToRenderer<BoxItemBatchUpsertEvent>(BOX_ITEM_CHANNELS.BATCH_UPSERT, {
      items: validItems.map(item => this.items.get(item.id)!),
    })
    this.log(`Batch upserted ${validItems.length} items`)
  }

  /**
   * 批量删除 items
   * @param ids - 要删除的 item ids 数组
   */
  batchDelete(ids: string[]): void {
    if (ids.length === 0) {
      return
    }

    const existingIds = ids.filter(id => this.items.has(id))

    if (existingIds.length === 0) {
      this.logWarn('No existing items to delete in batch')
      return
    }

    existingIds.forEach(id => this.items.delete(id))

    this.emitToRenderer<BoxItemBatchDeleteEvent>(BOX_ITEM_CHANNELS.BATCH_DELETE, { ids: existingIds })
    if (this.options.enableLogging) {
      this.log(`Batch deleted ${existingIds.length} items`)
    }
  }

  // ==================== 查询操作 ====================

  /**
   * 获取单个 item
   * @param id - item id
   * @returns item 或 undefined
   */
  get(id: string): TuffItem | undefined {
    return this.items.get(id)
  }

  /**
   * 获取所有 items
   * @returns items 数组
   */
  getAll(): TuffItem[] {
    return Array.from(this.items.values())
  }

  /**
   * 根据来源获取 items
   * @param source - 来源 id（如插件名）
   * @returns 匹配的 items 数组
   */
  getBySource(source: string): TuffItem[] {
    return Array.from(this.items.values()).filter(item => item.source?.id === source)
  }

  /**
   * 获取 items 数量
   * @returns items 数量
   */
  getCount(): number {
    return this.items.size
  }

  // ==================== 清空操作 ====================

  /**
   * 清空所有 items 或指定来源的 items
   * @param source - 可选，仅清空指定来源的 items
   */
  clear(source?: string): void {
    if (source) {
      // 清空指定来源
      const toDelete: string[] = []
      this.items.forEach((item, id) => {
        if (item.source?.id === source) {
          toDelete.push(id)
        }
      })

      toDelete.forEach(id => this.items.delete(id))
      if (this.options.enableLogging) {
        this.log(`Cleared ${toDelete.length} items from source: ${source}`)
      }
    }
    else {
      // 清空所有
      const count = this.items.size
      this.items.clear()
      this.log(`Cleared all ${count} items`)
    }

    this.emitToRenderer<BoxItemClearEvent>(BOX_ITEM_CHANNELS.CLEAR, { source })
  }

  // ==================== 同步操作 ====================

  /**
   * 处理来自渲染进程的同步请求
   * 返回所有当前 items
   */
  handleSyncRequest(): void {
    const items = this.getAll()
    this.emitToRenderer<BoxItemSyncResponseEvent>(BOX_ITEM_CHANNELS.SYNC_RESPONSE, { items })
    this.log(`Synced ${items.length} items to renderer`)
  }

  // ==================== 内部方法 ====================

  /**
   * 验证 item 是否有效
   * @param item - 要验证的 item
   * @param logError - 是否记录错误日志
   * @returns 是否有效
   */
  private validateItem(item: TuffItem, logError = true): boolean {
    if (!item) {
      if (logError)
        this.logWarn('Item is null or undefined')
      return false
    }

    if (!item.id) {
      if (logError)
        this.logWarn('Item must have an id')
      return false
    }

    if (!item.source) {
      if (logError)
        this.logWarn(`Item ${item.id} must have a source`)
      return false
    }

    return true
  }

  /**
   * 深度合并两个对象
   * @param target - 目标对象
   * @param source - 源对象
   * @returns 合并后的对象
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target }

    Object.keys(source).forEach((key) => {
      const sourceValue = source[key as keyof T]
      const targetValue = result[key as keyof T]

      if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        // 递归合并对象
        result[key as keyof T] = this.deepMerge(
          targetValue || ({} as any),
          sourceValue as any,
        ) as any
      }
      else {
        // 直接赋值（包括数组、基本类型、null、undefined）
        result[key as keyof T] = sourceValue as any
      }
    })

    return result
  }

  /**
   * 发送事件到渲染进程
   * @param channel - channel 名称
   * @param data - 事件数据
   */
  private emitToRenderer<T = any>(channel: string, data: T): void {
    const coreBoxWindow = this.getCoreBoxWindow()
    if (!coreBoxWindow || coreBoxWindow.isDestroyed()) {
      this.logWarn('CoreBox window not available, cannot emit event')
      return
    }

    this.channel
      .sendTo(coreBoxWindow, ChannelType.MAIN, channel, data)
      .catch((error) => {
        this.logWarn(`Failed to send ${channel} event:`, error)
      })
  }

  /**
   * 获取 CoreBox 窗口
   * @returns CoreBox 窗口或 null
   */
  private getCoreBoxWindow(): BrowserWindow | null {
    // 这里需要从 CoreBoxManager 获取窗口
    // 暂时返回 null，稍后集成
    const { getCoreBoxWindow } = require('../../core-box/manager')
    const coreBoxWindow = getCoreBoxWindow()
    return coreBoxWindow?.window || null
  }

  /**
   * 记录日志
   */
  private log(...args: any[]): void {
    if (this.options.enableLogging) {
      console.log('[BoxItemManager]', ...args)
    }
  }

  /**
   * 记录警告日志
   */
  private logWarn(...args: any[]): void {
    if (this.options.enableLogging) {
      console.warn('[BoxItemManager]', ...args)
    }
  }
}

// 导出单例
let boxItemManagerInstance: BoxItemManager | null = null

/**
 * 获取 BoxItemManager 单例
 * @param options - 配置选项（仅首次调用时生效）
 * @returns BoxItemManager 实例
 */
export function getBoxItemManager(options?: BoxItemManagerOptions): BoxItemManager {
  if (!boxItemManagerInstance) {
    boxItemManagerInstance = new BoxItemManager(options)
  }
  return boxItemManagerInstance
}

/**
 * 重置 BoxItemManager 单例（用于测试）
 */
export function resetBoxItemManager(): void {
  boxItemManagerInstance = null
}
