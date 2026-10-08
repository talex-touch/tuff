import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { normalizeProviderAuthRef } from './providerCredentialStore'
import {
  isKnownSceneCapabilityAdapterKey,
  normalizeSceneCapabilityAdapterKey,
  sceneCapabilityAdapterSupports,
} from './sceneCapabilityAdapterRegistry'
import { defineD1Schema, ensureD1Schema } from './d1Schema'

const PROVIDERS_TABLE = 'provider_registry'
const CAPABILITIES_TABLE = 'provider_capabilities'
const JSON_LIMIT_BYTES = 64 * 1024


export const PROVIDER_REGISTRY_VENDORS = ['tencent-cloud', 'openai', 'deepseek', 'dashscope', 'exchange-rate', 'custom'] as const
export const PROVIDER_REGISTRY_STATUSES = ['enabled', 'disabled', 'degraded'] as const
export const PROVIDER_REGISTRY_AUTH_TYPES = ['api_key', 'secret_pair', 'oauth', 'none'] as const
export const PROVIDER_REGISTRY_OWNER_SCOPES = ['system', 'workspace', 'user'] as const

export type ProviderRegistryVendor = typeof PROVIDER_REGISTRY_VENDORS[number]
export type ProviderRegistryStatus = typeof PROVIDER_REGISTRY_STATUSES[number]
export type ProviderRegistryAuthType = typeof PROVIDER_REGISTRY_AUTH_TYPES[number]
export type ProviderRegistryOwnerScope = typeof PROVIDER_REGISTRY_OWNER_SCOPES[number]

export interface ProviderCapabilityRecord {
  id: string
  providerId: string
  capability: string
  schemaRef: string | null
  metering: Record<string, unknown> | null
  constraints: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface ProviderRegistryRecord {
  id: string
  name: string
  displayName: string
  vendor: ProviderRegistryVendor
  status: ProviderRegistryStatus
  authType: ProviderRegistryAuthType
  authRef: string | null
  ownerScope: ProviderRegistryOwnerScope
  ownerId: string | null
  description: string | null
  endpoint: string | null
  region: string | null
  metadata: Record<string, unknown> | null
  capabilities: ProviderCapabilityRecord[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

interface ProviderRegistryRow {
  id: string
  name: string
  display_name: string
  vendor: string
  status: string
  auth_type: string
  auth_ref: string | null
  owner_scope: string
  owner_id: string | null
  description: string | null
  endpoint: string | null
  region: string | null
  metadata: string | null
  created_by: string
  created_at: string
  updated_at: string
}

interface ProviderCapabilityRow {
  id: string
  provider_id: string
  capability: string
  schema_ref: string | null
  metering: string | null
  constraints_json: string | null
  metadata: string | null
  created_at: string
  updated_at: string
}

export interface ProviderCapabilityInput {
  capability: unknown
  schemaRef?: unknown
  metering?: unknown
  constraints?: unknown
  metadata?: unknown
}

export interface UpdateProviderCapabilityInput {
  capability?: unknown
  schemaRef?: unknown
  metering?: unknown
  constraints?: unknown
  metadata?: unknown
}

export interface CreateProviderRegistryInput {
  name: unknown
  displayName?: unknown
  vendor: unknown
  status?: unknown
  authType: unknown
  authRef?: unknown
  ownerScope?: unknown
  ownerId?: unknown
  description?: unknown
  endpoint?: unknown
  region?: unknown
  metadata?: unknown
  capabilities?: unknown
}

export interface UpdateProviderRegistryInput {
  name?: unknown
  displayName?: unknown
  vendor?: unknown
  status?: unknown
  authType?: unknown
  authRef?: unknown
  ownerScope?: unknown
  ownerId?: unknown
  description?: unknown
  endpoint?: unknown
  region?: unknown
  metadata?: unknown
  capabilities?: unknown
}

interface NormalizedProviderInput {
  name: string
  displayName: string
  vendor: ProviderRegistryVendor
  status: ProviderRegistryStatus
  authType: ProviderRegistryAuthType
  authRef: string | null
  ownerScope: ProviderRegistryOwnerScope
  ownerId: string | null
  description: string | null
  endpoint: string | null
  region: string | null
  metadata: Record<string, unknown> | null
  metadataJson: string | null
  capabilities: NormalizedProviderCapabilityInput[]
}

interface NormalizedProviderCapabilityInput {
  capability: string
  schemaRef: string | null
  metering: Record<string, unknown> | null
  meteringJson: string | null
  constraints: Record<string, unknown> | null
  constraintsJson: string | null
  metadata: Record<string, unknown> | null
  metadataJson: string | null
}

export interface ListProviderRegistryOptions {
  vendor?: ProviderRegistryVendor
  status?: ProviderRegistryStatus
  ownerScope?: ProviderRegistryOwnerScope
}

export interface ListProviderCapabilitiesOptions {
  providerId?: string
  vendor?: ProviderRegistryVendor
  capability?: string
}

const SENSITIVE_BODY_KEYS = new Set([
  'apikey',
  'secretid',
  'secretkey',
  'credential',
  'credentials',
  'token',
  'accesstoken',
  'refreshtoken',
  'clientsecret',
  'password',
  'privatekey',
])

function getD1Database(event: H3Event): D1Database {
  const db = readCloudflareBindings(event)?.DB
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }
  return db
}

const PROVIDER_REGISTRY_SCHEMA = defineD1Schema('provider-registry', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${PROVIDERS_TABLE} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        vendor TEXT NOT NULL,
        status TEXT NOT NULL,
        auth_type TEXT NOT NULL,
        auth_ref TEXT,
        owner_scope TEXT NOT NULL,
        owner_id TEXT,
        description TEXT,
        endpoint TEXT,
        region TEXT,
        metadata TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    `CREATE TABLE IF NOT EXISTS ${CAPABILITIES_TABLE} (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        capability TEXT NOT NULL,
        schema_ref TEXT,
        metering TEXT,
        constraints_json TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(provider_id, capability),
        FOREIGN KEY (provider_id) REFERENCES ${PROVIDERS_TABLE}(id) ON DELETE CASCADE
      )`,
    `CREATE INDEX IF NOT EXISTS idx_provider_registry_vendor ON ${PROVIDERS_TABLE}(vendor)`,
    `CREATE INDEX IF NOT EXISTS idx_provider_registry_status ON ${PROVIDERS_TABLE}(status)`,
    `CREATE INDEX IF NOT EXISTS idx_provider_registry_owner_scope ON ${PROVIDERS_TABLE}(owner_scope)`,
    `CREATE INDEX IF NOT EXISTS idx_provider_capabilities_provider ON ${CAPABILITIES_TABLE}(provider_id)`,
    `CREATE INDEX IF NOT EXISTS idx_provider_capabilities_capability ON ${CAPABILITIES_TABLE}(capability)`,
  ],
})

