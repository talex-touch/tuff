import type { D1Database } from '@cloudflare/workers-types'
import type {
  PluginSecurityFindingCode,
  PluginSecurityScanWaiver,
} from '@talex-touch/utils/plugin'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { recordPlatformGovernanceEvent } from './platformGovernanceStore'

const TABLE_NAME = 'plugin_security_scan_waivers'
const SHA256_RE = /^[a-f0-9]{64}$/
const WAIVABLE_RULES = new Set<PluginSecurityFindingCode>([
  'PLUGIN_SCAN_PRODUCTION_DEV_SOURCE',
  'PLUGIN_SCAN_DYNAMIC_EXECUTION',
  'PLUGIN_SCAN_NATIVE_BINARY',
  'PLUGIN_SCAN_PERMISSION_MISMATCH',
  'PLUGIN_SCAN_FILE_LIMIT_EXCEEDED',
])

interface WaiverRow {
  id: string
  artifact_sha256: string
  rule_id: PluginSecurityFindingCode
  owner_id: string
  reason: string
  ticket: string | null
  created_at: string
  expires_at: string
  revoked_at: string | null
}

export interface PluginSecurityScanWaiverRecord extends PluginSecurityScanWaiver {
  revokedAt: string | null
}

export interface CreatePluginSecurityScanWaiverInput {
  artifactSha256: string
  ruleId: PluginSecurityFindingCode
  reason: string
  expiresAt: string
  ticket?: string
}

const memoryWaivers = new Map<string, PluginSecurityScanWaiverRecord>()
let schemaInitialized = false

function getD1Database(event: H3Event): D1Database | null {
  return readCloudflareBindings(event)?.DB ?? null
}

async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaInitialized) return
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
      id TEXT PRIMARY KEY,
      artifact_sha256 TEXT NOT NULL,
      rule_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      ticket TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );
  `).run()
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_plugin_scan_waivers_artifact
    ON ${TABLE_NAME}(artifact_sha256, expires_at, revoked_at);
  `).run()
  schemaInitialized = true
}

function normalizeBoundedString(value: unknown, field: string, max: number): string {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized.length > max) {
    throw createError({
      statusCode: 400,
      statusMessage: `${field} must contain 1-${max} characters.`,
    })
  }
  return normalized
}

function normalizeInput(
  input: CreatePluginSecurityScanWaiverInput,
): CreatePluginSecurityScanWaiverInput {
  const artifactSha256 = String(input.artifactSha256 ?? '').trim().toLowerCase()
  if (!SHA256_RE.test(artifactSha256)) {
    throw createError({ statusCode: 400, statusMessage: 'artifactSha256 must be SHA-256.' })
  }
  if (!WAIVABLE_RULES.has(input.ruleId)) {
    throw createError({ statusCode: 400, statusMessage: 'ruleId is not waivable.' })
  }
  const expiresAtMs = Date.parse(input.expiresAt)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw createError({ statusCode: 400, statusMessage: 'expiresAt must be in the future.' })
  }
  const expiresAt = new Date(expiresAtMs).toISOString()
  return {
    artifactSha256,
    ruleId: input.ruleId,
    reason: normalizeBoundedString(input.reason, 'reason', 500),
    expiresAt,
    ...(input.ticket
      ? { ticket: normalizeBoundedString(input.ticket, 'ticket', 120) }
      : {}),
  }
}

function fromRow(row: WaiverRow): PluginSecurityScanWaiverRecord {
  return {
    id: row.id,
    artifactSha256: row.artifact_sha256,
    ruleId: row.rule_id,
    owner: row.owner_id,
    reason: row.reason,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ...(row.ticket ? { ticket: row.ticket } : {}),
    revokedAt: row.revoked_at,
  }
}

