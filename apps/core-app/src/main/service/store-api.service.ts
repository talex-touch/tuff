import type { StoreProviderDefinition, StoreSourcesPayload } from '@talex-touch/utils/store'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import {
  DEFAULT_NPM_REGISTRY_URL,
  encodeNpmPackagePath,
  formatNpmPluginSource,
  isAllowedNpmRegistryUrl,
  isValidNpmPackageName,
  NPM_ABBREVIATED_PACKUMENT_ACCEPT,
  parseNpmPluginSource,
  resolveNpmRegistryUrl
} from '@talex-touch/utils/plugin'
import { createRequire } from 'node:module'
import process from 'node:process'
import {
  createDefaultStoreProviders,
  DEFAULT_STORE_PROVIDERS,
  STORE_SOURCES_STORAGE_KEY
} from '@talex-touch/utils/store'
import { compareUpdateVersions } from '../../shared/update/version'
import { getRuntimeNexusBaseUrl } from '../modules/nexus/runtime-base'
import { getMainConfig } from '../modules/storage'
import { createLogger } from '../utils/logger'
import { appTaskGate } from './app-task-gate'
import { performStoreHttpRequest } from './store-http.service'

const log = createLogger('StoreApiService')

export const NPM_UPDATE_CHECK_CONCURRENCY = 4

function normalizeOfficialRuntimeSources(
  sources: StoreProviderDefinition[],
  baseUrl = getRuntimeNexusBaseUrl()
): StoreProviderDefinition[] {
  const runtimeNexus = createDefaultStoreProviders(baseUrl).find((item) => item.id === 'tuff-nexus')
  if (!runtimeNexus) return sources

  return sources.map((source) => {
    if (source.id !== 'tuff-nexus' || source.isOfficial !== true) {
      return source
    }

    return {
      ...source,
      url: runtimeNexus.url,
      config: {
        ...(source.config ?? {}),
        apiUrl: runtimeNexus.config?.apiUrl
      }
    }
  })
}

/**
 * Get all configured store sources from user storage
 */
export function getStoreSources(): StoreProviderDefinition[] {
  try {
    const payload = getMainConfig(STORE_SOURCES_STORAGE_KEY) as StoreSourcesPayload | null
    if (payload?.sources && Array.isArray(payload.sources)) {
      return normalizeOfficialRuntimeSources(payload.sources)
    }
  } catch (error) {
    log.warn('Failed to read store sources from storage', { error })
  }
  return normalizeOfficialRuntimeSources(DEFAULT_STORE_PROVIDERS)
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
 * Get enabled npmPackage sources sorted by priority descending
 */
export function getEnabledNpmSources(): StoreProviderDefinition[] {
  return getStoreSources()
    .filter((source) => source.enabled !== false && source.type === 'npmPackage')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}

/**
 * Get the primary store base URL from configured sources
 * Prioritizes enabled tpexApi sources by priority, falls back to defaults
 */
function getDefaultStoreBaseUrl(): string {
  const runtimeBase = getRuntimeNexusBaseUrl()

  // Get enabled API sources sorted by priority
  const sources = getEnabledApiSources()
    .filter((s) => s.type === 'tpexApi')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

  // Return the highest priority source URL
  if (sources.length > 0) {
    const source = sources[0]!
    const sourceUrl = source.url
    if (sourceUrl && (source.id !== 'tuff-nexus' || source.isOfficial !== true)) {
      return sourceUrl.replace(/\/$/, '')
    }
  }

  return runtimeBase
}

const DEFAULT_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface InstalledPluginInfo {
  slug: string
  version: string
}

export interface PluginUpdateInfo {
  slug: string
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  downloadUrl?: string
  changelog?: string
  source?: 'official' | 'third-party' | 'npm'
  packageName?: string
  registry?: string
  installSource?: string
}

interface UpdateCheckResponse {
  updates: PluginUpdateInfo[]
  checkedAt: string
}

export interface PluginInstallProviderMetadata {
  packageName?: string
  package?: string
  resolvedVersion?: string
  requestedSpec?: string
  distTag?: string
  registry?: string
  integrity?: string
  shasum?: string
  tarballUrl?: string
  trustTier?: string
  officialScope?: boolean
  [key: string]: unknown
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
    packageName?: string
    registry?: string
    distTag?: string
    [key: string]: unknown
  } | null
  providerMetadata?: PluginInstallProviderMetadata | null
}

