import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createHash, randomUUID } from 'node:crypto'
import { createError, getHeader } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { resolveRequestIp } from './ipSecurityStore'
import { assertStorageChannelPolicyConfig } from './storageChannelCatalog'
import { isPlainObject, normalizeNumber, normalizeString } from './telemetrySanitizer'

const EVENTS_TABLE = 'platform_governance_events'
const CONFIGS_TABLE = 'platform_governance_configs'
const JSON_LIMIT_BYTES = 64 * 1024
const MAX_MEMORY_EVENTS = 5000
const UPLOAD_STUCK_ATTEMPT_AGE_MS = 15 * 60 * 1000

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

export type StorageGovernanceAction = 'storage.write' | 'storage.read' | 'storage.delete'

export interface RecordStorageChannelUsageInput {
  action: StorageGovernanceAction
  actorId?: unknown
  channel: unknown
  provider?: unknown
  resourceType?: unknown
  resourceId?: unknown
  unit?: unknown
  quantity?: unknown
  metadata?: unknown
  occurredAt?: unknown
}

export interface AssertStorageChannelPolicyInput {
  action: StorageGovernanceAction
  channel: unknown
  provider?: unknown
  resourceType?: unknown
  unit?: unknown
  quantity?: unknown
  days?: number
  limit?: number
}

export interface StoragePolicyEvaluationOptions {
  days?: number
  limit?: number
}

export interface StoragePolicyEvaluation {
  policyId: string
  name: string
  channel: string
  provider: string | null
  enabled: boolean
  days: number
  status: 'ok' | 'warning' | 'blocked' | 'disabled'
  reasons: string[]
  usage: {
    storedBytes: number
    trafficBytes: number
    operations: number
    writes: number
    reads: number
    deletes: number
  }
  limits: {
    maxBytes: number | null
    trafficBytes: number | null
    maxOperations: number | null
    alertBytes: number | null
    warningThreshold: number | null
  }
  utilization: {
    storedBytes: number | null
    trafficBytes: number | null
    operations: number | null
  }
}

export type StoragePolicyAlertMetric = 'storedBytes' | 'trafficBytes' | 'operations'
export type StoragePolicyAlertLimitKey = 'maxBytes' | 'trafficBytes' | 'maxOperations' | 'alertBytes'

export interface StoragePolicyAlert {
  policyId: string
  name: string
  channel: string
  provider: string | null
  status: 'warning' | 'blocked'
  metric: StoragePolicyAlertMetric
  limitKey: StoragePolicyAlertLimitKey
  usage: number
  limit: number | null
  utilization: number | null
  reasons: string[]
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
  'auth',
  'privatekey',
  'p256dh',
  'webhookurl',
  'webpushsubscription',
  'webpushsubscriptions',
  'pushsubscription',
  'pushsubscriptions',
])

