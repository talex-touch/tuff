import type { H3Event } from 'h3'
import process from 'node:process'
import {
  decryptConfigValue,
  encryptConfigValue,
  isEncryptedConfigValue,
} from './pilot-config-crypto'
import { getPilotDatabase, requirePilotDatabase } from './pilot-store'

const SETTINGS_TABLE = 'pilot_admin_settings'
const DATASOURCE_WEBSARCH_KEY = 'datasource.websearch'
const CACHE_KEY = '__pilotDatasourceWebsearchConfig'
const DEFAULT_TIMEOUT_MS = 12_000
const DEFAULT_MAX_RESULTS = 6
const DEFAULT_TTL_MINUTES = 30
const DEFAULT_CRAWL_MAX_CONTENT_CHARS = 8_000

const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 120_000
const MIN_RESULTS = 1
const MAX_RESULTS = 20
const MIN_PRIORITY = 1
const MAX_PRIORITY = 9_999
const MIN_TTL_MINUTES = 1
const MAX_TTL_MINUTES = 24 * 60

type PilotEventContext = H3Event['context'] & {
  [CACHE_KEY]?: PilotWebsearchDatasourceConfig
}

export type PilotBuiltinSourceType = 'official-docs' | 'official-announcement'

export interface PilotBuiltinSourceRule {
  id: string
  type: PilotBuiltinSourceType
  enabled: boolean
  domains: string[]
  metadata?: Record<string, unknown>
}

export type PilotWebsearchProviderType = 'sosearch' | 'searxng' | 'serper' | 'tavily'

export interface PilotWebsearchProviderConfig {
  id: string
  type: PilotWebsearchProviderType
  enabled: boolean
  priority: number
  baseUrl: string
  apiKeyEncrypted: string
  timeoutMs: number
  maxResults: number
}

export interface PilotWebsearchAggregationConfig {
  mode: 'hybrid' | 'sequential'
  targetResults: number
  minPerProvider: number
  dedupeKey: 'url' | 'url+content'
  stopWhenEnough: boolean
}

export interface PilotWebsearchCrawlConfig {
  enabled: boolean
  timeoutMs: number
  maxContentChars: number
}

export interface PilotWebsearchDatasourceConfig {
  providers: PilotWebsearchProviderConfig[]
  aggregation: PilotWebsearchAggregationConfig
  crawl: PilotWebsearchCrawlConfig
  allowlistDomains: string[]
  ttlMinutes: number
  builtinSources: PilotBuiltinSourceRule[]
  // legacy fields for backward compatibility only
  gatewayBaseUrl: string
  apiKeyRef: string
  timeoutMs: number
  maxResults: number
  crawlEnabled: boolean
}

export interface PilotWebsearchProviderViewConfig {
  id: string
  type: PilotWebsearchProviderType
  enabled: boolean
  priority: number
  baseUrl: string
  timeoutMs: number
  maxResults: number
  hasApiKey: boolean
  apiKeyMasked: string
}

export interface PilotWebsearchDatasourceViewConfig {
  providers: PilotWebsearchProviderViewConfig[]
  aggregation: PilotWebsearchAggregationConfig
  crawl: PilotWebsearchCrawlConfig
  allowlistDomains: string[]
  ttlMinutes: number
  builtinSources: PilotBuiltinSourceRule[]
  gatewayBaseUrl: string
  apiKeyRef: string
  timeoutMs: number
  maxResults: number
  crawlEnabled: boolean
}

export interface UpdatePilotWebsearchProviderInput {
  id: string
  type?: PilotWebsearchProviderType
  enabled?: boolean
  priority?: number
  baseUrl?: string
  apiKeyEncrypted?: string
  apiKey?: string
  clearApiKey?: boolean
  timeoutMs?: number
  maxResults?: number
}

export interface UpdatePilotWebsearchDatasourceInput {
  providers?: UpdatePilotWebsearchProviderInput[]
  aggregation?: Partial<PilotWebsearchAggregationConfig>
  crawl?: Partial<PilotWebsearchCrawlConfig>
  allowlistDomains?: string[]
  ttlMinutes?: number
  builtinSources?: PilotBuiltinSourceRule[]
  // legacy patch compatibility
  gatewayBaseUrl?: string
  apiKeyRef?: string
  timeoutMs?: number
  maxResults?: number
  crawlEnabled?: boolean
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) {
    return fallback
  }
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return fallback
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(Math.floor(parsed), min), max)
}

function normalizeDomain(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
}

function normalizeDomains(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const list = value
    .map(item => normalizeDomain(item))
    .filter(Boolean)
  return Array.from(new Set(list))
}

