/**
 * Plugin Market Service
 *
 * Provides unified search and browse capabilities for plugins
 * from multiple sources (NPM, TPEX, etc.)
 */

import type {
  MarketPluginInfo,
  MarketSearchOptions,
  MarketSearchResult,
} from '@talex-touch/utils/plugin/providers'
import { PluginMarketClient } from '@talex-touch/utils/plugin/providers'
import { getTpexApiBase } from '@talex-touch/utils/env'
import { createLogger } from '../utils/logger'

const log = createLogger('PluginMarketService')

// Singleton market client
let marketClient: PluginMarketClient | null = null

function resolveTpexApiBase(): string {
  if (process.env.NODE_ENV === 'development' && process.env.USE_LOCAL_NEXUS === 'true') {
    return 'http://localhost:3200'
  }

  return getTpexApiBase()
}

/**
 * Get or create the market client instance
 */
export function getMarketClient(): PluginMarketClient {
  if (!marketClient) {
    const tpexApiBase = resolveTpexApiBase()
    marketClient = new PluginMarketClient({
      tpexApiBase,
      npmRegistry: 'https://registry.npmjs.org',
    })
    log.info('Plugin market client initialized', { meta: { tpexApiBase } })
  }
  return marketClient
}

/**
 * Search for plugins across all sources
 */
export async function searchPlugins(options: MarketSearchOptions = {}): Promise<MarketSearchResult> {
  const client = getMarketClient()
  log.debug('Searching plugins', { meta: { keyword: options.keyword, source: options.source } })

  try {
    const result = await client.search(options)
    log.debug('Search completed', {
      meta: {
        total: result.total,
        tpex: result.sources.tpex,
        npm: result.sources.npm,
      },
    })
    return result
  }
  catch (error) {
    log.error('Plugin search failed', { error })
    throw error
  }
}

/**
 * Get plugin details by identifier
 */
export async function getPluginDetails(
  identifier: string,
  source?: 'tpex' | 'npm',
): Promise<MarketPluginInfo | null> {
  const client = getMarketClient()
  log.debug('Getting plugin details', { meta: { identifier, source } })

  try {
    return await client.getPlugin(identifier, source)
  }
  catch (error) {
    log.error('Failed to get plugin details', { error })
    return null
  }
}

/**
 * List official plugins from TPEX
 */
export async function listOfficialPlugins(): Promise<MarketPluginInfo[]> {
  const client = getMarketClient()
  log.debug('Listing official plugins')

  try {
    return await client.listOfficialPlugins()
  }
  catch (error) {
    log.error('Failed to list official plugins', { error })
    return []
  }
}

/**
 * List plugins from NPM
 */
export async function listNpmPlugins(): Promise<MarketPluginInfo[]> {
  const client = getMarketClient()
  log.debug('Listing NPM plugins')

  try {
    return await client.listNpmPlugins()
  }
  catch (error) {
    log.error('Failed to list NPM plugins', { error })
    return []
  }
}

/**
 * Get install source string for a plugin
 */
export function getInstallSource(plugin: MarketPluginInfo): string {
  const client = getMarketClient()
  return client.getInstallSource(plugin)
}

/**
 * Get featured plugins (official + popular)
 */
export async function getFeaturedPlugins(limit = 20): Promise<MarketPluginInfo[]> {
  const client = getMarketClient()
  log.debug('Getting featured plugins')

  try {
    const result = await client.search({ limit, source: 'all' })
    // Filter to get official plugins first, then popular ones
    return result.plugins.slice(0, limit)
  }
  catch (error) {
    log.error('Failed to get featured plugins', { error })
    return []
  }
}

/**
 * Get plugins by category
 */
export async function getPluginsByCategory(
  category: string,
  limit = 50,
): Promise<MarketPluginInfo[]> {
  const client = getMarketClient()
  log.debug('Getting plugins by category', { meta: { category } })

  try {
    const result = await client.search({ category, limit })
    return result.plugins
  }
  catch (error) {
    log.error('Failed to get plugins by category', { error })
    return []
  }
}
