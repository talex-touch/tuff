import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import {
  getProviderRegistryEntry,
  PROVIDER_REGISTRY_OWNER_SCOPES,
  type ProviderRegistryOwnerScope,
  type ProviderRegistryRecord,
} from './providerRegistryStore'
import { resolveProviderSceneAdapterKey, sceneCapabilityAdapterSupports } from './sceneCapabilityAdapterRegistry'
import { defineD1Schema, ensureD1Schema } from './d1Schema'

const SCENES_TABLE = 'scene_registry'
const BINDINGS_TABLE = 'scene_strategy_bindings'
const JSON_LIMIT_BYTES = 64 * 1024


export const SCENE_REGISTRY_OWNERS = ['nexus', 'core-app', 'app', 'plugin'] as const
export const SCENE_STRATEGY_MODES = ['priority', 'least_cost', 'lowest_latency', 'balanced', 'manual'] as const
export const SCENE_FALLBACK_MODES = ['enabled', 'disabled'] as const
export const SCENE_BINDING_STATUSES = ['enabled', 'disabled'] as const

export type SceneRegistryOwner = typeof SCENE_REGISTRY_OWNERS[number]
export type SceneStrategyMode = typeof SCENE_STRATEGY_MODES[number]
export type SceneFallbackMode = typeof SCENE_FALLBACK_MODES[number]
export type SceneBindingStatus = typeof SCENE_BINDING_STATUSES[number]