function normalizeProviderType(value: unknown, fallback: PilotWebsearchProviderType = 'searxng'): PilotWebsearchProviderType {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'sosearch' || normalized === 'serper' || normalized === 'tavily' || normalized === 'searxng') {
    return normalized
  }
  return fallback
}

function nowIso(): string {
  return new Date().toISOString()
}

function maskSecret(value: string): string {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }
  if (text.length <= 8) {
    return '********'
  }
  return `${text.slice(0, 4)}...${text.slice(-4)}`
}

function maybeEncryptConfigValue(value: string): string {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }
  if (isEncryptedConfigValue(text)) {
    return text
  }
  return encryptConfigValue(text)
}

function maybeDecryptConfigValue(value: string): string {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }
  if (!isEncryptedConfigValue(text)) {
    return text
  }
  try {
    return decryptConfigValue(text)
  }
  catch {
    return ''
  }
}

function getDefaultBuiltinSourceRules(): PilotBuiltinSourceRule[] {
  return [
    {
      id: 'official-docs',
      type: 'official-docs',
      enabled: true,
      domains: [
        'platform.openai.com',
        'docs.anthropic.com',
        'ai.google.dev',
        'learn.microsoft.com',
      ],
    },
    {
      id: 'official-announcement',
      type: 'official-announcement',
      enabled: true,
      domains: [
        'openai.com',
        'anthropic.com',
        'deepmind.google',
        'news.microsoft.com',
      ],
    },
  ]
}

function getDefaultProviders(): PilotWebsearchProviderConfig[] {
  return [
    {
      id: 'sosearch-main',
      type: 'sosearch',
      enabled: true,
      priority: 10,
      baseUrl: '',
      apiKeyEncrypted: '',
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxResults: DEFAULT_MAX_RESULTS,
    },
    {
      id: 'searxng-main',
      type: 'searxng',
      enabled: true,
      priority: 20,
      baseUrl: '',
      apiKeyEncrypted: '',
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxResults: DEFAULT_MAX_RESULTS,
    },
    {
      id: 'serper-backup',
      type: 'serper',
      enabled: true,
      priority: 30,
      baseUrl: 'https://google.serper.dev',
      apiKeyEncrypted: '',
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxResults: DEFAULT_MAX_RESULTS,
    },
    {
      id: 'tavily-backup',
      type: 'tavily',
      enabled: true,
      priority: 40,
      baseUrl: 'https://api.tavily.com',
      apiKeyEncrypted: '',
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxResults: DEFAULT_MAX_RESULTS,
    },
  ]
}

function getDefaultAggregationConfig(): PilotWebsearchAggregationConfig {
  return {
    mode: 'hybrid',
    targetResults: DEFAULT_MAX_RESULTS,
    minPerProvider: 2,
    dedupeKey: 'url',
    stopWhenEnough: true,
  }
}

function getDefaultCrawlConfig(): PilotWebsearchCrawlConfig {
  return {
    enabled: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxContentChars: DEFAULT_CRAWL_MAX_CONTENT_CHARS,
  }
}

function getDefaultWebsearchDatasourceConfig(): PilotWebsearchDatasourceConfig {
  return {
    providers: getDefaultProviders(),
    aggregation: getDefaultAggregationConfig(),
    crawl: getDefaultCrawlConfig(),
    allowlistDomains: [],
    ttlMinutes: DEFAULT_TTL_MINUTES,
    builtinSources: getDefaultBuiltinSourceRules(),
    gatewayBaseUrl: '',
    apiKeyRef: '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxResults: DEFAULT_MAX_RESULTS,
    crawlEnabled: true,
  }
}

function normalizeBuiltinSourceRule(value: unknown): PilotBuiltinSourceRule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const row = value as Record<string, unknown>
  const id = normalizeText(row.id)
  const typeRaw = normalizeText(row.type).toLowerCase()
  const type: PilotBuiltinSourceType = typeRaw === 'official-announcement'
    ? 'official-announcement'
    : 'official-docs'
  if (!id) {
    return null
  }
  return {
    id,
    type,
    enabled: normalizeBoolean(row.enabled, true),
    domains: normalizeDomains(row.domains),
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : undefined,
  }
}

function normalizeBuiltinSourceRules(value: unknown): PilotBuiltinSourceRule[] {
  if (!Array.isArray(value)) {
    return getDefaultBuiltinSourceRules()
  }
  const rules = value
    .map(item => normalizeBuiltinSourceRule(item))
    .filter((item): item is PilotBuiltinSourceRule => Boolean(item))
  if (rules.length <= 0) {
    return getDefaultBuiltinSourceRules()
  }
  return Array.from(new Map(rules.map(item => [item.id, item])).values())
}

