import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { normalizeProviderAuthRef } from './providerCredentialStore'

const PROVIDERS_TABLE = 'provider_registry'
const CAPABILITIES_TABLE = 'provider_capabilities'
const JSON_LIMIT_BYTES = 64 * 1024

const initializedSchemas = new WeakSet<D1Database>()

export const PROVIDER_REGISTRY_VENDORS = ['tencent-cloud', 'openai', 'deepseek', 'exchange-rate', 'custom'] as const
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

async function ensureProviderRegistrySchema(db: D1Database) {
  if (initializedSchemas.has(db))
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${PROVIDERS_TABLE} (
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
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${CAPABILITIES_TABLE} (
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
    );
  `).run()

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_provider_registry_vendor ON ${PROVIDERS_TABLE}(vendor);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_provider_registry_status ON ${PROVIDERS_TABLE}(status);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_provider_registry_owner_scope ON ${PROVIDERS_TABLE}(owner_scope);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_provider_capabilities_provider ON ${CAPABILITIES_TABLE}(provider_id);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_provider_capabilities_capability ON ${CAPABILITIES_TABLE}(capability);`).run()

  initializedSchemas.add(db)
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

  const metadata = normalizeOptionalJsonObject(input.metadata, 'metadata')

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
    capabilities: normalizeCapabilities(input.capabilities),
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

async function listCapabilitiesForProviders(db: D1Database, providerIds: string[]): Promise<ProviderCapabilityRecord[]> {
  if (providerIds.length === 0)
    return []

  const placeholders = providerIds.map(() => '?').join(', ')
  const { results } = await db.prepare(`
    SELECT id, provider_id, capability, schema_ref, metering, constraints_json, metadata, created_at, updated_at
    FROM ${CAPABILITIES_TABLE}
    WHERE provider_id IN (${placeholders})
    ORDER BY capability ASC;
  `).bind(...providerIds).all<ProviderCapabilityRow>()

  return (results ?? []).map(mapCapability)
}

async function replaceProviderCapabilities(
  db: D1Database,
  providerId: string,
  capabilities: NormalizedProviderCapabilityInput[],
  now: string,
) {
  await db.prepare(`DELETE FROM ${CAPABILITIES_TABLE} WHERE provider_id = ?;`).bind(providerId).run()

  for (const capability of capabilities) {
    await db.prepare(`
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
    ).run()
  }
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

export async function listProviderRegistryEntries(
  event: H3Event,
  options: ListProviderRegistryOptions = {},
): Promise<ProviderRegistryRecord[]> {
  const db = getD1Database(event)
  await ensureProviderRegistrySchema(db)

  const { clause, values } = buildProviderWhere(options)
  const { results } = await db.prepare(`
    SELECT id, name, display_name, vendor, status, auth_type, auth_ref, owner_scope, owner_id,
      description, endpoint, region, metadata, created_by, created_at, updated_at
    FROM ${PROVIDERS_TABLE}
    ${clause}
    ORDER BY created_at DESC;
  `).bind(...values).all<ProviderRegistryRow>()

  const providerRows = results ?? []
  const capabilities = await listCapabilitiesForProviders(db, providerRows.map(row => row.id))
  const capabilitiesByProvider = new Map<string, ProviderCapabilityRecord[]>()
  for (const capability of capabilities) {
    const list = capabilitiesByProvider.get(capability.providerId) ?? []
    list.push(capability)
    capabilitiesByProvider.set(capability.providerId, list)
  }

  return providerRows.map(row => mapProvider(row, capabilitiesByProvider.get(row.id) ?? []))
}

export async function getProviderRegistryEntry(
  event: H3Event,
  id: string,
): Promise<ProviderRegistryRecord | null> {
  const db = getD1Database(event)
  await ensureProviderRegistrySchema(db)

  const safeId = assertNonEmptyString(id, 'id', 120)
  const provider = await db.prepare(`
    SELECT id, name, display_name, vendor, status, auth_type, auth_ref, owner_scope, owner_id,
      description, endpoint, region, metadata, created_by, created_at, updated_at
    FROM ${PROVIDERS_TABLE}
    WHERE id = ?;
  `).bind(safeId).first<ProviderRegistryRow>()

  if (!provider)
    return null

  const capabilities = await listCapabilitiesForProviders(db, [safeId])
  return mapProvider(provider, capabilities)
}

export async function createProviderRegistryEntry(
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

  const created = await getProviderRegistryEntry(event, id)
  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Provider registry entry was not created.' })
  }
  return created
}

export async function updateProviderRegistryEntry(
  event: H3Event,
  id: string,
  input: UpdateProviderRegistryInput,
): Promise<ProviderRegistryRecord | null> {
  const existing = await getProviderRegistryEntry(event, id)
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

  return await getProviderRegistryEntry(event, existing.id)
}

export async function deleteProviderRegistryEntry(event: H3Event, id: string): Promise<boolean> {
  const existing = await getProviderRegistryEntry(event, id)
  if (!existing)
    return false

  const db = getD1Database(event)
  await ensureProviderRegistrySchema(db)
  await db.prepare(`DELETE FROM ${CAPABILITIES_TABLE} WHERE provider_id = ?;`).bind(existing.id).run()
  await db.prepare(`DELETE FROM ${PROVIDERS_TABLE} WHERE id = ?;`).bind(existing.id).run()
  return true
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

export async function createProviderCapability(
  event: H3Event,
  providerId: string,
  input: ProviderCapabilityInput,
): Promise<ProviderCapabilityRecord | null> {
  const existingProvider = await getProviderRegistryEntry(event, providerId)
  if (!existingProvider)
    return null

  const db = getD1Database(event)
  await ensureProviderRegistrySchema(db)

  const normalized = normalizeProviderCapabilityInput(input, 'capability')
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

export async function updateProviderCapability(
  event: H3Event,
  providerId: string,
  capabilityId: string,
  input: UpdateProviderCapabilityInput,
): Promise<ProviderCapabilityRecord | null> {
  const existingProvider = await getProviderRegistryEntry(event, providerId)
  if (!existingProvider)
    return null

  const db = getD1Database(event)
  await ensureProviderRegistrySchema(db)

  const safeCapabilityId = assertNonEmptyString(capabilityId, 'capabilityId', 120)
  const existing = await getProviderCapabilityRecord(db, existingProvider.id, safeCapabilityId)
  if (!existing)
    return null

  const normalized = normalizeProviderCapabilityPatch(existing, input)
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

export async function deleteProviderCapability(
  event: H3Event,
  providerId: string,
  capabilityId: string,
): Promise<boolean> {
  const existingProvider = await getProviderRegistryEntry(event, providerId)
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