async function ensureProviderRegistrySchema(db: D1Database) {
  await ensureD1Schema(db, PROVIDER_REGISTRY_SCHEMA)
}

function normalizeSensitiveKey(key: string) {
  return key.replace(/[-_\s]/g, '').toLowerCase()
}

export function assertNoPlainProviderSecrets(value: unknown, path = 'body') {
  if (!value || typeof value !== 'object')
    return

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPlainProviderSecrets(item, `${path}[${index}]`))
    return
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_BODY_KEYS.has(normalizeSensitiveKey(key))) {
      throw createError({
        statusCode: 400,
        statusMessage: `${path}.${key} must be stored in a secure secret store and referenced by authRef.`,
      })
    }
    assertNoPlainProviderSecrets(item, `${path}.${key}`)
  }
}

function assertNonEmptyString(value: unknown, field: string, maxLength = 100): string {
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
function normalizeProviderModels(value: unknown): string[] {
  if (value == null)
    return []
  if (!Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'metadata.models must be an array.' })
  }

  const seen = new Set<string>()
  return value.map((item, index) => {
    const model = assertNonEmptyString(item, `metadata.models[${index}]`, 160)
    if (seen.has(model)) {
      throw createError({ statusCode: 400, statusMessage: `metadata.models[${index}] is duplicated.` })
    }
    seen.add(model)
    return model
  })
}