export interface PluginWithSource {
  name: string
  version: string
  installSource?: PluginInstallSource | null
}

interface NpmAbbreviatedPackumentResponse {
  'dist-tags'?: Record<string, string>
  versions?: Record<
    string,
    {
      dist?: {
        tarball?: string
      }
    }
  >
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function isLocalHttpNpmRegistryAllowed(explicitOverride?: boolean): boolean {
  if (typeof explicitOverride === 'boolean') return explicitOverride
  if (!process.versions?.electron) return false
  try {
    const req = createRequire(import.meta.url)
    const electron = req('electron') as { app?: { isPackaged?: boolean } }
    return electron?.app?.isPackaged === false
  } catch {
    return false
  }
}

function resolveNpmUpdateTarget(
  plugin: PluginWithSource,
  allowLocalHttp: boolean
): { packageName: string; registry: string; distTag: string } | null {
  const source = plugin.installSource
  if (!source) return null

  const providerMeta = source.providerMetadata
  const requestMeta = source.metadata

  const rawPackageName =
    readTrimmedString(providerMeta?.packageName) ??
    readTrimmedString(providerMeta?.package) ??
    readTrimmedString(requestMeta?.packageName) ??
    parseNpmPluginSource(source.source, { allowAnyBarePackageName: true })?.packageName

  if (!rawPackageName || !isValidNpmPackageName(rawPackageName)) {
    return null
  }

  const distTag =
    readTrimmedString(providerMeta?.distTag) ?? readTrimmedString(requestMeta?.distTag) ?? 'latest'

  const storedRegistry =
    readTrimmedString(providerMeta?.registry) ?? readTrimmedString(requestMeta?.registry)

  const candidates: string[] = []
  if (storedRegistry) {
    if (!isAllowedNpmRegistryUrl(storedRegistry, { allowLocalHttp })) {
      log.warn('Skipping npm update check for plugin with disallowed registry URL', {
        meta: { pluginName: plugin.name, packageName: rawPackageName }
      })
      return null
    }
    candidates.push(storedRegistry)
  } else {
    try {
      for (const npmSource of getEnabledNpmSources()) {
        const configRegistry = readTrimmedString(npmSource.config?.registryUrl)
        if (configRegistry && isAllowedNpmRegistryUrl(configRegistry, { allowLocalHttp })) {
          candidates.push(configRegistry)
          continue
        }
        const sourceUrl = readTrimmedString(npmSource.url)
        if (sourceUrl && isAllowedNpmRegistryUrl(sourceUrl, { allowLocalHttp })) {
          candidates.push(sourceUrl)
        }
      }
    } catch {
      // Storage may not be ready; fall back to default registry
    }
  }

  const registry = resolveNpmRegistryUrl([...candidates, DEFAULT_NPM_REGISTRY_URL], {
    allowLocalHttp
  })

  return {
    packageName: rawPackageName,
    registry,
    distTag
  }
}

/**
 * Check for updates of npm-installed plugins using abbreviated packuments with bounded concurrency.
 */
export async function checkNpmPluginUpdates(
  plugins: PluginWithSource[],
  options: { allowLocalHttp?: boolean; concurrency?: number } = {}
): Promise<PluginUpdateInfo[]> {
  if (!plugins.length) return []

  const allowLocalHttp = isLocalHttpNpmRegistryAllowed(options.allowLocalHttp)
  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? NPM_UPDATE_CHECK_CONCURRENCY, NPM_UPDATE_CHECK_CONCURRENCY)
  )
  const workerCount = Math.min(concurrency, plugins.length)
  const results: Array<PluginUpdateInfo | null> = new Array(plugins.length).fill(null)
  let nextIndex = 0

  const checkOne = async (plugin: PluginWithSource): Promise<PluginUpdateInfo | null> => {
    const target = resolveNpmUpdateTarget(plugin, allowLocalHttp)
    if (!target) return null

    const { packageName, registry, distTag } = target
    const url = `${registry}/${encodeNpmPackagePath(packageName)}`

    try {
      const response = await performStoreHttpRequest<NpmAbbreviatedPackumentResponse>({
        url,
        method: 'GET',
        headers: {
          Accept: NPM_ABBREVIATED_PACKUMENT_ACCEPT
        },
        responseType: 'json',
        timeout: 15_000
      })

      if (response.status < 200 || response.status >= 300 || !response.data) {
        return null
      }

      const distTags = response.data['dist-tags']
      const latestVersion =
        readTrimmedString(distTags?.[distTag]) ?? readTrimmedString(distTags?.latest)
      if (!latestVersion) return null

      const hasUpdate = compareUpdateVersions(latestVersion, plugin.version) === 1
      const tarballUrl = readTrimmedString(response.data.versions?.[latestVersion]?.dist?.tarball)
      const installSource = formatNpmPluginSource(packageName, latestVersion)

      return {
        slug: plugin.name,
        currentVersion: plugin.version,
        latestVersion,
        hasUpdate,
        ...(tarballUrl ? { downloadUrl: tarballUrl } : {}),
        source: 'npm',
        packageName,
        registry,
        installSource
      }
    } catch (error) {
      log.warn('Failed to check npm plugin update', {
        meta: { pluginName: plugin.name, packageName, registry },
        error
      })
      return null
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < plugins.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await checkOne(plugins[index]!)
      }
    })
  )

  return results.filter((entry): entry is PluginUpdateInfo => entry !== null)
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
  allowLocalHttpNpmRegistry?: boolean
}

