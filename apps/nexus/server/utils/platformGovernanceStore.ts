import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createHash, randomUUID } from 'node:crypto'
import { createError, getHeader } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { resolveRequestIp } from './ipSecurityStore'
import { isPlainObject, normalizeNumber, normalizeString } from './telemetrySanitizer'

const EVENTS_TABLE = 'platform_governance_events'
const CONFIGS_TABLE = 'platform_governance_configs'
const JSON_LIMIT_BYTES = 64 * 1024
const MAX_MEMORY_EVENTS = 5000

const initializedSchemas = new WeakSet<D1Database>()

export const GOVERNANCE_CONFIG_TYPES = [
  'analytics_collection',
  'storage_channel',
  'notification_channel',
  'intelligence_provider_quota',
] as const
export const GOVERNANCE_OWNER_SCOPES = ['system', 'workspace', 'user'] as const

export type GovernanceConfigType = typeof GOVERNANCE_CONFIG_TYPES[number]
export type GovernanceOwnerScope = typeof GOVERNANCE_OWNER_SCOPES[number]

export interface PlatformGovernanceEvent {
  id: string
  scope: string
  action: string
  actorHash: string | null
  contextHash: string | null
  resourceType: string | null
  resourceId: string | null
  channel: string | null
  unit: string
  quantity: number
  metadata: Record<string, unknown> | null
  occurredAt: string
  createdAt: string
}

export interface RecordPlatformGovernanceEventInput {
  scope: unknown
  action: unknown
  actorId?: unknown
  contextId?: unknown
  resourceType?: unknown
  resourceId?: unknown
  channel?: unknown
  unit?: unknown
  quantity?: unknown
  metadata?: unknown
  occurredAt?: unknown
}

export interface PlatformGovernanceConfig {
  id: string
  configType: GovernanceConfigType
  name: string
  ownerScope: GovernanceOwnerScope
  ownerId: string | null
  targetId: string | null
  channel: string | null
  provider: string | null
  enabled: boolean
  limits: Record<string, unknown> | null
  warningThreshold: number | null
  config: Record<string, unknown> | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface UpsertPlatformGovernanceConfigInput {
  id?: unknown
  configType: unknown
  name: unknown
  ownerScope?: unknown
  ownerId?: unknown
  targetId?: unknown
  channel?: unknown
  provider?: unknown
  enabled?: unknown
  limits?: unknown
  warningThreshold?: unknown
  config?: unknown
}

export interface ListGovernanceEventsOptions {
  scope?: string
  action?: string
  resourceType?: string
  resourceId?: string
  channel?: string
  days?: number
  limit?: number
}

export interface ListGovernanceConfigsOptions {
  configType?: GovernanceConfigType
  ownerScope?: GovernanceOwnerScope
  ownerId?: string
  targetId?: string
  channel?: string
  provider?: string
  enabled?: boolean
}

export interface GovernanceSummaryOptions extends ListGovernanceEventsOptions {
  topLimit?: number
}

export interface GovernanceAnalyticsOptions {
  days?: number
  limit?: number
  topLimit?: number
}

interface GovernanceEventRow {
  id: string
  scope: string
  action: string
  actor_hash: string | null
  context_hash: string | null
  resource_type: string | null
  resource_id: string | null
  channel: string | null
  unit: string
  quantity: number
  metadata_json: string | null
  occurred_at: string
  created_at: string
}

interface GovernanceConfigRow {
  id: string
  config_type: string
  name: string
  owner_scope: string
  owner_id: string
  target_id: string
  channel: string
  provider: string
  enabled: number
  limits_json: string | null
  warning_threshold: number | null
  config_json: string | null
  created_by: string
  created_at: string
  updated_at: string
}

interface NormalizedConfigInput {
  id?: string
  configType: GovernanceConfigType
  name: string
  ownerScope: GovernanceOwnerScope
  ownerId: string
  targetId: string
  channel: string
  provider: string
  enabled: boolean
  limits: Record<string, unknown> | null
  limitsJson: string | null
  warningThreshold: number | null
  config: Record<string, unknown> | null
  configJson: string | null
}

const memoryEvents: PlatformGovernanceEvent[] = []
const memoryConfigs = new Map<string, PlatformGovernanceConfig>()

const SENSITIVE_KEYS = new Set([
  'apikey',
  'secret',
  'secretkey',
  'token',
  'accesstoken',
  'refreshtoken',
  'password',
  'credential',
  'credentials',
  'privatekey',
  'webhookurl',
])

function getD1Database(event?: H3Event | null): D1Database | null {
  return event ? readCloudflareBindings(event)?.DB ?? null : null
}

async function ensureGovernanceSchema(db: D1Database): Promise<void> {
  if (initializedSchemas.has(db))
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${EVENTS_TABLE} (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_hash TEXT,
      context_hash TEXT,
      resource_type TEXT,
      resource_id TEXT,
      channel TEXT,
      unit TEXT NOT NULL DEFAULT 'count',
      quantity REAL NOT NULL DEFAULT 1,
      metadata_json TEXT,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${CONFIGS_TABLE} (
      id TEXT PRIMARY KEY,
      config_type TEXT NOT NULL,
      name TEXT NOT NULL,
      owner_scope TEXT NOT NULL DEFAULT 'system',
      owner_id TEXT NOT NULL DEFAULT '',
      target_id TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      limits_json TEXT,
      warning_threshold REAL,
      config_json TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_${EVENTS_TABLE}_scope_action_at ON ${EVENTS_TABLE}(scope, action, occurred_at);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_${EVENTS_TABLE}_resource_at ON ${EVENTS_TABLE}(resource_type, resource_id, occurred_at);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_${EVENTS_TABLE}_channel_at ON ${EVENTS_TABLE}(channel, occurred_at);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_${CONFIGS_TABLE}_type_target ON ${CONFIGS_TABLE}(config_type, target_id, channel, provider);`).run()
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${CONFIGS_TABLE}_unique ON ${CONFIGS_TABLE}(config_type, owner_scope, owner_id, target_id, channel, provider);`).run()

  initializedSchemas.add(db)
}

function hashIdentifier(value: unknown): string | null {
  const normalized = normalizeString(value, 512)
  if (!normalized)
    return null
  return createHash('sha256').update(normalized).digest('hex')
}

function resolveRequestContextHash(event?: H3Event | null): string | null {
  if (!event)
    return null
  const ip = resolveRequestIp(event)
  const userAgent = normalizeString(getHeader(event, 'user-agent'), 256)
  return hashIdentifier([ip, userAgent].filter(Boolean).join('|'))
}

function normalizeSecretKey(key: string) {
  return key.replace(/[-_\s]/g, '').toLowerCase()
}

function assertNoPlainSecrets(value: unknown, path = 'config'): void {
  if (!value || typeof value !== 'object')
    return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPlainSecrets(item, `${path}[${index}]`))
    return
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(normalizeSecretKey(key))) {
      throw createError({
        statusCode: 400,
        statusMessage: `${path}.${key} must use authRef or credentialRef instead of storing plaintext secrets.`,
      })
    }
    assertNoPlainSecrets(nested, `${path}.${key}`)
  }
}

