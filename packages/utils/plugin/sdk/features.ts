/**
 * Plugin Features SDK
 *
 * @description
 * 提供插件features管理的SDK功能，包括动态添加、删除、查询和优先级管理
 *
 * @version 1.0.0
 * @module plugin/sdk/features
 */

import type { IPluginFeature } from '../index'

/**
 * Features管理器接口
 *
 * @description
 * 提供完整的features管理功能，包括CRUD操作和优先级管理
 */
export interface IFeaturesManager {
  /**
   * 动态添加功能到插件
   * @param feature - 功能定义
   * @returns 是否添加成功
   */
  addFeature: (feature: IPluginFeature) => boolean

  /**
   * 删除功能
   * @param featureId - 功能ID
   * @returns 是否删除成功
   */
  removeFeature: (featureId: string) => boolean

  /**
   * 获取所有功能
   * @returns 所有功能列表
   */
  getFeatures: () => IPluginFeature[]

  /**
   * 获取指定功能
   * @param featureId - 功能ID
   * @returns 功能对象，如果不存在返回null
   */
  getFeature: (featureId: string) => IPluginFeature | null

  /**
   * 设置功能优先级
   * @param featureId - 功能ID
   * @param priority - 优先级值（数字越大优先级越高）
   * @returns 是否设置成功
   */
  setPriority: (featureId: string, priority: number) => boolean

  /**
   * 获取功能优先级
   * @param featureId - 功能ID
   * @returns 优先级值，如果功能不存在返回null
   */
  getPriority: (featureId: string) => number | null

  /**
   * 按优先级排序获取所有功能
   * @returns 按优先级排序的功能列表（高优先级在前）
   */
  getFeaturesByPriority: () => IPluginFeature[]

  /**
   * 批量设置功能优先级
   * @param priorities - 优先级映射对象 {featureId: priority}
   * @returns 设置成功的功能数量
   */
  setPriorities: (priorities: Record<string, number>) => number

  /**
   * 重置功能优先级为默认值（0）
   * @param featureId - 功能ID
   * @returns 是否重置成功
   */
  resetPriority: (featureId: string) => boolean

  /**
   * 获取功能统计信息
   * @returns 功能统计对象
   */
  getStats: () => {
    total: number
    byPriority: Record<number, number>
    averagePriority: number
  }
}

/**
 * 创建Features管理器
 *
 * @description
 * 为插件创建features管理器实例
 *
 * @param pluginName - 插件名称
 * @param utils - 插件工具对象
 * @returns Features管理器实例
 *
 * @example
 * ```typescript
 * const featuresManager = createFeaturesManager('my-plugin', utils)
 *
 * // 添加功能
 * featuresManager.addFeature({
 *   id: 'search',
 *   name: '搜索功能',
 *   desc: '提供搜索能力',
 *   commands: [{ type: 'over', value: ['search'] }],
 *   priority: 100
 * })
 *
 * // 设置优先级
 * featuresManager.setPriority('search', 200)
 *
 * // 获取按优先级排序的功能
 * const sortedFeatures = featuresManager.getFeaturesByPriority()
 * ```
 */