export class PluginUpdateScheduler {
  private static readonly pollingService = PollingService.getInstance()
  private readonly pollingTaskId = 'plugin-update-scheduler.check'
  private readonly pollingJitterMs = 30_000
  private checkInFlight = false
  private lastCheckTime = 0
  private readonly checkIntervalMs: number
  private readonly getPluginsWithSource: PluginSourceFetcher
  private readonly onUpdatesFound?: UpdateNotifier
  private readonly allowLocalHttpNpmRegistry?: boolean

  constructor(options: UpdateSchedulerOptions) {
    this.checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS
    this.getPluginsWithSource = options.getPluginsWithSource
    this.onUpdatesFound = options.onUpdatesFound
    this.allowLocalHttpNpmRegistry = options.allowLocalHttpNpmRegistry
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

      // Check npm-installed plugins
      if (grouped.npm.length > 0) {
        const updates = await this.checkNpmUpdates(grouped.npm)
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
    npm: PluginWithSource[]
  } {
    const official: PluginWithSource[] = []
    const thirdParty = new Map<string, PluginWithSource[]>()
    const npm: PluginWithSource[] = []

    for (const plugin of plugins) {
      const source = plugin.installSource

      // No install source means local/dev plugin, skip
      if (!source) continue

      // NPM-installed plugins query their configured npm registry packument
      if (source.provider === 'npm') {
        npm.push(plugin)
        continue
      }

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
      // Other provider types (git, repository) don't support update check yet
    }

    return { official, thirdParty, npm }
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

  private async checkNpmUpdates(plugins: PluginWithSource[]): Promise<PluginUpdateInfo[]> {
    return checkNpmPluginUpdates(plugins, {
      allowLocalHttp: this.allowLocalHttpNpmRegistry
    })
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