export interface SceneStrategyBindingRecord {
  id: string
  sceneId: string
  providerId: string
  capability: string
  model: string | null
  priority: number
  weight: number | null
  status: SceneBindingStatus
  constraints: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface SceneRegistryRecord {
  id: string
  displayName: string
  owner: SceneRegistryOwner
  ownerScope: ProviderRegistryOwnerScope
  ownerId: string | null
  status: SceneBindingStatus
  requiredCapabilities: string[]
  strategyMode: SceneStrategyMode
  fallback: SceneFallbackMode
  meteringPolicy: Record<string, unknown> | null
  auditPolicy: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  bindings: SceneStrategyBindingRecord[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface SceneRegistryReadiness {
  status: 'ready' | 'degraded' | 'disabled'
  missingCapabilities: string[]
  invalidBindings: Array<{
    bindingId: string
    providerId: string
    capability: string
    code: 'PROVIDER_MISSING' | 'CAPABILITY_MISSING' | 'ADAPTER_MISSING' | 'MODEL_INVALID'
  }>
}

export interface SceneRegistryEntryWithReadiness extends SceneRegistryRecord {
  readiness: SceneRegistryReadiness
}

interface SceneRegistryRow {
  id: string
  display_name: string
  owner: string
  owner_scope: string
  owner_id: string | null
  status: string
  required_capabilities: string
  strategy_mode: string
  fallback: string
  metering_policy: string | null
  audit_policy: string | null
  metadata: string | null
  created_by: string
  created_at: string
  updated_at: string
}

interface SceneStrategyBindingRow {
  id: string
  scene_id: string
  provider_id: string
  capability: string
  model: string | null
  priority: number
  weight: number | null
  status: string
  constraints_json: string | null
  metadata: string | null
  created_at: string
  updated_at: string
}

export interface SceneStrategyBindingInput {
  providerId: unknown
  capability: unknown
  model?: unknown
  priority?: unknown
  weight?: unknown
  status?: unknown
  constraints?: unknown
  metadata?: unknown
}

export interface CreateSceneRegistryInput {
  id: unknown
  displayName: unknown
  owner: unknown
  ownerScope?: unknown
  ownerId?: unknown
  status?: unknown
  requiredCapabilities?: unknown
  strategyMode?: unknown
  fallback?: unknown
  meteringPolicy?: unknown
  auditPolicy?: unknown
  metadata?: unknown
  bindings?: unknown
}

export interface UpdateSceneRegistryInput {
  displayName?: unknown
  owner?: unknown
  ownerScope?: unknown
  ownerId?: unknown
  status?: unknown
  requiredCapabilities?: unknown
  strategyMode?: unknown
  fallback?: unknown
  meteringPolicy?: unknown
  auditPolicy?: unknown
  metadata?: unknown
  bindings?: unknown
}

interface NormalizedSceneInput {
  id: string
  displayName: string
  owner: SceneRegistryOwner
  ownerScope: ProviderRegistryOwnerScope
  ownerId: string | null
  status: SceneBindingStatus
  requiredCapabilities: string[]
  requiredCapabilitiesJson: string
  strategyMode: SceneStrategyMode
  fallback: SceneFallbackMode
  meteringPolicy: Record<string, unknown> | null
  meteringPolicyJson: string | null
  auditPolicy: Record<string, unknown> | null
  auditPolicyJson: string | null
  metadata: Record<string, unknown> | null
  metadataJson: string | null
  bindings: NormalizedSceneStrategyBindingInput[]
}

interface NormalizedSceneStrategyBindingInput {
  providerId: string
  capability: string
  model: string | null
  priority: number
  weight: number | null
  status: SceneBindingStatus
  constraints: Record<string, unknown> | null
  constraintsJson: string | null
  metadata: Record<string, unknown> | null
  metadataJson: string | null
}

export interface ListSceneRegistryOptions {
  owner?: SceneRegistryOwner
  ownerScope?: ProviderRegistryOwnerScope
  status?: SceneBindingStatus
}

function getD1Database(event: H3Event): D1Database {
  const db = readCloudflareBindings(event)?.DB
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }
  return db
}

const SCENE_REGISTRY_SCHEMA = defineD1Schema('scene-registry', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${SCENES_TABLE} (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        owner TEXT NOT NULL,
        owner_scope TEXT NOT NULL,
        owner_id TEXT,
        status TEXT NOT NULL,
        required_capabilities TEXT NOT NULL,
        strategy_mode TEXT NOT NULL,
        fallback TEXT NOT NULL,
        metering_policy TEXT,
        audit_policy TEXT,
        metadata TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    `CREATE TABLE IF NOT EXISTS ${BINDINGS_TABLE} (
        id TEXT PRIMARY KEY,
        scene_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        capability TEXT NOT NULL,
        model TEXT,
        priority INTEGER NOT NULL DEFAULT 100,
        weight REAL,
        status TEXT NOT NULL,
        constraints_json TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(scene_id, provider_id, capability),
        FOREIGN KEY (scene_id) REFERENCES ${SCENES_TABLE}(id) ON DELETE CASCADE
      )`,
    `CREATE INDEX IF NOT EXISTS idx_scene_registry_owner ON ${SCENES_TABLE}(owner)`,
    `CREATE INDEX IF NOT EXISTS idx_scene_registry_status ON ${SCENES_TABLE}(status)`,
    `CREATE INDEX IF NOT EXISTS idx_scene_strategy_bindings_scene ON ${BINDINGS_TABLE}(scene_id)`,
    `CREATE INDEX IF NOT EXISTS idx_scene_strategy_bindings_provider ON ${BINDINGS_TABLE}(provider_id)`,
    `CREATE INDEX IF NOT EXISTS idx_scene_strategy_bindings_capability ON ${BINDINGS_TABLE}(capability)`,
  ],
  columns: [
    {
      table: BINDINGS_TABLE,
      columns: [
        { name: 'model', ddl: 'model TEXT' },
      ],
    },
  ],
})

async function ensureSceneRegistrySchema(db: D1Database) {
  await ensureD1Schema(db, SCENE_REGISTRY_SCHEMA)
}

function assertNonEmptyString(value: unknown, field: string, maxLength = 120): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  }
  return value.trim()
}

function normalizeOptionalString(value: unknown, field: string, maxLength = 255): string | null {
  if (value == null)
    return null
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  }
  return value.trim() || null
}

function assertEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  }
  return value as T
}

function normalizeOptionalJsonObject(value: unknown, field: string): { data: Record<string, unknown> | null, json: string | null } {
  if (value == null)
    return { data: null, json: null }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a JSON object.` })
  }

  const json = JSON.stringify(value)
  if (new TextEncoder().encode(json).length > JSON_LIMIT_BYTES) {
    throw createError({ statusCode: 400, statusMessage: `${field} exceeds 64KB.` })
  }

  return { data: value as Record<string, unknown>, json }
}

function parseJsonObject(value: string | null): Record<string, unknown> | null {
  if (!value)
    return null
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return null
    return parsed as Record<string, unknown>
  }
  catch {
    return null
  }
}

function parseJsonStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed))
      return []
    return parsed.filter(item => typeof item === 'string')
  }
  catch {
    return []
  }
}

function normalizeStringArray(value: unknown, field: string): { data: string[], json: string } {
  if (value == null)
    return { data: [], json: '[]' }
  if (!Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be an array.` })
  }

  const seen = new Set<string>()
  const data = value.map((item, index) => {
    const text = assertNonEmptyString(item, `${field}[${index}]`, 120)
    if (seen.has(text)) {
      throw createError({ statusCode: 400, statusMessage: `${field}[${index}] is duplicated.` })
    }
    seen.add(text)
    return text
  })

  return { data, json: JSON.stringify(data) }
}