export function createFeaturesManager(
  _pluginName: string,
  utils: any,
): IFeaturesManager {
  return {
    /**
     * 动态添加功能到插件
     */
    addFeature(feature: IPluginFeature): boolean {
      try {
        return utils.features.addFeature(feature)
      }
      catch (error) {
        console.error(`[FeaturesManager] Failed to add feature ${feature.id}:`, error)
        return false
      }
    },

    /**
     * 删除功能
     */
    removeFeature(featureId: string): boolean {
      try {
        return utils.features.removeFeature(featureId)
      }
      catch (error) {
        console.error(`[FeaturesManager] Failed to remove feature ${featureId}:`, error)
        return false
      }
    },

    /**
     * 获取所有功能
     */
    getFeatures(): IPluginFeature[] {
      try {
        return utils.features.getFeatures()
      }
      catch (error) {
        console.error(`[FeaturesManager] Failed to get features:`, error)
        return []
      }
    },

    /**
     * 获取指定功能
     */
    getFeature(featureId: string): IPluginFeature | null {
      try {
        return utils.features.getFeature(featureId)
      }
      catch (error) {
        console.error(`[FeaturesManager] Failed to get feature ${featureId}:`, error)
        return null
      }
    },

    /**
     * 设置功能优先级
     */
    setPriority(featureId: string, priority: number): boolean {
      try {
        return utils.features.setPriority(featureId, priority)
      }
      catch (error) {
        console.error(`[FeaturesManager] Failed to set priority for ${featureId}:`, error)
        return false
      }
    },

    /**
     * 获取功能优先级
     */
    getPriority(featureId: string): number | null {
      try {
        return utils.features.getPriority(featureId)
      }
      catch (error) {
        console.error(`[FeaturesManager] Failed to get priority for ${featureId}:`, error)
        return null
      }
    },

    /**
     * 按优先级排序获取所有功能
     */
    getFeaturesByPriority(): IPluginFeature[] {
      try {
        return utils.features.getFeaturesByPriority()
      }
      catch (error) {
        console.error(`[FeaturesManager] Failed to get features by priority:`, error)
        return []
      }
    },

    /**
     * 批量设置功能优先级
     */
    setPriorities(priorities: Record<string, number>): number {
      let successCount = 0
      for (const [featureId, priority] of Object.entries(priorities)) {
        if (this.setPriority(featureId, priority)) {
          successCount++
        }
      }
      return successCount
    },

    /**
     * 重置功能优先级为默认值
     */
    resetPriority(featureId: string): boolean {
      return this.setPriority(featureId, 0)
    },

    /**
     * 获取功能统计信息
     */
    getStats(): {
      total: number
      byPriority: Record<number, number>
      averagePriority: number
    } {
      try {
        const features = this.getFeatures()
        const total = features.length

        const byPriority: Record<number, number> = {}
        let totalPriority = 0

        features.forEach((feature) => {
          const priority = feature.priority ?? 0
          byPriority[priority] = (byPriority[priority] || 0) + 1
          totalPriority += priority
        })

        const averagePriority = total > 0 ? totalPriority / total : 0

        return {
          total,
          byPriority,
          averagePriority,
        }
      }
      catch (error) {
        console.error(`[FeaturesManager] Failed to get stats:`, error)
        return {
          total: 0,
          byPriority: {},
          averagePriority: 0,
        }
      }
    },
  }
}

/**
 * Features管理器工厂函数
 *
 * @description
 * 为插件创建features管理器的便捷工厂函数
 *
 * @param utils - 插件工具对象
 * @returns Features管理器实例
 */
export function useFeatures(utils: any): IFeaturesManager {
  const pluginName = utils.plugin?.getInfo()?.name || 'unknown'
  return createFeaturesManager(pluginName, utils)
}

/**
 * 功能优先级常量
 *
 * @description
 * 提供常用的优先级值，便于插件开发者使用
 */
export const FEATURE_PRIORITIES = {
  /** 最高优先级 */
  HIGHEST: 1000,
  /** 高优先级 */
  HIGH: 500,
  /** 默认优先级 */
  NORMAL: 0,
  /** 低优先级 */
  LOW: -500,
  /** 最低优先级 */
  LOWEST: -1000,
} as const

/**
 * 功能类型枚举
 *
 * @description
 * 预定义的功能类型，便于分类管理
 */
export const FEATURE_TYPES = {
  /** 搜索功能 */
  SEARCH: 'search',
  /** 工具功能 */
  TOOL: 'tool',
  /** 系统功能 */
  SYSTEM: 'system',
  /** 网络功能 */
  NETWORK: 'network',
  /** 文件功能 */
  FILE: 'file',
  /** 应用功能 */
  APP: 'app',
} as const
