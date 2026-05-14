import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { PROVIDER_REGISTRY_OWNER_SCOPES, type ProviderRegistryOwnerScope } from './providerRegistryStore'

const SCENES_TABLE = 'scene_registry'
const BINDINGS_TABLE = 'scene_strategy_bindings'
const JSON_LIMIT_BYTES = 64 * 1024

const initializedSchemas = new WeakSet<D1Database>()

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

async function ensureSceneRegistrySchema(db: D1Database) {
  if (initializedSchemas.has(db))
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SCENES_TABLE} (
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
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${BINDINGS_TABLE} (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      weight REAL,
      status TEXT NOT NULL,
      constraints_json TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(scene_id, provider_id, capability),
      FOREIGN KEY (scene_id) REFERENCES ${SCENES_TABLE}(id) ON DELETE CASCADE
    );
  `).run()

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_scene_registry_owner ON ${SCENES_TABLE}(owner);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_scene_registry_status ON ${SCENES_TABLE}(status);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_scene_strategy_bindings_scene ON ${BINDINGS_TABLE}(scene_id);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_scene_strategy_bindings_provider ON ${BINDINGS_TABLE}(provider_id);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_scene_strategy_bindings_capability ON ${BINDINGS_TABLE}(capability);`).run()

  initializedSchemas.add(db)
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

async function listBindingsForScenes(db: D1Database, sceneIds: string[]): Promise<SceneStrategyBindingRecord[]> {
  if (sceneIds.length === 0)
    return []

  const placeholders = sceneIds.map(() => '?').join(', ')
  const { results } = await db.prepare(`
    SELECT id, scene_id, provider_id, capability, priority, weight, status, constraints_json,
      metadata, created_at, updated_at
    FROM ${BINDINGS_TABLE}
    WHERE scene_id IN (${placeholders})
    ORDER BY priority ASC, capability ASC;
  `).bind(...sceneIds).all<SceneStrategyBindingRow>()

  return (results ?? []).map(mapBinding)
}

async function replaceSceneBindings(
  db: D1Database,
  sceneId: string,
  bindings: NormalizedSceneStrategyBindingInput[],
  now: string,
) {
  await db.prepare(`DELETE FROM ${BINDINGS_TABLE} WHERE scene_id = ?;`).bind(sceneId).run()

  for (const binding of bindings) {
    await db.prepare(`
      INSERT INTO ${BINDINGS_TABLE} (
        id, scene_id, provider_id, capability, priority, weight, status, constraints_json,
        metadata, created_at, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11);
    `).bind(
      randomUUID(),
      sceneId,
      binding.providerId,
      binding.capability,
      binding.priority,
      binding.weight,
      binding.status,
      binding.constraintsJson,
      binding.metadataJson,
      now,
      now,
    ).run()
  }
}

export async function listSceneRegistryEntries(
  event: H3Event,
  options: ListSceneRegistryOptions = {},
): Promise<SceneRegistryRecord[]> {
  const db = getD1Database(event)
  await ensureSceneRegistrySchema(db)

  const { clause, values } = buildSceneWhere(options)
  const { results } = await db.prepare(`
    SELECT id, display_name, owner, owner_scope, owner_id, status, required_capabilities,
      strategy_mode, fallback, metering_policy, audit_policy, metadata, created_by, created_at, updated_at
    FROM ${SCENES_TABLE}
    ${clause}
    ORDER BY created_at DESC;
  `).bind(...values).all<SceneRegistryRow>()

  const sceneRows = results ?? []
  const bindings = await listBindingsForScenes(db, sceneRows.map(row => row.id))
  const bindingsByScene = new Map<string, SceneStrategyBindingRecord[]>()
  for (const binding of bindings) {
    const list = bindingsByScene.get(binding.sceneId) ?? []
    list.push(binding)
    bindingsByScene.set(binding.sceneId, list)
  }

  return sceneRows.map(row => mapScene(row, bindingsByScene.get(row.id) ?? []))
}

export async function getSceneRegistryEntry(event: H3Event, id: string): Promise<SceneRegistryRecord | null> {
  const db = getD1Database(event)
  await ensureSceneRegistrySchema(db)

  const safeId = assertNonEmptyString(id, 'id', 160)
  const scene = await db.prepare(`
    SELECT id, display_name, owner, owner_scope, owner_id, status, required_capabilities,
      strategy_mode, fallback, metering_policy, audit_policy, metadata, created_by, created_at, updated_at
    FROM ${SCENES_TABLE}
    WHERE id = ?;
  `).bind(safeId).first<SceneRegistryRow>()

  if (!scene)
    return null

  const bindings = await listBindingsForScenes(db, [safeId])
  return mapScene(scene, bindings)
}

export async function createSceneRegistryEntry(
  event: H3Event,
  input: CreateSceneRegistryInput,
  createdBy: string,
): Promise<SceneRegistryRecord> {
  const db = getD1Database(event)
  await ensureSceneRegistrySchema(db)

  const normalized = normalizeSceneInput(input)
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

  const created = await getSceneRegistryEntry(event, normalized.id)
  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Scene registry entry was not created.' })
  }
  return created
}

export async function updateSceneRegistryEntry(
  event: H3Event,
  id: string,
  input: UpdateSceneRegistryInput,
): Promise<SceneRegistryRecord | null> {
  const existing = await getSceneRegistryEntry(event, id)
  if (!existing)
    return null

  const db = getD1Database(event)
  await ensureSceneRegistrySchema(db)

  const normalized = normalizeScenePatch(existing, input)
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

  return await getSceneRegistryEntry(event, existing.id)
}

export async function deleteSceneRegistryEntry(event: H3Event, id: string): Promise<boolean> {
  const existing = await getSceneRegistryEntry(event, id)
  if (!existing)
    return false

  const db = getD1Database(event)
  await ensureSceneRegistrySchema(db)
  await db.prepare(`DELETE FROM ${BINDINGS_TABLE} WHERE scene_id = ?;`).bind(existing.id).run()
  await db.prepare(`DELETE FROM ${SCENES_TABLE} WHERE id = ?;`).bind(existing.id).run()
  return true
}