function normalizeInteger(value: unknown, field: string, fallback: number): number {
  if (value == null)
    return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  }
  return Math.min(Math.max(Math.floor(value), 0), 10000)
}

function normalizeWeight(value: unknown, field: string): number | null {
  if (value == null)
    return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  }
  return value
}

function normalizeBindings(value: unknown): NormalizedSceneStrategyBindingInput[] {
  if (value == null)
    return []
  if (!Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'bindings must be an array.' })
  }

  const seen = new Set<string>()
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw createError({ statusCode: 400, statusMessage: `bindings[${index}] is invalid.` })
    }

    const input = item as SceneStrategyBindingInput
    const providerId = assertNonEmptyString(input.providerId, `bindings[${index}].providerId`, 160)
    const capability = assertNonEmptyString(input.capability, `bindings[${index}].capability`, 120)
    const key = `${providerId}:${capability}`
    if (seen.has(key)) {
      throw createError({ statusCode: 400, statusMessage: `bindings[${index}] is duplicated.` })
    }
    seen.add(key)

    const constraints = normalizeOptionalJsonObject(input.constraints, `bindings[${index}].constraints`)
    const metadata = normalizeOptionalJsonObject(input.metadata, `bindings[${index}].metadata`)

    return {
      providerId,
      capability,
      model: normalizeOptionalString(input.model, `bindings[${index}].model`, 160),
      priority: normalizeInteger(input.priority, `bindings[${index}].priority`, 100),
      weight: normalizeWeight(input.weight, `bindings[${index}].weight`),
      status: input.status == null
        ? 'enabled'
        : assertEnum(input.status, `bindings[${index}].status`, SCENE_BINDING_STATUSES),
      constraints: constraints.data,
      constraintsJson: constraints.json,
      metadata: metadata.data,
      metadataJson: metadata.json,
    }
  })
}

function normalizeSceneInput(input: CreateSceneRegistryInput): NormalizedSceneInput {
  const requiredCapabilities = normalizeStringArray(input.requiredCapabilities, 'requiredCapabilities')
  const meteringPolicy = normalizeOptionalJsonObject(input.meteringPolicy, 'meteringPolicy')
  const auditPolicy = normalizeOptionalJsonObject(input.auditPolicy, 'auditPolicy')
  const metadata = normalizeOptionalJsonObject(input.metadata, 'metadata')

  return {
    id: assertNonEmptyString(input.id, 'id', 160),
    displayName: assertNonEmptyString(input.displayName, 'displayName', 120),
    owner: assertEnum(input.owner, 'owner', SCENE_REGISTRY_OWNERS),
    ownerScope: input.ownerScope == null
      ? 'system'
      : assertEnum(input.ownerScope, 'ownerScope', PROVIDER_REGISTRY_OWNER_SCOPES),
    ownerId: normalizeOptionalString(input.ownerId, 'ownerId', 120),
    status: input.status == null
      ? 'enabled'
      : assertEnum(input.status, 'status', SCENE_BINDING_STATUSES),
    requiredCapabilities: requiredCapabilities.data,
    requiredCapabilitiesJson: requiredCapabilities.json,
    strategyMode: input.strategyMode == null
      ? 'priority'
      : assertEnum(input.strategyMode, 'strategyMode', SCENE_STRATEGY_MODES),
    fallback: input.fallback == null
      ? 'enabled'
      : assertEnum(input.fallback, 'fallback', SCENE_FALLBACK_MODES),
    meteringPolicy: meteringPolicy.data,
    meteringPolicyJson: meteringPolicy.json,
    auditPolicy: auditPolicy.data,
    auditPolicyJson: auditPolicy.json,
    metadata: metadata.data,
    metadataJson: metadata.json,
    bindings: normalizeBindings(input.bindings),
  }
}