export async function createPluginSecurityScanWaiver(
  event: H3Event,
  ownerId: string,
  rawInput: CreatePluginSecurityScanWaiverInput,
): Promise<PluginSecurityScanWaiverRecord> {
  const input = normalizeInput(rawInput)
  const now = new Date().toISOString()
  const record: PluginSecurityScanWaiverRecord = {
    id: randomUUID(),
    artifactSha256: input.artifactSha256,
    ruleId: input.ruleId,
    owner: normalizeBoundedString(ownerId, 'owner', 180),
    reason: input.reason,
    createdAt: now,
    expiresAt: input.expiresAt,
    ...(input.ticket ? { ticket: input.ticket } : {}),
    revokedAt: null,
  }
  const db = getD1Database(event)
  if (!db) {
    memoryWaivers.set(record.id, record)
  }
  else {
    await ensureSchema(db)
    await db.prepare(`
      INSERT INTO ${TABLE_NAME} (
        id, artifact_sha256, rule_id, owner_id, reason, ticket,
        created_at, expires_at, revoked_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL);
    `).bind(
      record.id,
      record.artifactSha256,
      record.ruleId,
      record.owner,
      record.reason,
      record.ticket ?? null,
      record.createdAt,
      record.expiresAt,
    ).run()
  }
  await recordPlatformGovernanceEvent(event, {
    scope: 'plugin-security-scan',
    action: 'waiver.created',
    actorId: ownerId,
    resourceType: 'plugin-security-scan-waiver',
    resourceId: record.id,
    metadata: {
      artifactSha256: record.artifactSha256,
      ruleId: record.ruleId,
      expiresAt: record.expiresAt,
      ticket: record.ticket ?? null,
    },
  })
  return record
}

export async function listPluginSecurityScanWaivers(
  event: H3Event,
  artifactSha256?: string,
): Promise<PluginSecurityScanWaiverRecord[]> {
  const normalizedDigest = artifactSha256?.trim().toLowerCase()
  if (normalizedDigest && !SHA256_RE.test(normalizedDigest)) {
    throw createError({ statusCode: 400, statusMessage: 'artifactSha256 must be SHA-256.' })
  }
  const db = getD1Database(event)
  if (!db) {
    return Array.from(memoryWaivers.values())
      .filter(record => !normalizedDigest || record.artifactSha256 === normalizedDigest)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }
  await ensureSchema(db)
  const statement = normalizedDigest
    ? db.prepare(`
        SELECT * FROM ${TABLE_NAME}
        WHERE artifact_sha256 = ?1
        ORDER BY created_at DESC;
      `).bind(normalizedDigest)
    : db.prepare(`
        SELECT * FROM ${TABLE_NAME}
        ORDER BY created_at DESC
        LIMIT 500;
      `)
  const result = await statement.all<WaiverRow>()
  return (result.results ?? []).map(fromRow)
}

export async function listActivePluginSecurityScanWaivers(
  event: H3Event,
  artifactSha256: string,
  now = new Date(),
): Promise<PluginSecurityScanWaiver[]> {
  const records = await listPluginSecurityScanWaivers(event, artifactSha256)
  const nowMs = now.getTime()
  return records
    .filter(record => !record.revokedAt && Date.parse(record.expiresAt) > nowMs)
    .map(({ revokedAt: _revokedAt, ...waiver }) => waiver)
}

export async function revokePluginSecurityScanWaiver(
  event: H3Event,
  id: string,
  actorId: string,
): Promise<PluginSecurityScanWaiverRecord> {
  const normalizedId = normalizeBoundedString(id, 'id', 180)
  const revokedAt = new Date().toISOString()
  const db = getD1Database(event)
  let record: PluginSecurityScanWaiverRecord | undefined
  if (!db) {
    const existing = memoryWaivers.get(normalizedId)
    if (existing) {
      record = { ...existing, revokedAt }
      memoryWaivers.set(normalizedId, record)
    }
  }
  else {
    await ensureSchema(db)
    await db.prepare(`
      UPDATE ${TABLE_NAME}
      SET revoked_at = ?2
      WHERE id = ?1 AND revoked_at IS NULL;
    `).bind(normalizedId, revokedAt).run()
    const row = await db.prepare(`
      SELECT * FROM ${TABLE_NAME} WHERE id = ?1;
    `).bind(normalizedId).first<WaiverRow>()
    record = row ? fromRow(row) : undefined
  }
  if (!record) {
    throw createError({ statusCode: 404, statusMessage: 'Security scan waiver not found.' })
  }
  await recordPlatformGovernanceEvent(event, {
    scope: 'plugin-security-scan',
    action: 'waiver.revoked',
    actorId,
    resourceType: 'plugin-security-scan-waiver',
    resourceId: record.id,
    metadata: {
      artifactSha256: record.artifactSha256,
      ruleId: record.ruleId,
    },
  })
  return record
}

export function resetPluginSecurityScanWaiverStoreForTests(): void {
  memoryWaivers.clear()
  schemaInitialized = false
}