function normalizeProviderMetadata(
  value: unknown,
  capabilities: NormalizedProviderCapabilityInput[],
): { data: Record<string, unknown> | null, json: string | null } {
  const raw = normalizeOptionalJsonObject(value, 'metadata')
  const data = raw.data ? { ...raw.data } : {}
  const adapterKey = normalizeSceneCapabilityAdapterKey(data.adapterKey)
    ?? normalizeSceneCapabilityAdapterKey(data.adapter)

  if (capabilities.length > 0 && !adapterKey) {
    throw createError({ statusCode: 400, statusMessage: 'metadata.adapterKey is required when capabilities are configured.' })
  }
  if (adapterKey && !isKnownSceneCapabilityAdapterKey(adapterKey)) {
    throw createError({ statusCode: 400, statusMessage: 'metadata.adapterKey is not registered.' })
  }
  if (adapterKey) {
    const unsupported = capabilities.find(capability => !sceneCapabilityAdapterSupports(adapterKey, capability.capability))
    if (unsupported) {
      throw createError({
        statusCode: 400,
        statusMessage: `metadata.adapterKey does not support capability ${unsupported.capability}.`,
      })
    }
    data.adapterKey = adapterKey
    if (typeof data.adapter === 'string')
      delete data.adapter
  }

  const models = normalizeProviderModels(data.models)
  const defaultModel = normalizeOptionalString(data.defaultModel, 'metadata.defaultModel', 160)
  if (defaultModel && !models.includes(defaultModel)) {
    throw createError({ statusCode: 400, statusMessage: 'metadata.defaultModel must be included in metadata.models.' })
  }
  if (data.models !== undefined || defaultModel)
    data.models = models
  if (defaultModel)
    data.defaultModel = defaultModel
  else
    delete data.defaultModel

  return normalizeOptionalJsonObject(Object.keys(data).length > 0 ? data : null, 'metadata')
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

function normalizeProviderCapabilityInput(input: ProviderCapabilityInput, field: string): NormalizedProviderCapabilityInput {
  const capability = assertNonEmptyString(input.capability, `${field}.capability`, 120)
  const metering = normalizeOptionalJsonObject(input.metering, `${field}.metering`)
  const constraints = normalizeOptionalJsonObject(input.constraints, `${field}.constraints`)
  const metadata = normalizeOptionalJsonObject(input.metadata, `${field}.metadata`)

  return {
    capability,
    schemaRef: normalizeOptionalString(input.schemaRef, `${field}.schemaRef`, 255),
    metering: metering.data,
    meteringJson: metering.json,
    constraints: constraints.data,
    constraintsJson: constraints.json,
    metadata: metadata.data,
    metadataJson: metadata.json,
  }
}

function normalizeProviderCapabilityPatch(
  existing: ProviderCapabilityRecord,
  input: UpdateProviderCapabilityInput,
): NormalizedProviderCapabilityInput {
  return normalizeProviderCapabilityInput({
    capability: input.capability === undefined ? existing.capability : input.capability,
    schemaRef: input.schemaRef === undefined ? existing.schemaRef : input.schemaRef,
    metering: input.metering === undefined ? existing.metering : input.metering,
    constraints: input.constraints === undefined ? existing.constraints : input.constraints,
    metadata: input.metadata === undefined ? existing.metadata : input.metadata,
  }, 'capability')
}

function normalizeCapabilities(value: unknown): NormalizedProviderCapabilityInput[] {
  if (value == null)
    return []
  if (!Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'capabilities must be an array.' })
  }

  const seen = new Set<string>()
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw createError({ statusCode: 400, statusMessage: `capabilities[${index}] is invalid.` })
    }

    const input = item as ProviderCapabilityInput
    const capability = normalizeProviderCapabilityInput(input, `capabilities[${index}]`)
    if (seen.has(capability.capability)) {
      throw createError({ statusCode: 400, statusMessage: `capabilities[${index}].capability is duplicated.` })
    }
    seen.add(capability.capability)
    return capability
  })
}

function normalizeProviderInput(input: CreateProviderRegistryInput): NormalizedProviderInput {
  const name = assertNonEmptyString(input.name, 'name')
  const displayName = input.displayName == null
    ? name
    : assertNonEmptyString(input.displayName, 'displayName')
  const vendor = assertEnum(input.vendor, 'vendor', PROVIDER_REGISTRY_VENDORS)
  const status = input.status == null
    ? 'disabled'
    : assertEnum(input.status, 'status', PROVIDER_REGISTRY_STATUSES)
  const authType = assertEnum(input.authType, 'authType', PROVIDER_REGISTRY_AUTH_TYPES)
  const rawAuthRef = normalizeOptionalString(input.authRef, 'authRef', 255)
  const authRef = rawAuthRef ? normalizeProviderAuthRef(rawAuthRef) : null

  if (authType !== 'none' && !authRef) {
    throw createError({ statusCode: 400, statusMessage: 'authRef is required for credentialed providers.' })
  }

  const capabilities = normalizeCapabilities(input.capabilities)
  const metadata = normalizeProviderMetadata(input.metadata, capabilities)

  return {
    name,
    displayName,
    vendor,
    status,
    authType,
    authRef: authType === 'none' ? null : authRef,
    ownerScope: input.ownerScope == null
      ? 'system'
      : assertEnum(input.ownerScope, 'ownerScope', PROVIDER_REGISTRY_OWNER_SCOPES),
    ownerId: normalizeOptionalString(input.ownerId, 'ownerId', 120),
    description: normalizeOptionalString(input.description, 'description', 500),
    endpoint: normalizeOptionalString(input.endpoint, 'endpoint', 255),
    region: normalizeOptionalString(input.region, 'region', 80),
    metadata: metadata.data,
    metadataJson: metadata.json,
    capabilities,
  }
}

