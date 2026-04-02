import type { H3Event } from 'h3'
import type { PilotCapabilityId as SharedPilotCapabilityId } from '../../shared/pilot-capability-meta'
import type { PilotScenePolicy } from '../../shared/pilot-routing-scene'
import type { PilotBuiltinTool, PilotProviderTargetType } from './pilot-channel'
import {
  createPilotDefaultCapabilities,
  normalizeThinkingFlags,
  resolvePilotCapabilities,
  sanitizeBuiltinToolsByCapabilities,
} from '../../shared/pilot-capability-meta'
import {
  isPilotBuiltInScene,
  normalizePilotScene,
} from '../../shared/pilot-routing-scene'
import { normalizePilotProviderTargetType } from './pilot-channel'
import { getPilotDatabase, requirePilotDatabase } from './pilot-store'

const SETTINGS_TABLE = 'pilot_admin_settings'
const MODEL_CATALOG_KEY = 'model.catalog'
const ROUTE_COMBOS_KEY = 'routing.routeCombos'
const ROUTING_POLICY_KEY = 'routing.policy'
const LB_POLICY_KEY = 'routing.lbPolicy'
const MEMORY_POLICY_KEY = 'memory.policy'
const CACHE_KEY = '__pilotAdminRoutingConfig'

type PilotEventContext = H3Event['context'] & {
  [CACHE_KEY]?: PilotAdminRoutingConfig
}

export type PilotIconType = 'class' | 'url' | 'emoji' | 'file'

export interface PilotIconConfig {
  type: PilotIconType
  value: string
}

export type PilotCapabilityId = SharedPilotCapabilityId
export type PilotModelCapabilities = Partial<Record<PilotCapabilityId, boolean>>
const DEFAULT_MODEL_CAPABILITIES = createPilotDefaultCapabilities(true)

export interface PilotModelBinding {
  channelId: string
  providerModel: string
  providerTargetType?: PilotProviderTargetType
  enabled: boolean
  priority: number
  weight: number
  timeoutMs?: number
  builtinTools?: PilotBuiltinTool[]
  metadata?: Record<string, unknown>
}

export interface PilotModelCatalogItem {
  id: string
  name: string
  description?: string
  enabled: boolean
  visible: boolean
  source: 'system' | 'manual' | 'discovered'
  icon?: PilotIconConfig
  tags?: string[]
  scenes?: string[]
  qualityScore?: number
  speedScore?: number
  costScore?: number
  thinkingSupported?: boolean
  thinkingDefaultEnabled?: boolean
  capabilities?: PilotModelCapabilities
  allowWebsearch?: boolean
  allowImageAnalysis?: boolean
  allowImageGeneration?: boolean
  allowFileAnalysis?: boolean
  builtinTools?: PilotBuiltinTool[]
  defaultRouteComboId?: string
  bindings: PilotModelBinding[]
  metadata?: Record<string, unknown>
}

export interface PilotRouteComboRoute {
  channelId: string
  modelId?: string
  providerModel?: string
  providerTargetType?: PilotProviderTargetType
  enabled: boolean
  priority: number
  weight: number
  timeoutMs?: number
  maxRetries?: number
  circuitBreakerThreshold?: number
  metadata?: Record<string, unknown>
}

export interface PilotRouteComboItem {
  id: string
  name: string
  description?: string
  enabled: boolean
  langgraphAssistantId?: string
  graphProfile?: string
  fallbackRouteComboId?: string
  routes: PilotRouteComboRoute[]
  metadata?: Record<string, unknown>
}

export interface PilotRoutingPolicy {
  defaultModelId: string
  defaultRouteComboId: string
  quotaAutoStrategy: 'speed-first'
  explorationRate: number
  scenePolicies?: PilotScenePolicy[]
  intentNanoModelId: string
  intentRouteComboId: string
  imageGenerationModelId: string
  imageRouteComboId: string
}

export interface PilotLoadBalancePolicy {
  metricWindowHours: number
  recentRequestWindow: number
  circuitBreakerFailureThreshold: number
  circuitBreakerCooldownMs: number
  halfOpenProbeCount: number
}

export interface PilotMemoryPolicy {
  enabledByDefault: boolean
  allowUserDisable: boolean
  allowUserClear: boolean
}