function normalizeScenePatch(existing: SceneRegistryRecord, input: UpdateSceneRegistryInput): NormalizedSceneInput {
  return normalizeSceneInput({
    id: existing.id,
    displayName: input.displayName ?? existing.displayName,
    owner: input.owner ?? existing.owner,
    ownerScope: input.ownerScope ?? existing.ownerScope,
    ownerId: input.ownerId === undefined ? existing.ownerId : input.ownerId,
    status: input.status ?? existing.status,
    requiredCapabilities: input.requiredCapabilities ?? existing.requiredCapabilities,
    strategyMode: input.strategyMode ?? existing.strategyMode,
    fallback: input.fallback ?? existing.fallback,
    meteringPolicy: input.meteringPolicy === undefined ? existing.meteringPolicy : input.meteringPolicy,
    auditPolicy: input.auditPolicy === undefined ? existing.auditPolicy : input.auditPolicy,
    metadata: input.metadata === undefined ? existing.metadata : input.metadata,
    bindings: input.bindings === undefined
      ? existing.bindings.map(binding => ({
          providerId: binding.providerId,
          capability: binding.capability,
          model: binding.model,
          priority: binding.priority,
          weight: binding.weight,
          status: binding.status,
          constraints: binding.constraints,
          metadata: binding.metadata,
        }))
      : input.bindings,
  })
}