function normalizeProviderPatch(existing: ProviderRegistryRecord, input: UpdateProviderRegistryInput): NormalizedProviderInput {
  return normalizeProviderInput({
    name: input.name ?? existing.name,
    displayName: input.displayName ?? existing.displayName,
    vendor: input.vendor ?? existing.vendor,
    status: input.status ?? existing.status,
    authType: input.authType ?? existing.authType,
    authRef: input.authRef === undefined ? existing.authRef : input.authRef,
    ownerScope: input.ownerScope ?? existing.ownerScope,
    ownerId: input.ownerId === undefined ? existing.ownerId : input.ownerId,
    description: input.description === undefined ? existing.description : input.description,
    endpoint: input.endpoint === undefined ? existing.endpoint : input.endpoint,
    region: input.region === undefined ? existing.region : input.region,
    metadata: input.metadata === undefined ? existing.metadata : input.metadata,
    capabilities: input.capabilities === undefined
      ? existing.capabilities.map(capability => ({
          capability: capability.capability,
          schemaRef: capability.schemaRef,
          metering: capability.metering,
          constraints: capability.constraints,
          metadata: capability.metadata,
        }))
      : input.capabilities,
  })
}

function mapCapability(row: ProviderCapabilityRow): ProviderCapabilityRecord {
  return {
    id: row.id,
    providerId: row.provider_id,
    capability: row.capability,
    schemaRef: row.schema_ref,
    metering: parseJsonObject(row.metering),
    constraints: parseJsonObject(row.constraints_json),
    metadata: parseJsonObject(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapProvider(row: ProviderRegistryRow, capabilities: ProviderCapabilityRecord[] = []): ProviderRegistryRecord {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    vendor: row.vendor as ProviderRegistryVendor,
    status: row.status as ProviderRegistryStatus,
    authType: row.auth_type as ProviderRegistryAuthType,
    authRef: row.auth_ref,
    ownerScope: row.owner_scope as ProviderRegistryOwnerScope,
    ownerId: row.owner_id,
    description: row.description,
    endpoint: row.endpoint,
    region: row.region,
    metadata: parseJsonObject(row.metadata),
    capabilities,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildProviderWhere(options: ListProviderRegistryOptions) {
  const conditions: string[] = []
  const values: string[] = []

  if (options.vendor) {
    conditions.push('vendor = ?')
    values.push(assertEnum(options.vendor, 'vendor', PROVIDER_REGISTRY_VENDORS))
  }
  if (options.status) {
    conditions.push('status = ?')
    values.push(assertEnum(options.status, 'status', PROVIDER_REGISTRY_STATUSES))
  }
  if (options.ownerScope) {
    conditions.push('owner_scope = ?')
    values.push(assertEnum(options.ownerScope, 'ownerScope', PROVIDER_REGISTRY_OWNER_SCOPES))
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  }
}

async function replaceProviderCapabilities(
  db: D1Database,
  providerId: string,
  capabilities: NormalizedProviderCapabilityInput[],
  now: string,
) {
  // One transaction: the old set is never half replaced, and it is one round trip rather than one
  // per capability.
  await db.batch([
    db.prepare(`DELETE FROM ${CAPABILITIES_TABLE} WHERE provider_id = ?;`).bind(providerId),
    ...capabilities.map(capability => db.prepare(`
      INSERT INTO ${CAPABILITIES_TABLE} (
        id, provider_id, capability, schema_ref, metering, constraints_json, metadata, created_at, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9);
    `).bind(
      randomUUID(),
      providerId,
      capability.capability,
      capability.schemaRef,
      capability.meteringJson,
      capability.constraintsJson,
      capability.metadataJson,
      now,
      now,
    )),
  ])
}

async function getProviderCapabilityRecord(
  db: D1Database,
  providerId: string,
  capabilityId: string,
): Promise<ProviderCapabilityRecord | null> {
  const row = await db.prepare(`
    SELECT id, provider_id, capability, schema_ref, metering, constraints_json, metadata, created_at, updated_at
    FROM ${CAPABILITIES_TABLE}
    WHERE provider_id = ?1 AND id = ?2;
  `).bind(providerId, capabilityId).first<ProviderCapabilityRow>()

  return row ? mapCapability(row) : null
}

async function touchProviderUpdatedAt(db: D1Database, providerId: string, now: string) {
  await db.prepare(`
    UPDATE ${PROVIDERS_TABLE}
    SET updated_at = ?1
    WHERE id = ?2;
  `).bind(now, providerId).run()
}

async function assertProviderCapabilityNotDuplicated(
  event: H3Event,
  providerId: string,
  capability: string,
  ignoreCapabilityId?: string,
) {
  const existing = await listProviderCapabilities(event, { providerId, capability })
  const duplicated = existing.some(item => item.id !== ignoreCapabilityId)
  if (duplicated) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Provider capability already exists.',
    })
  }
}

/**
 * How long an isolate may answer provider registry reads from memory. Every AI call and scene run resolves
 * provider registry entries; they change when an operator edits the registry. A write through this isolate
 * forgets them at once; other isolates pick it up within this window.
 */
const PROVIDER_REGISTRY_CACHE_TTL_MS = 30_000

const providerRegistryCache = new WeakMap<object, Map<string, { value: ProviderRegistryRecord | null, expiresAt: number }>>()

function forgetProviderRegistryCache(event: H3Event): void {
  const db = readCloudflareBindings(event)?.DB
  if (db)
    providerRegistryCache.delete(db)
}

function readCachedProvider(db: D1Database, id: string): { value: ProviderRegistryRecord | null } | null {
  const entry = providerRegistryCache.get(db)?.get(id)
  if (!entry || entry.expiresAt <= Date.now())
    return null
  return { value: entry.value ? structuredClone(entry.value) : null }
}

function writeCachedProvider(db: D1Database, id: string, value: ProviderRegistryRecord | null): void {
  let entries = providerRegistryCache.get(db)
  if (!entries) {
    entries = new Map()
    providerRegistryCache.set(db, entries)
  }
  entries.set(id, { value: value ? structuredClone(value) : null, expiresAt: Date.now() + PROVIDER_REGISTRY_CACHE_TTL_MS })
}

export async function listProviderRegistryEntries(
  event: H3Event,
  options: ListProviderRegistryOptions = {},
): Promise<ProviderRegistryRecord[]> {
  const db = getD1Database(event)
  await ensureProviderRegistrySchema(db)

  const { clause, values } = buildProviderWhere(options)
  // The providers and their capabilities in one round trip. The capabilities used to follow with an
  // `IN` list of every provider id: a second round trip, and past 100 providers (every user's own
  // count) more parameters than D1 binds.
  const [providerResult, capabilityResult] = await db.batch([
    db.prepare(`
      SELECT id, name, display_name, vendor, status, auth_type, auth_ref, owner_scope, owner_id,
        description, endpoint, region, metadata, created_by, created_at, updated_at
      FROM ${PROVIDERS_TABLE}
      ${clause}
      ORDER BY created_at DESC;
    `).bind(...values),
    db.prepare(`
      SELECT id, provider_id, capability, schema_ref, metering, constraints_json, metadata, created_at, updated_at
      FROM ${CAPABILITIES_TABLE}
      WHERE provider_id IN (SELECT id FROM ${PROVIDERS_TABLE} ${clause})
      ORDER BY capability ASC;
    `).bind(...values),
  ])

  const providerRows = (providerResult?.results ?? []) as ProviderRegistryRow[]
  const capabilities = ((capabilityResult?.results ?? []) as ProviderCapabilityRow[]).map(mapCapability)
  const capabilitiesByProvider = new Map<string, ProviderCapabilityRecord[]>()
  for (const capability of capabilities) {
    const list = capabilitiesByProvider.get(capability.providerId) ?? []
    list.push(capability)
    capabilitiesByProvider.set(capability.providerId, list)
  }

  return providerRows.map(row => mapProvider(row, capabilitiesByProvider.get(row.id) ?? []))
}

/** Reads straight from the database: writers use it to answer with what they just wrote. */
async function loadProviderRegistryEntry(event: H3Event, id: string): Promise<ProviderRegistryRecord | null> {
  const db = getD1Database(event)
  await ensureProviderRegistrySchema(db)

  const safeId = assertNonEmptyString(id, 'id', 120)
  // The provider and its capabilities in one round trip; they were two.
  const [providerResult, capabilityResult] = await db.batch([
    db.prepare(`
      SELECT id, name, display_name, vendor, status, auth_type, auth_ref, owner_scope, owner_id,
        description, endpoint, region, metadata, created_by, created_at, updated_at
      FROM ${PROVIDERS_TABLE}
      WHERE id = ?;
    `).bind(safeId),
    db.prepare(`
      SELECT id, provider_id, capability, schema_ref, metering, constraints_json, metadata, created_at, updated_at
      FROM ${CAPABILITIES_TABLE}
      WHERE provider_id = ?
      ORDER BY capability ASC;
    `).bind(safeId),
  ])
  const provider = (providerResult?.results?.[0] ?? null) as ProviderRegistryRow | null
  const record = provider
    ? mapProvider(provider, ((capabilityResult?.results ?? []) as ProviderCapabilityRow[]).map(mapCapability))
    : null
  return record
}

export async function getProviderRegistryEntry(event: H3Event, id: string): Promise<ProviderRegistryRecord | null> {
  const db = getD1Database(event)
  const safeId = assertNonEmptyString(id, 'id', 120)
  const cached = readCachedProvider(db, safeId)
  if (cached)
    return cached.value
  const record = await loadProviderRegistryEntry(event, safeId)
  writeCachedProvider(db, safeId, record)
  return record
}

async function createProviderRegistryEntryUncached(
  event: H3Event,
  input: CreateProviderRegistryInput,
  createdBy: string,
): Promise<ProviderRegistryRecord> {
  const db = getD1Database(event)
  await ensureProviderRegistrySchema(db)

  const normalized = normalizeProviderInput(input)
  const id = `prv_${randomUUID()}`
  const now = new Date().toISOString()
  const safeCreatedBy = assertNonEmptyString(createdBy, 'createdBy', 120)

  await db.prepare(`
    INSERT INTO ${PROVIDERS_TABLE} (
      id, name, display_name, vendor, status, auth_type, auth_ref, owner_scope, owner_id,
      description, endpoint, region, metadata, created_by, created_at, updated_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16);
  `).bind(
    id,
    normalized.name,
    normalized.displayName,
    normalized.vendor,
    normalized.status,
    normalized.authType,
    normalized.authRef,
    normalized.ownerScope,
    normalized.ownerId,
    normalized.description,
    normalized.endpoint,
    normalized.region,
    normalized.metadataJson,
    safeCreatedBy,
    now,
    now,
  ).run()

  await replaceProviderCapabilities(db, id, normalized.capabilities, now)

  const created = await loadProviderRegistryEntry(event, id)
  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Provider registry entry was not created.' })
  }
  return created
}