export interface PilotAdminRoutingConfig {
  modelCatalog: PilotModelCatalogItem[]
  routeCombos: PilotRouteComboItem[]
  routingPolicy: PilotRoutingPolicy
  lbPolicy: PilotLoadBalancePolicy
  memoryPolicy: PilotMemoryPolicy
}

export interface UpdatePilotAdminRoutingConfigInput {
  modelCatalog?: PilotModelCatalogItem[]
  routeCombos?: PilotRouteComboItem[]
  routingPolicy?: Partial<PilotRoutingPolicy>
  lbPolicy?: Partial<PilotLoadBalancePolicy>
  memoryPolicy?: Partial<PilotMemoryPolicy>
}

function nowIso(): string {
  return new Date().toISOString()
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

function normalizeFloat(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(parsed, min), max)
}

export function resolvePilotModelCapabilities(
  value: unknown,
  legacy?: {
    allowWebsearch?: unknown
    allowImageGeneration?: unknown
    allowFileAnalysis?: unknown
    allowImageAnalysis?: unknown
  },
): PilotModelCapabilities {
  return resolvePilotCapabilities(value, {
    allowWebsearch: legacy?.allowWebsearch,
    allowImageGeneration: legacy?.allowImageGeneration,
    allowFileAnalysis: legacy?.allowFileAnalysis,
    allowImageAnalysis: legacy?.allowImageAnalysis,
  }, DEFAULT_MODEL_CAPABILITIES)
}

function normalizeBuiltinTools(value: unknown): PilotBuiltinTool[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const allowed = new Set<PilotBuiltinTool>(['write_todos', 'read_file', 'write_file', 'edit_file', 'ls', 'websearch'])
  const list = value
    .map(item => normalizeText(item))
    .filter(item => allowed.has(item as PilotBuiltinTool)) as PilotBuiltinTool[]
  if (list.length <= 0) {
    return undefined
  }
  return Array.from(new Set(list))
}

function normalizeModelBuiltinTools(value: unknown): PilotBuiltinTool[] {
  return normalizeBuiltinTools(value) || ['write_todos']
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const list = value
    .map(item => normalizeText(item))
    .filter(Boolean)
  if (list.length <= 0) {
    return undefined
  }
  return Array.from(new Set(list))
}

function normalizeSceneArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const list = value
    .map(item => normalizePilotScene(item))
    .filter(Boolean)
  if (list.length <= 0) {
    return []
  }
  return Array.from(new Set(list))
}

function normalizeScenePolicy(raw: unknown): PilotScenePolicy | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const row = raw as Record<string, unknown>
  const scene = normalizePilotScene(row.scene)
  const modelId = normalizeText(row.modelId)
  if (!scene || !modelId) {
    return null
  }
  return {
    scene,
    modelId,
    routeComboId: normalizeText(row.routeComboId) || undefined,
  }
}

function normalizeScenePolicies(value: unknown): PilotScenePolicy[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value
    .map(item => normalizeScenePolicy(item))
    .filter((item): item is PilotScenePolicy => Boolean(item))
}

function createScenePolicy(
  scene: string,
  modelId: unknown,
  routeComboId: unknown,
): PilotScenePolicy | null {
  const normalizedScene = normalizePilotScene(scene)
  const normalizedModelId = normalizeText(modelId)
  if (!normalizedScene || !normalizedModelId) {
    return null
  }
  return {
    scene: normalizedScene,
    modelId: normalizedModelId,
    routeComboId: normalizeText(routeComboId) || undefined,
  }
}

function buildScenePoliciesFromLegacy(row: Record<string, unknown>): PilotScenePolicy[] {
  const list = [
    createScenePolicy('intent_classification', row.intentNanoModelId, row.intentRouteComboId),
    createScenePolicy('image_generate', row.imageGenerationModelId, row.imageRouteComboId),
  ].filter((item): item is PilotScenePolicy => Boolean(item))
  return list
}

