/**
 * Agent Store Service
 *
 * Provides APIs for browsing, searching and managing agents from external sources.
 */

import { StorageList, type AgentCapability, type AgentDescriptor } from '@talex-touch/utils'
import { getTpexApiBase } from '@talex-touch/utils/env'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import compressing from 'compressing'
import { app } from 'electron'
import fse from 'fs-extra'
import { getNetworkService } from '../modules/network'
import {
  getConfig,
  getMainConfig,
  isMainStorageReady,
  saveConfig,
  saveMainConfig
} from '../modules/storage'
import { createLogger } from '../utils/logger'

const log = createLogger('AgentStore')
const LEGACY_AGENT_STORE_KEY = 'agent-market.json'
const REMOTE_CATALOG_CACHE_TTL_MS = 2 * 60 * 1000
const NETWORK_TIMEOUT_MS = 20_000

/**
 * Store agent metadata
 */
export interface StoreAgentInfo {
  id: string
  name: string
  description: string
  version: string
  author: string
  category:
    | 'productivity'
    | 'file-management'
    | 'data-processing'
    | 'search'
    | 'automation'
    | 'development'
    | 'custom'
  capabilities: string[]
  tags: string[]
  downloads: number
  rating: number
  ratingCount: number
  source: 'official' | 'community' | 'local'
  isInstalled: boolean
  installedVersion?: string
  hasUpdate?: boolean
  createdAt: number
  updatedAt: number
  icon?: string
  homepage?: string
  repository?: string
}

/**
 * Agent search options
 */
export interface AgentSearchOptions {
  keyword?: string
  category?: StoreAgentInfo['category']
  source?: StoreAgentInfo['source']
  tags?: string[]
  sortBy?: 'downloads' | 'rating' | 'updated' | 'name'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

/**
 * Agent search result
 */
export interface AgentSearchResult {
  agents: StoreAgentInfo[]
  total: number
  hasMore: boolean
}

/**
 * Agent install options
 */
export interface AgentInstallOptions {
  agentId: string
  version?: string
  force?: boolean
}

/**
 * Agent install result
 */
export interface AgentInstallResult {
  success: boolean
  agentId: string
  version: string
  message?: string
  error?: string
}

interface AgentStoreState {
  installed: Record<string, string>
}

interface RemoteAgentPackage {
  version: string
  downloadUrl: string
  checksum?: string
}

interface RemoteCatalogSnapshot {
  fetchedAt: number
  agents: StoreAgentInfo[]
  packagesByAgent: Map<string, Map<string, RemoteAgentPackage>>
}

function isAgentStoreState(value: unknown): value is AgentStoreState {
  if (!value || typeof value !== 'object') {
    return false
  }
  const state = value as Partial<AgentStoreState>
  return Boolean(state.installed && typeof state.installed === 'object')
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return Date.now()
}

function normalizeCategory(value: unknown): StoreAgentInfo['category'] {
  const normalized = safeString(value).toLowerCase()
  if (
    normalized === 'productivity' ||
    normalized === 'file-management' ||
    normalized === 'data-processing' ||
    normalized === 'search' ||
    normalized === 'automation' ||
    normalized === 'development' ||
    normalized === 'custom'
  ) {
    return normalized
  }
  return 'custom'
}

function normalizeSource(value: unknown): StoreAgentInfo['source'] {
  const normalized = safeString(value).toLowerCase()
  if (normalized === 'official' || normalized === 'community' || normalized === 'local') {
    return normalized
  }
  return 'community'
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((tag) => safeString(tag)).filter(Boolean)
}

function normalizeCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((capability) => safeString(capability)).filter(Boolean)
}

function normalizePackage(value: unknown, fallbackVersion?: string): RemoteAgentPackage | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const obj = value as Record<string, unknown>
  const version = safeString(obj.version, fallbackVersion || '')
  const downloadUrl = safeString(obj.downloadUrl) || safeString(obj.url)
  if (!version || !downloadUrl) {
    return null
  }
  const checksum = safeString(obj.sha256) || safeString(obj.checksum)
  return {
    version,
    downloadUrl,
    checksum: checksum || undefined
  }
}

function clearLegacyAgentStoreKey(): void {
  saveConfig(LEGACY_AGENT_STORE_KEY, undefined, true, true)
}