/** createProviderRegistryEntry, then the registry cache forgets this database's entries (see `forgetProviderRegistryCache`). */
export async function createProviderRegistryEntry(...args: Parameters<typeof createProviderRegistryEntryUncached>): ReturnType<typeof createProviderRegistryEntryUncached> {
  try {
    return await createProviderRegistryEntryUncached(...args)
  }
  finally {
    forgetProviderRegistryCache(args[0])
  }
}

async function updateProviderRegistryEntryUncached(
  event: H3Event,
  id: string,
  input: UpdateProviderRegistryInput,
): Promise<ProviderRegistryRecord | null> {
  const existing = await loadProviderRegistryEntry(event, id)
  if (!existing)
    return null

  const db = getD1Database(event)
  await ensureProviderRegistrySchema(db)

  const normalized = normalizeProviderPatch(existing, input)
  const now = new Date().toISOString()

  await db.prepare(`
    UPDATE ${PROVIDERS_TABLE}
    SET name = ?1,
      display_name = ?2,
      vendor = ?3,
      status = ?4,
      auth_type = ?5,
      auth_ref = ?6,
      owner_scope = ?7,
      owner_id = ?8,
      description = ?9,
      endpoint = ?10,
      region = ?11,
      metadata = ?12,
      updated_at = ?13
    WHERE id = ?14;
  `).bind(
    normalized.name,
    normalized.displayName,
    normalized.vendor,
    normalized.status,
    normalized.authType,
    normalized.authRef,
    normalized.ownerScope,
    normalized.ownerId,
    normalized.description,
    normalized.endpoint,
    normalized.region,
    normalized.metadataJson,
    now,
    existing.id,
  ).run()

  if (input.capabilities !== undefined) {
    await replaceProviderCapabilities(db, existing.id, normalized.capabilities, now)
  }

  return await loadProviderRegistryEntry(event, existing.id)
}

