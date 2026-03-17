import type { H3Event } from 'h3'
import type { PilotBuiltinTool } from './pilot-channel'
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

export interface PilotModelBinding {
  channelId: string
  providerModel: string
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
  qualityScore?: number
  speedScore?: number
  costScore?: number
  thinkingSupported?: boolean
  thinkingDefaultEnabled?: boolean
  allowWebsearch?: boolean
  defaultRouteComboId?: string
  bindings: PilotModelBinding[]
  metadata?: Record<string, unknown>
}

export interface PilotRouteComboRoute {
  channelId: string
  modelId?: string
  providerModel?: string
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
    qualityScore: Number.isFinite(Number(row.qualityScore)) ? normalizeFloat(row.qualityScore, 50, 0, 100) : undefined,
    speedScore: Number.isFinite(Number(row.speedScore)) ? normalizeFloat(row.speedScore, 50, 0, 100) : undefined,
    costScore: Number.isFinite(Number(row.costScore)) ? normalizeFloat(row.costScore, 50, 0, 100) : undefined,
    thinkingSupported: normalizeBoolean(row.thinkingSupported, true),
    thinkingDefaultEnabled: normalizeBoolean(row.thinkingDefaultEnabled, false),
    allowWebsearch: normalizeBoolean(row.allowWebsearch, true),
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
  return [
    {
      id: 'quota-auto',
      name: 'Quota Auto',
      description: '速度优先自动路由',
      enabled: true,
      visible: true,
      source: 'system',
      icon: { type: 'class', value: 'i-carbon-flow-data' },
      tags: ['auto', 'routing'],
      thinkingSupported: true,
      thinkingDefaultEnabled: true,
      allowWebsearch: true,
      bindings: [],
    },
    {
      id: 'gpt-5.2',
      name: 'GPT 5.2',
      enabled: true,
      visible: true,
      source: 'system',
      icon: { type: 'class', value: 'i-carbon-logo-openai' },
      thinkingSupported: true,
      thinkingDefaultEnabled: true,
      allowWebsearch: true,
      bindings: [],
    },
    {
      id: 'gpt-5.4',
      name: 'GPT 5.4',
      enabled: true,
      visible: true,
      source: 'system',
      icon: { type: 'class', value: 'i-carbon-logo-openai' },
      thinkingSupported: true,
      thinkingDefaultEnabled: true,
      allowWebsearch: true,
      bindings: [],
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      enabled: true,
      visible: true,
      source: 'system',
      icon: { type: 'class', value: 'i-carbon-ai-status' },
      thinkingSupported: true,
      thinkingDefaultEnabled: true,
      allowWebsearch: true,
      bindings: [],
    },
    {
      id: 'gemini-3-pro',
      name: 'Gemini 3 Pro',
      enabled: true,
      visible: true,
      source: 'system',
      icon: { type: 'class', value: 'i-carbon-ai-status-complete' },
      thinkingSupported: true,
      thinkingDefaultEnabled: true,
      allowWebsearch: true,
      bindings: [],
    },
    {
      id: 'claudecode-opus-4.6',
      name: 'ClaudeCode Opus 4.6',
      enabled: true,
      visible: true,
      source: 'system',
      icon: { type: 'class', value: 'i-carbon-machine-learning-model' },
      thinkingSupported: true,
      thinkingDefaultEnabled: true,
      allowWebsearch: true,
      bindings: [],
    },
    {
      id: 'claudecode-sonnet-4.6',
      name: 'ClaudeCode Sonnet 4.6',
      enabled: true,
      visible: true,
      source: 'system',
      icon: { type: 'class', value: 'i-carbon-machine-learning-model' },
      thinkingSupported: true,
      thinkingDefaultEnabled: true,
      allowWebsearch: true,
      bindings: [],
    },
  ]
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
  return {
    defaultModelId: normalizeText(row.defaultModelId) || defaults.defaultModelId,
    defaultRouteComboId: normalizeText(row.defaultRouteComboId) || defaults.defaultRouteComboId,
    quotaAutoStrategy: 'speed-first',
    explorationRate: normalizeFloat(row.explorationRate, defaults.explorationRate, 0, 0.5),
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

  if (list.length <= 0) {
    return getDefaultModelCatalog()
  }

  const deduped = new Map<string, PilotModelCatalogItem>()
  for (const item of list) {
    if (!deduped.has(item.id)) {
      deduped.set(item.id, item)
    }
  }

  const defaults = getDefaultModelCatalog()
  for (const item of defaults) {
    if (!deduped.has(item.id)) {
      deduped.set(item.id, item)
    }
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

  const nextRoutingPolicy = normalizeRoutingPolicy({
    ...current.routingPolicy,
    ...(input.routingPolicy || {}),
  })

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
    label?: string
    thinkingSupported?: boolean
    thinkingDefaultEnabled?: boolean
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
      enabled: true,
      priority: 100,
      weight: 100,
    }

    if (!existing) {
      modelMap.set(modelId, {
        id: modelId,
        name: normalizeText(item.label) || modelId,
        enabled: true,
        visible: true,
        source: 'discovered',
        thinkingSupported: normalizeBoolean(item.thinkingSupported, true),
        thinkingDefaultEnabled: normalizeBoolean(item.thinkingDefaultEnabled, false),
        allowWebsearch: true,
        bindings: [binding],
      })
      continue
    }

    const hasBinding = existing.bindings.some(b => b.channelId === channelId && b.providerModel === modelId)
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