function normalizeProviderConfig(
  value: unknown,
  fallback: PilotWebsearchProviderConfig,
): PilotWebsearchProviderConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const row = value as Record<string, unknown>
  const id = normalizeText(row.id)
  if (!id) {
    return null
  }

  const providerType = normalizeProviderType(row.type, fallback.type)
  const encrypted = maybeEncryptConfigValue(
    normalizeText(row.apiKeyEncrypted),
  )

  return {
    id,
    type: providerType,
    enabled: normalizeBoolean(row.enabled, fallback.enabled),
    priority: normalizeNumber(row.priority, fallback.priority, MIN_PRIORITY, MAX_PRIORITY),
    baseUrl: normalizeText(row.baseUrl || fallback.baseUrl).replace(/\/+$/, ''),
    apiKeyEncrypted: encrypted,
    timeoutMs: normalizeNumber(row.timeoutMs, fallback.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS),
    maxResults: normalizeNumber(row.maxResults, fallback.maxResults, MIN_RESULTS, MAX_RESULTS),
  }
}

function normalizeProviderConfigs(value: unknown): PilotWebsearchProviderConfig[] {
  const defaults = getDefaultProviders()
  if (!Array.isArray(value) || value.length <= 0) {
    return []
  }

  const fallbackMap = new Map(defaults.map(item => [item.id, item]))
  const parsed = value
    .map((item, index) => {
      const maybe = item && typeof item === 'object' && !Array.isArray(item)
        ? item as Record<string, unknown>
        : null
      const rowId = normalizeText(maybe?.id)
      const fallback = rowId
        ? (fallbackMap.get(rowId) || defaults[index % defaults.length]!)
        : defaults[index % defaults.length]!
      return normalizeProviderConfig(item, fallback)
    })
    .filter((item): item is PilotWebsearchProviderConfig => Boolean(item))

  if (parsed.length <= 0) {
    return []
  }

  return Array.from(new Map(parsed.map(item => [item.id, item])).values())
    .sort((a, b) => a.priority - b.priority)
}

function normalizeAggregationConfig(value: unknown, fallback: PilotWebsearchAggregationConfig): PilotWebsearchAggregationConfig {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const modeRaw = normalizeText(row.mode).toLowerCase()
  const mode: PilotWebsearchAggregationConfig['mode'] = modeRaw === 'sequential' ? 'sequential' : 'hybrid'
  const dedupeRaw = normalizeText(row.dedupeKey).toLowerCase()
  const dedupeKey: PilotWebsearchAggregationConfig['dedupeKey'] = dedupeRaw === 'url+content' ? 'url+content' : 'url'
  return {
    mode,
    targetResults: normalizeNumber(row.targetResults, fallback.targetResults, MIN_RESULTS, MAX_RESULTS),
    minPerProvider: normalizeNumber(row.minPerProvider, fallback.minPerProvider, MIN_RESULTS, MAX_RESULTS),
    dedupeKey,
    stopWhenEnough: normalizeBoolean(row.stopWhenEnough, fallback.stopWhenEnough),
  }
}

function normalizeCrawlConfig(value: unknown, fallback: PilotWebsearchCrawlConfig): PilotWebsearchCrawlConfig {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  return {
    enabled: normalizeBoolean(row.enabled, fallback.enabled),
    timeoutMs: normalizeNumber(row.timeoutMs, fallback.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS),
    maxContentChars: normalizeNumber(row.maxContentChars, fallback.maxContentChars, 500, 100_000),
  }
}

function mapLegacyGatewayProvider(input: {
  gatewayBaseUrl: string
  timeoutMs: number
  maxResults: number
}): PilotWebsearchProviderConfig | null {
  const baseUrl = normalizeText(input.gatewayBaseUrl).replace(/\/+$/, '')
  if (!baseUrl) {
    return null
  }
  return {
    id: 'legacy-gateway',
    type: 'searxng',
    enabled: true,
    priority: 5,
    baseUrl,
    apiKeyEncrypted: '',
    timeoutMs: normalizeNumber(input.timeoutMs, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS),
    maxResults: normalizeNumber(input.maxResults, DEFAULT_MAX_RESULTS, MIN_RESULTS, MAX_RESULTS),
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  if (!value) {
    return {}
  }
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  }
  catch {
    return {}
  }
}

