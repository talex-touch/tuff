import type { StoreProviderDefinition, StoreSourcesPayload } from '@talex-touch/utils/store'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { getTpexApiBase, NEXUS_BASE_URL } from '@talex-touch/utils/env'
import {
  DEFAULT_STORE_PROVIDERS,
  STORE_SOURCES_STORAGE_KEY,
  STORE_SOURCES_STORAGE_VERSION
} from '@talex-touch/utils/store'
import { getConfig, getMainConfig, saveConfig } from '../modules/storage'
import { createLogger } from '../utils/logger'
import { appTaskGate } from './app-task-gate'
import { performStoreHttpRequest } from './store-http.service'

const log = createLogger('StoreApiService')
const LEGACY_STORE_SOURCES_KEY = 'market-sources.json'

function clearLegacyStoreSourcesKey(): void {
  saveConfig(LEGACY_STORE_SOURCES_KEY, undefined, true, true)
}

function isStoreSourcesPayload(value: unknown): value is StoreSourcesPayload {
  if (!value || typeof value !== 'object') {
    return false
  }

  const payload = value as Partial<StoreSourcesPayload>
  return Array.isArray(payload.sources)
}

function migrateCompatStoreSourcesIfNeeded(): void {
  const currentRaw = getConfig(STORE_SOURCES_STORAGE_KEY)
  if (isStoreSourcesPayload(currentRaw)) {
    return
  }

  const legacyRaw = getConfig(LEGACY_STORE_SOURCES_KEY)
  if (!isStoreSourcesPayload(legacyRaw)) {
    return
  }

  const nextPayload: StoreSourcesPayload = {
    version: STORE_SOURCES_STORAGE_VERSION,
    sources: legacyRaw.sources
  }

  saveConfig(STORE_SOURCES_STORAGE_KEY, nextPayload, false, true)
  clearLegacyStoreSourcesKey()
  log.info('Compat migration hit: store sources key upgraded', {
    meta: {
      from: LEGACY_STORE_SOURCES_KEY,
      to: STORE_SOURCES_STORAGE_KEY,
      sourceCount: legacyRaw.sources.length
    }
  })
}

/**
 * Get all configured store sources from user storage
 */
export function getStoreSources(): StoreProviderDefinition[] {
  try {
    migrateCompatStoreSourcesIfNeeded()
    const payload = getMainConfig(STORE_SOURCES_STORAGE_KEY) as StoreSourcesPayload | null
    if (payload?.sources && Array.isArray(payload.sources)) {
      return payload.sources
    }
  } catch (error) {
    log.warn('Failed to read store sources from storage', { error })
  }
  return DEFAULT_STORE_PROVIDERS
}

/**
 * Get enabled tpexApi or nexusStore sources
 */
export function getEnabledApiSources(): StoreProviderDefinition[] {
  return getStoreSources().filter(
    (source) =>
      source.enabled !== false && (source.type === 'tpexApi' || source.type === 'nexusStore')
  )
}

/**
 * Get the primary store base URL from configured sources
 * Prioritizes enabled tpexApi sources by priority, falls back to defaults
 */
function getDefaultStoreBaseUrl(): string {
  const envBase = getTpexApiBase()
  if (envBase) return envBase

  // Get enabled API sources sorted by priority
  const sources = getEnabledApiSources()
    .filter((s) => s.type === 'tpexApi')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

  // Return the highest priority source URL
  if (sources.length > 0 && sources[0]!.url) {
    return sources[0]!.url.replace(/\/$/, '')
  }

  return NEXUS_BASE_URL
}

const DEFAULT_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface InstalledPluginInfo {
  slug: string
  version: string
}

interface PluginUpdateInfo {
  slug: string
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  downloadUrl?: string
  changelog?: string
}

interface UpdateCheckResponse {
  updates: PluginUpdateInfo[]
  checkedAt: string
}