/** updateProviderRegistryEntry, then the registry cache forgets this database's entries (see `forgetProviderRegistryCache`). */
export async function updateProviderRegistryEntry(...args: Parameters<typeof updateProviderRegistryEntryUncached>): ReturnType<typeof updateProviderRegistryEntryUncached> {
  try {
    return await updateProviderRegistryEntryUncached(...args)
  }
  finally {
    forgetProviderRegistryCache(args[0])
  }
}

async function deleteProviderRegistryEntryUncached(event: H3Event, id: string): Promise<boolean> {
  const existing = await loadProviderRegistryEntry(event, id)
  if (!existing)
    return false

  const db = getD1Database(event)
  await ensureProviderRegistrySchema(db)
  await db.prepare(`DELETE FROM ${CAPABILITIES_TABLE} WHERE provider_id = ?;`).bind(existing.id).run()
  await db.prepare(`DELETE FROM ${PROVIDERS_TABLE} WHERE id = ?;`).bind(existing.id).run()
  return true
}

/** deleteProviderRegistryEntry, then the registry cache forgets this database's entries (see `forgetProviderRegistryCache`). */
export async function deleteProviderRegistryEntry(...args: Parameters<typeof deleteProviderRegistryEntryUncached>): ReturnType<typeof deleteProviderRegistryEntryUncached> {
  try {
    return await deleteProviderRegistryEntryUncached(...args)
  }
  finally {
    forgetProviderRegistryCache(args[0])
  }
}