function normalizeWebsearchDatasourceConfig(raw: unknown): PilotWebsearchDatasourceConfig {
  const defaults = getDefaultWebsearchDatasourceConfig()
  const row = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}

  const gatewayBaseUrl = normalizeText(row.gatewayBaseUrl).replace(/\/+$/, '')
  const apiKeyRef = normalizeText(row.apiKeyRef)
  const timeoutMs = normalizeNumber(row.timeoutMs, defaults.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
  const maxResults = normalizeNumber(row.maxResults, defaults.maxResults, MIN_RESULTS, MAX_RESULTS)
  const crawlEnabled = normalizeBoolean(row.crawlEnabled, defaults.crawlEnabled)

  const normalizedProviders = normalizeProviderConfigs(row.providers)
  const legacyProvider = mapLegacyGatewayProvider({
    gatewayBaseUrl,
    timeoutMs,
    maxResults,
  })

  const providers = normalizedProviders.length > 0
    ? normalizedProviders
    : legacyProvider
      ? [legacyProvider]
      : getDefaultProviders()

  const aggregation = normalizeAggregationConfig(row.aggregation, defaults.aggregation)
  const crawl = normalizeCrawlConfig(row.crawl, {
    enabled: crawlEnabled,
    timeoutMs,
    maxContentChars: defaults.crawl.maxContentChars,
  })

  return {
    providers,
    aggregation,
    crawl,
    allowlistDomains: normalizeDomains(row.allowlistDomains),
    ttlMinutes: normalizeNumber(row.ttlMinutes, defaults.ttlMinutes, MIN_TTL_MINUTES, MAX_TTL_MINUTES),
    builtinSources: normalizeBuiltinSourceRules(row.builtinSources),
    gatewayBaseUrl,
    apiKeyRef,
    timeoutMs,
    maxResults,
    crawlEnabled,
  }
}

function normalizeProviderPatch(
  value: UpdatePilotWebsearchProviderInput,
  fallback: PilotWebsearchProviderConfig,
): PilotWebsearchProviderConfig {
  const nextPlainApiKey = normalizeText(value.apiKey)
  const clearApiKey = normalizeBoolean(value.clearApiKey, false)

  let apiKeyEncrypted = normalizeText(value.apiKeyEncrypted)
  if (!apiKeyEncrypted) {
    apiKeyEncrypted = fallback.apiKeyEncrypted
  }
  if (nextPlainApiKey) {
    apiKeyEncrypted = maybeEncryptConfigValue(nextPlainApiKey)
  }
  else if (clearApiKey) {
    apiKeyEncrypted = ''
  }
  else if (apiKeyEncrypted) {
    apiKeyEncrypted = maybeEncryptConfigValue(apiKeyEncrypted)
  }

  return {
    id: normalizeText(value.id) || fallback.id,
    type: normalizeProviderType(value.type, fallback.type),
    enabled: normalizeBoolean(value.enabled, fallback.enabled),
    priority: normalizeNumber(value.priority, fallback.priority, MIN_PRIORITY, MAX_PRIORITY),
    baseUrl: normalizeText(value.baseUrl || fallback.baseUrl).replace(/\/+$/, ''),
    apiKeyEncrypted,
    timeoutMs: normalizeNumber(value.timeoutMs, fallback.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS),
    maxResults: normalizeNumber(value.maxResults, fallback.maxResults, MIN_RESULTS, MAX_RESULTS),
  }
}

async function ensureAdminSettingsSchema(event: H3Event): Promise<void> {
  const db = getPilotDatabase(event)
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SETTINGS_TABLE} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()
}

async function readSetting(event: H3Event, key: string): Promise<string> {
  const db = getPilotDatabase(event)
  await ensureAdminSettingsSchema(event)
  const row = await db.prepare(`
    SELECT value
    FROM ${SETTINGS_TABLE}
    WHERE key = ?1
    LIMIT 1
  `).bind(key).first<{ value: string }>()
  return normalizeText(row?.value)
}