function assertString(value: unknown, field: string, maxLength = 120): string {
  const normalized = normalizeString(value, maxLength)
  if (!normalized)
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  return normalized
}

function optionalString(value: unknown, field: string, maxLength = 180): string {
  if (value == null)
    return ''
  if (typeof value !== 'string')
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  const trimmed = value.trim()
  if (trimmed.length > maxLength)
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  return trimmed
}

function assertEnum<T extends string>(value: unknown, field: string, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T))
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  return value as T
}

function normalizeJsonObject(value: unknown, field: string): { data: Record<string, unknown> | null, json: string | null } {
  if (value == null)
    return { data: null, json: null }
  if (!isPlainObject(value))
    throw createError({ statusCode: 400, statusMessage: `${field} must be a JSON object.` })
  assertNoPlainSecrets(value, field)
  const json = JSON.stringify(value)
  if (new TextEncoder().encode(json).length > JSON_LIMIT_BYTES) {
    throw createError({ statusCode: 400, statusMessage: `${field} exceeds 64KB.` })
  }
  return { data: value, json }
}

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value)
    return null
  try {
    const parsed = JSON.parse(value)
    return isPlainObject(parsed) ? parsed : null
  }
  catch {
    return null
  }
}

function normalizeQuantity(value: unknown): number {
  const quantity = normalizeNumber(value, { min: 0, max: 1_000_000_000_000 })
  return typeof quantity === 'number' ? quantity : 1
}

function normalizeIso(value: unknown): string {
  if (typeof value !== 'string')
    return new Date().toISOString()
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString()
}

function normalizeConfigInput(input: UpsertPlatformGovernanceConfigInput): NormalizedConfigInput {
  const limits = normalizeJsonObject(input.limits, 'limits')
  const config = normalizeJsonObject(input.config, 'config')
  const parsedWarningThreshold = input.warningThreshold == null
    ? null
    : normalizeNumber(input.warningThreshold, { min: 0, max: 100 })

  if (input.warningThreshold != null && typeof parsedWarningThreshold !== 'number') {
    throw createError({ statusCode: 400, statusMessage: 'warningThreshold is invalid.' })
  }

  const warningThreshold = parsedWarningThreshold ?? null

  return {
    id: input.id == null ? undefined : assertString(input.id, 'id', 160),
    configType: assertEnum(input.configType, 'configType', GOVERNANCE_CONFIG_TYPES),
    name: assertString(input.name, 'name', 160),
    ownerScope: input.ownerScope == null
      ? 'system'
      : assertEnum(input.ownerScope, 'ownerScope', GOVERNANCE_OWNER_SCOPES),
    ownerId: optionalString(input.ownerId, 'ownerId', 180),
    targetId: optionalString(input.targetId, 'targetId', 180),
    channel: optionalString(input.channel, 'channel', 120),
    provider: optionalString(input.provider, 'provider', 120),
    enabled: input.enabled !== false,
    limits: limits.data,
    limitsJson: limits.json,
    warningThreshold,
    config: config.data,
    configJson: config.json,
  }
}