export async function listProviderCapabilities(
  event: H3Event,
  options: ListProviderCapabilitiesOptions = {},
): Promise<ProviderCapabilityRecord[]> {
  const db = getD1Database(event)
  await ensureProviderRegistrySchema(db)

  const conditions: string[] = []
  const values: string[] = []
  let joinProvider = false

  if (options.providerId) {
    conditions.push('c.provider_id = ?')
    values.push(assertNonEmptyString(options.providerId, 'providerId', 120))
  }
  if (options.capability) {
    conditions.push('c.capability = ?')
    values.push(assertNonEmptyString(options.capability, 'capability', 120))
  }
  if (options.vendor) {
    joinProvider = true
    conditions.push('p.vendor = ?')
    values.push(assertEnum(options.vendor, 'vendor', PROVIDER_REGISTRY_VENDORS))
  }

  const join = joinProvider ? `INNER JOIN ${PROVIDERS_TABLE} p ON p.id = c.provider_id` : ''
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const { results } = await db.prepare(`
    SELECT c.id, c.provider_id, c.capability, c.schema_ref, c.metering, c.constraints_json,
      c.metadata, c.created_at, c.updated_at
    FROM ${CAPABILITIES_TABLE} c
    ${join}
    ${where}
    ORDER BY c.capability ASC;
  `).bind(...values).all<ProviderCapabilityRow>()

  return (results ?? []).map(mapCapability)
}

function assertProviderAdapterSupportsCapability(provider: ProviderRegistryRecord, capability: string): void {
  const adapterKey = normalizeSceneCapabilityAdapterKey(provider.metadata?.adapterKey)
    ?? normalizeSceneCapabilityAdapterKey(provider.metadata?.adapter)
  if (!adapterKey || !isKnownSceneCapabilityAdapterKey(adapterKey) || !sceneCapabilityAdapterSupports(adapterKey, capability)) {
    throw createError({ statusCode: 400, statusMessage: `Provider adapter does not support capability ${capability}.` })
  }
}