async function upsertSetting(event: H3Event, key: string, value: string): Promise<void> {
  const db = requirePilotDatabase(event)
  await ensureAdminSettingsSchema(event)
  const now = nowIso()
  await db.prepare(`
    INSERT INTO ${SETTINGS_TABLE} (key, value, updated_at)
    VALUES (?1, ?2, ?3)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).bind(key, value, now).run()
}

function clearCache(event: H3Event): void {
  const context = event.context as PilotEventContext
  delete context[CACHE_KEY]
}

export function resolveDatasourceApiKey(apiKeyRef: string): string {
  const normalized = normalizeText(apiKeyRef)
  if (!normalized) {
    return ''
  }

  if (normalized.startsWith('env:')) {
    const envKey = normalizeText(normalized.slice(4))
    if (!envKey) {
      return ''
    }
    return normalizeText(process.env[envKey])
  }

  return normalizeText(process.env[normalized])
}

export function resolveWebsearchProviderApiKey(
  provider: Pick<PilotWebsearchProviderConfig, 'id' | 'apiKeyEncrypted'>,
  legacyApiKeyRef = '',
): string {
  const encrypted = normalizeText(provider.apiKeyEncrypted)
  if (encrypted) {
    return maybeDecryptConfigValue(encrypted)
  }
  if (provider.id === 'legacy-gateway') {
    return resolveDatasourceApiKey(legacyApiKeyRef)
  }
  return ''
}

function toProviderView(
  provider: PilotWebsearchProviderConfig,
  legacyApiKeyRef: string,
): PilotWebsearchProviderViewConfig {
  const plainApiKey = resolveWebsearchProviderApiKey(provider, legacyApiKeyRef)
  const hasApiKey = Boolean(plainApiKey)
  return {
    id: provider.id,
    type: provider.type,
    enabled: provider.enabled,
    priority: provider.priority,
    baseUrl: provider.baseUrl,
    timeoutMs: provider.timeoutMs,
    maxResults: provider.maxResults,
    hasApiKey,
    apiKeyMasked: hasApiKey ? maskSecret(plainApiKey) : '',
  }
}

export function toPilotWebsearchDatasourceView(
  config: PilotWebsearchDatasourceConfig,
): PilotWebsearchDatasourceViewConfig {
  return {
    providers: config.providers.map(item => toProviderView(item, config.apiKeyRef)),
    aggregation: config.aggregation,
    crawl: config.crawl,
    allowlistDomains: config.allowlistDomains,
    ttlMinutes: config.ttlMinutes,
    builtinSources: config.builtinSources,
    gatewayBaseUrl: config.gatewayBaseUrl,
    apiKeyRef: config.apiKeyRef,
    timeoutMs: config.timeoutMs,
    maxResults: config.maxResults,
    crawlEnabled: config.crawlEnabled,
  }
}

async function buildWebsearchDatasourceConfig(event: H3Event): Promise<PilotWebsearchDatasourceConfig> {
  const context = event.context as PilotEventContext
  if (context[CACHE_KEY]) {
    return context[CACHE_KEY]!
  }

  const raw = await readSetting(event, DATASOURCE_WEBSARCH_KEY)
  const config = normalizeWebsearchDatasourceConfig(parseJsonObject(raw))
  context[CACHE_KEY] = config
  return config
}

export async function getPilotWebsearchDatasourceConfig(event: H3Event): Promise<PilotWebsearchDatasourceConfig> {
  return await buildWebsearchDatasourceConfig(event)
}

export async function updatePilotWebsearchDatasourceConfig(
  event: H3Event,
  input: UpdatePilotWebsearchDatasourceInput,
): Promise<PilotWebsearchDatasourceConfig> {
  const current = await getPilotWebsearchDatasourceConfig(event)
  const patch = input || {}

  let nextProviders = current.providers
  if (Array.isArray(patch.providers)) {
    const existingMap = new Map(current.providers.map(item => [item.id, item]))
    const defaultByType = new Map(getDefaultProviders().map(item => [item.type, item]))
    const patched = patch.providers
      .map((item) => {
        const id = normalizeText(item?.id)
        if (!id) {
          return null
        }
        const fallbackById = existingMap.get(id)
        const fallbackByType = defaultByType.get(normalizeProviderType(item.type))
        const fallback = fallbackById || fallbackByType || getDefaultProviders()[0]!
        return normalizeProviderPatch(item, {
          ...fallback,
          id,
        })
      })
      .filter((item): item is PilotWebsearchProviderConfig => Boolean(item))

    nextProviders = patched.length > 0
      ? patched.sort((a, b) => a.priority - b.priority)
      : getDefaultProviders()
  }

  const next = normalizeWebsearchDatasourceConfig({
    ...current,
    ...patch,
    providers: nextProviders,
    aggregation: {
      ...current.aggregation,
      ...(patch.aggregation || {}),
    },
    crawl: {
      ...current.crawl,
      ...(patch.crawl || {}),
    },
    // once new providers are persisted, stop depending on legacy gateway fields
    gatewayBaseUrl: '',
    apiKeyRef: '',
  })

  await upsertSetting(event, DATASOURCE_WEBSARCH_KEY, JSON.stringify(next))
  clearCache(event)
  return await getPilotWebsearchDatasourceConfig(event)
}
