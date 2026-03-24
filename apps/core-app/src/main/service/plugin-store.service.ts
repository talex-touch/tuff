/**
 * Plugin Store Service
 *
 * Provides unified search and browse capabilities for plugins
 * from multiple sources (NPM, TPEX, etc.)
 */

import type {
  StorePluginInfo,
  StoreSearchOptions,
  StoreSearchResult
} from '@talex-touch/utils/plugin/providers'
import { getTpexApiBase } from '@talex-touch/utils/env'
import { PluginStoreClient } from '@talex-touch/utils/plugin/providers'
import { createLogger } from '../utils/logger'

const log = createLogger('PluginStoreService')

// Singleton store client
let storeClient: PluginStoreClient | null = null

function resolveTpexApiBase(): string {
  return getTpexApiBase()
}

/**
 * Get or create the store client instance
 */
export function getStoreClient(): PluginStoreClient {
  if (!storeClient) {
    const tpexApiBase = resolveTpexApiBase()
    storeClient = new PluginStoreClient({
      tpexApiBase,
      npmRegistry: 'https://registry.npmjs.org'
    })
    log.info('Plugin store client initialized', { meta: { tpexApiBase } })
  }
  return storeClient
}

/**
 * Search for plugins across all sources
 */
export async function searchPlugins(options: StoreSearchOptions = {}): Promise<StoreSearchResult> {
  const client = getStoreClient()
  log.debug('Searching plugins', { meta: { keyword: options.keyword, source: options.source } })

  try {
    const result = await client.search(options)
    log.debug('Search completed', {
      meta: {
        total: result.total,
        tpex: result.sources.tpex,
        npm: result.sources.npm
      }
    })
    return result
  } catch (error) {
    log.error('Plugin search failed', { error })
    throw error
  }
}

/**
 * Get plugin details by identifier
 */
export async function getPluginDetails(
  identifier: string,
  source?: 'tpex' | 'npm'
): Promise<StorePluginInfo | null> {
  const client = getStoreClient()
  log.debug('Getting plugin details', { meta: { identifier, source } })

  try {
    return await client.getPlugin(identifier, source)
  } catch (error) {
    log.error('Failed to get plugin details', { error })
    return null
  }
}

/**
 * List official plugins from TPEX
 */
export async function listOfficialPlugins(): Promise<StorePluginInfo[]> {
  const client = getStoreClient()
  log.debug('Listing official plugins')

  try {
    return await client.listOfficialPlugins()
  } catch (error) {
    log.error('Failed to list official plugins', { error })
    return []
  }
}

/**
 * List plugins from NPM
 */
export async function listNpmPlugins(): Promise<StorePluginInfo[]> {
  const client = getStoreClient()
  log.debug('Listing NPM plugins')

  try {
    return await client.listNpmPlugins()
  } catch (error) {
    log.error('Failed to list NPM plugins', { error })
    return []
  }
}

/**
 * Get install source string for a plugin
 */
export function getInstallSource(plugin: StorePluginInfo): string {
  const client = getStoreClient()
  return client.getInstallSource(plugin)
}

/**
 * Get featured plugins (official + popular)
 */
export async function getFeaturedPlugins(limit = 20): Promise<StorePluginInfo[]> {
  const client = getStoreClient()
  log.debug('Getting featured plugins')

  try {
    const result = await client.search({ limit, source: 'all' })
    // Filter to get official plugins first, then popular ones
    return result.plugins.slice(0, limit)
  } catch (error) {
    log.error('Failed to get featured plugins', { error })
    return []
  }
}

/**
 * Get plugins by category
 */
export async function getPluginsByCategory(
  category: string,
  limit = 50
): Promise<StorePluginInfo[]> {
  const client = getStoreClient()
  log.debug('Getting plugins by category', { meta: { category } })

  try {
    const result = await client.search({ category, limit })
    return result.plugins
  } catch (error) {
    log.error('Failed to get plugins by category', { error })
    return []
  }
}