function mapEventRow(row: GovernanceEventRow): PlatformGovernanceEvent {
  return {
    id: row.id,
    scope: row.scope,
    action: row.action,
    actorHash: row.actor_hash,
    contextHash: row.context_hash,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    channel: row.channel,
    unit: row.unit,
    quantity: Number(row.quantity) || 0,
    metadata: parseJsonObject(row.metadata_json),
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  }
}

function mapConfigRow(row: GovernanceConfigRow): PlatformGovernanceConfig {
  return {
    id: row.id,
    configType: row.config_type as GovernanceConfigType,
    name: row.name,
    ownerScope: row.owner_scope as GovernanceOwnerScope,
    ownerId: row.owner_id || null,
    targetId: row.target_id || null,
    channel: row.channel || null,
    provider: row.provider || null,
    enabled: Number(row.enabled) === 1,
    limits: parseJsonObject(row.limits_json),
    warningThreshold: row.warning_threshold == null ? null : Number(row.warning_threshold),
    config: parseJsonObject(row.config_json),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildEventFilters(options: ListGovernanceEventsOptions) {
  const conditions: string[] = []
  const values: Array<string | number> = []
  const days = Number.isFinite(options.days) && options.days && options.days > 0
    ? Math.min(Math.floor(options.days), 366)
    : 30
  const start = new Date()
  start.setDate(start.getDate() - days)
  conditions.push('occurred_at >= ?')
  values.push(start.toISOString())

  for (const [field, column] of [
    ['scope', 'scope'],
    ['action', 'action'],
    ['resourceType', 'resource_type'],
    ['resourceId', 'resource_id'],
    ['channel', 'channel'],
  ] as const) {
    const value = options[field]
    if (value) {
      conditions.push(`${column} = ?`)
      values.push(value)
    }
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  }
}

function eventMatchesOptions(event: PlatformGovernanceEvent, options: ListGovernanceEventsOptions): boolean {
  const days = Number.isFinite(options.days) && options.days && options.days > 0
    ? Math.min(Math.floor(options.days), 366)
    : 30
  const start = Date.now() - days * 24 * 60 * 60 * 1000
  const occurredAt = Date.parse(event.occurredAt)
  if (Number.isFinite(occurredAt) && occurredAt < start)
    return false
  if (options.scope && event.scope !== options.scope)
    return false
  if (options.action && event.action !== options.action)
    return false
  if (options.resourceType && event.resourceType !== options.resourceType)
    return false
  if (options.resourceId && event.resourceId !== options.resourceId)
    return false
  if (options.channel && event.channel !== options.channel)
    return false
  return true
}

function configMatchesOptions(config: PlatformGovernanceConfig, options: ListGovernanceConfigsOptions): boolean {
  if (options.configType && config.configType !== options.configType)
    return false
  if (options.ownerScope && config.ownerScope !== options.ownerScope)
    return false
  if (options.ownerId && config.ownerId !== options.ownerId)
    return false
  if (options.targetId && config.targetId !== options.targetId)
    return false
  if (options.channel && config.channel !== options.channel)
    return false
  if (options.provider && config.provider !== options.provider)
    return false
  if (typeof options.enabled === 'boolean' && config.enabled !== options.enabled)
    return false
  return true
}

function uniqueActorCount(events: PlatformGovernanceEvent[]): number {
  const actors = new Set<string>()
  for (const event of events) {
    const actor = event.actorHash ?? event.contextHash
    if (actor)
      actors.add(actor)
  }
  return actors.size
}

function summarizeEvents(events: PlatformGovernanceEvent[], topLimit = 12) {
  const byAction = new Map<string, { events: number, quantity: number, actors: Set<string> }>()
  const byChannel = new Map<string, { events: number, quantity: number }>()
  const byUnit = new Map<string, number>()
  const timeline = new Map<string, { date: string, events: number, quantity: number }>()
  const resources = new Map<string, { resourceType: string, resourceId: string, action: string, events: number, quantity: number, actors: Set<string> }>()

  for (const event of events) {
    const actor = event.actorHash ?? event.contextHash
    const action = byAction.get(event.action) ?? { events: 0, quantity: 0, actors: new Set<string>() }
    action.events += 1
    action.quantity += event.quantity
    if (actor)
      action.actors.add(actor)
    byAction.set(event.action, action)

    const channelKey = event.channel ?? 'unknown'
    const channel = byChannel.get(channelKey) ?? { events: 0, quantity: 0 }
    channel.events += 1
    channel.quantity += event.quantity
    byChannel.set(channelKey, channel)

    byUnit.set(event.unit, (byUnit.get(event.unit) ?? 0) + event.quantity)

    const date = event.occurredAt.slice(0, 10)
    const day = timeline.get(date) ?? { date, events: 0, quantity: 0 }
    day.events += 1
    day.quantity += event.quantity
    timeline.set(date, day)

    if (event.resourceType && event.resourceId) {
      const key = `${event.resourceType}:${event.resourceId}:${event.action}`
      const resource = resources.get(key) ?? {
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        action: event.action,
        events: 0,
        quantity: 0,
        actors: new Set<string>(),
      }
      resource.events += 1
      resource.quantity += event.quantity
      if (actor)
        resource.actors.add(actor)
      resources.set(key, resource)
    }
  }

  return {
    totalEvents: events.length,
    totalQuantity: events.reduce((sum, event) => sum + event.quantity, 0),
    uniqueActors: uniqueActorCount(events),
    byAction: Array.from(byAction.entries())
      .map(([action, item]) => ({ action, events: item.events, quantity: item.quantity, uniqueActors: item.actors.size }))
      .sort((a, b) => b.quantity - a.quantity || b.events - a.events),
    byChannel: Array.from(byChannel.entries())
      .map(([channel, item]) => ({ channel, events: item.events, quantity: item.quantity }))
      .sort((a, b) => b.quantity - a.quantity || b.events - a.events),
    byUnit: Array.from(byUnit.entries())
      .map(([unit, quantity]) => ({ unit, quantity }))
      .sort((a, b) => b.quantity - a.quantity),
    timeline: Array.from(timeline.values()).sort((a, b) => a.date.localeCompare(b.date)),
    topResources: Array.from(resources.values())
      .map(item => ({
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        action: item.action,
        events: item.events,
        quantity: item.quantity,
        uniqueActors: item.actors.size,
      }))
      .sort((a, b) => b.quantity - a.quantity || b.events - a.events)
      .slice(0, topLimit),
  }
}

function readEventActor(event: PlatformGovernanceEvent): string | null {
  return event.actorHash ?? event.contextHash
}

function readEventMetadataString(event: PlatformGovernanceEvent, key: string): string | null {
  const value = event.metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function createMetricBucket() {
  return {
    events: 0,
    quantity: 0,
    actors: new Set<string>(),
  }
}

function addMetricBucket(
  buckets: Map<string, ReturnType<typeof createMetricBucket>>,
  key: string | null | undefined,
  event: PlatformGovernanceEvent,
  quantity = event.quantity,
): void {
  const bucketKey = key && key.trim() ? key.trim() : 'unknown'
  const bucket = buckets.get(bucketKey) ?? createMetricBucket()
  bucket.events += 1
  bucket.quantity += quantity
  const actor = readEventActor(event)
  if (actor)
    bucket.actors.add(actor)
  buckets.set(bucketKey, bucket)
}

function mapMetricBuckets(buckets: Map<string, ReturnType<typeof createMetricBucket>>, limit: number) {
  return Array.from(buckets.entries())
    .map(([key, item]) => ({
      key,
      events: item.events,
      quantity: item.quantity,
      uniqueActors: item.actors.size,
    }))
    .sort((a, b) => b.quantity - a.quantity || b.events - a.events)
    .slice(0, limit)
}

function createScopedAnalytics(events: PlatformGovernanceEvent[], topLimit: number) {
  const byHour = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byChannel = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byResource = new Map<string, ReturnType<typeof createMetricBucket>>()
  const actors = new Set<string>()

  for (const event of events) {
    const actor = readEventActor(event)
    if (actor)
      actors.add(actor)
    const hour = new Date(event.occurredAt).getUTCHours().toString().padStart(2, '0')
    addMetricBucket(byHour, hour, event)
    addMetricBucket(byChannel, event.channel, event)
    addMetricBucket(byResource, event.resourceId, event)
  }

  return {
    totalEvents: events.length,
    totalQuantity: events.reduce((sum, item) => sum + item.quantity, 0),
    uniqueActors: actors.size,
    byHour: mapMetricBuckets(byHour, 24),
    byChannel: mapMetricBuckets(byChannel, topLimit),
    byResource: mapMetricBuckets(byResource, topLimit),
    timeline: summarizeEvents(events, topLimit).timeline,
  }
}

function createGrowth(events: PlatformGovernanceEvent[], days: number) {
  const now = Date.now()
  const windowMs = days * 24 * 60 * 60 * 1000
  const midpoint = now - windowMs / 2
  let previousEvents = 0
  let currentEvents = 0
  for (const event of events) {
    const occurredAt = Date.parse(event.occurredAt)
    if (!Number.isFinite(occurredAt))
      continue
    if (occurredAt >= midpoint)
      currentEvents += 1
    else
      previousEvents += 1
  }
  const eventGrowthRate = previousEvents > 0
    ? ((currentEvents - previousEvents) / previousEvents) * 100
    : currentEvents > 0 ? 100 : 0
  return {
    previousEvents,
    currentEvents,
    eventGrowthRate: Math.round(eventGrowthRate * 100) / 100,
  }
}

function createSearchAnalytics(events: PlatformGovernanceEvent[], days: number, topLimit: number) {
  const searchEvents = events.filter(event => event.scope === 'app' && event.action === 'search')
  const byQueryType = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byScene = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byInputType = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byProvider = new Map<string, ReturnType<typeof createMetricBucket>>()

  for (const event of searchEvents) {
    addMetricBucket(byQueryType, readEventMetadataString(event, 'queryType'), event)
    addMetricBucket(byScene, readEventMetadataString(event, 'searchScene') ?? event.resourceId, event)
    const inputTypes = Array.isArray(event.metadata?.inputTypes) ? event.metadata.inputTypes : []
    for (const inputType of inputTypes) {
      if (typeof inputType === 'string')
        addMetricBucket(byInputType, inputType, event)
    }
    const providerTimings = event.metadata?.providerTimings
    if (providerTimings && typeof providerTimings === 'object' && !Array.isArray(providerTimings)) {
      for (const providerId of Object.keys(providerTimings))
        addMetricBucket(byProvider, providerId, event)
    }
  }

  return {
    ...createScopedAnalytics(searchEvents, topLimit),
    growth: createGrowth(searchEvents, days),
    byQueryType: mapMetricBuckets(byQueryType, topLimit),
    byScene: mapMetricBuckets(byScene, topLimit),
    byInputType: mapMetricBuckets(byInputType, topLimit),
    byProvider: mapMetricBuckets(byProvider, topLimit),
  }
}

function createPluginAnalytics(events: PlatformGovernanceEvent[], days: number, topLimit: number) {
  const pluginEvents = events.filter(event => event.scope === 'plugin' && event.resourceType === 'plugin' && event.resourceId)
  const plugins = new Map<string, {
    pluginId: string
    downloads: number
    invocations: number
    events: number
    actors: Set<string>
    countries: Map<string, number>
    channels: Map<string, number>
  }>()

  for (const event of pluginEvents) {
    const pluginId = event.resourceId ?? 'unknown'
    const item = plugins.get(pluginId) ?? {
      pluginId,
      downloads: 0,
      invocations: 0,
      events: 0,
      actors: new Set<string>(),
      countries: new Map<string, number>(),
      channels: new Map<string, number>(),
    }
    item.events += 1
    if (event.action === 'download')
      item.downloads += event.quantity
    if (event.action === 'invoke')
      item.invocations += event.quantity
    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)
    const country = readEventMetadataString(event, 'countryCode')
    if (country)
      item.countries.set(country, (item.countries.get(country) ?? 0) + 1)
    if (event.channel)
      item.channels.set(event.channel, (item.channels.get(event.channel) ?? 0) + 1)
    plugins.set(pluginId, item)
  }

  const leaderboard = Array.from(plugins.values())
    .map(item => ({
      pluginId: item.pluginId,
      downloads: item.downloads,
      invocations: item.invocations,
      events: item.events,
      uniqueActors: item.actors.size,
      topCountries: Array.from(item.countries.entries())
        .map(([countryCode, events]) => ({ countryCode, events }))
        .sort((a, b) => b.events - a.events)
        .slice(0, 5),
      topChannels: Array.from(item.channels.entries())
        .map(([channel, events]) => ({ channel, events }))
        .sort((a, b) => b.events - a.events)
        .slice(0, 5),
    }))
    .sort((a, b) => (b.downloads + b.invocations) - (a.downloads + a.invocations) || b.events - a.events)
    .slice(0, topLimit)

  return {
    ...createScopedAnalytics(pluginEvents, topLimit),
    growth: createGrowth(pluginEvents, days),
    leaderboard,
  }
}

function createUploadAnalytics(events: PlatformGovernanceEvent[], topLimit: number) {
  const uploadEvents = events.filter(event => event.scope === 'upload')
  const completed = uploadEvents.filter(event => event.action === 'resource.completed')
  const failed = uploadEvents.filter(event => event.action === 'resource.failed')
  const byExtension = new Map<string, ReturnType<typeof createMetricBucket>>()

  for (const event of uploadEvents) {
    addMetricBucket(byExtension, readEventMetadataString(event, 'extension'), event)
  }

  return {
    ...createScopedAnalytics(uploadEvents, topLimit),
    completed: completed.length,
    failed: failed.length,
    bytes: completed.reduce((sum, event) => event.unit === 'byte' ? sum + event.quantity : sum, 0),
    failureRate: uploadEvents.length ? Math.round((failed.length / uploadEvents.length) * 10000) / 100 : 0,
    byExtension: mapMetricBuckets(byExtension, topLimit),
  }
}

function createProviderAnalytics(events: PlatformGovernanceEvent[], days: number, topLimit: number) {
  const providerEvents = events.filter(event => event.scope === 'intelligence' && event.resourceType === 'provider')
  const providers = new Map<string, {
    providerId: string
    requests: number
    tokens: number
    quantity: number
    actors: Set<string>
    units: Map<string, number>
    channels: Map<string, number>
  }>()

  for (const event of providerEvents) {
    const providerId = event.resourceId ?? 'unknown'
    const item = providers.get(providerId) ?? {
      providerId,
      requests: 0,
      tokens: 0,
      quantity: 0,
      actors: new Set<string>(),
      units: new Map<string, number>(),
      channels: new Map<string, number>(),
    }
    if (event.action === 'provider.request')
      item.requests += event.quantity
    if (event.action === 'provider.usage' && event.unit === 'token')
      item.tokens += event.quantity
    item.quantity += event.quantity
    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)
    item.units.set(event.unit, (item.units.get(event.unit) ?? 0) + event.quantity)
    if (event.channel)
      item.channels.set(event.channel, (item.channels.get(event.channel) ?? 0) + event.quantity)
    providers.set(providerId, item)
  }

  return {
    ...createScopedAnalytics(providerEvents, topLimit),
    growth: createGrowth(providerEvents, days),
    leaderboard: Array.from(providers.values())
      .map(item => ({
        providerId: item.providerId,
        requests: item.requests,
        tokens: item.tokens,
        quantity: item.quantity,
        uniqueActors: item.actors.size,
        byUnit: Array.from(item.units.entries())
          .map(([unit, quantity]) => ({ unit, quantity }))
          .sort((a, b) => b.quantity - a.quantity),
        byChannel: Array.from(item.channels.entries())
          .map(([channel, quantity]) => ({ channel, quantity }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5),
      }))
      .sort((a, b) => b.tokens - a.tokens || b.requests - a.requests || b.quantity - a.quantity)
      .slice(0, topLimit),
  }
}

function normalizeLimit(limit?: number): number {
  return Number.isFinite(limit) && limit && limit > 0 ? Math.min(Math.floor(limit), 5000) : 100
}

export async function recordPlatformGovernanceEvent(
  event: H3Event | undefined,
  input: RecordPlatformGovernanceEventInput,
): Promise<PlatformGovernanceEvent> {
  const now = new Date().toISOString()
  const scope = assertString(input.scope, 'scope', 80)
  const action = assertString(input.action, 'action', 120)
  const metadata = normalizeJsonObject(input.metadata, 'metadata')
  const record: PlatformGovernanceEvent = {
    id: randomUUID(),
    scope,
    action,
    actorHash: hashIdentifier(input.actorId),
    contextHash: hashIdentifier(input.contextId) ?? resolveRequestContextHash(event),
    resourceType: input.resourceType == null ? null : assertString(input.resourceType, 'resourceType', 80),
    resourceId: input.resourceId == null ? null : assertString(input.resourceId, 'resourceId', 180),
    channel: input.channel == null ? null : assertString(input.channel, 'channel', 120),
    unit: input.unit == null ? 'count' : assertString(input.unit, 'unit', 60),
    quantity: normalizeQuantity(input.quantity),
    metadata: metadata.data,
    occurredAt: normalizeIso(input.occurredAt),
    createdAt: now,
  }

  const db = getD1Database(event)
  if (!db) {
    memoryEvents.push(record)
    if (memoryEvents.length > MAX_MEMORY_EVENTS)
      memoryEvents.splice(0, memoryEvents.length - MAX_MEMORY_EVENTS)
    return record
  }

  await ensureGovernanceSchema(db)
  await db.prepare(`
    INSERT INTO ${EVENTS_TABLE} (
      id, scope, action, actor_hash, context_hash, resource_type, resource_id,
      channel, unit, quantity, metadata_json, occurred_at, created_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13);
  `).bind(
    record.id,
    record.scope,
    record.action,
    record.actorHash,
    record.contextHash,
    record.resourceType,
    record.resourceId,
    record.channel,
    record.unit,
    record.quantity,
    metadata.json,
    record.occurredAt,
    record.createdAt,
  ).run()

  return record
}

export async function listPlatformGovernanceEvents(
  event: H3Event | undefined,
  options: ListGovernanceEventsOptions = {},
): Promise<PlatformGovernanceEvent[]> {
  const db = getD1Database(event)
  const limit = normalizeLimit(options.limit)
  if (!db) {
    return memoryEvents
      .filter(item => eventMatchesOptions(item, options))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit)
  }

  await ensureGovernanceSchema(db)
  const { clause, values } = buildEventFilters(options)
  const { results } = await db.prepare(`
    SELECT id, scope, action, actor_hash, context_hash, resource_type, resource_id,
      channel, unit, quantity, metadata_json, occurred_at, created_at
    FROM ${EVENTS_TABLE}
    ${clause}
    ORDER BY occurred_at DESC
    LIMIT ?;
  `).bind(...values, limit).all<GovernanceEventRow>()

  return (results ?? []).map(mapEventRow)
}

export async function getPlatformGovernanceSummary(
  event: H3Event | undefined,
  options: GovernanceSummaryOptions = {},
) {
  const events = await listPlatformGovernanceEvents(event, {
    ...options,
    limit: options.limit ?? 500,
  })
  return {
    days: Number.isFinite(options.days) && options.days && options.days > 0 ? Math.min(Math.floor(options.days), 366) : 30,
    scope: options.scope ?? null,
    resourceType: options.resourceType ?? null,
    resourceId: options.resourceId ?? null,
    generatedAt: new Date().toISOString(),
    ...summarizeEvents(events, options.topLimit ?? 12),
  }
}

export async function getPlatformGovernanceAnalytics(
  event: H3Event | undefined,
  options: GovernanceAnalyticsOptions = {},
) {
  const days = Number.isFinite(options.days) && options.days && options.days > 0
    ? Math.min(Math.floor(options.days), 366)
    : 30
  const topLimit = Number.isFinite(options.topLimit) && options.topLimit && options.topLimit > 0
    ? Math.min(Math.floor(options.topLimit), 50)
    : 12
  const events = await listPlatformGovernanceEvents(event, {
    days,
    limit: options.limit ?? 5000,
  })
  const visitEvents = events.filter(item => item.scope === 'app' && item.action === 'visit')
  const notificationEvents = events.filter(item => item.scope === 'notification')
  const storageEvents = events.filter(item => item.scope === 'storage')

  return {
    days,
    generatedAt: new Date().toISOString(),
    overview: {
      ...summarizeEvents(events, topLimit),
      growth: createGrowth(events, days),
    },
    visits: {
      ...createScopedAnalytics(visitEvents, topLimit),
      growth: createGrowth(visitEvents, days),
    },
    searches: createSearchAnalytics(events, days, topLimit),
    plugins: createPluginAnalytics(events, days, topLimit),
    uploads: createUploadAnalytics(events, topLimit),
    notifications: createScopedAnalytics(notificationEvents, topLimit),
    storage: createScopedAnalytics(storageEvents, topLimit),
    providers: createProviderAnalytics(events, days, topLimit),
  }
}

function buildConfigKey(input: Pick<PlatformGovernanceConfig, 'configType' | 'ownerScope' | 'ownerId' | 'targetId' | 'channel' | 'provider'>): string {
  return [
    input.configType,
    input.ownerScope,
    input.ownerId ?? '',
    input.targetId ?? '',
    input.channel ?? '',
    input.provider ?? '',
  ].join('|')
}

async function findConfigRow(db: D1Database, input: NormalizedConfigInput): Promise<GovernanceConfigRow | null> {
  return await db.prepare(`
    SELECT id, config_type, name, owner_scope, owner_id, target_id, channel, provider,
      enabled, limits_json, warning_threshold, config_json, created_by, created_at, updated_at
    FROM ${CONFIGS_TABLE}
    WHERE config_type = ?1 AND owner_scope = ?2 AND owner_id = ?3
      AND target_id = ?4 AND channel = ?5 AND provider = ?6
    LIMIT 1;
  `).bind(
    input.configType,
    input.ownerScope,
    input.ownerId,
    input.targetId,
    input.channel,
    input.provider,
  ).first<GovernanceConfigRow>()
}

export async function upsertPlatformGovernanceConfig(
  event: H3Event | undefined,
  input: UpsertPlatformGovernanceConfigInput,
  createdBy: string,
): Promise<PlatformGovernanceConfig> {
  const normalized = normalizeConfigInput(input)
  const now = new Date().toISOString()
  const db = getD1Database(event)

  if (!db) {
    const key = buildConfigKey({
      configType: normalized.configType,
      ownerScope: normalized.ownerScope,
      ownerId: normalized.ownerId || null,
      targetId: normalized.targetId || null,
      channel: normalized.channel || null,
      provider: normalized.provider || null,
    })
    const existing = memoryConfigs.get(key)
    const config: PlatformGovernanceConfig = {
      id: existing?.id ?? normalized.id ?? randomUUID(),
      configType: normalized.configType,
      name: normalized.name,
      ownerScope: normalized.ownerScope,
      ownerId: normalized.ownerId || null,
      targetId: normalized.targetId || null,
      channel: normalized.channel || null,
      provider: normalized.provider || null,
      enabled: normalized.enabled,
      limits: normalized.limits,
      warningThreshold: normalized.warningThreshold,
      config: normalized.config,
      createdBy: existing?.createdBy ?? createdBy,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    memoryConfigs.set(key, config)
    return config
  }

  await ensureGovernanceSchema(db)
  const existing = await findConfigRow(db, normalized)
  const id = existing?.id ?? normalized.id ?? randomUUID()
  const createdAt = existing?.created_at ?? now
  const author = existing?.created_by ?? createdBy

  if (existing) {
    await db.prepare(`
      UPDATE ${CONFIGS_TABLE}
      SET name = ?1, enabled = ?2, limits_json = ?3, warning_threshold = ?4,
        config_json = ?5, updated_at = ?6
      WHERE id = ?7;
    `).bind(
      normalized.name,
      normalized.enabled ? 1 : 0,
      normalized.limitsJson,
      normalized.warningThreshold,
      normalized.configJson,
      now,
      id,
    ).run()
  }
  else {
    await db.prepare(`
      INSERT INTO ${CONFIGS_TABLE} (
        id, config_type, name, owner_scope, owner_id, target_id, channel, provider,
        enabled, limits_json, warning_threshold, config_json, created_by, created_at, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15);
    `).bind(
      id,
      normalized.configType,
      normalized.name,
      normalized.ownerScope,
      normalized.ownerId,
      normalized.targetId,
      normalized.channel,
      normalized.provider,
      normalized.enabled ? 1 : 0,
      normalized.limitsJson,
      normalized.warningThreshold,
      normalized.configJson,
      createdBy,
      now,
      now,
    ).run()
  }

  return {
    id,
    configType: normalized.configType,
    name: normalized.name,
    ownerScope: normalized.ownerScope,
    ownerId: normalized.ownerId || null,
    targetId: normalized.targetId || null,
    channel: normalized.channel || null,
    provider: normalized.provider || null,
    enabled: normalized.enabled,
    limits: normalized.limits,
    warningThreshold: normalized.warningThreshold,
    config: normalized.config,
    createdBy: author,
    createdAt,
    updatedAt: now,
  }
}

export async function listPlatformGovernanceConfigs(
  event: H3Event | undefined,
  options: ListGovernanceConfigsOptions = {},
): Promise<PlatformGovernanceConfig[]> {
  const db = getD1Database(event)
  if (!db) {
    return Array.from(memoryConfigs.values())
      .filter(config => configMatchesOptions(config, options))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  await ensureGovernanceSchema(db)
  const conditions: string[] = []
  const values: Array<string | number> = []
  if (options.configType) {
    conditions.push('config_type = ?')
    values.push(assertEnum(options.configType, 'configType', GOVERNANCE_CONFIG_TYPES))
  }
  if (options.ownerScope) {
    conditions.push('owner_scope = ?')
    values.push(assertEnum(options.ownerScope, 'ownerScope', GOVERNANCE_OWNER_SCOPES))
  }
  if (options.ownerId) {
    conditions.push('owner_id = ?')
    values.push(options.ownerId)
  }
  if (options.targetId) {
    conditions.push('target_id = ?')
    values.push(options.targetId)
  }
  if (options.channel) {
    conditions.push('channel = ?')
    values.push(options.channel)
  }
  if (options.provider) {
    conditions.push('provider = ?')
    values.push(options.provider)
  }
  if (typeof options.enabled === 'boolean') {
    conditions.push('enabled = ?')
    values.push(options.enabled ? 1 : 0)
  }

  const clause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { results } = await db.prepare(`
    SELECT id, config_type, name, owner_scope, owner_id, target_id, channel, provider,
      enabled, limits_json, warning_threshold, config_json, created_by, created_at, updated_at
    FROM ${CONFIGS_TABLE}
    ${clause}
    ORDER BY updated_at DESC;
  `).bind(...values).all<GovernanceConfigRow>()

  return (results ?? []).map(mapConfigRow)
}

function readLimitNumber(limits: Record<string, unknown> | null, keys: string[]): number | null {
  for (const key of keys) {
    const value = normalizeNumber(limits?.[key], { min: 0, max: 1_000_000_000_000 })
    if (typeof value === 'number')
      return value
  }
  return null
}

export async function assertIntelligenceProviderQuota(
  event: H3Event,
  providerId: string,
): Promise<void> {
  const [quota] = await listPlatformGovernanceConfigs(event, {
    configType: 'intelligence_provider_quota',
    targetId: providerId,
    enabled: true,
  })
  if (!quota)
    return

  const windowDays = readLimitNumber(quota.limits, ['windowDays', 'periodDays']) ?? 30
  const requestSummary = await getPlatformGovernanceSummary(event, {
    scope: 'intelligence',
    action: 'provider.request',
    resourceType: 'provider',
    resourceId: providerId,
    days: windowDays,
    limit: 5000,
  })
  const maxRequests = readLimitNumber(quota.limits, ['maxRequests', 'requestLimit'])
  if (maxRequests != null && requestSummary.totalEvents >= maxRequests) {
    throw createError({ statusCode: 429, statusMessage: 'Intelligence provider request quota exceeded.' })
  }

  const usageSummary = await getPlatformGovernanceSummary(event, {
    scope: 'intelligence',
    action: 'provider.usage',
    resourceType: 'provider',
    resourceId: providerId,
    days: windowDays,
    limit: 5000,
  })
  const tokenUsage = usageSummary.byUnit.find(item => item.unit === 'token')?.quantity ?? 0
  const maxTokens = readLimitNumber(quota.limits, ['maxTokens', 'tokenLimit'])
  if (maxTokens != null && tokenUsage >= maxTokens) {
    throw createError({ statusCode: 429, statusMessage: 'Intelligence provider token quota exceeded.' })
  }
}

export async function recordIntelligenceProviderRequest(
  event: H3Event,
  providerId: string,
  capability: string,
): Promise<void> {
  await recordPlatformGovernanceEvent(event, {
    scope: 'intelligence',
    action: 'provider.request',
    resourceType: 'provider',
    resourceId: providerId,
    channel: capability,
    unit: 'request',
    quantity: 1,
  })
}