export interface PluginInstallSource {
  source: string
  hintType?: string | null
  official: boolean
  provider: string
  installedAt: number
  metadata?: {
    providerId?: string
    providerName?: string
    providerType?: string
    officialId?: string
    officialVersion?: string
    officialSource?: string
  } | null
}

export interface PluginWithSource {
  name: string
  version: string
  installSource?: PluginInstallSource | null
}

/**
 * Check for plugin updates from the store
 */
export async function checkPluginUpdates(
  plugins: InstalledPluginInfo[],
  baseUrl?: string
): Promise<UpdateCheckResponse | null> {
  if (!plugins.length) return null

  const url = `${baseUrl ?? getDefaultStoreBaseUrl()}/api/store/updates`

  try {
    const response = await performStoreHttpRequest<UpdateCheckResponse>({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { plugins },
      timeout: 30_000
    })

    return response.data
  } catch (error) {
    log.warn('Failed to check plugin updates', { error })
    return null
  }
}

/**
 * Report plugin uninstall to the store (fire and forget)
 */
export async function reportPluginUninstall(slug: string, baseUrl?: string): Promise<boolean> {
  const url = `${baseUrl ?? getDefaultStoreBaseUrl()}/api/store/uninstall`

  try {
    await performStoreHttpRequest({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { slug },
      timeout: 10_000
    })

    log.debug('Plugin uninstall reported', { meta: { slug } })
    return true
  } catch (error) {
    log.debug('Failed to report plugin uninstall', { meta: { slug }, error })
    return false
  }
}

// ============================================
// Plugin Update Scheduler
// ============================================

type PluginSourceFetcher = () => Promise<PluginWithSource[]>
type UpdateNotifier = (updates: PluginUpdateInfo[]) => void

interface UpdateSchedulerOptions {
  checkIntervalMs?: number
  getPluginsWithSource: PluginSourceFetcher
  onUpdatesFound?: UpdateNotifier
}

class PluginUpdateScheduler {
  private static readonly pollingService = PollingService.getInstance()
  private readonly pollingTaskId = 'plugin-update-scheduler.check'
  private readonly pollingJitterMs = 30_000
  private checkInFlight = false
  private lastCheckTime = 0
  private readonly checkIntervalMs: number
  private readonly getPluginsWithSource: PluginSourceFetcher
  private readonly onUpdatesFound?: UpdateNotifier

  constructor(options: UpdateSchedulerOptions) {
    this.checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS
    this.getPluginsWithSource = options.getPluginsWithSource
    this.onUpdatesFound = options.onUpdatesFound
  }

  start(): void {
    if (PluginUpdateScheduler.pollingService.isRegistered(this.pollingTaskId)) {
      log.warn('Update scheduler already running')
      return
    }

    log.info('Starting plugin update scheduler', {
      meta: { intervalHours: this.checkIntervalMs / (60 * 60 * 1000) }
    })

    const initialDelayMs = 30_000 + Math.floor(Math.random() * this.pollingJitterMs)
    PluginUpdateScheduler.pollingService.register(
      this.pollingTaskId,
      () => {
        if (this.checkInFlight) {
          return
        }
        this.checkInFlight = true
        const jitterMs = Math.floor(Math.random() * this.pollingJitterMs)
        setTimeout(() => {
          void this.runUpdateCheck()
        }, jitterMs)
      },
      { interval: this.checkIntervalMs, unit: 'milliseconds', initialDelayMs }
    )
    PluginUpdateScheduler.pollingService.start()
  }

  private async runUpdateCheck(): Promise<void> {
    try {
      if (appTaskGate.isActive()) {
        await appTaskGate.waitForIdle()
      }
      await this.checkForUpdates()
    } finally {
      this.checkInFlight = false
    }
  }

  stop(): void {
    if (PluginUpdateScheduler.pollingService.isRegistered(this.pollingTaskId)) {
      PluginUpdateScheduler.pollingService.unregister(this.pollingTaskId)
      log.info('Plugin update scheduler stopped')
    }
  }