function findScenePolicy(
  scenePolicies: PilotScenePolicy[] | undefined,
  scene: string,
): PilotScenePolicy | undefined {
  const normalizedScene = normalizePilotScene(scene)
  if (!normalizedScene || !Array.isArray(scenePolicies) || scenePolicies.length <= 0) {
    return undefined
  }
  return scenePolicies.find(item => normalizePilotScene(item.scene) === normalizedScene)
}

function resolveLegacyRoutingFields(scenePolicies: PilotScenePolicy[]): Pick<
  PilotRoutingPolicy,
  'intentNanoModelId' | 'intentRouteComboId' | 'imageGenerationModelId' | 'imageRouteComboId'
> {
  const intentPolicy = findScenePolicy(scenePolicies, 'intent_classification')
  const imagePolicy = findScenePolicy(scenePolicies, 'image_generate')
  return {
    intentNanoModelId: normalizeText(intentPolicy?.modelId),
    intentRouteComboId: normalizeText(intentPolicy?.routeComboId),
    imageGenerationModelId: normalizeText(imagePolicy?.modelId),
    imageRouteComboId: normalizeText(imagePolicy?.routeComboId),
  }
}

function normalizeIcon(value: unknown): PilotIconConfig | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const row = value as Record<string, unknown>
  const type = normalizeText(row.type).toLowerCase()
  const iconType: PilotIconType = type === 'url' || type === 'emoji' || type === 'file'
    ? type
    : 'class'
  const iconValue = normalizeText(row.value)
  if (!iconValue) {
    return undefined
  }
  return {
    type: iconType,
    value: iconValue,
  }
}

function normalizeModelBinding(raw: unknown): PilotModelBinding | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const row = raw as Record<string, unknown>
  const channelId = normalizeText(row.channelId)
  const providerModel = normalizeText(row.providerModel)
  if (!channelId || !providerModel) {
    return null
  }
  return {
    channelId,
    providerModel,
    providerTargetType: normalizePilotProviderTargetType(row.providerTargetType, 'model'),
    enabled: normalizeBoolean(row.enabled, true),
    priority: normalizeNumber(row.priority, 100, 1, 9999),
    weight: normalizeNumber(row.weight, 100, 1, 1000),
    timeoutMs: Number.isFinite(Number(row.timeoutMs))
      ? normalizeNumber(row.timeoutMs, 90_000, 3_000, 10 * 60 * 1000)
      : undefined,
    builtinTools: normalizeBuiltinTools(row.builtinTools),
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : undefined,
  }
}

function normalizeRouteComboRoute(raw: unknown): PilotRouteComboRoute | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const row = raw as Record<string, unknown>
  const channelId = normalizeText(row.channelId)
  if (!channelId) {
    return null
  }
  return {
    channelId,
    modelId: normalizeText(row.modelId) || undefined,
    providerModel: normalizeText(row.providerModel) || undefined,
    providerTargetType: normalizePilotProviderTargetType(row.providerTargetType, 'model'),
    enabled: normalizeBoolean(row.enabled, true),
    priority: normalizeNumber(row.priority, 100, 1, 9999),
    weight: normalizeNumber(row.weight, 100, 1, 1000),
    timeoutMs: Number.isFinite(Number(row.timeoutMs))
      ? normalizeNumber(row.timeoutMs, 90_000, 3_000, 10 * 60 * 1000)
      : undefined,
    maxRetries: Number.isFinite(Number(row.maxRetries))
      ? normalizeNumber(row.maxRetries, 1, 0, 5)
      : undefined,
    circuitBreakerThreshold: Number.isFinite(Number(row.circuitBreakerThreshold))
      ? normalizeNumber(row.circuitBreakerThreshold, 3, 1, 10)
      : undefined,
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : undefined,
  }
}

