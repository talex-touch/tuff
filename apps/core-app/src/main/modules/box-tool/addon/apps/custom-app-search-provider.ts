import type {
  ISearchProvider,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils/core-box'
import type { ProviderContext } from '../../search-engine/types'
import { TuffInputType } from '@talex-touch/utils/core-box'
import { customAppIntegration } from './custom-app-integration'
import { createLogger } from '@main/utils/logger'

const logger = createLogger('CustomAppSearchProvider')

/**
 * 自定义应用搜索 Provider
 * 作为独立的搜索提供者集成到搜索引擎中
 */
class CustomAppSearchProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'custom-app-provider'
  readonly name = 'Custom App Provider'
  readonly type = 'application' as const
  readonly supportedInputTypes = [TuffInputType.Text]
  readonly priority = 'fast' as const
  readonly expectedDuration = 20

  private context: ProviderContext | null = null

  async onLoad(context: ProviderContext): Promise<void> {
    this.context = context
    logger.info('Custom app search provider loaded')
  }

  async onDestroy(): Promise<void> {
    this.context = null
    customAppIntegration.clearCache()
    logger.info('Custom app search provider destroyed')
  }

  /**
   * 搜索自定义应用
   */
  async provide(query: TuffQuery): Promise<TuffSearchResult[]> {
    try {
      const searchText = query.text?.trim() || ''
      
      // 如果查询为空，返回空结果
      // （可以选择返回最近使用的自定义应用）
      if (!searchText) {
        return []
      }

      const results = await customAppIntegration.search(searchText)
      
      logger.debug(`Found ${results.length} custom apps for query: ${searchText}`)
      
      return results
    } catch (error) {
      logger.error('Failed to search custom apps:', error)
      return []
    }
  }
}

// 导出单例
export const customAppSearchProvider = new CustomAppSearchProvider()