function compareVersion(a: string, b: string): number {
  const normalize = (version: string): Array<number | string> =>
    version
      .replace(/^v/i, '')
      .split(/[.\-+_]/g)
      .filter(Boolean)
      .map((part) => {
        const numeric = Number(part)
        return Number.isFinite(numeric) ? numeric : part
      })

  const left = normalize(a)
  const right = normalize(b)
  const max = Math.max(left.length, right.length)

  for (let i = 0; i < max; i += 1) {
    const l = left[i]
    const r = right[i]
    if (l === undefined && r === undefined) return 0
    if (l === undefined) return -1
    if (r === undefined) return 1
    if (typeof l === 'number' && typeof r === 'number') {
      if (l > r) return 1
      if (l < r) return -1
      continue
    }
    const lStr = String(l)
    const rStr = String(r)
    if (lStr > rStr) return 1
    if (lStr < rStr) return -1
  }
  return 0
}

// Built-in agents catalog
const BUILTIN_AGENTS: StoreAgentInfo[] = [
  {
    id: 'builtin.file-agent',
    name: 'File Agent',
    description: '智能文件管理助手，支持文件搜索、批量重命名、自动整理和重复检测',
    version: '1.0.0',
    author: 'Tuff Team',
    category: 'file-management',
    capabilities: ['file.search', 'file.organize', 'file.rename', 'file.duplicate'],
    tags: ['file', 'organize', 'rename', 'duplicate'],
    downloads: 0,
    rating: 5,
    ratingCount: 0,
    source: 'official',
    isInstalled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    icon: 'i-carbon-folder'
  },
  {
    id: 'builtin.search-agent',
    name: 'Search Agent',
    description: '智能搜索增强助手，提供语义搜索、搜索建议和结果排序优化',
    version: '1.0.0',
    author: 'Tuff Team',
    category: 'search',
    capabilities: ['search.smart', 'search.semantic', 'search.suggest', 'search.rank'],
    tags: ['search', 'semantic', 'suggest'],
    downloads: 0,
    rating: 5,
    ratingCount: 0,
    source: 'official',
    isInstalled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    icon: 'i-carbon-search'
  },
  {
    id: 'builtin.data-agent',
    name: 'Data Agent',
    description: '数据处理助手，支持数据提取、格式转换、清洗和分析',
    version: '1.0.0',
    author: 'Tuff Team',
    category: 'data-processing',
    capabilities: ['data.extract', 'data.transform', 'data.format', 'data.clean', 'data.analyze'],
    tags: ['data', 'transform', 'json', 'csv', 'yaml'],
    downloads: 0,
    rating: 5,
    ratingCount: 0,
    source: 'official',
    isInstalled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    icon: 'i-carbon-data-base'
  }
]

const BUILTIN_AGENT_IDS = new Set(BUILTIN_AGENTS.map((agent) => agent.id))
const BUILTIN_AGENT_VERSION_MAP = new Map(BUILTIN_AGENTS.map((agent) => [agent.id, agent.version]))

/**
 * Agent Store Service
 */
class AgentStoreService {
  private installedAgentIds = new Set<string>(BUILTIN_AGENT_IDS)
  private installedAgentVersions = new Map<string, string>(BUILTIN_AGENT_VERSION_MAP)
  private storageLoaded = false
  private pendingPersist = false
  private remoteCatalog: RemoteCatalogSnapshot | null = null

  private resolveCatalogBase(): string {
    const base = getTpexApiBase().replace(/\/+$/, '')
    return base
  }

  private getCatalogUrls(): string[] {
    const base = this.resolveCatalogBase()
    return [
      `${base}/api/v1/agents/catalog`,
      `${base}/api/v1/agents/index.json`,
      `${base}/api/agents/index.json`
    ]
  }

  private getInstallRoot(): string {
    return path.join(app.getPath('userData'), 'agents-store')
  }