function normalizeModelCatalogItem(raw: unknown): PilotModelCatalogItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const row = raw as Record<string, unknown>
  const id = normalizeText(row.id)
  if (!id) {
    return null
  }

  const bindings = Array.isArray(row.bindings)
    ? row.bindings
        .map(item => normalizeModelBinding(item))
        .filter((item): item is PilotModelBinding => Boolean(item))
    : []

  const capabilities = resolvePilotModelCapabilities(row.capabilities, {
    allowWebsearch: row.allowWebsearch,
    allowImageGeneration: row.allowImageGeneration,
    allowFileAnalysis: row.allowFileAnalysis,
    allowImageAnalysis: row.allowImageAnalysis,
  })

  const allowWebsearch = capabilities.websearch !== false
  const allowFileAnalysis = capabilities['file.analyze'] !== false
  const allowImageGeneration = capabilities['image.generate'] !== false
  const thinking = normalizeThinkingFlags(
    normalizeBoolean(row.thinkingSupported, true),
    normalizeBoolean(row.thinkingDefaultEnabled, false),
  )
  const builtinTools = sanitizeBuiltinToolsByCapabilities(normalizeModelBuiltinTools(row.builtinTools), {
    ...DEFAULT_MODEL_CAPABILITIES,
    ...(capabilities as Record<PilotCapabilityId, boolean>),
  })

  return {
    id,
    name: normalizeText(row.name) || id,
    description: normalizeText(row.description) || undefined,
    enabled: normalizeBoolean(row.enabled, true),
    visible: normalizeBoolean(row.visible, true),
    source: normalizeText(row.source) === 'manual'
      ? 'manual'
      : normalizeText(row.source) === 'discovered'
        ? 'discovered'
        : 'system',
    icon: normalizeIcon(row.icon),
    tags: normalizeStringArray(row.tags),
    scenes: normalizeSceneArray(row.scenes),
    qualityScore: Number.isFinite(Number(row.qualityScore)) ? normalizeFloat(row.qualityScore, 50, 0, 100) : undefined,
    speedScore: Number.isFinite(Number(row.speedScore)) ? normalizeFloat(row.speedScore, 50, 0, 100) : undefined,
    costScore: Number.isFinite(Number(row.costScore)) ? normalizeFloat(row.costScore, 50, 0, 100) : undefined,
    thinkingSupported: thinking.thinkingSupported,
    thinkingDefaultEnabled: thinking.thinkingDefaultEnabled,
    capabilities,
    allowWebsearch,
    allowImageAnalysis: allowFileAnalysis,
    allowImageGeneration,
    allowFileAnalysis,
    builtinTools,
    defaultRouteComboId: normalizeText(row.defaultRouteComboId) || undefined,
    bindings,
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : undefined,
  }
}

function normalizeRouteComboItem(raw: unknown): PilotRouteComboItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const row = raw as Record<string, unknown>
  const id = normalizeText(row.id)
  if (!id) {
    return null
  }

  const routes = Array.isArray(row.routes)
    ? row.routes
        .map(item => normalizeRouteComboRoute(item))
        .filter((item): item is PilotRouteComboRoute => Boolean(item))
    : []

  return {
    id,
    name: normalizeText(row.name) || id,
    description: normalizeText(row.description) || undefined,
    enabled: normalizeBoolean(row.enabled, true),
    langgraphAssistantId: normalizeText(row.langgraphAssistantId) || undefined,
    graphProfile: normalizeText(row.graphProfile) || undefined,
    fallbackRouteComboId: normalizeText(row.fallbackRouteComboId) || undefined,
    routes,
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : undefined,
  }
}

