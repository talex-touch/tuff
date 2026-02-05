import type { TuffSearchResult } from '@talex-touch/utils/core-box'
import { TuffSearchResultBuilder } from '@talex-touch/utils/core-box'
import { customAppProvider, type CustomApp } from './custom-app-provider'
import { createLogger } from '@main/utils/logger'
import path from 'node:path'

const logger = createLogger('CustomAppIntegration')

/**
 * 自定义应用搜索集成
 * 将自定义应用集成到搜索系统中
 */
export class CustomAppIntegration {
  private cachedApps: CustomApp[] = []
  private lastCacheTime = 0
  private readonly CACHE_TTL = 5000 // 5 seconds

  /**
   * 搜索自定义应用
   */
  async search(query: string): Promise<TuffSearchResult[]> {
    try {
      // 刷新缓存
      await this.refreshCache()

      if (!query || query.trim().length === 0) {
        return []
      }

      const normalizedQuery = query.toLowerCase().trim()
      const results: Array<{ app: CustomApp; score: number }> = []

      for (const app of this.cachedApps) {
        const score = this.calculateScore(app, normalizedQuery)
        if (score > 0) {
          results.push({ app, score })
        }
      }

      // 按分数排序
      results.sort((a, b) => b.score - a.score)

      // 转换为 TuffSearchResult
      return results.map(({ app }) => this.appToSearchResult(app))
    } catch (error) {
      logger.error('Failed to search custom apps:', error)
      return []
    }
  }

  /**
   * 获取所有启用的自定义应用（用于推荐）
   */
  async getAllEnabled(): Promise<TuffSearchResult[]> {
    try {
      await this.refreshCache()
      return this.cachedApps.map((app) => this.appToSearchResult(app))
    } catch (error) {
      logger.error('Failed to get all enabled custom apps:', error)
      return []
    }
  }

  /**
   * 刷新缓存
   */
  private async refreshCache(): Promise<void> {
    const now = Date.now()
    if (now - this.lastCacheTime < this.CACHE_TTL) {
      return
    }

    this.cachedApps = await customAppProvider.getEnabledCustomApps()
    this.lastCacheTime = now
  }

  /**
   * 计算匹配分数
   */
  private calculateScore(app: CustomApp, query: string): number {
    let score = 0

    // 生成搜索关键词
    const keywords = customAppProvider.generateKeywords(app.displayName)

    // 完全匹配
    if (keywords.some((kw) => kw === query)) {
      score += 100
    }

    // 前缀匹配
    if (keywords.some((kw) => kw.startsWith(query))) {
      score += 80
    }

    // 包含匹配
    if (keywords.some((kw) => kw.includes(query))) {
      score += 60
    }

    // 文件名匹配
    const fileName = path.basename(app.path).toLowerCase()
    if (fileName.includes(query)) {
      score += 40
    }

    // 路径匹配
    if (app.path.toLowerCase().includes(query)) {
      score += 20
    }

    // 备注匹配
    if (app.notes && app.notes.toLowerCase().includes(query)) {
      score += 10
    }

    // 使用频率加权
    if (app.useCount > 0) {
      score += Math.min(app.useCount, 20)
    }

    // 最近使用加权
    if (app.lastUsedAt) {
      const daysSinceLastUse = (Date.now() - app.lastUsedAt) / (1000 * 60 * 60 * 24)
      if (daysSinceLastUse < 7) {
        score += 10
      }
    }

    return score
  }

  /**
   * 将 CustomApp 转换为 TuffSearchResult
   */
  private appToSearchResult(app: CustomApp): TuffSearchResult {
    const builder = new TuffSearchResultBuilder()

    // 基本信息
    builder
      .setId(`custom-app:${app.id}`)
      .setTitle(app.displayName)
      .setSubtitle(app.path)
      .setIcon(app.iconPath || this.getDefaultIcon(app.fileType))

    // 设置执行动作
    builder.setAction(async () => {
      try {
        await customAppProvider.launchCustomApp(app.id)
        return true
      } catch (error) {
        logger.error(`Failed to launch custom app ${app.id}:`, error)
        return false
      }
    })

    // 添加元数据
    builder.setMetadata({
      type: 'custom-app',
      customAppId: app.id,
      fileType: app.fileType,
      path: app.path
    })

    // 添加标签
    const tags: string[] = ['Custom App']
    if (app.fileType) {
      tags.push(app.fileType.toUpperCase())
    }
    builder.setTags(tags)

    return builder.build()
  }

  /**
   * 获取默认图标
   */
  private getDefaultIcon(fileType: string): string {
    const iconMap: Record<string, string> = {
      jar: 'java',
      exe: 'windows',
      app: 'apple',
      sh: 'terminal',
      bash: 'terminal',
      py: 'python',
      js: 'javascript',
      ts: 'typescript',
      rb: 'ruby'
    }

    return iconMap[fileType] || 'file'
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cachedApps = []
    this.lastCacheTime = 0
  }
}

// 导出单例
export const customAppIntegration = new CustomAppIntegration()