  private getAgentInstallDir(agentId: string): string {
    const safeId = agentId.replace(/[^a-zA-Z0-9._-]/g, '_')
    return path.join(this.getInstallRoot(), safeId)
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await getNetworkService().request<T>({
      url,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Tuff-AgentStore/1.0'
      },
      timeoutMs: NETWORK_TIMEOUT_MS,
      responseType: 'json'
    })
    return response.data
  }

  private parseRemoteCatalog(payload: unknown): RemoteCatalogSnapshot {
    const rawAgents = Array.isArray(payload)
      ? payload
      : payload &&
          typeof payload === 'object' &&
          Array.isArray((payload as { agents?: unknown[] }).agents)
        ? ((payload as { agents: unknown[] }).agents ?? [])
        : []

    const parsedAgents: StoreAgentInfo[] = []
    const packagesByAgent = new Map<string, Map<string, RemoteAgentPackage>>()

    for (const entry of rawAgents) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const record = entry as Record<string, unknown>
      const id = safeString(record.id)
      if (!id || BUILTIN_AGENT_IDS.has(id)) {
        continue
      }

      const packageMap = new Map<string, RemoteAgentPackage>()
      const versions = Array.isArray(record.versions) ? record.versions : []
      for (const versionEntry of versions) {
        const pkg = normalizePackage(versionEntry)
        if (pkg) {
          packageMap.set(pkg.version, pkg)
        }
      }

      const fallbackVersion = safeString(record.latestVersion) || safeString(record.version)
      const fallbackPkg =
        normalizePackage(record.package, fallbackVersion) ||
        normalizePackage(record, fallbackVersion)
      if (fallbackPkg) {
        packageMap.set(fallbackPkg.version, fallbackPkg)
      }

      if (packageMap.size <= 0) {
        continue
      }

      const latestVersion =
        safeString(record.latestVersion) ||
        safeString(record.version) ||
        [...packageMap.keys()].sort(compareVersion).at(-1) ||
        ''
      if (!latestVersion) {
        continue
      }

      const agent: StoreAgentInfo = {
        id,
        name: safeString(record.name, id),
        description: safeString(record.description, 'No description'),
        version: latestVersion,
        author: safeString(record.author, 'Unknown'),
        category: normalizeCategory(record.category),
        capabilities: normalizeCapabilities(record.capabilities),
        tags: normalizeTags(record.tags),
        downloads: safeNumber(record.downloads, 0),
        rating: safeNumber(record.rating, 0),
        ratingCount: safeNumber(record.ratingCount, 0),
        source: normalizeSource(record.source),
        isInstalled: false,
        createdAt: normalizeTimestamp(record.createdAt),
        updatedAt: normalizeTimestamp(record.updatedAt),
        icon: safeString(record.icon) || undefined,
        homepage: safeString(record.homepage) || undefined,
        repository: safeString(record.repository) || undefined
      }

      parsedAgents.push(agent)
      packagesByAgent.set(agent.id, packageMap)
    }

    return {
      fetchedAt: Date.now(),
      agents: parsedAgents,
      packagesByAgent
    }
  }

  private async loadRemoteCatalog(force = false): Promise<RemoteCatalogSnapshot> {
    if (
      !force &&
      this.remoteCatalog &&
      Date.now() - this.remoteCatalog.fetchedAt < REMOTE_CATALOG_CACHE_TTL_MS
    ) {
      return this.remoteCatalog
    }

    const errors: string[] = []
    for (const url of this.getCatalogUrls()) {
      try {
        const payload = await this.fetchJson<unknown>(url)
        const snapshot = this.parseRemoteCatalog(payload)
        this.remoteCatalog = snapshot
        return snapshot
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        errors.push(`${url}: ${reason}`)
      }
    }

    throw new Error(`Agent store catalog unavailable. ${errors.join(' | ')}`)
  }

  private async listRemoteAgents(force = false): Promise<StoreAgentInfo[]> {
    const snapshot = await this.loadRemoteCatalog(force)
    return snapshot.agents
  }

  private migrateLegacyAgentStoreIfNeeded(): void {
    const currentRaw = getConfig(StorageList.AGENT_STORE)
    if (isAgentStoreState(currentRaw)) {
      return
    }

    const legacyRaw = getConfig(LEGACY_AGENT_STORE_KEY)
    if (!isAgentStoreState(legacyRaw)) {
      return
    }

    saveConfig(StorageList.AGENT_STORE, legacyRaw, false, true)
    clearLegacyAgentStoreKey()
    log.info('Migrated legacy agent store key', {
      meta: {
        from: LEGACY_AGENT_STORE_KEY,
        to: StorageList.AGENT_STORE,
        installedCount: Object.keys(legacyRaw.installed).length
      }
    })
  }

  private ensureStorageLoaded(): void {
    if (this.storageLoaded) return
    if (!isMainStorageReady()) return

    this.migrateLegacyAgentStoreIfNeeded()

    try {
      const state = getMainConfig(StorageList.AGENT_STORE) as AgentStoreState | undefined
      const installed = state?.installed ?? {}
      for (const [agentId, version] of Object.entries(installed)) {
        if (!agentId) continue
        this.installedAgentIds.add(agentId)
        if (typeof version === 'string' && version.length > 0) {
          this.installedAgentVersions.set(agentId, version)
        }
      }
    } catch (error) {
      log.warn('Failed to load agent store state', { error })
    }

    this.storageLoaded = true
    if (this.pendingPersist) {
      this.persistInstalledState()
    }
  }

  private persistInstalledState(): void {
    if (!isMainStorageReady()) {
      this.pendingPersist = true
      return
    }

    const installed: Record<string, string> = {}
    for (const [agentId, version] of this.installedAgentVersions.entries()) {
      if (!this.installedAgentIds.has(agentId)) continue
      if (BUILTIN_AGENT_IDS.has(agentId)) continue
      installed[agentId] = version
    }

    try {
      saveMainConfig(StorageList.AGENT_STORE, { installed })
      this.pendingPersist = false
    } catch (error) {
      log.warn('Failed to save agent store state', { error })
    }
  }

  private resolveInstalledVersion(agent: StoreAgentInfo): string | undefined {
    const stored = this.installedAgentVersions.get(agent.id)
    if (stored) return stored
    if (BUILTIN_AGENT_IDS.has(agent.id)) return agent.version
    return undefined
  }

  private applyInstallMeta(agent: StoreAgentInfo): StoreAgentInfo {
    const isInstalled = this.installedAgentIds.has(agent.id)
    const installedVersion = isInstalled ? this.resolveInstalledVersion(agent) : undefined
    const hasUpdate = Boolean(
      isInstalled && installedVersion && compareVersion(agent.version, installedVersion) > 0
    )
    return {
      ...agent,
      isInstalled,
      installedVersion,
      hasUpdate
    }
  }

  private async downloadPackage(url: string, outputPath: string): Promise<void> {
    const response = await getNetworkService().request<ArrayBuffer>({
      url,
      method: 'GET',
      headers: { 'User-Agent': 'Tuff-AgentStore/1.0' },
      timeoutMs: NETWORK_TIMEOUT_MS,
      responseType: 'arrayBuffer'
    })
    if (!(response.data instanceof ArrayBuffer)) {
      throw new Error('Failed to download package: invalid payload')
    }
    const buffer = Buffer.from(response.data)
    await fse.outputFile(outputPath, buffer)
  }

  private async verifyChecksumIfNeeded(filePath: string, expectedChecksum?: string): Promise<void> {
    if (!expectedChecksum) {
      return
    }
    const expected = expectedChecksum
      .replace(/^sha256:/i, '')
      .toLowerCase()
      .trim()
    if (!expected) {
      return
    }
    const payload = await fse.readFile(filePath)
    const actual = crypto.createHash('sha256').update(payload).digest('hex').toLowerCase()
    if (actual !== expected) {
      throw new Error(`Checksum mismatch: expected ${expected}, got ${actual}`)
    }
  }

  private async extractPackage(packagePath: string, targetDir: string): Promise<void> {
    const lower = packagePath.toLowerCase()
    if (lower.endsWith('.zip')) {
      await compressing.zip.uncompress(packagePath, targetDir)
      return
    }
    if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
      await compressing.tgz.uncompress(packagePath, targetDir)
      return
    }
    if (lower.endsWith('.tar') || lower.endsWith('.tpex')) {
      await compressing.tar.uncompress(packagePath, targetDir)
      return
    }

    const extractors: Array<() => Promise<void>> = [
      async () => await compressing.zip.uncompress(packagePath, targetDir),
      async () => await compressing.tgz.uncompress(packagePath, targetDir),
      async () => await compressing.tar.uncompress(packagePath, targetDir)
    ]
    for (const extractor of extractors) {
      try {
        await extractor()
        return
      } catch {
        // try next extractor
      }
    }
    throw new Error('Unsupported agent package format')
  }

  private async resolveExtractedRoot(extractDir: string): Promise<string> {
    const rootAgentJson = path.join(extractDir, 'agent.json')
    const rootManifest = path.join(extractDir, 'manifest.json')
    if ((await fse.pathExists(rootAgentJson)) || (await fse.pathExists(rootManifest))) {
      return extractDir
    }

    const entries = await fse.readdir(extractDir)
    if (entries.length === 1) {
      const candidate = path.join(extractDir, entries[0]!)
      const stat = await fse.stat(candidate)
      if (stat.isDirectory()) {
        return candidate
      }
    }

    throw new Error('Invalid agent package: missing agent manifest')
  }

  private async resolveInstalledVersionFromPayload(
    payloadRoot: string,
    fallbackVersion: string
  ): Promise<string> {
    const agentJsonPath = path.join(payloadRoot, 'agent.json')
    if (!(await fse.pathExists(agentJsonPath))) {
      return fallbackVersion
    }
    try {
      const payload = (await fse.readJSON(agentJsonPath)) as { version?: unknown }
      const version = safeString(payload.version)
      return version || fallbackVersion
    } catch {
      return fallbackVersion
    }
  }

  private async installWithRollback(
    agentId: string,
    targetVersion: string,
    pkg: RemoteAgentPackage
  ): Promise<string> {
    const installDir = this.getAgentInstallDir(agentId)
    const currentDir = path.join(installDir, 'current')
    const backupDir = path.join(installDir, `rollback-${Date.now()}`)
    const tempDir = await fse.mkdtemp(path.join(os.tmpdir(), `tuff-agent-${Date.now()}-`))
    const packagePath = path.join(tempDir, 'agent-package.bin')
    const extractDir = path.join(tempDir, 'extract')
    let hasBackup = false

    try {
      await this.downloadPackage(pkg.downloadUrl, packagePath)
      await this.verifyChecksumIfNeeded(packagePath, pkg.checksum)
      await fse.ensureDir(extractDir)
      await this.extractPackage(packagePath, extractDir)
      const payloadRoot = await this.resolveExtractedRoot(extractDir)
      const installedVersion = await this.resolveInstalledVersionFromPayload(
        payloadRoot,
        targetVersion
      )

      await fse.ensureDir(installDir)
      if (await fse.pathExists(currentDir)) {
        await fse.move(currentDir, backupDir, { overwrite: true })
        hasBackup = true
      }

      await fse.copy(payloadRoot, currentDir, { overwrite: true })
      await fse.writeJSON(
        path.join(currentDir, 'install-meta.json'),
        {
          agentId,
          version: installedVersion,
          downloadedFrom: pkg.downloadUrl,
          installedAt: Date.now()
        },
        { spaces: 2 }
      )

      if (hasBackup) {
        await fse.remove(backupDir)
      }

      return installedVersion
    } catch (error) {
      if (hasBackup) {
        try {
          await fse.remove(currentDir)
          await fse.move(backupDir, currentDir, { overwrite: true })
        } catch (rollbackError) {
          log.error('Agent install rollback failed', {
            error: rollbackError,
            meta: { agentId, backupDir, currentDir }
          })
        }
      }
      throw error
    } finally {
      await fse.remove(tempDir).catch(() => {})
    }
  }

  /**
   * Search agents in the store
   */
  async searchAgents(options: AgentSearchOptions = {}): Promise<AgentSearchResult> {
    const {
      keyword,
      category,
      source,
      tags,
      sortBy = 'downloads',
      sortOrder = 'desc',
      limit = 20,
      offset = 0
    } = options

    log.debug(`Searching agents: ${JSON.stringify(options)}`)
    this.ensureStorageLoaded()

    let remoteAgents: StoreAgentInfo[] = []
    try {
      remoteAgents = await this.listRemoteAgents()
    } catch (error) {
      log.warn('Agent store remote catalog unavailable for search', { error })
    }

    let agents = [...BUILTIN_AGENTS, ...remoteAgents]
    agents = agents.map((agent) => this.applyInstallMeta(agent))

    if (keyword) {
      const lowerKeyword = keyword.toLowerCase()
      agents = agents.filter(
        (agent) =>
          agent.name.toLowerCase().includes(lowerKeyword) ||
          agent.description.toLowerCase().includes(lowerKeyword) ||
          agent.tags.some((tag) => tag.toLowerCase().includes(lowerKeyword))
      )
    }

    if (category) {
      agents = agents.filter((agent) => agent.category === category)
    }

    if (source) {
      agents = agents.filter((agent) => agent.source === source)
    }

    if (tags && tags.length > 0) {
      agents = agents.filter((agent) => tags.some((tag) => agent.tags.includes(tag)))
    }

    agents.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'downloads':
          comparison = a.downloads - b.downloads
          break
        case 'rating':
          comparison = a.rating - b.rating
          break
        case 'updated':
          comparison = a.updatedAt - b.updatedAt
          break
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
      }
      return sortOrder === 'desc' ? -comparison : comparison
    })

    const total = agents.length
    const paginated = agents.slice(offset, offset + limit)

    return {
      agents: paginated,
      total,
      hasMore: offset + limit < total
    }
  }

  /**
   * Get agent details by ID
   */
  async getAgentDetails(agentId: string): Promise<StoreAgentInfo | null> {
    this.ensureStorageLoaded()
    const builtin = BUILTIN_AGENTS.find((agent) => agent.id === agentId)
    if (builtin) {
      return this.applyInstallMeta(builtin)
    }

    try {
      const remoteAgents = await this.listRemoteAgents()
      const remote = remoteAgents.find((agent) => agent.id === agentId)
      return remote ? this.applyInstallMeta(remote) : null
    } catch (error) {
      log.warn('Failed to get remote agent details', { error, meta: { agentId } })
      return null
    }
  }

  /**
   * Get featured/recommended agents
   */
  async getFeaturedAgents(): Promise<StoreAgentInfo[]> {
    this.ensureStorageLoaded()
    try {
      const remoteAgents = await this.listRemoteAgents()
      const sorted = [...remoteAgents].sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating
        return b.downloads - a.downloads
      })
      return sorted.slice(0, 20).map((agent) => this.applyInstallMeta(agent))
    } catch (error) {
      log.warn('Failed to get remote featured agents', { error })
      return BUILTIN_AGENTS.map((agent) => this.applyInstallMeta(agent))
    }
  }

  /**
   * Get installed agents
   */
  async getInstalledAgents(): Promise<StoreAgentInfo[]> {
    this.ensureStorageLoaded()
    const merged = new Map<string, StoreAgentInfo>()
    BUILTIN_AGENTS.forEach((agent) => merged.set(agent.id, agent))
    try {
      const remoteAgents = await this.listRemoteAgents()
      remoteAgents.forEach((agent) => merged.set(agent.id, agent))
    } catch (error) {
      log.warn('Failed to sync remote agents for installed list', { error })
    }
    return Array.from(merged.values())
      .filter((agent) => this.installedAgentIds.has(agent.id))
      .map((agent) => this.applyInstallMeta(agent))
  }

  /**
   * Get available categories
   */
  async getCategories(): Promise<{ id: string; name: string; count: number }[]> {
    const agents = await this.searchAgents({ limit: 1000, offset: 0 })
    const categoryMap = new Map<string, number>()
    for (const agent of agents.agents) {
      categoryMap.set(agent.category, (categoryMap.get(agent.category) || 0) + 1)
    }

    const categoryNames: Record<string, string> = {
      productivity: '生产力',
      'file-management': '文件管理',
      'data-processing': '数据处理',
      search: '搜索',
      automation: '自动化',
      development: '开发',
      custom: '自定义'
    }

    return Array.from(categoryMap.entries()).map(([id, count]) => ({
      id,
      name: categoryNames[id] || id,
      count
    }))
  }

  /**
   * Install an agent
   */
  async installAgent(options: AgentInstallOptions): Promise<AgentInstallResult> {
    const { agentId, version, force } = options
    this.ensureStorageLoaded()
    log.info(`Installing agent: ${agentId}@${version || 'latest'}`)

    if (BUILTIN_AGENT_IDS.has(agentId)) {
      const current = BUILTIN_AGENT_VERSION_MAP.get(agentId) || 'unknown'
      return {
        success: false,
        agentId,
        version: current,
        error: 'Builtin agents are bundled with core-app and cannot be reinstalled'
      }
    }

    const catalog = await this.loadRemoteCatalog(true)
    const agent = catalog.agents.find((item) => item.id === agentId)
    if (!agent) {
      return {
        success: false,
        agentId,
        version: version || 'unknown',
        error: `Agent ${agentId} not found in remote catalog`
      }
    }

    const packageMap = catalog.packagesByAgent.get(agentId)
    const targetVersion = version || agent.version
    const targetPackage = packageMap?.get(targetVersion)
    if (!targetPackage) {
      return {
        success: false,
        agentId,
        version: targetVersion,
        error: `Version ${targetVersion} is not available for agent ${agentId}`
      }
    }

    if (this.installedAgentIds.has(agentId) && !force) {
      const installedVersion = this.installedAgentVersions.get(agentId)
      if (installedVersion === targetVersion) {
        return {
          success: false,
          agentId,
          version: targetVersion,
          error: 'Agent already installed'
        }
      }
    }

    try {
      const installedVersion = await this.installWithRollback(agentId, targetVersion, targetPackage)
      this.installedAgentIds.add(agentId)
      this.installedAgentVersions.set(agentId, installedVersion)
      this.persistInstalledState()
      return {
        success: true,
        agentId,
        version: installedVersion,
        message: `Agent ${agent.name} installed successfully`
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error('Agent install failed', {
        error,
        meta: { agentId, targetVersion, downloadUrl: targetPackage.downloadUrl }
      })
      return {
        success: false,
        agentId,
        version: targetVersion,
        error: message
      }
    }
  }

  /**
   * Uninstall an agent
   */
  async uninstallAgent(agentId: string): Promise<AgentInstallResult> {
    this.ensureStorageLoaded()
    log.info(`Uninstalling agent: ${agentId}`)

    if (BUILTIN_AGENT_IDS.has(agentId)) {
      return {
        success: false,
        agentId,
        version: BUILTIN_AGENT_VERSION_MAP.get(agentId) || 'unknown',
        error: 'Cannot uninstall builtin agents'
      }
    }

    if (!this.installedAgentIds.has(agentId)) {
      return {
        success: false,
        agentId,
        version: 'unknown',
        error: 'Agent not installed'
      }
    }

    const installedVersion = this.installedAgentVersions.get(agentId) ?? 'unknown'
    const installDir = this.getAgentInstallDir(agentId)
    try {
      await fse.remove(installDir)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        agentId,
        version: installedVersion,
        error: message
      }
    }

    this.installedAgentIds.delete(agentId)
    this.installedAgentVersions.delete(agentId)
    this.persistInstalledState()

    return {
      success: true,
      agentId,
      version: installedVersion,
      message: 'Agent uninstalled successfully'
    }
  }

  /**
   * Check for agent updates
   */
  async checkUpdates(): Promise<StoreAgentInfo[]> {
    this.ensureStorageLoaded()
    const catalog = await this.loadRemoteCatalog(true)
    const updates: StoreAgentInfo[] = []

    for (const agentId of this.installedAgentIds) {
      if (BUILTIN_AGENT_IDS.has(agentId)) {
        continue
      }
      const installedVersion = this.installedAgentVersions.get(agentId)
      if (!installedVersion) {
        continue
      }
      const remote = catalog.agents.find((agent) => agent.id === agentId)
      if (!remote) {
        continue
      }
      if (compareVersion(remote.version, installedVersion) > 0) {
        updates.push(this.applyInstallMeta(remote))
      }
    }

    return updates
  }

  /**
   * Convert StoreAgentInfo to AgentDescriptor format
   */
  toDescriptor(agent: StoreAgentInfo): AgentDescriptor {
    const resolveCapabilityType = (capabilityId: string): AgentCapability['type'] => {
      const lowered = capabilityId.toLowerCase()
      if (lowered.includes('workflow')) return 'workflow'
      if (lowered.includes('chat')) return 'chat'
      if (lowered.includes('search') || lowered.includes('query')) return 'query'
      return 'action'
    }

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      version: agent.version,
      category: agent.category as AgentDescriptor['category'],
      enabled: agent.isInstalled,
      capabilities: agent.capabilities.map((capability) => ({
        id: capability,
        type: resolveCapabilityType(capability),
        name: capability,
        description: ''
      })),
      tools: [],
      config: {}
    }
  }
}

// Singleton instance
export const agentStoreService = new AgentStoreService()