  async checkForUpdates(): Promise<PluginUpdateInfo[]> {
    const now = Date.now()
    if (now - this.lastCheckTime < 60_000) {
      log.debug('Skipping update check, too recent')
      return []
    }
    this.lastCheckTime = now

    log.info('Checking for plugin updates...')

    try {
      const plugins = await this.getPluginsWithSource()

      // Group plugins by provider source
      const grouped = this.groupBySource(plugins)

      const allUpdates: PluginUpdateInfo[] = []

      // Check official plugins
      if (grouped.official.length > 0) {
        const updates = await this.checkOfficialUpdates(grouped.official)
        allUpdates.push(...updates)
      }

      // Check third-party sources
      for (const [baseUrl, sourcePlugins] of grouped.thirdParty) {
        const updates = await this.checkThirdPartyUpdates(sourcePlugins, baseUrl)
        allUpdates.push(...updates)
      }

      const withUpdates = allUpdates.filter((u) => u.hasUpdate)
      if (withUpdates.length > 0) {
        log.info('Updates available', { meta: { count: withUpdates.length } })
        this.onUpdatesFound?.(withUpdates)
      } else {
        log.debug('All plugins are up to date')
      }

      return allUpdates
    } catch (error) {
      log.error('Failed to check for updates', { error })
      return []
    }
  }

  private groupBySource(plugins: PluginWithSource[]): {
    official: PluginWithSource[]
    thirdParty: Map<string, PluginWithSource[]>
  } {
    const official: PluginWithSource[] = []
    const thirdParty = new Map<string, PluginWithSource[]>()

    for (const plugin of plugins) {
      const source = plugin.installSource

      // No install source means local/dev plugin, skip
      if (!source) continue

      // Official plugins go to official store
      if (source.official) {
        official.push(plugin)
        continue
      }

      // Third-party: group by source URL base
      const providerType = source.metadata?.providerType
      if (providerType === 'tpexApi' || providerType === 'nexusStore') {
        // Extract base URL from source
        const baseUrl = this.extractBaseUrl(source.source)
        if (baseUrl) {
          const list = thirdParty.get(baseUrl) ?? []
          list.push(plugin)
          thirdParty.set(baseUrl, list)
        }
      }
      // Other provider types (npm, git, repository) don't support update check yet
    }

    return { official, thirdParty }
  }

  private extractBaseUrl(source: string): string | null {
    try {
      const url = new URL(source)
      return `${url.protocol}//${url.host}`
    } catch {
      return null
    }
  }

  private async checkOfficialUpdates(plugins: PluginWithSource[]): Promise<PluginUpdateInfo[]> {
    const input = plugins.map((p) => ({
      slug: p.installSource?.metadata?.officialId ?? p.name,
      version: p.version
    }))

    const result = await checkPluginUpdates(input)
    return result?.updates ?? []
  }

  private async checkThirdPartyUpdates(
    plugins: PluginWithSource[],
    baseUrl: string
  ): Promise<PluginUpdateInfo[]> {
    const input = plugins.map((p) => ({
      slug: p.name,
      version: p.version
    }))

    const result = await checkPluginUpdates(input, baseUrl)
    return result?.updates ?? []
  }
}

let schedulerInstance: PluginUpdateScheduler | null = null

/**
 * Initialize and start the plugin update scheduler
 */
export function startUpdateScheduler(options: UpdateSchedulerOptions): void {
  if (schedulerInstance) {
    schedulerInstance.stop()
  }
  schedulerInstance = new PluginUpdateScheduler(options)
  schedulerInstance.start()
}

/**
 * Stop the plugin update scheduler
 */
export function stopUpdateScheduler(): void {
  schedulerInstance?.stop()
  schedulerInstance = null
}

/**
 * Manually trigger an update check
 */
export async function triggerUpdateCheck(): Promise<PluginUpdateInfo[]> {
  if (!schedulerInstance) {
    log.warn('Update scheduler not initialized')
    return []
  }
  return schedulerInstance.checkForUpdates()
}