function getDefaultModelCatalog(): PilotModelCatalogItem[] {
  const defaults: Array<Omit<PilotModelCatalogItem, 'scenes'>> = [
    {
      id: 'quota-auto',
      name: 'Quota Auto',
      description: '速度优先自动路由',
      enabled: true,
      visible: true,
      source: 'system',
      icon: { type: 'class', value: 'i-carbon-flow-data' },
      tags: ['auto', 'routing'],
      ...normalizeThinkingFlags(true, true),
      capabilities: resolvePilotModelCapabilities({}),
      allowWebsearch: true,
      allowImageAnalysis: true,
      allowImageGeneration: true,
      allowFileAnalysis: true,
      builtinTools: sanitizeBuiltinToolsByCapabilities(['write_todos'], DEFAULT_MODEL_CAPABILITIES),
      bindings: [],
    },
    {
      id: 'gpt-5.2',
      name: 'GPT 5.2',
      enabled: true,
      visible: true,
      source: 'system',
      icon: { type: 'class', value: 'i-carbon-logo-openai' },
      ...normalizeThinkingFlags(true, true),
      capabilities: resolvePilotModelCapabilities({}),
      allowWebsearch: true,
      allowImageAnalysis: true,
      allowImageGeneration: true,
      allowFileAnalysis: true,
      builtinTools: sanitizeBuiltinToolsByCapabilities(['write_todos'], DEFAULT_MODEL_CAPABILITIES),
      bindings: [],
    },
    {
      id: 'gpt-5.4',
      name: 'GPT 5.4',
      enabled: true,
      visible: true,
      source: 'system',
      icon: { type: 'class', value: 'i-carbon-logo-openai' },
      ...normalizeThinkingFlags(true, true),
      capabilities: resolvePilotModelCapabilities({}),
      allowWebsearch: true,
      allowImageAnalysis: true,
      allowImageGeneration: true,
      allowFileAnalysis: true,
      builtinTools: sanitizeBuiltinToolsByCapabilities(['write_todos'], DEFAULT_MODEL_CAPABILITIES),
      bindings: [],
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      enabled: true,
      visible: true,
      source: 'system',
      icon: { type: 'class', value: 'i-carbon-ai-status' },
      ...normalizeThinkingFlags(true, true),
      capabilities: resolvePilotModelCapabilities({}),
      allowWebsearch: true,
      allowImageAnalysis: true,
      allowImageGeneration: true,
      allowFileAnalysis: true,
      builtinTools: sanitizeBuiltinToolsByCapabilities(['write_todos'], DEFAULT_MODEL_CAPABILITIES),
      bindings: [],
    },
    {
      id: 'gemini-3-pro',
      name: 'Gemini 3 Pro',
      enabled: true,
      visible: true,
      source: 'system',
      icon: { type: 'class', value: 'i-carbon-ai-status-complete' },
      ...normalizeThinkingFlags(true, true),
      capabilities: resolvePilotModelCapabilities({}),
      allowWebsearch: true,
      allowImageAnalysis: true,
      allowImageGeneration: true,
      allowFileAnalysis: true,
      builtinTools: sanitizeBuiltinToolsByCapabilities(['write_todos'], DEFAULT_MODEL_CAPABILITIES),
      bindings: [],
    },
    {
      id: 'claudecode-opus-4.6',
      name: 'ClaudeCode Opus 4.6',
      enabled: true,
      visible: true,
      source: 'system',
      icon: { type: 'class', value: 'i-carbon-machine-learning-model' },
      ...normalizeThinkingFlags(true, true),
      capabilities: resolvePilotModelCapabilities({}),
      allowWebsearch: true,
      allowImageAnalysis: true,
      allowImageGeneration: true,
      allowFileAnalysis: true,
      builtinTools: sanitizeBuiltinToolsByCapabilities(['write_todos'], DEFAULT_MODEL_CAPABILITIES),
      bindings: [],
    },
    {
      id: 'claudecode-sonnet-4.6',
      name: 'ClaudeCode Sonnet 4.6',
      enabled: true,
      visible: true,
      source: 'system',
      icon: { type: 'class', value: 'i-carbon-machine-learning-model' },
      ...normalizeThinkingFlags(true, true),
      capabilities: resolvePilotModelCapabilities({}),
      allowWebsearch: true,
      allowImageAnalysis: true,
      allowImageGeneration: true,
      allowFileAnalysis: true,
      builtinTools: sanitizeBuiltinToolsByCapabilities(['write_todos'], DEFAULT_MODEL_CAPABILITIES),
      bindings: [],
    },
  ]

  return defaults.map(item => ({
    ...item,
    scenes: [],
  }))
}

function getDefaultRouteCombos(): PilotRouteComboItem[] {
  return [
    {
      id: 'default-auto',
      name: 'Default Auto',
      description: '默认自动路由组合',
      enabled: true,
      routes: [],
    },
  ]
}

function getDefaultRoutingPolicy(): PilotRoutingPolicy {
  return {
    defaultModelId: 'quota-auto',
    defaultRouteComboId: 'default-auto',
    quotaAutoStrategy: 'speed-first',
    explorationRate: 0.08,
    scenePolicies: [],
    intentNanoModelId: '',
    intentRouteComboId: '',
    imageGenerationModelId: '',
    imageRouteComboId: '',
  }
}