async function createProviderCapabilityUncached(
  event: H3Event,
  providerId: string,
  input: ProviderCapabilityInput,
): Promise<ProviderCapabilityRecord | null> {
  const existingProvider = await loadProviderRegistryEntry(event, providerId)
  if (!existingProvider)
    return null

  const db = getD1Database(event)
  await ensureProviderRegistrySchema(db)

  const normalized = normalizeProviderCapabilityInput(input, 'capability')
  assertProviderAdapterSupportsCapability(existingProvider, normalized.capability)
  await assertProviderCapabilityNotDuplicated(event, existingProvider.id, normalized.capability)

  const id = randomUUID()
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO ${CAPABILITIES_TABLE} (
      id, provider_id, capability, schema_ref, metering, constraints_json, metadata, created_at, updated_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9);
  `).bind(
    id,
    existingProvider.id,
    normalized.capability,
    normalized.schemaRef,
    normalized.meteringJson,
    normalized.constraintsJson,
    normalized.metadataJson,
    now,
    now,
  ).run()
  await touchProviderUpdatedAt(db, existingProvider.id, now)

  return await getProviderCapabilityRecord(db, existingProvider.id, id)
}

/** createProviderCapability, then the registry cache forgets this database's entries (see `forgetProviderRegistryCache`). */
export async function createProviderCapability(...args: Parameters<typeof createProviderCapabilityUncached>): ReturnType<typeof createProviderCapabilityUncached> {
  try {
    return await createProviderCapabilityUncached(...args)
  }
  finally {
    forgetProviderRegistryCache(args[0])
  }
}

async function updateProviderCapabilityUncached(
  event: H3Event,
  providerId: string,
  capabilityId: string,
  input: UpdateProviderCapabilityInput,
): Promise<ProviderCapabilityRecord | null> {
  const existingProvider = await loadProviderRegistryEntry(event, providerId)
  if (!existingProvider)
    return null

  const db = getD1Database(event)
  await ensureProviderRegistrySchema(db)

  const safeCapabilityId = assertNonEmptyString(capabilityId, 'capabilityId', 120)
  const existing = await getProviderCapabilityRecord(db, existingProvider.id, safeCapabilityId)
  if (!existing)
    return null

  const normalized = normalizeProviderCapabilityPatch(existing, input)
  assertProviderAdapterSupportsCapability(existingProvider, normalized.capability)
  await assertProviderCapabilityNotDuplicated(event, existingProvider.id, normalized.capability, existing.id)

  const now = new Date().toISOString()
  await db.prepare(`
    UPDATE ${CAPABILITIES_TABLE}
    SET capability = ?1,
      schema_ref = ?2,
      metering = ?3,
      constraints_json = ?4,
      metadata = ?5,
      updated_at = ?6
    WHERE provider_id = ?7 AND id = ?8;
  `).bind(
    normalized.capability,
    normalized.schemaRef,
    normalized.meteringJson,
    normalized.constraintsJson,
    normalized.metadataJson,
    now,
    existingProvider.id,
    existing.id,
  ).run()
  await touchProviderUpdatedAt(db, existingProvider.id, now)

  return await getProviderCapabilityRecord(db, existingProvider.id, existing.id)
}

/** updateProviderCapability, then the registry cache forgets this database's entries (see `forgetProviderRegistryCache`). */
export async function updateProviderCapability(...args: Parameters<typeof updateProviderCapabilityUncached>): ReturnType<typeof updateProviderCapabilityUncached> {
  try {
    return await updateProviderCapabilityUncached(...args)
  }
  finally {
    forgetProviderRegistryCache(args[0])
  }
}

async function deleteProviderCapabilityUncached(
  event: H3Event,
  providerId: string,
  capabilityId: string,
): Promise<boolean> {
  const existingProvider = await loadProviderRegistryEntry(event, providerId)
  if (!existingProvider)
    return false

  const db = getD1Database(event)
  await ensureProviderRegistrySchema(db)

  const safeCapabilityId = assertNonEmptyString(capabilityId, 'capabilityId', 120)
  const existing = await getProviderCapabilityRecord(db, existingProvider.id, safeCapabilityId)
  if (!existing)
    return false

  const now = new Date().toISOString()
  await db.prepare(`
    DELETE FROM ${CAPABILITIES_TABLE}
    WHERE provider_id = ?1 AND id = ?2;
  `).bind(existingProvider.id, existing.id).run()
  await touchProviderUpdatedAt(db, existingProvider.id, now)

  return true
}

/** deleteProviderCapability, then the registry cache forgets this database's entries (see `forgetProviderRegistryCache`). */
export async function deleteProviderCapability(...args: Parameters<typeof deleteProviderCapabilityUncached>): ReturnType<typeof deleteProviderCapabilityUncached> {
  try {
    return await deleteProviderCapabilityUncached(...args)
  }
  finally {
    forgetProviderRegistryCache(args[0])
  }
}