function mapBinding(row: SceneStrategyBindingRow): SceneStrategyBindingRecord {
  return {
    id: row.id,
    sceneId: row.scene_id,
    providerId: row.provider_id,
    capability: row.capability,
    model: row.model,
    priority: row.priority,
    weight: row.weight,
    status: row.status as SceneBindingStatus,
    constraints: parseJsonObject(row.constraints_json),
    metadata: parseJsonObject(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapScene(row: SceneRegistryRow, bindings: SceneStrategyBindingRecord[] = []): SceneRegistryRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    owner: row.owner as SceneRegistryOwner,
    ownerScope: row.owner_scope as ProviderRegistryOwnerScope,
    ownerId: row.owner_id,
    status: row.status as SceneBindingStatus,
    requiredCapabilities: parseJsonStringArray(row.required_capabilities),
    strategyMode: row.strategy_mode as SceneStrategyMode,
    fallback: row.fallback as SceneFallbackMode,
    meteringPolicy: parseJsonObject(row.metering_policy),
    auditPolicy: parseJsonObject(row.audit_policy),
    metadata: parseJsonObject(row.metadata),
    bindings,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildSceneWhere(options: ListSceneRegistryOptions) {
  const conditions: string[] = []
  const values: string[] = []

  if (options.owner) {
    conditions.push('owner = ?')
    values.push(assertEnum(options.owner, 'owner', SCENE_REGISTRY_OWNERS))
  }
  if (options.ownerScope) {
    conditions.push('owner_scope = ?')
    values.push(assertEnum(options.ownerScope, 'ownerScope', PROVIDER_REGISTRY_OWNER_SCOPES))
  }
  if (options.status) {
    conditions.push('status = ?')
    values.push(assertEnum(options.status, 'status', SCENE_BINDING_STATUSES))
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  }
}

async function replaceSceneBindings(
  db: D1Database,
  sceneId: string,
  bindings: NormalizedSceneStrategyBindingInput[],
  now: string,
) {
  // One transaction: the old bindings are never half replaced, and it is one round trip rather
  // than one per binding.
  await db.batch([
    db.prepare(`DELETE FROM ${BINDINGS_TABLE} WHERE scene_id = ?;`).bind(sceneId),
    ...bindings.map(binding => db.prepare(`
      INSERT INTO ${BINDINGS_TABLE} (
        id, scene_id, provider_id, capability, model, priority, weight, status, constraints_json,
        metadata, created_at, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12);
    `).bind(
      randomUUID(),
      sceneId,
      binding.providerId,
      binding.capability,
      binding.model,
      binding.priority,
      binding.weight,
      binding.status,
      binding.constraintsJson,
      binding.metadataJson,
      now,
      now,
    )),
  ])
}

/**
 * How long an isolate may answer scene registry reads from memory. Every AI call and scene run resolves
 * scene registry entries; they change when an operator edits the registry. A write through this isolate
 * forgets them at once; other isolates pick it up within this window.
 */
const SCENE_REGISTRY_CACHE_TTL_MS = 30_000

const sceneRegistryCache = new WeakMap<object, Map<string, { value: SceneRegistryRecord | null, expiresAt: number }>>()

function forgetSceneRegistryCache(event: H3Event): void {
  const db = readCloudflareBindings(event)?.DB
  if (db)
    sceneRegistryCache.delete(db)
}

function readCachedScene(db: D1Database, id: string): { value: SceneRegistryRecord | null } | null {
  const entry = sceneRegistryCache.get(db)?.get(id)
  if (!entry || entry.expiresAt <= Date.now())
    return null
  return { value: entry.value ? structuredClone(entry.value) : null }
}

function writeCachedScene(db: D1Database, id: string, value: SceneRegistryRecord | null): void {
  let entries = sceneRegistryCache.get(db)
  if (!entries) {
    entries = new Map()
    sceneRegistryCache.set(db, entries)
  }
  entries.set(id, { value: value ? structuredClone(value) : null, expiresAt: Date.now() + SCENE_REGISTRY_CACHE_TTL_MS })
}

export async function listSceneRegistryEntries(
  event: H3Event,
  options: ListSceneRegistryOptions = {},
): Promise<SceneRegistryRecord[]> {
  const db = getD1Database(event)
  await ensureSceneRegistrySchema(db)

  const { clause, values } = buildSceneWhere(options)
  // The scenes and their bindings in one round trip. The bindings used to follow with an `IN` list of
  // every scene's id: a second round trip, and past 100 scenes more parameters than D1 binds.
  const [sceneResult, bindingResult] = await db.batch([
    db.prepare(`
      SELECT id, display_name, owner, owner_scope, owner_id, status, required_capabilities,
        strategy_mode, fallback, metering_policy, audit_policy, metadata, created_by, created_at, updated_at
      FROM ${SCENES_TABLE}
      ${clause}
      ORDER BY created_at DESC;
    `).bind(...values),
    db.prepare(`
      SELECT id, scene_id, provider_id, capability, model, priority, weight, status, constraints_json,
        metadata, created_at, updated_at
      FROM ${BINDINGS_TABLE}
      WHERE scene_id IN (SELECT id FROM ${SCENES_TABLE} ${clause})
      ORDER BY priority ASC, capability ASC;
    `).bind(...values),
  ])

  const sceneRows = (sceneResult?.results ?? []) as SceneRegistryRow[]
  const bindings = ((bindingResult?.results ?? []) as SceneStrategyBindingRow[]).map(mapBinding)
  const bindingsByScene = new Map<string, SceneStrategyBindingRecord[]>()
  for (const binding of bindings) {
    const list = bindingsByScene.get(binding.sceneId) ?? []
    list.push(binding)
    bindingsByScene.set(binding.sceneId, list)
  }

  return sceneRows.map(row => mapScene(row, bindingsByScene.get(row.id) ?? []))
}

/** Reads straight from the database: writers use it to answer with what they just wrote. */
async function loadSceneRegistryEntry(event: H3Event, id: string): Promise<SceneRegistryRecord | null> {
  const db = getD1Database(event)
  await ensureSceneRegistrySchema(db)

  const safeId = assertNonEmptyString(id, 'id', 160)
  // The scene and its bindings in one round trip; they were two.
  const [sceneResult, bindingResult] = await db.batch([
    db.prepare(`
      SELECT id, display_name, owner, owner_scope, owner_id, status, required_capabilities,
        strategy_mode, fallback, metering_policy, audit_policy, metadata, created_by, created_at, updated_at
      FROM ${SCENES_TABLE}
      WHERE id = ?;
    `).bind(safeId),
    db.prepare(`
      SELECT id, scene_id, provider_id, capability, model, priority, weight, status, constraints_json,
        metadata, created_at, updated_at
      FROM ${BINDINGS_TABLE}
      WHERE scene_id = ?
      ORDER BY priority ASC, capability ASC;
    `).bind(safeId),
  ])
  const scene = (sceneResult?.results?.[0] ?? null) as SceneRegistryRow | null
  const record = scene
    ? mapScene(scene, ((bindingResult?.results ?? []) as SceneStrategyBindingRow[]).map(mapBinding))
    : null
  return record
}

export async function getSceneRegistryEntry(event: H3Event, id: string): Promise<SceneRegistryRecord | null> {
  const db = getD1Database(event)
  const safeId = assertNonEmptyString(id, 'id', 160)
  const cached = readCachedScene(db, safeId)
  if (cached)
    return cached.value
  const record = await loadSceneRegistryEntry(event, safeId)
  writeCachedScene(db, safeId, record)
  return record
}

function providerModels(provider: ProviderRegistryRecord): string[] {
  const value = provider.metadata?.models
  return Array.isArray(value)
    ? value.filter((model): model is string => typeof model === 'string' && model.trim().length > 0)
    : []
}

async function assertSceneBindingsValid(
  event: H3Event,
  bindings: NormalizedSceneStrategyBindingInput[],
): Promise<void> {
  const providers = new Map<string, ProviderRegistryRecord>()
  for (const [index, binding] of bindings.entries()) {
    let provider = providers.get(binding.providerId)
    if (!provider) {
      provider = await getProviderRegistryEntry(event, binding.providerId) ?? undefined
      if (provider)
        providers.set(binding.providerId, provider)
    }
    if (!provider)
      continue
    if (!provider.capabilities.some(item => item.capability === binding.capability))
      continue
    const adapterKey = resolveProviderSceneAdapterKey(provider)
    if (!adapterKey || !sceneCapabilityAdapterSupports(adapterKey, binding.capability))
      continue
    if (binding.model && !providerModels(provider).includes(binding.model)) {
      throw createError({ statusCode: 400, statusMessage: `bindings[${index}].model is not declared by the provider.` })
    }
  }
}

export async function resolveSceneRegistryReadiness(
  event: H3Event,
  scene: SceneRegistryRecord,
): Promise<SceneRegistryReadiness> {
  if (scene.status === 'disabled') {
    return { status: 'disabled', missingCapabilities: [], invalidBindings: [] }
  }

  const invalidBindings: SceneRegistryReadiness['invalidBindings'] = []
  const validCapabilities = new Set<string>()
  const providers = new Map<string, ProviderRegistryRecord | null>()

  for (const binding of scene.bindings) {
    if (binding.status !== 'enabled')
      continue
    if (!providers.has(binding.providerId))
      providers.set(binding.providerId, await getProviderRegistryEntry(event, binding.providerId))
    const provider = providers.get(binding.providerId) ?? null
    if (!provider) {
      invalidBindings.push({ bindingId: binding.id, providerId: binding.providerId, capability: binding.capability, code: 'PROVIDER_MISSING' })
      continue
    }
    if (provider.status !== 'enabled' || !provider.capabilities.some(item => item.capability === binding.capability)) {
      invalidBindings.push({ bindingId: binding.id, providerId: binding.providerId, capability: binding.capability, code: 'CAPABILITY_MISSING' })
      continue
    }
    const adapterKey = resolveProviderSceneAdapterKey(provider)
    if (!adapterKey || !sceneCapabilityAdapterSupports(adapterKey, binding.capability)) {
      invalidBindings.push({ bindingId: binding.id, providerId: binding.providerId, capability: binding.capability, code: 'ADAPTER_MISSING' })
      continue
    }
    if (binding.model && !providerModels(provider).includes(binding.model)) {
      invalidBindings.push({ bindingId: binding.id, providerId: binding.providerId, capability: binding.capability, code: 'MODEL_INVALID' })
      continue
    }
    validCapabilities.add(binding.capability)
  }

  const missingCapabilities = scene.requiredCapabilities.filter(capability => !validCapabilities.has(capability))
  return {
    status: missingCapabilities.length > 0 || invalidBindings.length > 0 ? 'degraded' : 'ready',
    missingCapabilities,
    invalidBindings,
  }
}

export async function withSceneRegistryReadiness(
  event: H3Event,
  scene: SceneRegistryRecord,
): Promise<SceneRegistryEntryWithReadiness> {
  return {
    ...scene,
    readiness: await resolveSceneRegistryReadiness(event, scene),
  }
}

async function createSceneRegistryEntryUncached(
  event: H3Event,
  input: CreateSceneRegistryInput,
  createdBy: string,
): Promise<SceneRegistryRecord> {
  const db = getD1Database(event)
  await ensureSceneRegistrySchema(db)

  const normalized = normalizeSceneInput(input)
  await assertSceneBindingsValid(event, normalized.bindings)
  const now = new Date().toISOString()
  const safeCreatedBy = assertNonEmptyString(createdBy, 'createdBy', 120)

  await db.prepare(`
    INSERT INTO ${SCENES_TABLE} (
      id, display_name, owner, owner_scope, owner_id, status, required_capabilities,
      strategy_mode, fallback, metering_policy, audit_policy, metadata, created_by, created_at, updated_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15);
  `).bind(
    normalized.id,
    normalized.displayName,
    normalized.owner,
    normalized.ownerScope,
    normalized.ownerId,
    normalized.status,
    normalized.requiredCapabilitiesJson,
    normalized.strategyMode,
    normalized.fallback,
    normalized.meteringPolicyJson,
    normalized.auditPolicyJson,
    normalized.metadataJson,
    safeCreatedBy,
    now,
    now,
  ).run()

  await replaceSceneBindings(db, normalized.id, normalized.bindings, now)

  const created = await loadSceneRegistryEntry(event, normalized.id)
  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Scene registry entry was not created.' })
  }
  return created
}

/** createSceneRegistryEntry, then the registry cache forgets this database's entries (see `forgetSceneRegistryCache`). */
export async function createSceneRegistryEntry(...args: Parameters<typeof createSceneRegistryEntryUncached>): ReturnType<typeof createSceneRegistryEntryUncached> {
  try {
    return await createSceneRegistryEntryUncached(...args)
  }
  finally {
    forgetSceneRegistryCache(args[0])
  }
}

async function updateSceneRegistryEntryUncached(
  event: H3Event,
  id: string,
  input: UpdateSceneRegistryInput,
): Promise<SceneRegistryRecord | null> {
  const existing = await loadSceneRegistryEntry(event, id)
  if (!existing)
    return null

  const db = getD1Database(event)
  await ensureSceneRegistrySchema(db)

  const normalized = normalizeScenePatch(existing, input)
  await assertSceneBindingsValid(event, normalized.bindings)
  const now = new Date().toISOString()

  await db.prepare(`
    UPDATE ${SCENES_TABLE}
    SET display_name = ?1,
      owner = ?2,
      owner_scope = ?3,
      owner_id = ?4,
      status = ?5,
      required_capabilities = ?6,
      strategy_mode = ?7,
      fallback = ?8,
      metering_policy = ?9,
      audit_policy = ?10,
      metadata = ?11,
      updated_at = ?12
    WHERE id = ?13;
  `).bind(
    normalized.displayName,
    normalized.owner,
    normalized.ownerScope,
    normalized.ownerId,
    normalized.status,
    normalized.requiredCapabilitiesJson,
    normalized.strategyMode,
    normalized.fallback,
    normalized.meteringPolicyJson,
    normalized.auditPolicyJson,
    normalized.metadataJson,
    now,
    existing.id,
  ).run()

  if (input.bindings !== undefined) {
    await replaceSceneBindings(db, existing.id, normalized.bindings, now)
  }

  return await loadSceneRegistryEntry(event, existing.id)
}

/** updateSceneRegistryEntry, then the registry cache forgets this database's entries (see `forgetSceneRegistryCache`). */
export async function updateSceneRegistryEntry(...args: Parameters<typeof updateSceneRegistryEntryUncached>): ReturnType<typeof updateSceneRegistryEntryUncached> {
  try {
    return await updateSceneRegistryEntryUncached(...args)
  }
  finally {
    forgetSceneRegistryCache(args[0])
  }
}

async function deleteSceneRegistryEntryUncached(event: H3Event, id: string): Promise<boolean> {
  const existing = await loadSceneRegistryEntry(event, id)
  if (!existing)
    return false

  const db = getD1Database(event)
  await ensureSceneRegistrySchema(db)
  await db.prepare(`DELETE FROM ${BINDINGS_TABLE} WHERE scene_id = ?;`).bind(existing.id).run()
  await db.prepare(`DELETE FROM ${SCENES_TABLE} WHERE id = ?;`).bind(existing.id).run()
  return true
}

/** deleteSceneRegistryEntry, then the registry cache forgets this database's entries (see `forgetSceneRegistryCache`). */
export async function deleteSceneRegistryEntry(...args: Parameters<typeof deleteSceneRegistryEntryUncached>): ReturnType<typeof deleteSceneRegistryEntryUncached> {
  try {
    return await deleteSceneRegistryEntryUncached(...args)
  }
  finally {
    forgetSceneRegistryCache(args[0])
  }
}