function getDefaultLoadBalancePolicy(): PilotLoadBalancePolicy {
  return {
    metricWindowHours: 24,
    recentRequestWindow: 200,
    circuitBreakerFailureThreshold: 3,
    circuitBreakerCooldownMs: 60_000,
    halfOpenProbeCount: 1,
  }
}

function getDefaultMemoryPolicy(): PilotMemoryPolicy {
  return {
    enabledByDefault: true,
    allowUserDisable: true,
    allowUserClear: true,
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
  const now = nowIso()
  await ensureAdminSettingsSchema(event)
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

function parseJsonArray(value: string): unknown[] {
  if (!value) {
    return []
  }
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    return []
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

function normalizeRoutingPolicy(raw: unknown): PilotRoutingPolicy {
  const row = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  const defaults = getDefaultRoutingPolicy()
  const explicitScenePolicies = normalizeScenePolicies(row.scenePolicies)
  const scenePolicies = explicitScenePolicies ?? buildScenePoliciesFromLegacy(row)
  const legacyFields = resolveLegacyRoutingFields(scenePolicies)
  return {
    defaultModelId: normalizeText(row.defaultModelId) || defaults.defaultModelId,
    defaultRouteComboId: normalizeText(row.defaultRouteComboId) || defaults.defaultRouteComboId,
    quotaAutoStrategy: 'speed-first',
    explorationRate: normalizeFloat(row.explorationRate, defaults.explorationRate, 0, 0.5),
    scenePolicies,
    intentNanoModelId: legacyFields.intentNanoModelId || defaults.intentNanoModelId,
    intentRouteComboId: legacyFields.intentRouteComboId || defaults.intentRouteComboId,
    imageGenerationModelId: legacyFields.imageGenerationModelId || defaults.imageGenerationModelId,
    imageRouteComboId: legacyFields.imageRouteComboId || defaults.imageRouteComboId,
  }
}

function normalizeLoadBalancePolicy(raw: unknown): PilotLoadBalancePolicy {
  const row = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  const defaults = getDefaultLoadBalancePolicy()
  return {
    metricWindowHours: normalizeNumber(row.metricWindowHours, defaults.metricWindowHours, 1, 24 * 7),
    recentRequestWindow: normalizeNumber(row.recentRequestWindow, defaults.recentRequestWindow, 10, 5000),
    circuitBreakerFailureThreshold: normalizeNumber(
      row.circuitBreakerFailureThreshold,
      defaults.circuitBreakerFailureThreshold,
      1,
      20,
    ),
    circuitBreakerCooldownMs: normalizeNumber(
      row.circuitBreakerCooldownMs,
      defaults.circuitBreakerCooldownMs,
      5_000,
      10 * 60 * 1000,
    ),
    halfOpenProbeCount: normalizeNumber(row.halfOpenProbeCount, defaults.halfOpenProbeCount, 1, 5),
  }
}

function normalizeMemoryPolicy(raw: unknown): PilotMemoryPolicy {
  const row = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  const defaults = getDefaultMemoryPolicy()
  return {
    enabledByDefault: normalizeBoolean(row.enabledByDefault, defaults.enabledByDefault),
    allowUserDisable: normalizeBoolean(row.allowUserDisable, defaults.allowUserDisable),
    allowUserClear: normalizeBoolean(row.allowUserClear, defaults.allowUserClear),
  }
}

function normalizeModelCatalog(raw: unknown[]): PilotModelCatalogItem[] {
  const list = raw
    .map(item => normalizeModelCatalogItem(item))
    .filter((item): item is PilotModelCatalogItem => Boolean(item))

  const quotaAutoDefault = getDefaultModelCatalog().find(item => item.id === 'quota-auto')
  if (!quotaAutoDefault) {
    throw new Error('Missing required default model catalog item: quota-auto')
  }

  if (list.length <= 0) {
    return [quotaAutoDefault]
  }

  const deduped = new Map<string, PilotModelCatalogItem>()
  for (const item of list) {
    if (!deduped.has(item.id)) {
      deduped.set(item.id, item)
    }
  }

  if (!deduped.has(quotaAutoDefault.id)) {
    deduped.set(quotaAutoDefault.id, quotaAutoDefault)
  }

  return Array.from(deduped.values())
}

function normalizeRouteCombos(raw: unknown[]): PilotRouteComboItem[] {
  const list = raw
    .map(item => normalizeRouteComboItem(item))
    .filter((item): item is PilotRouteComboItem => Boolean(item))

  if (list.length <= 0) {
    return getDefaultRouteCombos()
  }

  return Array.from(new Map(list.map(item => [item.id, item])).values())
}

async function buildConfig(event: H3Event): Promise<PilotAdminRoutingConfig> {
  const context = event.context as PilotEventContext
  if (context[CACHE_KEY]) {
    return context[CACHE_KEY]!
  }

  const [modelCatalogRaw, routeCombosRaw, routingPolicyRaw, lbPolicyRaw, memoryPolicyRaw] = await Promise.all([
    readSetting(event, MODEL_CATALOG_KEY),
    readSetting(event, ROUTE_COMBOS_KEY),
    readSetting(event, ROUTING_POLICY_KEY),
    readSetting(event, LB_POLICY_KEY),
    readSetting(event, MEMORY_POLICY_KEY),
  ])

  const config: PilotAdminRoutingConfig = {
    modelCatalog: normalizeModelCatalog(parseJsonArray(modelCatalogRaw)),
    routeCombos: normalizeRouteCombos(parseJsonArray(routeCombosRaw)),
    routingPolicy: normalizeRoutingPolicy(parseJsonObject(routingPolicyRaw)),
    lbPolicy: normalizeLoadBalancePolicy(parseJsonObject(lbPolicyRaw)),
    memoryPolicy: normalizeMemoryPolicy(parseJsonObject(memoryPolicyRaw)),
  }

  context[CACHE_KEY] = config
  return config
}

export async function getPilotAdminRoutingConfig(event: H3Event): Promise<PilotAdminRoutingConfig> {
  return await buildConfig(event)
}

export async function updatePilotAdminRoutingConfig(
  event: H3Event,
  input: UpdatePilotAdminRoutingConfigInput,
): Promise<PilotAdminRoutingConfig> {
  const current = await getPilotAdminRoutingConfig(event)

  const nextModelCatalog = input.modelCatalog
    ? normalizeModelCatalog(input.modelCatalog)
    : current.modelCatalog

  const nextRouteCombos = input.routeCombos
    ? normalizeRouteCombos(input.routeCombos)
    : current.routeCombos

  const hasExplicitScenePolicies = Boolean(
    input.routingPolicy && Object.prototype.hasOwnProperty.call(input.routingPolicy, 'scenePolicies'),
  )
  const hasLegacySceneOverride = Boolean(
    input.routingPolicy
    && [
      'intentNanoModelId',
      'intentRouteComboId',
      'imageGenerationModelId',
      'imageRouteComboId',
    ].some(key => Object.prototype.hasOwnProperty.call(input.routingPolicy, key)),
  )
  const nextRoutingPolicySource: Record<string, unknown> = {
    ...current.routingPolicy,
    ...(input.routingPolicy || {}),
  }
  if (!hasExplicitScenePolicies && hasLegacySceneOverride) {
    delete nextRoutingPolicySource.scenePolicies
  }
  const nextRoutingPolicy = normalizeRoutingPolicy(nextRoutingPolicySource)

  if (hasExplicitScenePolicies) {
    const modelMap = new Map(nextModelCatalog.map(item => [item.id, item]))
    const seenScenes = new Set<string>()
    for (const policy of nextRoutingPolicy.scenePolicies || []) {
      const scene = normalizePilotScene(policy.scene)
      const modelId = normalizeText(policy.modelId)
      if (!scene || !modelId) {
        continue
      }
      if (seenScenes.has(scene)) {
        throw new Error(`Scene policy duplicated: ${scene}`)
      }
      seenScenes.add(scene)
      const model = modelMap.get(modelId)
      if (!model) {
        throw new Error(`Scene policy model group not found: ${modelId}`)
      }
      if (isPilotBuiltInScene(scene) && !(model.scenes || []).includes(scene)) {
        throw new Error(`Model group ${modelId} is missing required scene tag: ${scene}`)
      }
    }
  }

  const nextLbPolicy = normalizeLoadBalancePolicy({
    ...current.lbPolicy,
    ...(input.lbPolicy || {}),
  })

  const nextMemoryPolicy = normalizeMemoryPolicy({
    ...current.memoryPolicy,
    ...(input.memoryPolicy || {}),
  })

  await Promise.all([
    upsertSetting(event, MODEL_CATALOG_KEY, JSON.stringify(nextModelCatalog)),
    upsertSetting(event, ROUTE_COMBOS_KEY, JSON.stringify(nextRouteCombos)),
    upsertSetting(event, ROUTING_POLICY_KEY, JSON.stringify(nextRoutingPolicy)),
    upsertSetting(event, LB_POLICY_KEY, JSON.stringify(nextLbPolicy)),
    upsertSetting(event, MEMORY_POLICY_KEY, JSON.stringify(nextMemoryPolicy)),
  ])

  clearCache(event)
  return await getPilotAdminRoutingConfig(event)
}

export async function mergeDiscoveredModelsIntoCatalog(
  event: H3Event,
  discovered: Array<{
    channelId: string
    providerModel: string
    providerTargetType?: PilotProviderTargetType
    label?: string
    thinkingSupported?: boolean
    thinkingDefaultEnabled?: boolean
    capabilities?: PilotModelCapabilities
    allowImageAnalysis?: boolean
    allowImageGeneration?: boolean
    allowFileAnalysis?: boolean
  }>,
): Promise<PilotAdminRoutingConfig> {
  const current = await getPilotAdminRoutingConfig(event)
  if (!Array.isArray(discovered) || discovered.length <= 0) {
    return current
  }

  const modelMap = new Map(current.modelCatalog.map(item => [item.id, {
    ...item,
    bindings: [...(item.bindings || [])],
  }]))

  for (const item of discovered) {
    const modelId = normalizeText(item.providerModel)
    const channelId = normalizeText(item.channelId)
    if (!modelId || !channelId) {
      continue
    }

    const existing = modelMap.get(modelId)
    const binding: PilotModelBinding = {
      channelId,
      providerModel: modelId,
      providerTargetType: normalizePilotProviderTargetType(item.providerTargetType, 'model'),
      enabled: true,
      priority: 100,
      weight: 100,
    }

    if (!existing) {
      const capabilities = resolvePilotModelCapabilities(item.capabilities, {
        allowWebsearch: true,
        allowImageGeneration: item.allowImageGeneration,
        allowFileAnalysis: item.allowFileAnalysis,
        allowImageAnalysis: item.allowImageAnalysis,
      })
      const thinking = normalizeThinkingFlags(
        normalizeBoolean(item.thinkingSupported, true),
        normalizeBoolean(item.thinkingDefaultEnabled, false),
      )
      modelMap.set(modelId, {
        id: modelId,
        name: normalizeText(item.label) || modelId,
        enabled: true,
        visible: true,
        source: 'discovered',
        scenes: [],
        thinkingSupported: thinking.thinkingSupported,
        thinkingDefaultEnabled: thinking.thinkingDefaultEnabled,
        capabilities,
        allowWebsearch: capabilities.websearch !== false,
        allowImageAnalysis: capabilities['file.analyze'] !== false,
        allowImageGeneration: capabilities['image.generate'] !== false,
        allowFileAnalysis: capabilities['file.analyze'] !== false,
        builtinTools: sanitizeBuiltinToolsByCapabilities(['write_todos'], {
          ...DEFAULT_MODEL_CAPABILITIES,
          ...(capabilities as Record<PilotCapabilityId, boolean>),
        }),
        bindings: [binding],
      })
      continue
    }

    const hasBinding = existing.bindings.some(b => (
      b.channelId === channelId
      && b.providerModel === modelId
      && normalizePilotProviderTargetType(b.providerTargetType, 'model') === normalizePilotProviderTargetType(item.providerTargetType, 'model')
    ))
    if (!hasBinding) {
      existing.bindings.push(binding)
    }

    if (existing.source === 'system') {
      existing.source = 'manual'
    }
  }

  return await updatePilotAdminRoutingConfig(event, {
    modelCatalog: Array.from(modelMap.values()),
  })
}