const NOTIFICATION_RECIPIENT_CONFIG_KEYS = new Set([
  'recipient',
  'recipients',
  'to',
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

function assertNoPersistentNotificationRecipients(value: unknown, path = 'config'): void {
  if (!value || typeof value !== 'object')
    return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPersistentNotificationRecipients(item, `${path}[${index}]`))
    return
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (NOTIFICATION_RECIPIENT_CONFIG_KEYS.has(normalizeSecretKey(key))) {
      throw createError({
        statusCode: 400,
        statusMessage: `${path}.${key} must be supplied at dispatch time instead of governance config.`,
      })
    }
    assertNoPersistentNotificationRecipients(nested, `${path}.${key}`)
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
  const configType = assertEnum(input.configType, 'configType', GOVERNANCE_CONFIG_TYPES)
  const limits = normalizeJsonObject(input.limits, 'limits')
  const config = normalizeJsonObject(input.config, 'config')
  if (configType === 'notification_channel')
    assertNoPersistentNotificationRecipients(config.data, 'config')
  if (configType === 'storage_channel') {
    assertStorageChannelPolicyConfig({
      channel: optionalString(input.channel, 'channel', 120),
      provider: optionalString(input.provider, 'provider', 120),
      limits: limits.data,
      config: config.data,
    })
  }
  const parsedWarningThreshold = input.warningThreshold == null
    ? null
    : normalizeNumber(input.warningThreshold, { min: 0, max: 100 })

  if (input.warningThreshold != null && typeof parsedWarningThreshold !== 'number') {
    throw createError({ statusCode: 400, statusMessage: 'warningThreshold is invalid.' })
  }

  const warningThreshold = parsedWarningThreshold ?? null

  return {
    id: input.id == null ? undefined : assertString(input.id, 'id', 160),
    configType,
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

function readAnalyticsResourceKey(event: PlatformGovernanceEvent): string | null {
  if (event.scope === 'storage')
    return event.resourceType ?? event.channel ?? null
  if (event.scope === 'upload')
    return readEventMetadataString(event, 'resourceType') ?? event.resourceType ?? event.channel ?? null
  return event.resourceId
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

    const resourceId = readAnalyticsResourceKey(event)
    if (event.resourceType && resourceId) {
      const key = `${event.resourceType}:${resourceId}:${event.action}`
      const resource = resources.get(key) ?? {
        resourceType: event.resourceType,
        resourceId,
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

function readEventMetadataNumber(event: PlatformGovernanceEvent, key: string): number | null {
  const value = event.metadata?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readEventMetadataBoolean(event: PlatformGovernanceEvent, key: string): boolean | null {
  const value = event.metadata?.[key]
  return typeof value === 'boolean' ? value : null
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

function addStringArrayBuckets(
  buckets: Map<string, ReturnType<typeof createMetricBucket>>,
  value: unknown,
  event: PlatformGovernanceEvent,
): void {
  if (!Array.isArray(value))
    return
  for (const item of value) {
    if (typeof item === 'string')
      addMetricBucket(buckets, item, event)
  }
}

function addNumberMapBuckets(
  buckets: Map<string, ReturnType<typeof createMetricBucket>>,
  value: unknown,
  event: PlatformGovernanceEvent,
): void {
  if (!isPlainObject(value))
    return
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number' && Number.isFinite(raw))
      addMetricBucket(buckets, key, event, raw)
  }
}

function addStatusMapBuckets(
  buckets: Map<string, ReturnType<typeof createMetricBucket>>,
  value: unknown,
  event: PlatformGovernanceEvent,
): void {
  if (!isPlainObject(value))
    return
  for (const [provider, status] of Object.entries(value)) {
    if (typeof status === 'string' && status.trim())
      addMetricBucket(buckets, `${provider}:${status}`, event, 1)
  }
}

function createNumberStats() {
  return {
    count: 0,
    total: 0,
    max: 0,
  }
}

function addNumberStat(stats: ReturnType<typeof createNumberStats>, value: number | null): void {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return
  stats.count += 1
  stats.total += value
  stats.max = Math.max(stats.max, value)
}

function mapNumberStat(stats: ReturnType<typeof createNumberStats>) {
  return {
    count: stats.count,
    average: stats.count ? Math.round((stats.total / stats.count) * 100) / 100 : 0,
    max: stats.count ? stats.max : 0,
  }
}

function createDailyTrend(events: PlatformGovernanceEvent[]) {
  const timeline = new Map<string, { date: string, events: number, quantity: number, actors: Set<string> }>()
  for (const event of events) {
    const date = event.occurredAt.slice(0, 10)
    const item = timeline.get(date) ?? { date, events: 0, quantity: 0, actors: new Set<string>() }
    item.events += 1
    item.quantity += event.quantity
    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)
    timeline.set(date, item)
  }
  return Array.from(timeline.values())
    .map(item => ({
      date: item.date,
      events: item.events,
      quantity: item.quantity,
      uniqueActors: item.actors.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function createTimeHeatmap(events: PlatformGovernanceEvent[]) {
  const buckets = new Map<string, ReturnType<typeof createMetricBucket>>()
  for (const event of events) {
    const date = new Date(event.occurredAt)
    if (Number.isNaN(date.getTime()))
      continue
    const dayOfWeek = date.getUTCDay()
    const hour = date.getUTCHours().toString().padStart(2, '0')
    addMetricBucket(buckets, `${dayOfWeek}:${hour}`, event)
  }
  return Array.from(buckets.entries())
    .map(([key, item]) => {
      const [dayOfWeek = '0', hour = '00'] = key.split(':')
      return {
        dayOfWeek: Number.parseInt(dayOfWeek, 10),
        hour,
        events: item.events,
        quantity: item.quantity,
        uniqueActors: item.actors.size,
      }
    })
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.hour.localeCompare(b.hour))
}

function createPluginDailyTrend(events: PlatformGovernanceEvent[]) {
  const timeline = new Map<string, {
    date: string
    events: number
    downloads: number
    installs: number
    invocations: number
    quantity: number
    actors: Set<string>
  }>()
  for (const event of events) {
    const date = event.occurredAt.slice(0, 10)
    const item = timeline.get(date) ?? {
      date,
      events: 0,
      downloads: 0,
      installs: 0,
      invocations: 0,
      quantity: 0,
      actors: new Set<string>(),
    }
    item.events += 1
    item.quantity += event.quantity
    if (event.action === 'download')
      item.downloads += event.quantity
    if (event.action === 'install')
      item.installs += event.quantity
    if (event.action === 'invoke')
      item.invocations += event.quantity
    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)
    timeline.set(date, item)
  }
  return Array.from(timeline.values())
    .map(item => ({
      date: item.date,
      events: item.events,
      downloads: item.downloads,
      installs: item.installs,
      invocations: item.invocations,
      quantity: item.quantity,
      uniqueActors: item.actors.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function createPluginGrowth(events: PlatformGovernanceEvent[], days: number) {
  const now = Date.now()
  const windowMs = days * 24 * 60 * 60 * 1000
  const midpoint = now - windowMs / 2
  const previous = {
    downloads: 0,
    installs: 0,
    invocations: 0,
    events: 0,
  }
  const current = {
    downloads: 0,
    installs: 0,
    invocations: 0,
    events: 0,
  }

  for (const event of events) {
    const occurredAt = Date.parse(event.occurredAt)
    if (!Number.isFinite(occurredAt))
      continue
    const bucket = occurredAt >= midpoint ? current : previous
    bucket.events += 1
    if (event.action === 'download')
      bucket.downloads += event.quantity
    if (event.action === 'install')
      bucket.installs += event.quantity
    if (event.action === 'invoke')
      bucket.invocations += event.quantity
  }

  const previousScore = previous.downloads + previous.installs * 2 + previous.invocations * 3
  const currentScore = current.downloads + current.installs * 2 + current.invocations * 3
  const growthRate = previousScore > 0
    ? ((currentScore - previousScore) / previousScore) * 100
    : currentScore > 0 ? 100 : 0

  return {
    previousScore,
    currentScore,
    growthRate: Math.round(growthRate * 100) / 100,
    previous,
    current,
  }
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
    addMetricBucket(byResource, readAnalyticsResourceKey(event), event)
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

function createNotificationAnalytics(events: PlatformGovernanceEvent[], topLimit: number) {
  const deliveryEvents = events.filter(event => event.action.startsWith('notification.delivery.'))
  const pushSubscriptionEvents = events.filter(event => event.action.startsWith('browser_push.subscription.'))
  const byDeliveryStatus = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byProvider = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byAdapter = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byReason = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byNotificationAction = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byPushSubscriptionAction = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byPushEndpointHost = new Map<string, ReturnType<typeof createMetricBucket>>()
  const providerHealth = new Map<string, {
    provider: string
    providerType: string | null
    adapter: string | null
    channel: string | null
    total: number
    planned: number
    sent: number
    skipped: number
    failed: number
    latestFailureReason: string | null
    latestFailureAt: string | null
  }>()

  let planned = 0
  let sent = 0
  let skipped = 0
  let failed = 0
  let pushRegistered = 0
  let pushDeleted = 0

  for (const event of deliveryEvents) {
    const status = event.action.slice('notification.delivery.'.length) || 'unknown'
    const provider = readEventMetadataString(event, 'provider') ?? event.channel ?? 'unknown'
    const providerType = readEventMetadataString(event, 'providerType')
    const adapter = readEventMetadataString(event, 'adapter')
    const reason = readEventMetadataString(event, 'reason')
    const providerItem = providerHealth.get(provider) ?? {
      provider,
      providerType,
      adapter,
      channel: event.channel,
      total: 0,
      planned: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      latestFailureReason: null,
      latestFailureAt: null,
    }
    providerItem.providerType ||= providerType
    providerItem.adapter ||= adapter
    providerItem.channel ||= event.channel
    providerItem.total += 1

    if (status === 'planned')
      planned += 1
    else if (status === 'sent') {
      sent += 1
    }
    else if (status === 'skipped') {
      skipped += 1
    }
    else if (status === 'failed') {
      failed += 1
      if (!providerItem.latestFailureAt || event.occurredAt.localeCompare(providerItem.latestFailureAt) > 0) {
        providerItem.latestFailureAt = event.occurredAt
        providerItem.latestFailureReason = reason
      }
    }

    if (status === 'planned')
      providerItem.planned += 1
    else if (status === 'sent')
      providerItem.sent += 1
    else if (status === 'skipped')
      providerItem.skipped += 1
    else if (status === 'failed')
      providerItem.failed += 1
    providerHealth.set(provider, providerItem)

    addMetricBucket(byDeliveryStatus, status, event, 1)
    addMetricBucket(byProvider, provider, event, 1)
    addMetricBucket(byAdapter, adapter, event, 1)
    addMetricBucket(byReason, reason, event, 1)
    addMetricBucket(byNotificationAction, readEventMetadataString(event, 'notificationAction'), event, 1)
  }
  for (const event of pushSubscriptionEvents) {
    const action = event.action.slice('browser_push.subscription.'.length) || 'unknown'
    if (action === 'upserted')
      pushRegistered += 1
    else if (action === 'deleted')
      pushDeleted += 1
    addMetricBucket(byPushSubscriptionAction, action, event, 1)
    addMetricBucket(byPushEndpointHost, readEventMetadataString(event, 'endpointHost'), event, 1)
  }

  const total = deliveryEvents.length

  return {
    ...createScopedAnalytics(events, topLimit),
    deliveries: {
      total,
      planned,
      sent,
      skipped,
      failed,
      plannedRate: total ? Math.round(((planned + sent) / total) * 10000) / 100 : 0,
      sentRate: total ? Math.round((sent / total) * 10000) / 100 : 0,
      failureRate: total ? Math.round((failed / total) * 10000) / 100 : 0,
    },
    byDeliveryStatus: mapMetricBuckets(byDeliveryStatus, topLimit),
    byProvider: mapMetricBuckets(byProvider, topLimit),
    byAdapter: mapMetricBuckets(byAdapter, topLimit),
    byReason: mapMetricBuckets(byReason, topLimit),
    byNotificationAction: mapMetricBuckets(byNotificationAction, topLimit),
    providerHealth: Array.from(providerHealth.values())
      .map(item => ({
        ...item,
        sentRate: item.total ? Math.round((item.sent / item.total) * 10000) / 100 : 0,
        failureRate: item.total ? Math.round((item.failed / item.total) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.failed - a.failed || b.failureRate - a.failureRate || b.total - a.total)
      .slice(0, topLimit),
    browserPushSubscriptions: {
      total: pushSubscriptionEvents.length,
      registered: pushRegistered,
      deleted: pushDeleted,
      byAction: mapMetricBuckets(byPushSubscriptionAction, topLimit),
      byEndpointHost: mapMetricBuckets(byPushEndpointHost, topLimit),
      trend: createDailyTrend(pushSubscriptionEvents),
    },
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

function createUserAnalytics(events: PlatformGovernanceEvent[], days: number, topLimit: number) {
  const userEvents = events.filter(event => event.scope === 'user')
  const signupEvents = userEvents.filter(event => event.action === 'signup' || event.action === 'user.created')
  const byAction = new Map<string, ReturnType<typeof createMetricBucket>>()
  const bySource = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byCountry = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byRegion = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byTimezone = new Map<string, ReturnType<typeof createMetricBucket>>()

  for (const event of userEvents) {
    addMetricBucket(byAction, event.action, event)
    addMetricBucket(bySource, readEventMetadataString(event, 'source') ?? event.channel, event)
    addMetricBucket(byCountry, readEventMetadataString(event, 'countryCode'), event)
    addMetricBucket(byRegion, readEventMetadataString(event, 'regionCode'), event)
    addMetricBucket(byTimezone, readEventMetadataString(event, 'timezone'), event)
  }

  return {
    ...createScopedAnalytics(userEvents, topLimit),
    growth: createGrowth(userEvents, days),
    signups: signupEvents.reduce((sum, event) => sum + event.quantity, 0),
    signupGrowth: createGrowth(signupEvents, days),
    signupTrend: createDailyTrend(signupEvents),
    heatmap: createTimeHeatmap(userEvents),
    byAction: mapMetricBuckets(byAction, topLimit),
    bySource: mapMetricBuckets(bySource, topLimit),
    byCountry: mapMetricBuckets(byCountry, topLimit),
    byRegion: mapMetricBuckets(byRegion, topLimit),
    byTimezone: mapMetricBuckets(byTimezone, topLimit),
  }
}

function createSearchAnalytics(events: PlatformGovernanceEvent[], days: number, topLimit: number) {
  const searchEvents = events.filter(event => event.scope === 'app' && event.action === 'search')
  const byQueryType = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byScene = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byInputType = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byProvider = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byProviderLatency = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byProviderResults = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byResultCategory = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byProviderStatus = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byFilterKind = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byFilterSource = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byContextAppCategory = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byContextSource = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byEntryPoint = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byTriggerType = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byUserPreferenceMode = new Map<string, ReturnType<typeof createMetricBucket>>()
  const bySessionBucket = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byPluginId = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byPluginCategory = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byContextTag = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byLocalHour = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byLocalDayOfWeek = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byCountry = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byRegion = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byTimezone = new Map<string, ReturnType<typeof createMetricBucket>>()
  const queryLength = createNumberStats()
  const firstResultMs = createNumberStats()
  const totalDurationMs = createNumberStats()
  const resultCount = createNumberStats()
  const firstResultCount = createNumberStats()
  const providerErrorCount = createNumberStats()
  const providerTimeoutCount = createNumberStats()
  let withFilters = 0
  let withoutFilters = 0

  for (const event of searchEvents) {
    addMetricBucket(byQueryType, readEventMetadataString(event, 'queryType'), event)
    addMetricBucket(byScene, readEventMetadataString(event, 'searchScene') ?? event.resourceId, event)
    addMetricBucket(byCountry, readEventMetadataString(event, 'countryCode'), event)
    addMetricBucket(byRegion, readEventMetadataString(event, 'regionCode'), event)
    addMetricBucket(byTimezone, readEventMetadataString(event, 'timezone'), event)
    addMetricBucket(byContextAppCategory, readEventMetadataString(event, 'contextAppCategory'), event)
    addMetricBucket(byContextSource, readEventMetadataString(event, 'contextSource'), event)
    addMetricBucket(byEntryPoint, readEventMetadataString(event, 'entryPoint'), event)
    addMetricBucket(byTriggerType, readEventMetadataString(event, 'triggerType'), event)
    addMetricBucket(byUserPreferenceMode, readEventMetadataString(event, 'userPreferenceMode'), event)
    addMetricBucket(bySessionBucket, readEventMetadataString(event, 'sessionBucket'), event)
    addStringArrayBuckets(byInputType, event.metadata?.inputTypes, event)
    addStringArrayBuckets(byFilterKind, event.metadata?.filterKinds, event)
    addStringArrayBuckets(byFilterSource, event.metadata?.filterSources, event)
    addStringArrayBuckets(byPluginId, event.metadata?.pluginIds, event)
    addStringArrayBuckets(byPluginCategory, event.metadata?.pluginCategories, event)
    addStringArrayBuckets(byContextTag, event.metadata?.contextTags, event)
    const localHour = readEventMetadataNumber(event, 'localHour')
    if (typeof localHour === 'number')
      addMetricBucket(byLocalHour, String(Math.round(localHour)).padStart(2, '0'), event)
    const localDayOfWeek = readEventMetadataNumber(event, 'localDayOfWeek')
    if (typeof localDayOfWeek === 'number')
      addMetricBucket(byLocalDayOfWeek, String(Math.round(localDayOfWeek)), event)
    const providerTimings = event.metadata?.providerTimings
    if (providerTimings && typeof providerTimings === 'object' && !Array.isArray(providerTimings)) {
      for (const providerId of Object.keys(providerTimings))
        addMetricBucket(byProvider, providerId, event)
      addNumberMapBuckets(byProviderLatency, providerTimings, event)
    }
    addNumberMapBuckets(byProviderResults, event.metadata?.providerResults, event)
    addNumberMapBuckets(byResultCategory, event.metadata?.resultCategories, event)
    addStatusMapBuckets(byProviderStatus, event.metadata?.providerStatus, event)
    addNumberStat(queryLength, readEventMetadataNumber(event, 'queryLength'))
    addNumberStat(firstResultMs, readEventMetadataNumber(event, 'firstResultMs'))
    addNumberStat(totalDurationMs, readEventMetadataNumber(event, 'totalDurationMs') ?? readEventMetadataNumber(event, 'searchDurationMs'))
    addNumberStat(resultCount, readEventMetadataNumber(event, 'searchResultCount'))
    addNumberStat(firstResultCount, readEventMetadataNumber(event, 'firstResultCount'))
    addNumberStat(providerErrorCount, readEventMetadataNumber(event, 'providerErrorCount'))
    addNumberStat(providerTimeoutCount, readEventMetadataNumber(event, 'providerTimeoutCount'))
    const hasFilters = readEventMetadataBoolean(event, 'hasFilters')
    if (hasFilters === true)
      withFilters += 1
    else if (hasFilters === false)
      withoutFilters += 1
  }

  return {
    ...createScopedAnalytics(searchEvents, topLimit),
    growth: createGrowth(searchEvents, days),
    trend: createDailyTrend(searchEvents),
    heatmap: createTimeHeatmap(searchEvents),
    byQueryType: mapMetricBuckets(byQueryType, topLimit),
    byScene: mapMetricBuckets(byScene, topLimit),
    byInputType: mapMetricBuckets(byInputType, topLimit),
    byProvider: mapMetricBuckets(byProvider, topLimit),
    byProviderLatency: mapMetricBuckets(byProviderLatency, topLimit),
    byProviderResults: mapMetricBuckets(byProviderResults, topLimit),
    byResultCategory: mapMetricBuckets(byResultCategory, topLimit),
    byProviderStatus: mapMetricBuckets(byProviderStatus, topLimit),
    byFilterKind: mapMetricBuckets(byFilterKind, topLimit),
    byFilterSource: mapMetricBuckets(byFilterSource, topLimit),
    byContextAppCategory: mapMetricBuckets(byContextAppCategory, topLimit),
    byContextSource: mapMetricBuckets(byContextSource, topLimit),
    byEntryPoint: mapMetricBuckets(byEntryPoint, topLimit),
    byTriggerType: mapMetricBuckets(byTriggerType, topLimit),
    byUserPreferenceMode: mapMetricBuckets(byUserPreferenceMode, topLimit),
    bySessionBucket: mapMetricBuckets(bySessionBucket, topLimit),
    byPluginId: mapMetricBuckets(byPluginId, topLimit),
    byPluginCategory: mapMetricBuckets(byPluginCategory, topLimit),
    byContextTag: mapMetricBuckets(byContextTag, topLimit),
    byLocalHour: mapMetricBuckets(byLocalHour, 24),
    byLocalDayOfWeek: mapMetricBuckets(byLocalDayOfWeek, 7),
    byCountry: mapMetricBuckets(byCountry, topLimit),
    byRegion: mapMetricBuckets(byRegion, topLimit),
    byTimezone: mapMetricBuckets(byTimezone, topLimit),
    filterUsage: {
      withFilters,
      withoutFilters,
      filterRate: searchEvents.length ? Math.round((withFilters / searchEvents.length) * 10000) / 100 : 0,
    },
    latency: {
      firstResultMs: mapNumberStat(firstResultMs),
      totalDurationMs: mapNumberStat(totalDurationMs),
    },
    resultStats: {
      queryLength: mapNumberStat(queryLength),
      resultCount: mapNumberStat(resultCount),
      firstResultCount: mapNumberStat(firstResultCount),
      providerErrorCount: mapNumberStat(providerErrorCount),
      providerTimeoutCount: mapNumberStat(providerTimeoutCount),
    },
  }
}

function createPluginAnalytics(events: PlatformGovernanceEvent[], days: number, topLimit: number) {
  const pluginEvents = events.filter(event => event.scope === 'plugin' && event.resourceType === 'plugin' && event.resourceId)
  const plugins = new Map<string, {
    pluginId: string
    downloads: number
    installs: number
    invocations: number
    events: number
    actors: Set<string>
    countries: Map<string, number>
    regions: Map<string, number>
    channels: Map<string, number>
    actions: Map<string, { events: number, quantity: number }>
    eventRows: PlatformGovernanceEvent[]
  }>()

  for (const event of pluginEvents) {
    const pluginId = event.resourceId ?? 'unknown'
    const item = plugins.get(pluginId) ?? {
      pluginId,
      downloads: 0,
      installs: 0,
      invocations: 0,
      events: 0,
      actors: new Set<string>(),
      countries: new Map<string, number>(),
      regions: new Map<string, number>(),
      channels: new Map<string, number>(),
      actions: new Map<string, { events: number, quantity: number }>(),
      eventRows: [],
    }
    item.events += 1
    if (event.action === 'download')
      item.downloads += event.quantity
    if (event.action === 'install')
      item.installs += event.quantity
    if (event.action === 'invoke')
      item.invocations += event.quantity
    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)
    const country = readEventMetadataString(event, 'countryCode')
    if (country)
      item.countries.set(country, (item.countries.get(country) ?? 0) + 1)
    const region = readEventMetadataString(event, 'regionCode')
    if (region)
      item.regions.set(region, (item.regions.get(region) ?? 0) + 1)
    if (event.channel)
      item.channels.set(event.channel, (item.channels.get(event.channel) ?? 0) + 1)
    const action = item.actions.get(event.action) ?? { events: 0, quantity: 0 }
    action.events += 1
    action.quantity += event.quantity
    item.actions.set(event.action, action)
    item.eventRows.push(event)
    plugins.set(pluginId, item)
  }

  const leaderboard = Array.from(plugins.values())
    .map((item) => {
      const hotScore = item.downloads + item.installs * 2 + item.invocations * 3 + item.actors.size * 2
      return {
        pluginId: item.pluginId,
        downloads: item.downloads,
        installs: item.installs,
        invocations: item.invocations,
        hotScore,
        growth: createPluginGrowth(item.eventRows, days),
        events: item.events,
        uniqueActors: item.actors.size,
        topCountries: Array.from(item.countries.entries())
          .map(([countryCode, events]) => ({ countryCode, events }))
          .sort((a, b) => b.events - a.events)
          .slice(0, 5),
        topRegions: Array.from(item.regions.entries())
          .map(([regionCode, events]) => ({ regionCode, events }))
          .sort((a, b) => b.events - a.events)
          .slice(0, 5),
        topChannels: Array.from(item.channels.entries())
          .map(([channel, events]) => ({ channel, events }))
          .sort((a, b) => b.events - a.events)
          .slice(0, 5),
        byAction: Array.from(item.actions.entries())
          .map(([action, value]) => ({ action, events: value.events, quantity: value.quantity }))
          .sort((a, b) => b.quantity - a.quantity || b.events - a.events),
      }
    })
    .sort((a, b) => b.hotScore - a.hotScore || b.growth.currentScore - a.growth.currentScore || b.events - a.events)
    .slice(0, topLimit)

  return {
    ...createScopedAnalytics(pluginEvents, topLimit),
    growth: createGrowth(pluginEvents, days),
    trend: createPluginDailyTrend(pluginEvents),
    installTrend: createPluginDailyTrend(pluginEvents.filter(event => event.action === 'install')),
    heatmap: createTimeHeatmap(pluginEvents),
    leaderboard,
  }
}

function createSinglePluginAnalytics(pluginId: string, pluginEvents: PlatformGovernanceEvent[], days: number, topLimit: number) {
  const scoped = pluginEvents.filter(event => event.resourceId === pluginId)
  const actors = new Set<string>()
  const byAction = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byChannel = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byCountry = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byRegion = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byVersion = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byArtifactType = new Map<string, ReturnType<typeof createMetricBucket>>()
  const packageSize = createNumberStats()
  let downloads = 0
  let installs = 0
  let invocations = 0

  for (const event of scoped) {
    if (event.action === 'download')
      downloads += event.quantity
    if (event.action === 'install')
      installs += event.quantity
    if (event.action === 'invoke')
      invocations += event.quantity

    const actor = readEventActor(event)
    if (actor)
      actors.add(actor)

    addMetricBucket(byAction, event.action, event)
    addMetricBucket(byChannel, event.channel, event)
    addMetricBucket(byCountry, readEventMetadataString(event, 'countryCode'), event)
    addMetricBucket(byRegion, readEventMetadataString(event, 'regionCode'), event)
    addMetricBucket(byVersion, readEventMetadataString(event, 'version'), event)
    addMetricBucket(byArtifactType, readEventMetadataString(event, 'artifactType'), event)
    addNumberStat(packageSize, readEventMetadataNumber(event, 'packageSize'))
  }

  return {
    days,
    pluginId,
    downloads,
    installs,
    invocations,
    events: scoped.length,
    uniqueActors: actors.size,
    growth: createGrowth(scoped, days),
    trend: createPluginDailyTrend(scoped),
    installTrend: createPluginDailyTrend(scoped.filter(event => event.action === 'install')),
    heatmap: createTimeHeatmap(scoped),
    byAction: mapMetricBuckets(byAction, topLimit),
    byChannel: mapMetricBuckets(byChannel, topLimit),
    byCountry: mapMetricBuckets(byCountry, topLimit),
    byRegion: mapMetricBuckets(byRegion, topLimit),
    byVersion: mapMetricBuckets(byVersion, topLimit),
    byArtifactType: mapMetricBuckets(byArtifactType, topLimit),
    packageSize: mapNumberStat(packageSize),
  }
}

function createUploadAnalytics(events: PlatformGovernanceEvent[], topLimit: number) {
  const uploadEvents = events.filter(event => event.scope === 'upload')
  const started = uploadEvents.filter(event => event.action === 'resource.started')
  const completed = uploadEvents.filter(event => event.action === 'resource.completed')
  const failed = uploadEvents.filter(event => event.action === 'resource.failed')
  const terminalEvents = [...completed, ...failed]
  const attempts = new Map<string, {
    attemptId: string
    started: boolean
    completed: boolean
    failed: boolean
    resourceType: string
    resourceId: string
    latestAt: string
    surface: string | null
    storageChannel: string | null
    storageProvider: string | null
    contentType: string | null
    reason: string | null
    statusCode: number | null
    durationMs: number | null
    size: number | null
  }>()
  const byExtension = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byResourceType = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byContentType = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byStorageChannel = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byStorageProvider = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byFailureReason = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byStatusCode = new Map<string, ReturnType<typeof createMetricBucket>>()
  const bySurface = new Map<string, ReturnType<typeof createMetricBucket>>()
  const uploadSize = createNumberStats()
  const uploadDurationMs = createNumberStats()

  for (const event of uploadEvents) {
    const attemptId = readEventMetadataString(event, 'attemptId')
    if (attemptId) {
      const item = attempts.get(attemptId) ?? {
        attemptId,
        started: false,
        completed: false,
        failed: false,
        resourceType: readEventMetadataString(event, 'resourceType') ?? event.resourceType ?? 'unknown',
        resourceId: event.resourceId ?? 'unknown',
        latestAt: event.occurredAt,
        surface: null,
        storageChannel: null,
        storageProvider: null,
        contentType: null,
        reason: null,
        statusCode: null,
        durationMs: null,
        size: null,
      }
      item.started = item.started || event.action === 'resource.started'
      item.completed = item.completed || event.action === 'resource.completed'
      item.failed = item.failed || event.action === 'resource.failed'
      item.surface ??= readEventMetadataString(event, 'surface')
      item.storageChannel ??= readEventMetadataString(event, 'storageChannel')
      item.storageProvider ??= readEventMetadataString(event, 'storageProvider')
      item.contentType ??= readEventMetadataString(event, 'contentType') ?? event.channel
      item.reason ??= readEventMetadataString(event, 'reason')
      item.statusCode ??= readEventMetadataNumber(event, 'statusCode')
      item.durationMs ??= readEventMetadataNumber(event, 'durationMs')
      item.size ??= readEventMetadataNumber(event, 'size') ?? (event.unit === 'byte' ? event.quantity : null)
      item.resourceType = readEventMetadataString(event, 'resourceType') ?? event.resourceType ?? item.resourceType
      item.resourceId = event.resourceId ?? item.resourceId
      item.latestAt = event.occurredAt.localeCompare(item.latestAt) > 0 ? event.occurredAt : item.latestAt
      attempts.set(attemptId, item)
    }
    addMetricBucket(bySurface, readEventMetadataString(event, 'surface'), event)
  }

  for (const event of terminalEvents) {
    addMetricBucket(byExtension, readEventMetadataString(event, 'extension'), event)
    addMetricBucket(byResourceType, readEventMetadataString(event, 'resourceType') ?? event.resourceType, event)
    addMetricBucket(byContentType, readEventMetadataString(event, 'contentType') ?? event.channel, event)
    addMetricBucket(byStorageChannel, readEventMetadataString(event, 'storageChannel'), event)
    addMetricBucket(byStorageProvider, readEventMetadataString(event, 'storageProvider'), event)
    addNumberStat(uploadDurationMs, readEventMetadataNumber(event, 'durationMs'))
    if (event.action === 'resource.failed') {
      addMetricBucket(byFailureReason, readEventMetadataString(event, 'reason'), event, 1)
      const statusCode = readEventMetadataNumber(event, 'statusCode')
      if (typeof statusCode === 'number')
        addMetricBucket(byStatusCode, String(Math.round(statusCode)), event, 1)
    }
    addNumberStat(uploadSize, readEventMetadataNumber(event, 'size') ?? (event.unit === 'byte' ? event.quantity : null))
  }

  const stuckBefore = Date.now() - UPLOAD_STUCK_ATTEMPT_AGE_MS
  const stuckAttempts = Array.from(attempts.values())
    .filter((item) => {
      if (!item.started || item.completed || item.failed)
        return false
      const latestAt = Date.parse(item.latestAt)
      return Number.isFinite(latestAt) && latestAt <= stuckBefore
    })
  const stuckAttemptIds = new Set(stuckAttempts.map(item => item.attemptId))
  const problemAttempts = Array.from(attempts.values())
    .filter(item => item.failed || stuckAttemptIds.has(item.attemptId))
    .map((item) => {
      const latestAt = Date.parse(item.latestAt)
      return {
        attemptHash: hashIdentifier(item.attemptId)?.slice(0, 16) ?? 'unknown',
        resourceHash: hashIdentifier(item.resourceId)?.slice(0, 16) ?? 'unknown',
        status: item.failed ? 'failed' : 'stuck',
        resourceType: item.resourceType,
        surface: item.surface,
        storageChannel: item.storageChannel,
        storageProvider: item.storageProvider,
        contentType: item.contentType,
        reason: item.reason,
        statusCode: item.statusCode,
        durationMs: item.durationMs,
        size: item.size,
        latestAt: item.latestAt,
        ageMs: Number.isFinite(latestAt) ? Math.max(0, Date.now() - latestAt) : null,
      }
    })
    .sort((left, right) => {
      if (left.status !== right.status)
        return left.status === 'failed' ? -1 : 1
      return (right.ageMs ?? 0) - (left.ageMs ?? 0)
    })
    .slice(0, topLimit)

  return {
    ...createScopedAnalytics(uploadEvents, topLimit),
    started: started.length,
    completed: completed.length,
    failed: failed.length,
    attempts: attempts.size,
    stuckAttempts: stuckAttempts.length,
    stuckAttemptAgeMs: UPLOAD_STUCK_ATTEMPT_AGE_MS,
    bytes: completed.reduce((sum, event) => event.unit === 'byte' ? sum + event.quantity : sum, 0),
    failureRate: terminalEvents.length ? Math.round((failed.length / terminalEvents.length) * 10000) / 100 : 0,
    stuckRate: attempts.size ? Math.round((stuckAttempts.length / attempts.size) * 10000) / 100 : 0,
    byExtension: mapMetricBuckets(byExtension, topLimit),
    byResourceType: mapMetricBuckets(byResourceType, topLimit),
    byContentType: mapMetricBuckets(byContentType, topLimit),
    byStorageChannel: mapMetricBuckets(byStorageChannel, topLimit),
    byStorageProvider: mapMetricBuckets(byStorageProvider, topLimit),
    byFailureReason: mapMetricBuckets(byFailureReason, topLimit),
    byStatusCode: mapMetricBuckets(byStatusCode, topLimit),
    bySurface: mapMetricBuckets(bySurface, topLimit),
    uploadSize: mapNumberStat(uploadSize),
    uploadDurationMs: mapNumberStat(uploadDurationMs),
    problemAttempts,
  }
}

function createStorageUsageBucket() {
  return {
    events: 0,
    storedBytes: 0,
    trafficBytes: 0,
    operations: 0,
    writes: 0,
    reads: 0,
    deletes: 0,
    actors: new Set<string>(),
  }
}

function addStorageUsageBucket(
  buckets: Map<string, ReturnType<typeof createStorageUsageBucket>>,
  key: string | null | undefined,
  event: PlatformGovernanceEvent,
): void {
  const bucketKey = key && key.trim() ? key.trim() : 'unknown'
  const bucket = buckets.get(bucketKey) ?? createStorageUsageBucket()
  bucket.events += 1
  bucket.operations += 1
  if (event.action === 'storage.write') {
    bucket.writes += 1
    if (event.unit === 'byte')
      bucket.storedBytes += event.quantity
  }
  else if (event.action === 'storage.read') {
    bucket.reads += 1
    if (event.unit === 'byte')
      bucket.trafficBytes += event.quantity
  }
  else if (event.action === 'storage.delete') {
    bucket.deletes += 1
  }
  const actor = readEventActor(event)
  if (actor)
    bucket.actors.add(actor)
  buckets.set(bucketKey, bucket)
}

function mapStorageUsageBuckets(buckets: Map<string, ReturnType<typeof createStorageUsageBucket>>, limit: number) {
  return Array.from(buckets.entries())
    .map(([key, item]) => ({
      key,
      events: item.events,
      storedBytes: item.storedBytes,
      trafficBytes: item.trafficBytes,
      operations: item.operations,
      writes: item.writes,
      reads: item.reads,
      deletes: item.deletes,
      uniqueActors: item.actors.size,
    }))
    .sort((a, b) => (b.storedBytes + b.trafficBytes) - (a.storedBytes + a.trafficBytes) || b.operations - a.operations || b.events - a.events)
    .slice(0, limit)
}

function createStorageAnalytics(events: PlatformGovernanceEvent[], topLimit: number) {
  const storageEvents = events.filter(event => event.scope === 'storage')
  const byChannelUsage = new Map<string, ReturnType<typeof createStorageUsageBucket>>()
  const byProviderUsage = new Map<string, ReturnType<typeof createStorageUsageBucket>>()
  const byResourceTypeUsage = new Map<string, ReturnType<typeof createStorageUsageBucket>>()
  const byActionUsage = new Map<string, ReturnType<typeof createStorageUsageBucket>>()
  const trend = new Map<string, ReturnType<typeof createStorageUsageBucket> & { date: string }>()

  for (const event of storageEvents) {
    addStorageUsageBucket(byChannelUsage, event.channel, event)
    addStorageUsageBucket(byProviderUsage, readEventMetadataString(event, 'provider'), event)
    addStorageUsageBucket(byResourceTypeUsage, event.resourceType, event)
    addStorageUsageBucket(byActionUsage, event.action, event)

    const date = event.occurredAt.slice(0, 10)
    const item = trend.get(date) ?? { ...createStorageUsageBucket(), date }
    item.events += 1
    item.operations += 1
    if (event.action === 'storage.write') {
      item.writes += 1
      if (event.unit === 'byte')
        item.storedBytes += event.quantity
    }
    else if (event.action === 'storage.read') {
      item.reads += 1
      if (event.unit === 'byte')
        item.trafficBytes += event.quantity
    }
    else if (event.action === 'storage.delete') {
      item.deletes += 1
    }
    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)
    trend.set(date, item)
  }

  const totals = Array.from(byActionUsage.values()).reduce((sum, item) => ({
    storedBytes: sum.storedBytes + item.storedBytes,
    trafficBytes: sum.trafficBytes + item.trafficBytes,
    operations: sum.operations + item.operations,
    writes: sum.writes + item.writes,
    reads: sum.reads + item.reads,
    deletes: sum.deletes + item.deletes,
  }), {
    storedBytes: 0,
    trafficBytes: 0,
    operations: 0,
    writes: 0,
    reads: 0,
    deletes: 0,
  })

  return {
    ...createScopedAnalytics(storageEvents, topLimit),
    ...totals,
    byChannelUsage: mapStorageUsageBuckets(byChannelUsage, topLimit),
    byProviderUsage: mapStorageUsageBuckets(byProviderUsage, topLimit),
    byResourceTypeUsage: mapStorageUsageBuckets(byResourceTypeUsage, topLimit),
    byActionUsage: mapStorageUsageBuckets(byActionUsage, topLimit),
    trend: Array.from(trend.values())
      .map(item => ({
        date: item.date,
        events: item.events,
        storedBytes: item.storedBytes,
        trafficBytes: item.trafficBytes,
        operations: item.operations,
        writes: item.writes,
        reads: item.reads,
        deletes: item.deletes,
        uniqueActors: item.actors.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
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
    models: Map<string, number>
  }>()
  const byModel = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byProviderType = new Map<string, ReturnType<typeof createMetricBucket>>()

  for (const event of providerEvents) {
    const providerId = event.resourceId ?? 'unknown'
    const model = readEventMetadataString(event, 'model')
    const providerType = readEventMetadataString(event, 'providerType')
    const item = providers.get(providerId) ?? {
      providerId,
      requests: 0,
      tokens: 0,
      quantity: 0,
      actors: new Set<string>(),
      units: new Map<string, number>(),
      channels: new Map<string, number>(),
      models: new Map<string, number>(),
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
    if (event.action === 'provider.usage' && event.unit === 'token') {
      addMetricBucket(byModel, model, event)
      if (model)
        item.models.set(model, (item.models.get(model) ?? 0) + event.quantity)
    }
    if (providerType)
      addMetricBucket(byProviderType, providerType, event)
    providers.set(providerId, item)
  }

  return {
    ...createScopedAnalytics(providerEvents, topLimit),
    growth: createGrowth(providerEvents, days),
    byModel: mapMetricBuckets(byModel, topLimit),
    byProviderType: mapMetricBuckets(byProviderType, topLimit),
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
        byModel: Array.from(item.models.entries())
          .map(([model, tokens]) => ({ model, tokens }))
          .sort((a, b) => b.tokens - a.tokens)
          .slice(0, 5),
      }))
      .sort((a, b) => b.tokens - a.tokens || b.requests - a.requests || b.quantity - a.quantity)
      .slice(0, topLimit),
  }
}

function createProviderQuotaAnalytics(
  providerEvents: PlatformGovernanceEvent[],
  quotas: PlatformGovernanceConfig[],
  topLimit: number,
) {
  return quotas
    .map((quota) => {
      const providerId = quota.targetId ?? quota.provider ?? 'unknown'
      const windowDays = readLimitNumber(quota.limits, ['windowDays', 'periodDays']) ?? 30
      const maxRequests = readLimitNumber(quota.limits, ['maxRequests', 'requestLimit'])
      const maxTokens = readLimitNumber(quota.limits, ['maxTokens', 'tokenLimit'])
      const warningThreshold = resolvePolicyWarningPercent(quota)
      const start = Date.now() - windowDays * 24 * 60 * 60 * 1000
      let requests = 0
      let tokens = 0

      for (const event of providerEvents) {
        if (event.resourceId !== providerId)
          continue
        const occurredAt = Date.parse(event.occurredAt)
        if (Number.isFinite(occurredAt) && occurredAt < start)
          continue
        if (event.action === 'provider.request')
          requests += event.quantity
        else if (event.action === 'provider.usage' && event.unit === 'token')
          tokens += event.quantity
      }

      const requestUtilization = roundUsageRatio(requests, maxRequests)
      const tokenUtilization = roundUsageRatio(tokens, maxTokens)
      const blocked = (maxRequests != null && requests >= maxRequests) || (maxTokens != null && tokens >= maxTokens)
      const warning = (requestUtilization != null && requestUtilization >= warningThreshold)
        || (tokenUtilization != null && tokenUtilization >= warningThreshold)

      return {
        configId: quota.id,
        providerId,
        name: quota.name,
        channel: quota.channel,
        provider: quota.provider,
        enabled: quota.enabled,
        windowDays,
        status: !quota.enabled ? 'disabled' : blocked ? 'blocked' : warning ? 'warning' : 'ok',
        usage: {
          requests,
          tokens,
        },
        limits: {
          maxRequests,
          maxTokens,
          warningThreshold,
        },
        utilization: {
          requests: requestUtilization,
          tokens: tokenUtilization,
        },
      }
    })
    .sort((left, right) => {
      const statusRank = { blocked: 3, warning: 2, ok: 1, disabled: 0 }
      const leftUtilization = Math.max(left.utilization.requests ?? 0, left.utilization.tokens ?? 0)
      const rightUtilization = Math.max(right.utilization.requests ?? 0, right.utilization.tokens ?? 0)
      return statusRank[right.status] - statusRank[left.status] || rightUtilization - leftUtilization
    })
    .slice(0, topLimit)
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

export async function getPluginGovernanceAnalytics(
  event: H3Event | undefined,
  pluginId: string,
  options: GovernanceAnalyticsOptions = {},
) {
  const days = Number.isFinite(options.days) && options.days && options.days > 0
    ? Math.min(Math.floor(options.days), 366)
    : 30
  const topLimit = Number.isFinite(options.topLimit) && options.topLimit && options.topLimit > 0
    ? Math.min(Math.floor(options.topLimit), 50)
    : 12
  const events = await listPlatformGovernanceEvents(event, {
    scope: 'plugin',
    resourceType: 'plugin',
    resourceId: pluginId,
    days,
    limit: options.limit ?? 5000,
  })

  return createSinglePluginAnalytics(pluginId, events, days, topLimit)
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
  const providerEvents = events.filter(item => item.scope === 'intelligence' && item.resourceType === 'provider')
  const providerQuotas = await listPlatformGovernanceConfigs(event, {
    configType: 'intelligence_provider_quota',
  })
  const providers = createProviderAnalytics(events, days, topLimit)

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
    users: createUserAnalytics(events, days, topLimit),
    plugins: createPluginAnalytics(events, days, topLimit),
    uploads: createUploadAnalytics(events, topLimit),
    notifications: createNotificationAnalytics(notificationEvents, topLimit),
    storage: createStorageAnalytics(events, topLimit),
    providers: {
      ...providers,
      quotas: createProviderQuotaAnalytics(providerEvents, providerQuotas, topLimit),
    },
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

function roundUsageRatio(used: number, limit: number | null): number | null {
  if (limit == null || limit <= 0)
    return null
  return Math.round((used / limit) * 10000) / 100
}

function readStorageOperationLimit(limits: Record<string, unknown> | null, days: number): number | null {
  const windowLimit = readLimitNumber(limits, ['maxOperations', 'operationLimit', 'maxOperationsPerWindow'])
  if (windowLimit != null)
    return windowLimit

  const dailyLimit = readLimitNumber(limits, ['maxOperationsPerDay', 'dailyOperations'])
  return dailyLimit == null ? null : dailyLimit * days
}

function resolvePolicyWarningPercent(policy: PlatformGovernanceConfig): number {
  return policy.warningThreshold ?? readLimitNumber(policy.limits, ['warningThreshold', 'warningPercent']) ?? 80
}

function resolveStoragePolicyProjection(
  evaluation: StoragePolicyEvaluation,
  input: Pick<AssertStorageChannelPolicyInput, 'action' | 'unit' | 'quantity'>,
) {
  const quantity = normalizeQuantity(input.quantity)
  const unit = input.unit == null ? 'byte' : assertString(input.unit, 'unit', 60)
  const projected = {
    storedBytes: evaluation.usage.storedBytes,
    trafficBytes: evaluation.usage.trafficBytes,
    operations: evaluation.usage.operations + 1,
  }

  if (unit === 'byte') {
    if (input.action === 'storage.write')
      projected.storedBytes += quantity
    else if (input.action === 'storage.read')
      projected.trafficBytes += quantity
  }

  return projected
}

export async function assertStorageChannelPolicy(
  event: H3Event | undefined,
  input: AssertStorageChannelPolicyInput,
): Promise<void> {
  const channel = assertString(input.channel, 'channel', 120)
  const provider = input.provider == null ? '' : optionalString(input.provider, 'provider', 120)
  const policies = await listPlatformGovernanceConfigs(event, {
    configType: 'storage_channel',
    channel,
    enabled: true,
  })
  if (!policies.length)
    return

  const action = assertEnum(input.action, 'action', ['storage.write', 'storage.read', 'storage.delete'] as const)
  const resourceType = input.resourceType == null ? '' : optionalString(input.resourceType, 'resourceType', 80)
  const matched = policies.filter((policy) => {
    const providerMatched = !policy.provider || !provider || policy.provider === provider
    const targetMatched = !policy.targetId || (resourceType && policy.targetId === resourceType)
    return providerMatched && targetMatched
  })
  for (const policy of matched) {
    const evaluation = await evaluateStorageChannelPolicy(event, policy, {
      days: input.days,
      limit: input.limit,
    })
    const projected = resolveStoragePolicyProjection(evaluation, {
      action,
      unit: input.unit,
      quantity: input.quantity,
    })
    const reasons: string[] = []

    if (action === 'storage.write' && evaluation.limits.maxBytes != null && projected.storedBytes > evaluation.limits.maxBytes)
      reasons.push('max-bytes-exceeded')
    if (action === 'storage.read' && evaluation.limits.trafficBytes != null && projected.trafficBytes > evaluation.limits.trafficBytes)
      reasons.push('traffic-bytes-exceeded')
    if (evaluation.limits.maxOperations != null && projected.operations > evaluation.limits.maxOperations)
      reasons.push('operation-limit-exceeded')

    if (reasons.length) {
      throw createError({
        statusCode: 429,
        statusMessage: `Storage channel policy exceeded: ${reasons.join(', ')}`,
      })
    }
  }
}

export async function recordStorageChannelUsage(
  event: H3Event | undefined,
  input: RecordStorageChannelUsageInput,
): Promise<PlatformGovernanceEvent> {
  return await recordPlatformGovernanceEvent(event, {
    scope: 'storage',
    action: input.action,
    actorId: input.actorId,
    resourceType: input.resourceType ?? 'object',
    resourceId: input.resourceId,
    channel: input.channel,
    unit: input.unit ?? 'byte',
    quantity: input.quantity,
    metadata: {
      ...(isPlainObject(input.metadata) ? input.metadata : {}),
      provider: normalizeString(input.provider, 120),
    },
    occurredAt: input.occurredAt,
  })
}

export async function evaluateStorageChannelPolicy(
  event: H3Event | undefined,
  policy: PlatformGovernanceConfig,
  options: StoragePolicyEvaluationOptions = {},
): Promise<StoragePolicyEvaluation> {
  const days = Number.isFinite(options.days) && options.days && options.days > 0
    ? Math.min(Math.floor(options.days), 366)
    : readLimitNumber(policy.limits, ['windowDays', 'periodDays']) ?? 1
  const channel = policy.channel ?? 'unknown'
  const maxBytes = readLimitNumber(policy.limits, ['maxBytes', 'maxStorageBytes', 'storageBytes'])
  const trafficBytes = readLimitNumber(policy.limits, ['trafficBytes', 'maxTrafficBytes', 'bandwidthBytes'])
  const maxOperations = readStorageOperationLimit(policy.limits, days)
  const alertBytes = readLimitNumber(policy.limits, ['alertBytes', 'warningBytes'])
  const warningThreshold = resolvePolicyWarningPercent(policy)

  if (!policy.enabled) {
    return {
      policyId: policy.id,
      name: policy.name,
      channel,
      provider: policy.provider,
      enabled: false,
      days,
      status: 'disabled',
      reasons: ['policy-disabled'],
      usage: {
        storedBytes: 0,
        trafficBytes: 0,
        operations: 0,
        writes: 0,
        reads: 0,
        deletes: 0,
      },
      limits: {
        maxBytes,
        trafficBytes,
        maxOperations,
        alertBytes,
        warningThreshold,
      },
      utilization: {
        storedBytes: null,
        trafficBytes: null,
        operations: null,
      },
    }
  }

  const events = (await listPlatformGovernanceEvents(event, {
    scope: 'storage',
    channel,
    days,
    limit: options.limit ?? 5000,
  })).filter((item) => {
    const providerMatched = !policy.provider || item.metadata?.provider === policy.provider
    const targetMatched = !policy.targetId || item.resourceType === policy.targetId
    return providerMatched && targetMatched
  })
  const usage = {
    storedBytes: 0,
    trafficBytes: 0,
    operations: 0,
    writes: 0,
    reads: 0,
    deletes: 0,
  }

  for (const item of events) {
    usage.operations += 1
    if (item.action === 'storage.write') {
      usage.writes += 1
      if (item.unit === 'byte')
        usage.storedBytes += item.quantity
    }
    else if (item.action === 'storage.read') {
      usage.reads += 1
      if (item.unit === 'byte')
        usage.trafficBytes += item.quantity
    }
    else if (item.action === 'storage.delete') {
      usage.deletes += 1
    }
  }

  const utilization = {
    storedBytes: roundUsageRatio(usage.storedBytes, maxBytes),
    trafficBytes: roundUsageRatio(usage.trafficBytes, trafficBytes),
    operations: roundUsageRatio(usage.operations, maxOperations),
  }
  const reasons: string[] = []

  if (maxBytes != null && usage.storedBytes >= maxBytes)
    reasons.push('max-bytes-exceeded')
  if (trafficBytes != null && usage.trafficBytes >= trafficBytes)
    reasons.push('traffic-bytes-exceeded')
  if (maxOperations != null && usage.operations >= maxOperations)
    reasons.push('operation-limit-exceeded')

  const warningReasons: string[] = []
  if (alertBytes != null && usage.storedBytes >= alertBytes)
    warningReasons.push('alert-bytes-reached')
  if (utilization.storedBytes != null && utilization.storedBytes >= warningThreshold)
    warningReasons.push('max-bytes-warning')
  if (utilization.trafficBytes != null && utilization.trafficBytes >= warningThreshold)
    warningReasons.push('traffic-bytes-warning')
  if (utilization.operations != null && utilization.operations >= warningThreshold)
    warningReasons.push('operation-limit-warning')

  return {
    policyId: policy.id,
    name: policy.name,
    channel,
    provider: policy.provider,
    enabled: true,
    days,
    status: reasons.length ? 'blocked' : warningReasons.length ? 'warning' : 'ok',
    reasons: reasons.length ? reasons : warningReasons,
    usage,
    limits: {
      maxBytes,
      trafficBytes,
      maxOperations,
      alertBytes,
      warningThreshold,
    },
    utilization,
  }
}

export function buildStoragePolicyAlerts(evaluations: StoragePolicyEvaluation[]): StoragePolicyAlert[] {
  const alerts: StoragePolicyAlert[] = []

  for (const evaluation of evaluations) {
    if (evaluation.status !== 'warning' && evaluation.status !== 'blocked')
      continue

    const specs: Array<{
      metric: StoragePolicyAlertMetric
      limitKey: StoragePolicyAlertLimitKey
      usage: number
      limit: number | null
      utilization: number | null
      reasonCodes: string[]
    }> = [
      {
        metric: 'storedBytes',
        limitKey: 'maxBytes',
        usage: evaluation.usage.storedBytes,
        limit: evaluation.limits.maxBytes,
        utilization: evaluation.utilization.storedBytes,
        reasonCodes: ['max-bytes-exceeded', 'max-bytes-warning'],
      },
      {
        metric: 'trafficBytes',
        limitKey: 'trafficBytes',
        usage: evaluation.usage.trafficBytes,
        limit: evaluation.limits.trafficBytes,
        utilization: evaluation.utilization.trafficBytes,
        reasonCodes: ['traffic-bytes-exceeded', 'traffic-bytes-warning'],
      },
      {
        metric: 'operations',
        limitKey: 'maxOperations',
        usage: evaluation.usage.operations,
        limit: evaluation.limits.maxOperations,
        utilization: evaluation.utilization.operations,
        reasonCodes: ['operation-limit-exceeded', 'operation-limit-warning'],
      },
      {
        metric: 'storedBytes',
        limitKey: 'alertBytes',
        usage: evaluation.usage.storedBytes,
        limit: evaluation.limits.alertBytes,
        utilization: roundUsageRatio(evaluation.usage.storedBytes, evaluation.limits.alertBytes),
        reasonCodes: ['alert-bytes-reached'],
      },
    ]

    for (const spec of specs) {
      const reasons = evaluation.reasons.filter(reason => spec.reasonCodes.includes(reason))
      if (!reasons.length)
        continue

      alerts.push({
        policyId: evaluation.policyId,
        name: evaluation.name,
        channel: evaluation.channel,
        provider: evaluation.provider,
        status: evaluation.status,
        metric: spec.metric,
        limitKey: spec.limitKey,
        usage: spec.usage,
        limit: spec.limit,
        utilization: spec.utilization,
        reasons,
      })
    }
  }

  return alerts.sort((left, right) => {
    if (left.status !== right.status)
      return left.status === 'blocked' ? -1 : 1
    return (right.utilization ?? 0) - (left.utilization ?? 0)
  })
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
    throw createError({
      statusCode: 429,
      statusMessage: 'Intelligence provider request quota exceeded.',
      data: {
        code: 'INTELLIGENCE_PROVIDER_REQUEST_QUOTA_EXCEEDED',
        providerId,
        windowDays,
        limit: maxRequests,
      },
    })
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
    throw createError({
      statusCode: 429,
      statusMessage: 'Intelligence provider token quota exceeded.',
      data: {
        code: 'INTELLIGENCE_PROVIDER_TOKEN_QUOTA_EXCEEDED',
        providerId,
        windowDays,
        limit: maxTokens,
      },
    })
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
