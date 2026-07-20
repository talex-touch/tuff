import type { D1Database } from '@cloudflare/workers-types'
import type {
  PluginAdmissionAttestationV1,
  PluginPublisherSignatureV1,
  PluginSecurityScanDecision,
  PluginSecurityScanWaiver,
} from '@talex-touch/utils/plugin'
import type { H3Event } from 'h3'
import type { PluginReleaseAudience, PluginReleaseEligibility, PluginReleaseEligibilityReason } from './pluginReleaseEligibility'
import type { PublisherSigningKeyRecord, VerifiedPublisherSignature } from './pluginSigning'
import type { TpexExtractedMetadata } from './tpex'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import process from 'node:process'
import { serializePluginSecurityScanReport } from '@talex-touch/utils/plugin'
import { createError } from 'h3'
import { useStorage } from 'nitropack/runtime/internal/storage'
import { isPluginCategoryId } from '~/utils/plugin-categories'
import { readCloudflareBindings } from './cloudflare'
import { deleteImage, uploadImageFromBuffer } from './imageStorage'
import { recordPlatformGovernanceEvent } from './platformGovernanceStore'
import { deletePluginPackage, uploadPluginPackage } from './pluginPackageStorage'
import { evaluatePluginReleaseEligibility } from './pluginReleaseEligibility'
import { listActivePluginSecurityScanWaivers } from './pluginSecurityScanWaiverStore'
import { createPluginAdmissionAttestation, verifyPluginPublisherSignature } from './pluginSigning'
import { extractTpexMetadata, getTpexAdmissionFailure } from './tpex'
import {
  completeUploadGovernance,
  failUploadGovernance,
  startUploadGovernance,
} from './uploadGovernance'

const PLUGINS_KEY = 'dashboard:plugins'
const PLUGIN_VERSIONS_KEY = 'dashboard:pluginVersions'
const PLUGIN_TIMELINE_KEY = 'dashboard:pluginTimeline'
const PLUGINS_TABLE = 'dashboard_plugins'
const PLUGIN_VERSIONS_TABLE = 'dashboard_plugin_versions'
const PLUGIN_TIMELINE_TABLE = 'dashboard_plugin_timeline'

const MAX_PLUGINS_PER_USER = 10
const SUBMISSION_COOLDOWN_MS = 5 * 60 * 1000

let schemaInitialized = false
let hasLoggedPluginsDb = false
let hasLoggedPluginsFallback = false
let hasLoggedShaFallback = false

export function buildPluginPackageGovernanceResourceId(input: {
  pluginId: string
  channel: PluginChannel
  version: string
}) {
  return `plugin:${input.pluginId}:version:${input.channel.toLowerCase()}:${input.version}`
}

function extractPublisherSignatureKeyId(value: unknown): string {
  let parsed = value
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    }
    catch {
      return ''
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return ''
  const keyId = (parsed as Record<string, unknown>).keyId
  return typeof keyId === 'string' ? keyId.trim() : ''
}

function classifyPluginPackageUploadFailure(error: unknown): string {
  const statusCode = error && typeof error === 'object'
    ? (error as { statusCode?: unknown }).statusCode
    : null
  const message = error && typeof error === 'object'
    ? String((error as { statusMessage?: unknown, message?: unknown }).statusMessage ?? (error as { message?: unknown }).message ?? '')
    : ''
  const normalized = message.toLowerCase()

  if (statusCode === 429)
    return 'storage-policy-blocked'
  if (normalized.includes('plugin_scan')) {
    return normalized.includes('unavailable') || normalized.includes('timeout') || normalized.includes('engine')
      ? 'plugin-security-scan-unavailable'
      : 'plugin-security-scan-blocked'
  }
  if (normalized.includes('plugin_package_'))
    return 'plugin-package-policy-rejected'
  if (normalized.includes('integrity'))
    return 'plugin-package-integrity-invalid'
  if (normalized.includes('icon'))
    return 'plugin-package-icon-invalid'
  if (normalized.includes('package size'))
    return 'plugin-package-size-exceeded'
  if (normalized.includes('package type') || normalized.includes('.tpex'))
    return 'plugin-package-type-invalid'
  return 'plugin-package-upload-failed'
}

function assertTpexAdmission(metadata: TpexExtractedMetadata): void {
  const failure = getTpexAdmissionFailure(metadata)
  if (!failure)
    return
  throw createError({
    statusCode: 400,
    statusMessage: `${failure.code}: ${failure.reason}`,
  })
}

async function extractTpexForAdmission(
  event: H3Event,
  packageBuffer: Buffer,
  expected: { pluginId: string, version: string },
  waivers: readonly PluginSecurityScanWaiver[],
  actorId: string,
  resourceId: string,
): Promise<TpexExtractedMetadata> {
  await recordPlatformGovernanceEvent(event, {
    scope: 'plugin-security-scan',
    action: 'scan.started',
    actorId,
    resourceType: 'plugin-package',
    resourceId,
    metadata: { pluginId: expected.pluginId, version: expected.version },
  })
  try {
    const metadata = await extractTpexMetadata(packageBuffer, expected, waivers)
    const report = metadata.securityScan
    await recordPlatformGovernanceEvent(event, {
      scope: 'plugin-security-scan',
      action: report.decision === 'blocked'
        ? 'scan.blocked'
        : report.decision === 'unavailable'
          ? 'scan.unavailable'
          : 'scan.completed',
      actorId,
      resourceType: 'plugin-package',
      resourceId,
      metadata: {
        artifactSha256: report.artifactSha256,
        decision: report.decision,
        scannerVersion: report.scannerVersion,
        ruleSetVersion: report.ruleSetVersion,
        findingCount: report.findings.length,
        failureCode: report.failure?.code ?? null,
      },
    })
    return metadata
  }
  catch (error) {
    await recordPlatformGovernanceEvent(event, {
      scope: 'plugin-security-scan',
      action: 'scan.unavailable',
      actorId,
      resourceType: 'plugin-package',
      resourceId,
      metadata: { reason: 'archive-extraction-failed' },
    })
    throw error
  }
}

// region debug [DBG-nexus-coreapp-planprd-2026-01-12]
const DBG_SID = 'DBG-nexus-coreapp-planprd-2026-01-12'
const DBG_ENABLED = process.env.TALEX_WORKFLOW_DEBUG === DBG_SID
const DBG_LOG_PATH = '.workflow/.debug/DBG-nexus-coreapp-planprd-2026-01-12/debug.log'

async function dbgLog(
  hid: string,
  loc: string,
  msg: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!DBG_ENABLED)
    return

  try {
    const fs = await import('node:fs')
    const path = await import('node:path')
    fs.mkdirSync(path.dirname(DBG_LOG_PATH), { recursive: true })
    fs.appendFileSync(
      DBG_LOG_PATH,
      `${JSON.stringify({ sid: DBG_SID, hid, loc, msg, data, ts: Date.now() })}\n`,
    )
  }
  catch {}
}
// endregion

export type PluginChannel = 'SNAPSHOT' | 'BETA' | 'RELEASE'
export type PluginStatus = 'draft' | 'pending' | 'approved' | 'rejected'
export type PluginVersionStatus = 'pending' | 'approved' | 'rejected'
export type PluginArtifactType = 'plugin' | 'layout' | 'theme'
export type PluginTimelineActorRole = 'owner' | 'admin' | 'system'

export interface DashboardPluginAuthor {
  name: string
  avatarColor?: string
}

export interface DashboardPluginVersion {
  id: string
  pluginId: string
  createdBy: string
  channel: PluginChannel
  version: string
  artifactSha256: string
  publisherSignature?: PluginPublisherSignatureV1 | null
  publisherKey?: PublisherSigningKeyRecord | null
  publisherVerifiedAt?: string | null
  nexusAttestation?: PluginAdmissionAttestationV1 | null
  admissionStatus?: 'pending' | 'eligible' | 'blocked'
  policyDecision?: 'passed' | 'failed' | 'unavailable' | 'not-evaluated'
  artifactState?: 'available' | 'missing' | 'quarantined'
  revokedAt?: string | null
  eligibilityRevision?: number
  eligibilityEvaluatedAt?: string | null
  eligibilityReasons?: PluginReleaseEligibilityReason[]
  packageKey: string
  packageUrl: string
  packageSize: number
  iconKey: string
  iconUrl: string
  readmeMarkdown?: string | null
  manifest?: Record<string, unknown> | null
  changelog?: string | null
  status: PluginVersionStatus
  reviewedAt?: string | null
  rejectReason?: string | null
  securityScanDecision?: PluginSecurityScanDecision | null
  securityScanReportDigest?: string | null
  securityScannerVersion?: string | null
  securityRuleSetVersion?: string | null
  securityScanFindingCount?: number | null
  securityScanCompletedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface PluginTimelineEvent {
  id: string
  pluginId: string
  versionId?: string | null
  eventType: 'plugin.created' | 'plugin.status.changed' | 'version.created' | 'version.status.changed' | 'version.reedited'
  actorId?: string | null
  actorRole: PluginTimelineActorRole
  fromStatus?: string | null
  toStatus?: string | null
  reason?: string | null
  meta?: Record<string, unknown> | null
  createdAt: string
}

export interface DashboardPlugin {
  id: string
  userId: string
  ownerOrgId?: string | null
  slug: string
  name: string
  summary: string
  category: string
  artifactType: PluginArtifactType
  installs: number
  homepage?: string | null
  isOfficial: boolean
  badges: string[]
  author?: DashboardPluginAuthor | null
  status: PluginStatus
  readmeMarkdown?: string | null
  iconKey?: string | null
  iconUrl?: string | null
  createdAt: string
  updatedAt: string
  latestVersionId?: string | null
  versions?: DashboardPluginVersion[]
  hasPendingReview?: boolean
  pendingReviewCount?: number
}

interface D1PluginRow {
  id: string
  user_id: string
  owner_org_id: string | null
  name: string
  summary: string
  category: string
  artifact_type: string | null
  installs: number
  homepage: string | null
  icon: string | null
  image_url: string | null
  last_updated: string | null
  version: string | null
  is_official: number
  badges: string | null
  author: string | null
  slug: string | null
  status: string | null
  readme_markdown: string | null
  icon_key: string | null
  icon_url: string | null
  created_at: string
  updated_at: string
  latest_version_id: string | null
}

interface D1PluginVersionRow {
  id: string
  plugin_id: string
  created_by: string
  channel: string
  version: string
  signature?: string | null
  artifact_sha256?: string | null
  publisher_signature?: string | null
  publisher_key?: string | null
  publisher_key_id?: string | null
  publisher_verified_at?: string | null
  nexus_attestation?: string | null
  admission_status?: string | null
  policy_decision?: string | null
  artifact_state?: string | null
  revoked_at?: string | null
  eligibility_revision?: number | null
  eligibility_evaluated_at?: string | null
  eligibility_reasons?: string | null
  package_key: string
  package_url: string
  package_size: number
  icon_key: string
  icon_url: string
  readme_markdown: string | null
  manifest: string | null
  notes: string | null
  status: string | null
  reviewed_at: string | null
  reject_reason: string | null
  security_scan_decision?: string | null
  security_scan_report_digest?: string | null
  security_scanner_version?: string | null
  security_rule_set_version?: string | null
  security_scan_finding_count?: number | null
  security_scan_completed_at?: string | null
  created_at: string
  updated_at: string
}

interface D1PluginTimelineRow {
  id: string
  plugin_id: string
  version_id: string | null
  event_type: PluginTimelineEvent['eventType']
  actor_id: string | null
  actor_role: PluginTimelineActorRole
  from_status: string | null
  to_status: string | null
  reason: string | null
  meta: string | null
  created_at: string
}

interface AddTimelineEventInput {
  pluginId: string
  versionId?: string | null
  eventType: PluginTimelineEvent['eventType']
  actorId?: string | null
  actorRole?: PluginTimelineActorRole
  fromStatus?: string | null
  toStatus?: string | null
  reason?: string | null
  meta?: Record<string, unknown> | null
  createdAt?: string
}

interface PluginVisibilityOptions {
  ownerId?: string
  viewerId?: string
  viewerOrgIds?: string[]
  viewerIsAdmin?: boolean
  includeVersions?: boolean
  forStore?: boolean
  audience?: PluginReleaseAudience
  statuses?: PluginStatus[]
}

export interface StorePluginSearchOptions {
  keyword?: string
  category?: string
  limit?: number
  offset?: number
  audience?: PluginReleaseAudience
}

export interface StorePluginSearchPlugin extends DashboardPlugin {
  latestVersion: DashboardPluginVersion
  latestVersionId: string
  versions: DashboardPluginVersion[]
}

export interface StorePluginSearchResult {
  plugins: StorePluginSearchPlugin[]
  total: number
  limit: number
  offset: number
}

export interface StorePluginListOptions {
  compact?: boolean
  limit?: number
  offset?: number
  audience?: PluginReleaseAudience
}

export interface StorePluginListResult {
  plugins: StorePluginSearchPlugin[]
  total: number
  limit: number
  offset: number
}

interface CreatePluginInput {
  slug: string
  name: string
  summary: string
  category: string
  artifactType?: PluginArtifactType
  homepage?: string | null
  isOfficial?: boolean
  badges?: string[]
  author?: DashboardPluginAuthor | null
  readmeMarkdown?: string
  iconKey?: string | null
  iconUrl?: string | null
  status?: PluginStatus
}

interface UpdatePluginInput extends Partial<CreatePluginInput> {
  ownerOrgId?: string | null
}

interface PublishVersionInput {
  pluginId: string
  channel: PluginChannel
  version: string
  changelog: string
  packageFile: File
  publisherSignature: unknown
  publisherPublicKey: string
  publisherKeyValidFrom: string
  publisherKeyValidUntil?: string
  createdBy: string
  canModerate?: boolean
  homepage?: string | null
  iconFile?: File
}

interface ReeditVersionInput {
  pluginId: string
  versionId: string
  packageFile: File
  publisherSignature: unknown
  publisherPublicKey: string
  publisherKeyValidFrom: string
  publisherKeyValidUntil?: string
  changelog: string
  updatedBy: string
  canModerate?: boolean
}

function sanitizeSerializable(value: unknown): unknown {
  if (value == null)
    return value

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))
    return (value as Buffer).toJSON()

  if (ArrayBuffer.isView(value)) {
    const view = value as { buffer: ArrayBuffer, byteOffset: number, byteLength: number }
    return Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
  }

  if (value instanceof ArrayBuffer)
    return Array.from(new Uint8Array(value))

  if (Array.isArray(value))
    return value.map(item => sanitizeSerializable(item))

  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value)
    if (proto === null || proto === Object.prototype) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, sanitizeSerializable(nested)]),
      )
    }
  }

  return value
}

function sanitizeManifest(manifest: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!manifest)
    return null

  const sanitized = sanitizeSerializable(manifest)
  return sanitized && typeof sanitized === 'object'
    ? sanitized as Record<string, unknown>
    : null
}

function sanitizeVersion(version: DashboardPluginVersion): DashboardPluginVersion {
  return {
    ...version,
    manifest: sanitizeManifest(version.manifest ?? undefined),
  }
}

function getD1Database(event?: H3Event | null): D1Database | null {
  if (!event)
    return null

  const bindings = readCloudflareBindings(event)
  const db = bindings?.DB ?? null

  if (db) {
    if (!hasLoggedPluginsDb) {
      hasLoggedPluginsDb = true
    }
  }
  else if (!hasLoggedPluginsFallback) {
    console.warn('[pluginsStore] 未检测到 D1 绑定，插件数据仅存储在内存中。')
    hasLoggedPluginsFallback = true
  }

  return db
}

async function ensurePluginSchema(db: D1Database) {
  if (schemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${PLUGINS_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      owner_org_id TEXT,
      name TEXT NOT NULL,
      summary TEXT NOT NULL,
      category TEXT NOT NULL,
      artifact_type TEXT NOT NULL DEFAULT 'plugin',
      installs INTEGER NOT NULL DEFAULT 0,
      homepage TEXT,
      icon TEXT,
      image_url TEXT,
      last_updated TEXT,
      version TEXT,
      is_official INTEGER NOT NULL DEFAULT 0,
      badges TEXT NOT NULL,
      author TEXT,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      readme_markdown TEXT,
      icon_key TEXT,
      icon_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      latest_version_id TEXT
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${PLUGIN_VERSIONS_TABLE} (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      channel TEXT NOT NULL,
      version TEXT NOT NULL,
      signature TEXT NOT NULL,
      artifact_sha256 TEXT,
      publisher_signature TEXT,
      publisher_key TEXT,
      publisher_key_id TEXT,
      publisher_verified_at TEXT,
      nexus_attestation TEXT,
      admission_status TEXT NOT NULL DEFAULT 'pending',
      policy_decision TEXT NOT NULL DEFAULT 'not-evaluated',
      artifact_state TEXT NOT NULL DEFAULT 'available',
      revoked_at TEXT,
      eligibility_revision INTEGER NOT NULL DEFAULT 0,
      eligibility_evaluated_at TEXT,
      eligibility_reasons TEXT,
      package_key TEXT NOT NULL,
      package_url TEXT NOT NULL,
      package_size INTEGER NOT NULL,
      icon_key TEXT NOT NULL,
      icon_url TEXT NOT NULL,
      readme_markdown TEXT,
      manifest TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TEXT,
      reject_reason TEXT,
      security_scan_decision TEXT,
      security_scan_report_digest TEXT,
      security_scanner_version TEXT,
      security_rule_set_version TEXT,
      security_scan_finding_count INTEGER,
      security_scan_completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${PLUGIN_TIMELINE_TABLE} (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      version_id TEXT,
      event_type TEXT NOT NULL,
      actor_id TEXT,
      actor_role TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      reason TEXT,
      meta TEXT,
      created_at TEXT NOT NULL
    );
  `).run()

  // Add missing columns for backward compatibility
  const pluginColumns = await db.prepare(`PRAGMA table_info(${PLUGINS_TABLE});`).all<{ name: string }>()
  const columnNames = new Set((pluginColumns.results ?? []).map(col => col.name))

  const addColumnIfMissing = async (column: string, ddl: string) => {
    if (!columnNames.has(column)) {
      await db.prepare(`ALTER TABLE ${PLUGINS_TABLE} ADD COLUMN ${ddl};`).run()
    }
  }

  // Ensure all columns exist for backward compatibility
  await addColumnIfMissing('user_id', 'user_id TEXT')
  await addColumnIfMissing('owner_org_id', 'owner_org_id TEXT')
  await addColumnIfMissing('name', 'name TEXT')
  await addColumnIfMissing('summary', 'summary TEXT')
  await addColumnIfMissing('category', 'category TEXT')
  await addColumnIfMissing('artifact_type', 'artifact_type TEXT DEFAULT \'plugin\'')
  await addColumnIfMissing('installs', 'installs INTEGER DEFAULT 0')
  await addColumnIfMissing('homepage', 'homepage TEXT')
  await addColumnIfMissing('icon', 'icon TEXT')
  await addColumnIfMissing('image_url', 'image_url TEXT')
  await addColumnIfMissing('last_updated', 'last_updated TEXT')
  await addColumnIfMissing('version', 'version TEXT')
  await addColumnIfMissing('is_official', 'is_official INTEGER DEFAULT 0')
  await addColumnIfMissing('badges', 'badges TEXT')
  await addColumnIfMissing('author', 'author TEXT')
  await addColumnIfMissing('slug', 'slug TEXT')
  await addColumnIfMissing('status', 'status TEXT DEFAULT \'draft\'')
  await addColumnIfMissing('readme_markdown', 'readme_markdown TEXT')
  await addColumnIfMissing('icon_key', 'icon_key TEXT')
  await addColumnIfMissing('icon_url', 'icon_url TEXT')
  await addColumnIfMissing('created_at', 'created_at TEXT')
  await addColumnIfMissing('updated_at', 'updated_at TEXT')
  await addColumnIfMissing('latest_version_id', 'latest_version_id TEXT')

  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${PLUGINS_TABLE}_slug ON ${PLUGINS_TABLE}(slug);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_${PLUGINS_TABLE}_store_status_created ON ${PLUGINS_TABLE}(status, created_at DESC);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_${PLUGINS_TABLE}_store_status_category_created ON ${PLUGINS_TABLE}(status, category, created_at DESC);`).run()

  const versionColumns = await db.prepare(`PRAGMA table_info(${PLUGIN_VERSIONS_TABLE});`).all<{ name: string }>()
  const versionColumnNames = new Set((versionColumns.results ?? []).map(col => col.name))

  const addVersionColumnIfMissing = async (column: string, ddl: string) => {
    if (!versionColumnNames.has(column))
      await db.prepare(`ALTER TABLE ${PLUGIN_VERSIONS_TABLE} ADD COLUMN ${ddl};`).run()
  }

  await addVersionColumnIfMissing('notes', 'notes TEXT')
  await addVersionColumnIfMissing('status', 'status TEXT NOT NULL DEFAULT \'pending\'')
  await addVersionColumnIfMissing('reviewed_at', 'reviewed_at TEXT')
  await addVersionColumnIfMissing('reject_reason', 'reject_reason TEXT')
  await addVersionColumnIfMissing('artifact_sha256', 'artifact_sha256 TEXT')
  await addVersionColumnIfMissing('publisher_signature', 'publisher_signature TEXT')
  await addVersionColumnIfMissing('publisher_key', 'publisher_key TEXT')
  await addVersionColumnIfMissing('publisher_key_id', 'publisher_key_id TEXT')
  await addVersionColumnIfMissing('publisher_verified_at', 'publisher_verified_at TEXT')
  await addVersionColumnIfMissing('nexus_attestation', 'nexus_attestation TEXT')
  await addVersionColumnIfMissing('admission_status', 'admission_status TEXT NOT NULL DEFAULT \'pending\'')
  await addVersionColumnIfMissing('policy_decision', 'policy_decision TEXT NOT NULL DEFAULT \'not-evaluated\'')
  await addVersionColumnIfMissing('artifact_state', 'artifact_state TEXT NOT NULL DEFAULT \'available\'')
  await addVersionColumnIfMissing('revoked_at', 'revoked_at TEXT')
  await addVersionColumnIfMissing('eligibility_revision', 'eligibility_revision INTEGER NOT NULL DEFAULT 0')
  await addVersionColumnIfMissing('eligibility_evaluated_at', 'eligibility_evaluated_at TEXT')
  await addVersionColumnIfMissing('eligibility_reasons', 'eligibility_reasons TEXT')
  await addVersionColumnIfMissing('security_scan_decision', 'security_scan_decision TEXT')
  await addVersionColumnIfMissing('security_scan_report_digest', 'security_scan_report_digest TEXT')
  await addVersionColumnIfMissing('security_scanner_version', 'security_scanner_version TEXT')
  await addVersionColumnIfMissing('security_rule_set_version', 'security_rule_set_version TEXT')
  await addVersionColumnIfMissing('security_scan_finding_count', 'security_scan_finding_count INTEGER')
  await addVersionColumnIfMissing('security_scan_completed_at', 'security_scan_completed_at TEXT')

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_${PLUGIN_VERSIONS_TABLE}_store_plugin_status_created ON ${PLUGIN_VERSIONS_TABLE}(plugin_id, status, created_at DESC);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_${PLUGIN_VERSIONS_TABLE}_publisher_key ON ${PLUGIN_VERSIONS_TABLE}(publisher_key_id, admission_status);`).run()

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_${PLUGIN_TIMELINE_TABLE}_plugin_created ON ${PLUGIN_TIMELINE_TABLE}(plugin_id, created_at DESC);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_${PLUGIN_TIMELINE_TABLE}_version_created ON ${PLUGIN_TIMELINE_TABLE}(version_id, created_at DESC);`).run()

  schemaInitialized = true
}

function parseJsonArray(value: string | null): string[] {
  if (!value)
    return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(item => String(item)) : []
  }
  catch {
    return []
  }
}

function normalizeArtifactType(value: unknown): PluginArtifactType {
  return value === 'layout' || value === 'theme' ? value : 'plugin'
}

function parseJsonObject<T>(value: string | null): T | null {
  if (!value)
    return null

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as T) : null
  }
  catch {
    return null
  }
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  if (typeof createHash === 'function') {
    try {
      return createHash('sha256').update(data).digest('hex')
    }
    catch {
      // fall through to WebCrypto
    }
  }

  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw createError({
      statusCode: 500,
      statusMessage: 'SHA-256 is not supported in this runtime.',
    })
  }

  if (!hasLoggedShaFallback) {
    console.warn('[pluginsStore] node crypto unavailable, falling back to WebCrypto SHA-256.')
    hasLoggedShaFallback = true
  }

  const safeData = new Uint8Array(data)
  const digest = await subtle.digest('SHA-256', safeData)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function mapPluginRow(row: D1PluginRow): DashboardPlugin {
  return {
    id: row.id,
    userId: row.user_id,
    ownerOrgId: row.owner_org_id,
    slug: row.slug ?? row.id,
    name: row.name,
    summary: row.summary,
    category: row.category,
    artifactType: normalizeArtifactType(row.artifact_type),
    installs: Number(row.installs ?? 0),
    homepage: row.homepage,
    isOfficial: Boolean(row.is_official),
    badges: parseJsonArray(row.badges),
    author: parseJsonObject<DashboardPluginAuthor>(row.author),
    status: (row.status as PluginStatus) || 'draft',
    readmeMarkdown: row.readme_markdown,
    iconKey: row.icon_key ?? row.icon ?? null,
    iconUrl: row.icon_url ?? row.image_url ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestVersionId: row.latest_version_id,
  }
}

function mapPluginVersionRow(row: D1PluginVersionRow): DashboardPluginVersion {
  const admissionStatus = row.admission_status === 'eligible' || row.admission_status === 'pending'
    ? row.admission_status
    : 'blocked'
  return sanitizeVersion({
    id: row.id,
    pluginId: row.plugin_id,
    createdBy: row.created_by,
    channel: row.channel as PluginChannel,
    version: row.version,
    artifactSha256: row.artifact_sha256 ?? row.signature ?? '',
    publisherSignature: parseJsonObject<PluginPublisherSignatureV1>(row.publisher_signature ?? null) ?? null,
    publisherKey: parseJsonObject<PublisherSigningKeyRecord>(row.publisher_key ?? null) ?? null,
    publisherVerifiedAt: row.publisher_verified_at ?? null,
    nexusAttestation: parseJsonObject<PluginAdmissionAttestationV1>(row.nexus_attestation ?? null) ?? null,
    admissionStatus,
    policyDecision: row.policy_decision === 'passed' || row.policy_decision === 'failed' || row.policy_decision === 'unavailable'
      ? row.policy_decision
      : 'not-evaluated',
    artifactState: row.artifact_state === 'missing' || row.artifact_state === 'quarantined'
      ? row.artifact_state
      : 'available',
    revokedAt: row.revoked_at ?? null,
    eligibilityRevision: Number(row.eligibility_revision ?? 0),
    eligibilityEvaluatedAt: row.eligibility_evaluated_at ?? null,
    eligibilityReasons: parseJsonArray(row.eligibility_reasons ?? null) as PluginReleaseEligibilityReason[],
    packageKey: row.package_key,
    packageUrl: row.package_url,
    packageSize: Number(row.package_size),
    iconKey: row.icon_key,
    iconUrl: row.icon_url,
    readmeMarkdown: row.readme_markdown,
    manifest: parseJsonObject<Record<string, unknown>>(row.manifest),
    changelog: row.notes,
    status: (row.status as PluginVersionStatus) || 'pending',
    reviewedAt: row.reviewed_at,
    rejectReason: row.reject_reason,
    securityScanDecision: row.security_scan_decision as PluginSecurityScanDecision | null | undefined,
    securityScanReportDigest: row.security_scan_report_digest ?? null,
    securityScannerVersion: row.security_scanner_version ?? null,
    securityRuleSetVersion: row.security_rule_set_version ?? null,
    securityScanFindingCount: row.security_scan_finding_count == null
      ? null
      : Number(row.security_scan_finding_count),
    securityScanCompletedAt: row.security_scan_completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function mapPluginTimelineRow(row: D1PluginTimelineRow): PluginTimelineEvent {
  return {
    id: row.id,
    pluginId: row.plugin_id,
    versionId: row.version_id ?? null,
    eventType: row.event_type,
    actorId: row.actor_id ?? null,
    actorRole: row.actor_role,
    fromStatus: row.from_status ?? null,
    toStatus: row.to_status ?? null,
    reason: row.reason ?? null,
    meta: parseJsonObject<Record<string, unknown>>(row.meta),
    createdAt: row.created_at,
  }
}

function sanitizeBadges(badges?: string[]): string[] {
  return (badges ?? [])
    .map(badge => badge.trim())
    .filter(Boolean)
}

function validatePluginInput(input: CreatePluginInput, forUpdate = false) {
  if (!forUpdate) {
    if (!input.slug || typeof input.slug !== 'string')
      throw createError({ statusCode: 400, statusMessage: 'Plugin identifier is required.' })
    if (!input.name || typeof input.name !== 'string')
      throw createError({ statusCode: 400, statusMessage: 'Plugin name is required.' })
    if (!input.summary || typeof input.summary !== 'string')
      throw createError({ statusCode: 400, statusMessage: 'Plugin summary is required.' })
    if (!input.category || typeof input.category !== 'string' || !isPluginCategoryId(input.category))
      throw createError({ statusCode: 400, statusMessage: 'Plugin category is invalid.' })
    if (!input.readmeMarkdown || typeof input.readmeMarkdown !== 'string' || !input.readmeMarkdown.trim())
      throw createError({ statusCode: 400, statusMessage: 'Plugin README is required.' })
  }
  else {
    if (input.category && !isPluginCategoryId(input.category))
      throw createError({ statusCode: 400, statusMessage: 'Plugin category is invalid.' })
    if (input.readmeMarkdown !== undefined && input.readmeMarkdown !== null && !input.readmeMarkdown.trim())
      throw createError({ statusCode: 400, statusMessage: 'Plugin README cannot be empty.' })
  }

  const allowedArtifactTypes: PluginArtifactType[] = ['plugin', 'layout', 'theme']
  if (input.artifactType && !allowedArtifactTypes.includes(input.artifactType))
    throw createError({ statusCode: 400, statusMessage: 'Publish type is invalid.' })

  if (input.slug) {
    const normalized = input.slug.trim()
    const slugPattern = /^[a-z0-9][a-z0-9\-_.]{1,62}[a-z0-9]$/
    if (!slugPattern.test(normalized))
      throw createError({ statusCode: 400, statusMessage: 'Plugin identifier must be 3-64 characters, lowercase, and may include numbers, dashes, underscores, or dots.' })
    input.slug = normalized
  }

  if (input.status) {
    const allowedStatuses: PluginStatus[] = ['draft', 'pending', 'approved', 'rejected']
    if (!allowedStatuses.includes(input.status))
      throw createError({ statusCode: 400, statusMessage: 'Plugin status is invalid.' })
  }

  if (input.homepage) {
    try {
      const url = new URL(input.homepage)
      if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('Invalid protocol')
    }
    catch {
      throw createError({ statusCode: 400, statusMessage: 'Plugin homepage must be a valid URL.' })
    }
  }
}

function validateChannel(channel: string): asserts channel is PluginChannel {
  const allowed: PluginChannel[] = ['SNAPSHOT', 'BETA', 'RELEASE']
  if (!allowed.includes(channel as PluginChannel))
    throw createError({ statusCode: 400, statusMessage: 'Invalid plugin channel.' })
}

/**
 * Validate semantic version format (e.g., 1.0.0, 2.1.3-beta, 1.0.0-rc.1)
 * @param version - Version string to validate
 * @returns true if version follows semver format, false otherwise
 */
function validateSemanticVersion(version: string): boolean {
  // Standard semver pattern: major.minor.patch with optional pre-release and build metadata
  const semverPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*))*)?(?:\+[0-9a-z-]+(?:\.[0-9a-z-]+)*)?$/i
  return semverPattern.test(version)
}

/**
 * Compare two semantic versions
 * @param v1 - First version string
 * @param v2 - Second version string
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const parse = (value: string) => {
    const withoutBuild = value.split('+', 1)[0] ?? value
    const prereleaseIndex = withoutBuild.indexOf('-')
    const core = prereleaseIndex === -1 ? withoutBuild : withoutBuild.slice(0, prereleaseIndex)
    const prerelease = prereleaseIndex === -1
      ? []
      : withoutBuild.slice(prereleaseIndex + 1).split('.')
    return { core: core.split('.'), prerelease }
  }
  const compareNumeric = (left: string, right: string): number => {
    if (left.length !== right.length)
      return left.length > right.length ? 1 : -1
    if (left === right)
      return 0
    return left > right ? 1 : -1
  }

  const left = parse(v1)
  const right = parse(v2)
  for (let index = 0; index < 3; index++) {
    const coreDiff = compareNumeric(left.core[index] ?? '0', right.core[index] ?? '0')
    if (coreDiff !== 0)
      return coreDiff
  }

  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length)
      return 0
    return left.prerelease.length === 0 ? 1 : -1
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index++) {
    const leftPart = left.prerelease[index]
    const rightPart = right.prerelease[index]
    if (leftPart === undefined || rightPart === undefined)
      return leftPart === undefined ? -1 : 1
    if (leftPart === rightPart)
      continue

    const leftNumeric = /^\d+$/.test(leftPart)
    const rightNumeric = /^\d+$/.test(rightPart)
    if (leftNumeric && rightNumeric)
      return compareNumeric(leftPart, rightPart)
    if (leftNumeric !== rightNumeric)
      return leftNumeric ? -1 : 1
    return leftPart > rightPart ? 1 : -1
  }
  return 0
}

async function ensureUniquePluginSlug(event: H3Event | undefined, slug: string, excludeId?: string) {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)
    const existing = await db.prepare(`
      SELECT id
      FROM ${PLUGINS_TABLE}
      WHERE slug = ?1
      LIMIT 1;
    `).bind(slug).first<{ id: string }>()

    if (existing && existing.id !== excludeId)
      throw createError({ statusCode: 400, statusMessage: 'Plugin identifier is already in use.' })
    return
  }

  const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const found = plugins.find(plugin => plugin.slug === slug && plugin.id !== excludeId)
  if (found)
    throw createError({ statusCode: 400, statusMessage: 'Plugin identifier is already in use.' })
}

function resolvePluginPolicyDecision(
  version: DashboardPluginVersion,
): NonNullable<DashboardPluginVersion['policyDecision']> {
  if (version.policyDecision)
    return version.policyDecision
  return version.publisherSignature?.payload.policyVersion ? 'passed' : 'not-evaluated'
}

export function getPluginVersionEligibility(
  plugin: DashboardPlugin,
  version: DashboardPluginVersion,
  audience: PluginReleaseAudience = 'public',
): PluginReleaseEligibility {
  const artifactState = version.artifactState
    ?? (version.packageKey && version.packageUrl && version.packageSize > 0 ? 'available' : 'missing')
  const policyDecision = resolvePluginPolicyDecision(version)
  const publisherTrust = version.revokedAt
    ? 'revoked'
    : version.publisherSignature && version.publisherKey && version.publisherVerifiedAt
      ? 'verified'
      : 'not-evaluated'
  const nexusAttestation = version.nexusAttestation
    ? 'verified'
    : 'not-evaluated'
  return evaluatePluginReleaseEligibility({
    pluginStatus: plugin.status,
    versionStatus: version.status,
    channel: version.channel,
    artifactState,
    policyDecision,
    scanDecision: version.securityScanDecision ?? 'not-evaluated',
    publisherTrust,
    nexusAttestation,
    admissionDecision: version.admissionStatus ?? 'blocked',
    revokedAt: version.revokedAt,
    audience,
  })
}

function versionIsVisible(
  version: DashboardPluginVersion,
  plugin: DashboardPlugin,
  options: PluginVisibilityOptions,
): boolean {
  const viewerIsAdmin = Boolean(options.viewerIsAdmin)
  const isOwner = options.viewerId === plugin.userId

  if (options.forStore)
    return getPluginVersionEligibility(plugin, version, options.audience ?? 'public').eligible

  if (viewerIsAdmin || isOwner)
    return true

  if (version.channel === 'BETA'
    && plugin.ownerOrgId
    && options.viewerOrgIds?.includes(plugin.ownerOrgId)) {
    return getPluginVersionEligibility(plugin, version, 'beta').eligible
  }

  return getPluginVersionEligibility(plugin, version, 'public').eligible
}

function comparePluginVersions(left: DashboardPluginVersion, right: DashboardPluginVersion): number {
  const byChannelPriority = { RELEASE: 3, BETA: 2, SNAPSHOT: 1 } as const
  const channelDiff = byChannelPriority[left.channel] - byChannelPriority[right.channel]
  if (channelDiff !== 0)
    return channelDiff

  const semanticDiff = compareVersions(left.version, right.version)
  if (semanticDiff !== 0)
    return semanticDiff

  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
}

function projectVisibleVersions(
  versions: DashboardPluginVersion[],
  plugin: DashboardPlugin,
  options: PluginVisibilityOptions,
): { versions: DashboardPluginVersion[], latest?: DashboardPluginVersion } {
  const visible: DashboardPluginVersion[] = []
  let latest: DashboardPluginVersion | undefined

  for (const version of versions) {
    if (!versionIsVisible(version, plugin, options))
      continue
    visible.push(version)
    if (!latest || comparePluginVersions(version, latest) > 0)
      latest = version
  }

  return { versions: visible, latest }
}

function selectLatestVisibleVersion(
  versions: DashboardPluginVersion[],
  plugin: DashboardPlugin,
  options: PluginVisibilityOptions,
): DashboardPluginVersion | undefined {
  return projectVisibleVersions(versions, plugin, options).latest
}

function projectPluginVersions(
  plugin: DashboardPlugin,
  versions: DashboardPluginVersion[],
  options: PluginVisibilityOptions,
): DashboardPlugin | null {
  const projection = projectVisibleVersions(versions, plugin, options)
  if (options.forStore && !projection.latest)
    return null

  return {
    ...plugin,
    versions: projection.versions,
    latestVersionId: projection.latest?.id ?? null,
    ...resolvePendingReviewMeta(plugin, versions),
  }
}

function resolvePendingReviewMeta(plugin: DashboardPlugin, versions: DashboardPluginVersion[]) {
  const pendingVersionCount = versions.filter(version => version.status === 'pending').length
  const hasPendingReview = plugin.status === 'pending' || pendingVersionCount > 0
  return {
    hasPendingReview,
    pendingReviewCount: pendingVersionCount,
  }
}

function pluginIsVisible(plugin: DashboardPlugin, options: PluginVisibilityOptions): boolean {
  if (options.statuses && options.statuses.length && !options.statuses.includes(plugin.status))
    return false

  if (options.forStore)
    return plugin.status === 'approved'

  const viewerIsAdmin = Boolean(options.viewerIsAdmin)
  const isOwner = options.viewerId === plugin.userId

  if (viewerIsAdmin || isOwner)
    return true

  if (plugin.status === 'approved')
    return true

  if (plugin.status === 'pending' && plugin.ownerOrgId && options.viewerOrgIds?.includes(plugin.ownerOrgId))
    return true

  return false
}

async function readCollection<T>(key: string): Promise<T[]> {
  const storage = useStorage()
  const items = await storage.getItem<T[]>(key)
  return items ?? []
}

async function writeCollection<T>(key: string, items: T[]) {
  const storage = useStorage()
  await storage.setItem(key, items)
}

async function readStoredPluginVersions(): Promise<DashboardPluginVersion[]> {
  const versions = await readCollection<DashboardPluginVersion>(PLUGIN_VERSIONS_KEY)
  return versions.map(version => sanitizeVersion({
    ...version,
    status: (version.status ?? 'pending') as PluginVersionStatus,
    rejectReason: version.rejectReason ?? null,
  }))
}

async function writeStoredPluginVersions(versions: DashboardPluginVersion[]) {
  await writeCollection(PLUGIN_VERSIONS_KEY, versions.map(sanitizeVersion))
}

async function readStoredPluginTimeline(): Promise<PluginTimelineEvent[]> {
  const events = await readCollection<PluginTimelineEvent>(PLUGIN_TIMELINE_KEY)
  return events
    .map(event => ({
      ...event,
      actorRole: event.actorRole ?? 'system',
      meta: sanitizeManifest(event.meta ?? undefined),
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

async function writeStoredPluginTimeline(events: PluginTimelineEvent[]) {
  const normalized = events.map(event => ({
    ...event,
    actorRole: event.actorRole ?? 'system',
    meta: sanitizeManifest(event.meta ?? undefined),
  }))
  await writeCollection(PLUGIN_TIMELINE_KEY, normalized)
}

async function appendPluginTimelineEvent(event: H3Event, input: AddTimelineEventInput): Promise<PluginTimelineEvent> {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const record: PluginTimelineEvent = {
    id: randomUUID(),
    pluginId: input.pluginId,
    versionId: input.versionId ?? null,
    eventType: input.eventType,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? 'system',
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    reason: input.reason?.trim() || null,
    meta: sanitizeManifest(input.meta ?? undefined),
    createdAt,
  }

  const db = getD1Database(event)
  if (db) {
    await ensurePluginSchema(db)
    await db.prepare(`
      INSERT INTO ${PLUGIN_TIMELINE_TABLE} (
        id,
        plugin_id,
        version_id,
        event_type,
        actor_id,
        actor_role,
        from_status,
        to_status,
        reason,
        meta,
        created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11);
    `).bind(
      record.id,
      record.pluginId,
      record.versionId ?? null,
      record.eventType,
      record.actorId ?? null,
      record.actorRole,
      record.fromStatus ?? null,
      record.toStatus ?? null,
      record.reason ?? null,
      record.meta ? JSON.stringify(record.meta) : null,
      record.createdAt,
    ).run()
    return record
  }

  const events = await readStoredPluginTimeline()
  events.unshift(record)
  await writeStoredPluginTimeline(events)
  return record
}

async function countUserPluginsInDb(db: D1Database, userId: string) {
  const result = await db.prepare(`
    SELECT COUNT(*) as count
    FROM ${PLUGINS_TABLE}
    WHERE user_id = ?1;
  `).bind(userId).first<{ count: number }>()

  return Number(result?.count ?? 0)
}

async function checkUserPluginLimit(event: H3Event, userId: string) {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)
    const count = await countUserPluginsInDb(db, userId)
    if (count >= MAX_PLUGINS_PER_USER) {
      throw createError({
        statusCode: 400,
        statusMessage: `Plugin limit reached (${MAX_PLUGINS_PER_USER}).`,
      })
    }
  }
  else {
    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const count = plugins.filter(plugin => plugin.userId === userId).length
    if (count >= MAX_PLUGINS_PER_USER) {
      throw createError({
        statusCode: 400,
        statusMessage: `Plugin limit reached (${MAX_PLUGINS_PER_USER}).`,
      })
    }
  }
}

async function ensureSubmissionCooldown(event: H3Event, userId: string) {
  const db = getD1Database(event)
  const now = Date.now()

  if (db) {
    await ensurePluginSchema(db)

    const row = await db.prepare(`
      SELECT created_at
      FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE created_by = ?1
      ORDER BY datetime(created_at) DESC
      LIMIT 1;
    `).bind(userId).first<{ created_at: string }>()

    if (row) {
      const last = new Date(row.created_at).getTime()
      if (!Number.isNaN(last) && now - last < SUBMISSION_COOLDOWN_MS) {
        throw createError({
          statusCode: 429,
          statusMessage: 'You are submitting too frequently. Please wait before publishing again.',
        })
      }
    }
  }
  else {
    const versions = await readStoredPluginVersions()
    const latest = versions
      .filter(version => version.createdBy === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

    if (latest) {
      const last = new Date(latest.createdAt).getTime()
      if (!Number.isNaN(last) && now - last < SUBMISSION_COOLDOWN_MS) {
        throw createError({
          statusCode: 429,
          statusMessage: 'You are submitting too frequently. Please wait before publishing again.',
        })
      }
    }
  }
}

export async function listPlugins(event: H3Event | undefined, options: PluginVisibilityOptions = {}): Promise<DashboardPlugin[]> {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    let query = `
      SELECT
        id,
        user_id,
        owner_org_id,
        slug,
        name,
        summary,
        category,
        artifact_type,
        installs,
        homepage,
        is_official,
        badges,
        author,
        status,
        readme_markdown,
        icon,
        icon_key,
        icon_url,
        image_url,
        last_updated,
        version,
        created_at,
        updated_at,
        latest_version_id
      FROM ${PLUGINS_TABLE}`

    const bindings: unknown[] = []

    if (options.ownerId) {
      query += ` WHERE user_id = ?1`
      bindings.push(options.ownerId)
    }

    query += ` ORDER BY datetime(created_at) DESC;`

    const stmt = db.prepare(query)
    const { results } = bindings.length
      ? await stmt.bind(...bindings).all<D1PluginRow>()
      : await stmt.all<D1PluginRow>()

    const plugins = (results ?? []).map(mapPluginRow)
    const visiblePlugins = plugins.filter(plugin => pluginIsVisible(plugin, options))

    if ((!options.includeVersions && !options.forStore) || !visiblePlugins.length)
      return visiblePlugins

    const ids = visiblePlugins.map(plugin => plugin.id)
    const placeholders = ids.map((_, idx) => `?${idx + 1}`).join(', ')

    const versionsQuery = `
      SELECT *
      FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE plugin_id IN (${placeholders})
      ORDER BY datetime(created_at) DESC;
    `

    const versionResults = await db.prepare(versionsQuery).bind(...ids).all<D1PluginVersionRow>()
    const versions = (versionResults.results ?? []).map(mapPluginVersionRow)

    const byPlugin = new Map<string, DashboardPluginVersion[]>()
    for (const version of versions) {
      if (!byPlugin.has(version.pluginId))
        byPlugin.set(version.pluginId, [])
      byPlugin.get(version.pluginId)!.push(version)
    }

    return visiblePlugins
      .map(plugin => projectPluginVersions(plugin, byPlugin.get(plugin.id) ?? [], options))
      .filter((plugin): plugin is DashboardPlugin => Boolean(plugin))
  }

  const storedPlugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const normalized = storedPlugins.map(plugin => ({
    ...plugin,
    badges: Array.isArray(plugin.badges) ? plugin.badges : [],
    author: plugin.author ?? null,
    slug: plugin.slug ?? plugin.id,
    artifactType: normalizeArtifactType(plugin.artifactType),
    status: (plugin.status ?? 'draft') as PluginStatus,
  }))

  const plugins = normalized
    .filter(plugin => (options.ownerId ? plugin.userId === options.ownerId : true))
    .filter(plugin => pluginIsVisible(plugin, options))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  if (!options.includeVersions && !options.forStore)
    return plugins

  const storedVersions = await readStoredPluginVersions()
  const byPlugin = new Map<string, DashboardPluginVersion[]>()

  for (const version of storedVersions) {
    if (!byPlugin.has(version.pluginId))
      byPlugin.set(version.pluginId, [])
    byPlugin.get(version.pluginId)!.push(version)
  }

  return plugins
    .map((plugin) => {
      const pluginVersions = (byPlugin.get(plugin.id) ?? [])
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      return projectPluginVersions(plugin, pluginVersions, options)
    })
    .filter((plugin): plugin is DashboardPlugin => Boolean(plugin))
}

export async function searchStorePlugins(
  event: H3Event | undefined,
  options: StorePluginSearchOptions = {},
): Promise<StorePluginSearchResult> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 50), 1), 100)
  const offset = Math.max(Math.floor(options.offset ?? 0), 0)
  const keyword = options.keyword?.trim().toLowerCase() ?? ''
  const category = options.category?.trim() ?? ''
  const plugins = await listPlugins(event, {
    includeVersions: true,
    forStore: true,
    audience: options.audience,
  })

  const filtered = plugins
    .map((plugin) => {
      const versions = plugin.versions ?? []
      const latestVersion = versions.find(version => version.id === plugin.latestVersionId)
      if (!latestVersion)
        return null
      return {
        ...plugin,
        latestVersion,
        latestVersionId: latestVersion.id,
        versions,
      }
    })
    .filter((plugin): plugin is StorePluginSearchPlugin => Boolean(plugin))
    .filter((plugin) => {
      if (category && plugin.category !== category)
        return false
      if (!keyword)
        return true
      const haystack = [
        plugin.name,
        plugin.slug,
        plugin.summary,
        plugin.author?.name ?? '',
      ].join('\n').toLowerCase()
      return haystack.includes(keyword)
    })

  return {
    plugins: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit,
    offset,
  }
}

export async function listStorePlugins(
  event: H3Event | undefined,
  options: StorePluginListOptions = {},
): Promise<StorePluginListResult> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 100), 1), 100)
  const offset = Math.max(Math.floor(options.offset ?? 0), 0)
  return searchStorePlugins(event, { limit, offset, audience: options.audience })
}

export async function getPluginById(event: H3Event | undefined, id: string, options: PluginVisibilityOptions = {}) {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)
    const row = await db.prepare(`
      SELECT *
      FROM ${PLUGINS_TABLE}
      WHERE id = ?1;
    `).bind(id).first<D1PluginRow>()

    if (!row)
      return null

    const plugin = mapPluginRow(row)
    if (options.forStore && !pluginIsVisible(plugin, options))
      return null
    if (!options.includeVersions && !options.forStore)
      return plugin

    const versionResults = await db.prepare(`
      SELECT *
      FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE plugin_id = ?1
      ORDER BY datetime(created_at) DESC;
    `).bind(id).all<D1PluginVersionRow>()
    const versions = (versionResults.results ?? []).map(mapPluginVersionRow)
    return projectPluginVersions(plugin, versions, options)
  }

  const storedPlugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const storedPlugin = storedPlugins.find(item => item.id === id)
  if (!storedPlugin)
    return null

  const plugin: DashboardPlugin = {
    ...storedPlugin,
    badges: Array.isArray(storedPlugin.badges) ? storedPlugin.badges : [],
    author: storedPlugin.author ?? null,
    artifactType: normalizeArtifactType(storedPlugin.artifactType),
    slug: storedPlugin.slug ?? storedPlugin.id,
    status: (storedPlugin.status ?? 'draft') as PluginStatus,
  }
  if (options.forStore && !pluginIsVisible(plugin, options))
    return null
  if (!options.includeVersions && !options.forStore)
    return plugin

  const versions = await readStoredPluginVersions()
  const pluginVersions = versions
    .filter(version => version.pluginId === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return projectPluginVersions(plugin, pluginVersions, options)
}

export async function getPluginBySlug(event: H3Event | undefined, slug: string, options: PluginVisibilityOptions = {}) {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)
    const row = await db.prepare(`
      SELECT id
      FROM ${PLUGINS_TABLE}
      WHERE slug = ?1
      LIMIT 1;
    `).bind(slug).first<{ id: string }>()

    if (!row)
      return null

    return getPluginById(event, row.id, options)
  }

  const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const match = plugins.find(plugin => (plugin.slug ?? plugin.id) === slug)
  if (!match)
    return null

  return getPluginById(event, match.id, options)
}

export async function createPlugin(event: H3Event, input: CreatePluginInput & { userId: string, ownerOrgId?: string | null }) {
  validatePluginInput(input)
  await ensureUniquePluginSlug(event, input.slug)
  await checkUserPluginLimit(event, input.userId)

  const now = new Date().toISOString()
  const status: PluginStatus = input.status ?? 'draft'

  const plugin: DashboardPlugin = {
    id: randomUUID(),
    userId: input.userId,
    ownerOrgId: input.ownerOrgId ?? null,
    slug: input.slug,
    name: input.name,
    summary: input.summary,
    category: input.category,
    artifactType: input.artifactType ?? 'plugin',
    installs: 0,
    homepage: input.homepage ?? null,
    isOfficial: Boolean(input.isOfficial),
    badges: sanitizeBadges(input.badges),
    author: input.author ?? null,
    status,
    readmeMarkdown: input.readmeMarkdown ?? '',
    iconKey: input.iconKey ?? null,
    iconUrl: input.iconUrl ?? null,
    createdAt: now,
    updatedAt: now,
    latestVersionId: null,
  }

  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    await db.prepare(`
      INSERT INTO ${PLUGINS_TABLE} (
        id,
        user_id,
        owner_org_id,
        name,
        summary,
        category,
        artifact_type,
        installs,
        homepage,
        icon,
        image_url,
        last_updated,
        version,
        is_official,
        badges,
        author,
        slug,
        status,
        readme_markdown,
        icon_key,
        icon_url,
        created_at,
        updated_at,
        latest_version_id
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?21, ?7, ?8, ?9, ?10, ?19, '', ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, NULL);
    `).bind(
      plugin.id,
      plugin.userId,
      plugin.ownerOrgId ?? null,
      plugin.name,
      plugin.summary,
      plugin.category,
      plugin.installs,
      plugin.homepage ?? null,
      plugin.iconKey ?? null,
      plugin.iconUrl ?? null,
      plugin.isOfficial ? 1 : 0,
      JSON.stringify(plugin.badges),
      plugin.author ? JSON.stringify(plugin.author) : null,
      plugin.slug,
      plugin.status,
      plugin.readmeMarkdown ?? null,
      plugin.iconKey ?? null,
      plugin.iconUrl ?? null,
      plugin.createdAt,
      plugin.updatedAt,
      plugin.artifactType,
    ).run()

    await appendPluginTimelineEvent(event, {
      pluginId: plugin.id,
      eventType: 'plugin.created',
      actorId: plugin.userId,
      actorRole: 'owner',
      meta: {
        slug: plugin.slug,
        artifactType: plugin.artifactType,
      },
      createdAt: plugin.createdAt,
    })

    return plugin
  }

  const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  plugins.unshift(plugin)
  await writeCollection(PLUGINS_KEY, plugins)

  await appendPluginTimelineEvent(event, {
    pluginId: plugin.id,
    eventType: 'plugin.created',
    actorId: plugin.userId,
    actorRole: 'owner',
    meta: {
      slug: plugin.slug,
      artifactType: plugin.artifactType,
    },
    createdAt: plugin.createdAt,
  })

  return plugin
}

export async function updatePlugin(event: H3Event, id: string, input: UpdatePluginInput) {
  const existing = await getPluginById(event, id)

  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  if (input.slug && input.slug !== existing.slug)
    throw createError({ statusCode: 400, statusMessage: 'Plugin identifier cannot be changed once created.' })

  const merged: CreatePluginInput & { userId: string, ownerOrgId?: string | null, slug: string } = {
    userId: existing.userId,
    ownerOrgId: input.ownerOrgId ?? existing.ownerOrgId ?? null,
    slug: existing.slug,
    name: input.name ?? existing.name,
    summary: input.summary ?? existing.summary,
    category: input.category ?? existing.category,
    artifactType: input.artifactType ?? existing.artifactType,
    homepage: input.homepage ?? existing.homepage ?? null,
    isOfficial: input.isOfficial ?? existing.isOfficial,
    badges: input.badges ?? existing.badges,
    author: input.author ?? existing.author ?? null,
    readmeMarkdown: input.readmeMarkdown ?? existing.readmeMarkdown ?? '',
    iconKey: input.iconKey === undefined ? existing.iconKey ?? null : input.iconKey,
    iconUrl: input.iconUrl === undefined ? existing.iconUrl ?? null : input.iconUrl,
    status: input.status ?? existing.status,
  }

  validatePluginInput(merged, true)

  const updated: DashboardPlugin = {
    ...existing,
    ...merged,
    badges: sanitizeBadges(merged.badges),
    readmeMarkdown: merged.readmeMarkdown ?? '',
    iconKey: merged.iconKey ?? null,
    iconUrl: merged.iconUrl ?? null,
    status: merged.status ?? existing.status,
    updatedAt: new Date().toISOString(),
  }

  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)
    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET
        name = ?1,
        summary = ?2,
        category = ?3,
        artifact_type = ?17,
        homepage = ?4,
        is_official = ?5,
        badges = ?6,
        author = ?7,
        owner_org_id = ?8,
        status = ?9,
        readme_markdown = ?10,
        icon = ?11,
        image_url = ?12,
        icon_key = ?13,
        icon_url = ?14,
        updated_at = ?15
      WHERE id = ?16;
    `).bind(
      updated.name,
      updated.summary,
      updated.category,
      updated.homepage ?? null,
      updated.isOfficial ? 1 : 0,
      JSON.stringify(updated.badges),
      updated.author ? JSON.stringify(updated.author) : null,
      updated.ownerOrgId ?? null,
      updated.status,
      updated.readmeMarkdown ?? null,
      updated.iconKey ?? null,
      updated.iconUrl ?? null,
      updated.iconKey ?? null,
      updated.iconUrl ?? null,
      updated.updatedAt,
      updated.id,
      updated.artifactType,
    ).run()

    if (existing.iconKey && existing.iconKey !== updated.iconKey)
      await deleteImage(event, existing.iconKey)

    return updated
  }

  const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const index = plugins.findIndex(plugin => plugin.id === id)

  if (index === -1)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  plugins[index] = updated
  await writeCollection(PLUGINS_KEY, plugins)

  if (existing.iconKey && existing.iconKey !== updated.iconKey)
    await deleteImage(event, existing.iconKey)

  return updated
}

/**
 * Update plugin icon (used when auto-extracting icon from tpex package)
 */
async function updatePluginIcon(event: H3Event, pluginId: string, iconKey: string, iconUrl: string) {
  const db = getD1Database(event)
  const now = new Date().toISOString()

  if (db) {
    await ensurePluginSchema(db)

    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET
        icon_key = ?1,
        icon_url = ?2,
        updated_at = ?3
      WHERE id = ?4;
    `).bind(iconKey, iconUrl, now, pluginId).run()
  }
  else {
    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const index = plugins.findIndex(item => item.id === pluginId)
    if (index !== -1) {
      const existing = plugins[index]
      if (!existing)
        return
      plugins[index] = {
        ...existing,
        iconKey,
        iconUrl,
        updatedAt: now,
      }
      await writeCollection(PLUGINS_KEY, plugins)
    }
  }
}

export async function deletePlugin(event: H3Event, id: string) {
  const plugin = await getPluginById(event, id, { includeVersions: true })

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    const versionRows = await db.prepare(`
      SELECT *
      FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE plugin_id = ?1;
    `).bind(id).all<D1PluginVersionRow>()

    const versions = (versionRows.results ?? []).map(mapPluginVersionRow)

    for (const version of versions) {
      await deletePluginPackage(event, version.packageKey, {
        governanceResourceId: buildPluginPackageGovernanceResourceId(version),
      })
      await deleteImage(event, version.iconKey)
    }

    await db.prepare(`
      DELETE FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE plugin_id = ?1;
    `).bind(id).run()

    await db.prepare(`
      DELETE FROM ${PLUGIN_TIMELINE_TABLE}
      WHERE plugin_id = ?1;
    `).bind(id).run()

    await db.prepare(`
      DELETE FROM ${PLUGINS_TABLE}
      WHERE id = ?1;
    `).bind(id).run()
    if (plugin.iconKey)
      await deleteImage(event, plugin.iconKey)
  }
  else {
    const versions = await readStoredPluginVersions()
    const remainingVersions = versions.filter(version => version.pluginId !== id)

    const orphaned = versions.filter(version => version.pluginId === id)
    for (const version of orphaned) {
      await deletePluginPackage(event, version.packageKey, {
        governanceResourceId: buildPluginPackageGovernanceResourceId(version),
      })
      await deleteImage(event, version.iconKey)
    }

    await writeStoredPluginVersions(remainingVersions)
    const timeline = await readStoredPluginTimeline()
    await writeStoredPluginTimeline(timeline.filter(item => item.pluginId !== id))

    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const pluginToDelete = plugins.find(item => item.id === id)
    await writeCollection(
      PLUGINS_KEY,
      plugins.filter(item => item.id !== id),
    )
    if (pluginToDelete?.iconKey)
      await deleteImage(event, pluginToDelete.iconKey)
  }

  return plugin
}

export async function setPluginStatus(
  event: H3Event,
  id: string,
  status: PluginStatus,
  options: {
    actorId?: string | null
    actorRole?: PluginTimelineActorRole
    reason?: string | null
  } = {},
) {
  const plugin = await getPluginById(event, id)
  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })
  if (plugin.status === status)
    return plugin

  const now = new Date().toISOString()
  const updatedPlugin: DashboardPlugin = {
    ...plugin,
    status,
    updatedAt: now,
  }
  const db = getD1Database(event)
  let versions: DashboardPluginVersion[]

  if (db) {
    await ensurePluginSchema(db)
    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET status = ?1, updated_at = ?2
      WHERE id = ?3;
    `).bind(status, now, id).run()

    const rows = await db.prepare(`
      SELECT *
      FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE plugin_id = ?1;
    `).bind(id).all<D1PluginVersionRow>()
    versions = (rows.results ?? []).map(mapPluginVersionRow)
    for (const version of versions) {
      version.eligibilityRevision = (version.eligibilityRevision ?? 0) + 1
      version.eligibilityEvaluatedAt = now
      version.eligibilityReasons = [...getPluginVersionEligibility(updatedPlugin, version, 'public').reasons]
      await db.prepare(`
        UPDATE ${PLUGIN_VERSIONS_TABLE}
        SET eligibility_revision = ?1, eligibility_evaluated_at = ?2, eligibility_reasons = ?3
        WHERE id = ?4;
      `).bind(
        version.eligibilityRevision,
        version.eligibilityEvaluatedAt,
        JSON.stringify(version.eligibilityReasons),
        version.id,
      ).run()
    }
  }
  else {
    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const index = plugins.findIndex(item => item.id === id)
    if (index === -1)
      throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

    const storedVersions = await readStoredPluginVersions()
    versions = storedVersions.filter(version => version.pluginId === id)
    for (const version of versions) {
      version.eligibilityRevision = (version.eligibilityRevision ?? 0) + 1
      version.eligibilityEvaluatedAt = now
      version.eligibilityReasons = [...getPluginVersionEligibility(updatedPlugin, version, 'public').reasons]
    }
    await writeStoredPluginVersions(storedVersions)
    plugins[index] = updatedPlugin
    await writeCollection(PLUGINS_KEY, plugins)
  }

  const latest = selectLatestVisibleVersion(versions, updatedPlugin, { forStore: true })
  updatedPlugin.latestVersionId = latest?.id ?? null
  if (db) {
    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET latest_version_id = ?1
      WHERE id = ?2;
    `).bind(updatedPlugin.latestVersionId, id).run()
  }
  else {
    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const index = plugins.findIndex(item => item.id === id)
    if (index !== -1 && plugins[index]) {
      plugins[index] = updatedPlugin
      await writeCollection(PLUGINS_KEY, plugins)
    }
  }

  await appendPluginTimelineEvent(event, {
    pluginId: id,
    eventType: 'plugin.status.changed',
    actorId: options.actorId ?? null,
    actorRole: options.actorRole ?? 'system',
    fromStatus: plugin.status,
    toStatus: status,
    reason: options.reason ?? null,
    meta: {
      latestVersionId: updatedPlugin.latestVersionId,
      eligibilityRevisions: versions.map(version => ({
        versionId: version.id,
        revision: version.eligibilityRevision,
      })),
    },
    createdAt: now,
  })

  return updatedPlugin
}

export async function setPluginVersionStatus(
  event: H3Event,
  pluginId: string,
  versionId: string,
  status: PluginVersionStatus,
  options: {
    actorId?: string | null
    actorRole?: PluginTimelineActorRole
    reason?: string | null
  } = {},
) {
  const plugin = await getPluginById(event, pluginId, { includeVersions: true, viewerIsAdmin: true })
  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const version = (plugin.versions ?? []).find(item => item.id === versionId)
  if (!version)
    throw createError({ statusCode: 404, statusMessage: 'Version not found.' })
  if (version.status === status && (status !== 'approved' || version.admissionStatus === 'eligible'))
    return version

  const now = new Date().toISOString()
  const reviewedAt = status === 'approved' ? now : null
  const rejectReason = status === 'rejected' ? (options.reason?.trim() || null) : null
  let nexusAttestation: PluginAdmissionAttestationV1 | null = null
  let admissionStatus: NonNullable<DashboardPluginVersion['admissionStatus']>
    = status === 'pending' ? 'pending' : 'blocked'

  if (status === 'approved') {
    if (
      !version.artifactSha256
      || version.artifactState !== 'available'
      || resolvePluginPolicyDecision(version) !== 'passed'
      || Boolean(version.revokedAt)
      || !version.publisherSignature
      || !version.manifest
      || !version.publisherKey
      || !version.publisherVerifiedAt
      || !version.securityScanReportDigest
      || (version.securityScanDecision !== 'passed' && version.securityScanDecision !== 'review-required')
      || !options.actorId
    ) {
      throw createError({
        statusCode: 409,
        statusMessage: 'PLUGIN_ADMISSION_PREREQUISITES_MISSING',
      })
    }

    const publisher: VerifiedPublisherSignature = {
      envelope: version.publisherSignature,
      key: version.publisherKey,
      verifiedAt: version.publisherVerifiedAt,
    }
    nexusAttestation = await createPluginAdmissionAttestation(event, {
      artifactSha256: version.artifactSha256,
      artifactSize: version.packageSize,
      pluginId: version.publisherSignature.payload.pluginId,
      pluginName: version.publisherSignature.payload.pluginName,
      version: version.version,
      channel: version.channel,
      policyVersion: version.publisherSignature.payload.policyVersion,
      manifest: version.manifest,
      scanReportSha256: version.securityScanReportDigest,
      scanDecision: version.securityScanDecision,
      publisher,
      reviewActorId: options.actorId,
      reviewedAt: now,
    })
    admissionStatus = 'eligible'
  }

  const nextVersion: DashboardPluginVersion = {
    ...version,
    status,
    reviewedAt,
    rejectReason,
    nexusAttestation,
    admissionStatus,
    policyDecision: resolvePluginPolicyDecision(version),
    eligibilityRevision: (version.eligibilityRevision ?? 0) + 1,
    eligibilityEvaluatedAt: now,
    eligibilityReasons: [],
    updatedAt: now,
  }
  nextVersion.eligibilityReasons = [...getPluginVersionEligibility(plugin, nextVersion, 'public').reasons]

  const db = getD1Database(event)
  if (db) {
    await ensurePluginSchema(db)
    await db.prepare(`
      UPDATE ${PLUGIN_VERSIONS_TABLE}
      SET
        status = ?1,
        reviewed_at = ?2,
        reject_reason = ?3,
        nexus_attestation = ?4,
        admission_status = ?5,
        policy_decision = ?6,
        eligibility_revision = ?7,
        eligibility_evaluated_at = ?8,
        eligibility_reasons = ?9,
        updated_at = ?10
      WHERE id = ?11;
    `).bind(
      nextVersion.status,
      nextVersion.reviewedAt ?? null,
      nextVersion.rejectReason ?? null,
      nextVersion.nexusAttestation ? JSON.stringify(nextVersion.nexusAttestation) : null,
      nextVersion.admissionStatus ?? 'blocked',
      nextVersion.policyDecision ?? 'not-evaluated',
      nextVersion.eligibilityRevision ?? 0,
      nextVersion.eligibilityEvaluatedAt ?? null,
      JSON.stringify(nextVersion.eligibilityReasons ?? []),
      nextVersion.updatedAt,
      versionId,
    ).run()
  }
  else {
    const versions = await readStoredPluginVersions()
    const index = versions.findIndex(item => item.id === versionId)
    if (index === -1)
      throw createError({ statusCode: 404, statusMessage: 'Version not found.' })
    versions[index] = nextVersion
    await writeStoredPluginVersions(versions)
  }

  const refreshed = await getPluginById(event, pluginId, {
    includeVersions: true,
    viewerIsAdmin: true,
  })
  const latest = refreshed
    ? selectLatestVisibleVersion(refreshed.versions ?? [], refreshed, { forStore: true })
    : null

  if (db) {
    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET latest_version_id = ?1, updated_at = ?2
      WHERE id = ?3;
    `).bind(latest?.id ?? null, now, pluginId).run()
  }
  else {
    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const index = plugins.findIndex(item => item.id === pluginId)
    if (index !== -1 && plugins[index]) {
      plugins[index] = {
        ...plugins[index]!,
        latestVersionId: latest?.id ?? null,
        updatedAt: now,
      }
      await writeCollection(PLUGINS_KEY, plugins)
    }
  }

  await appendPluginTimelineEvent(event, {
    pluginId,
    versionId,
    eventType: 'version.status.changed',
    actorId: options.actorId ?? null,
    actorRole: options.actorRole ?? 'system',
    fromStatus: version.status,
    toStatus: status,
    reason: rejectReason,
    meta: {
      version: version.version,
      channel: version.channel,
      artifactSha256: version.artifactSha256,
      admissionStatus,
      eligibilityRevision: nextVersion.eligibilityRevision,
      eligibilityReasons: nextVersion.eligibilityReasons,
      nexusKeyId: nexusAttestation?.keyId ?? null,
    },
    createdAt: now,
  })

  return nextVersion
}

export async function invalidatePluginVersionsForPublisherKey(
  event: H3Event,
  keyId: string,
  actorId: string,
): Promise<number> {
  const normalizedKeyId = keyId.trim()
  if (!normalizedKeyId)
    return 0

  const now = new Date().toISOString()
  const db = getD1Database(event)
  let affected: Array<{ id: string, pluginId: string, version: string, channel: PluginChannel, status: PluginVersionStatus }> = []

  if (db) {
    await ensurePluginSchema(db)
    const result = await db.prepare(`
      SELECT id, plugin_id, version, channel, status
      FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE publisher_key_id = ?1 AND revoked_at IS NULL;
    `).bind(normalizedKeyId).all<{ id: string, plugin_id: string, version: string, channel: PluginChannel, status: PluginVersionStatus }>()
    affected = (result.results ?? []).map(row => ({
      id: row.id,
      pluginId: row.plugin_id,
      version: row.version,
      channel: row.channel,
      status: row.status,
    }))
    await db.prepare(`
      UPDATE ${PLUGIN_VERSIONS_TABLE}
      SET
        admission_status = 'blocked',
        nexus_attestation = NULL,
        revoked_at = ?1,
        eligibility_revision = eligibility_revision + 1,
        eligibility_evaluated_at = ?1,
        eligibility_reasons = ?2,
        updated_at = ?1
      WHERE publisher_key_id = ?3 AND revoked_at IS NULL;
    `).bind(
      now,
      JSON.stringify([
        'PLUGIN_ELIGIBILITY_PUBLISHER_REVOKED',
        'PLUGIN_ELIGIBILITY_ATTESTATION_UNVERIFIED',
        'PLUGIN_ELIGIBILITY_ADMISSION_NOT_ELIGIBLE',
      ] satisfies PluginReleaseEligibilityReason[]),
      normalizedKeyId,
    ).run()

    for (const pluginId of new Set(affected.map(version => version.pluginId))) {
      const plugin = await getPluginById(event, pluginId, { includeVersions: true, viewerIsAdmin: true })
      const latest = plugin
        ? selectLatestVisibleVersion(plugin.versions ?? [], plugin, { forStore: true })
        : null
      await db.prepare(`
        UPDATE ${PLUGINS_TABLE}
        SET latest_version_id = ?1, updated_at = ?2
        WHERE id = ?3;
      `).bind(latest?.id ?? null, now, pluginId).run()
    }
  }
  else {
    const versions = await readStoredPluginVersions()
    affected = versions
      .filter(version => version.publisherKey?.keyId === normalizedKeyId && !version.revokedAt)
      .map(version => ({
        id: version.id,
        pluginId: version.pluginId,
        version: version.version,
        channel: version.channel,
        status: version.status,
      }))

    for (const version of versions) {
      if (version.publisherKey?.keyId !== normalizedKeyId || version.revokedAt)
        continue
      version.admissionStatus = 'blocked'
      version.nexusAttestation = null
      version.revokedAt = now
      version.eligibilityRevision = (version.eligibilityRevision ?? 0) + 1
      version.eligibilityEvaluatedAt = now
      version.eligibilityReasons = [
        'PLUGIN_ELIGIBILITY_PUBLISHER_REVOKED',
        'PLUGIN_ELIGIBILITY_ATTESTATION_UNVERIFIED',
        'PLUGIN_ELIGIBILITY_ADMISSION_NOT_ELIGIBLE',
      ]
      version.updatedAt = now
    }
    await writeStoredPluginVersions(versions)

    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const affectedPluginIds = new Set(affected.map(version => version.pluginId))
    for (const plugin of plugins) {
      if (!affectedPluginIds.has(plugin.id))
        continue
      const candidates = versions.filter(version => version.pluginId === plugin.id)
      plugin.latestVersionId = selectLatestVisibleVersion(candidates, plugin, { forStore: true })?.id ?? null
      plugin.updatedAt = now
    }
    await writeCollection(PLUGINS_KEY, plugins)
  }

  for (const version of affected) {
    await appendPluginTimelineEvent(event, {
      pluginId: version.pluginId,
      versionId: version.id,
      eventType: 'version.status.changed',
      actorId,
      actorRole: 'owner',
      fromStatus: version.status,
      toStatus: version.status,
      reason: 'publisher-key-revoked',
      meta: {
        version: version.version,
        channel: version.channel,
        keyId: normalizedKeyId,
        admissionStatus: 'blocked',
        revokedAt: now,
      },
      createdAt: now,
    })
  }
  return affected.length
}

export async function blockPluginVersionAdmission(
  event: H3Event,
  pluginId: string,
  versionId: string,
  reason: 'artifact-missing' | 'artifact-digest-mismatch' | 'publisher-key-revoked' | 'policy-failed' | 'scan-failed',
  actorId: string | null = null,
): Promise<void> {
  const plugin = await getPluginById(event, pluginId, { includeVersions: true, viewerIsAdmin: true })
  const version = plugin?.versions?.find(candidate => candidate.id === versionId)
  if (!plugin || !version)
    return

  const now = new Date().toISOString()
  const nextVersion: DashboardPluginVersion = {
    ...version,
    admissionStatus: 'blocked',
    nexusAttestation: null,
    policyDecision: reason === 'policy-failed' ? 'failed' : version.policyDecision,
    securityScanDecision: reason === 'scan-failed' ? 'blocked' : version.securityScanDecision,
    artifactState: reason === 'artifact-missing'
      ? 'missing'
      : reason === 'artifact-digest-mismatch'
        ? 'quarantined'
        : version.artifactState,
    revokedAt: reason === 'publisher-key-revoked' ? now : version.revokedAt,
    eligibilityRevision: (version.eligibilityRevision ?? 0) + 1,
    eligibilityEvaluatedAt: now,
    eligibilityReasons: [],
    updatedAt: now,
  }
  nextVersion.eligibilityReasons = [...getPluginVersionEligibility(plugin, nextVersion, 'public').reasons]

  const db = getD1Database(event)
  if (db) {
    await ensurePluginSchema(db)
    await db.prepare(`
      UPDATE ${PLUGIN_VERSIONS_TABLE}
      SET
        admission_status = 'blocked',
        nexus_attestation = NULL,
        policy_decision = ?1,
        security_scan_decision = ?2,
        artifact_state = ?3,
        revoked_at = ?4,
        eligibility_revision = ?5,
        eligibility_evaluated_at = ?6,
        eligibility_reasons = ?7,
        updated_at = ?8
      WHERE id = ?9;
    `).bind(
      nextVersion.policyDecision ?? 'not-evaluated',
      nextVersion.securityScanDecision ?? null,
      nextVersion.artifactState ?? 'missing',
      nextVersion.revokedAt ?? null,
      nextVersion.eligibilityRevision ?? 0,
      nextVersion.eligibilityEvaluatedAt ?? null,
      JSON.stringify(nextVersion.eligibilityReasons ?? []),
      nextVersion.updatedAt,
      versionId,
    ).run()
  }
  else {
    const versions = await readStoredPluginVersions()
    const index = versions.findIndex(candidate => candidate.id === versionId)
    if (index >= 0)
      versions[index] = nextVersion
    await writeStoredPluginVersions(versions)
  }

  const refreshed = await getPluginById(event, pluginId, { includeVersions: true, viewerIsAdmin: true })
  const latest = refreshed
    ? selectLatestVisibleVersion(refreshed.versions ?? [], refreshed, { forStore: true })
    : null
  if (db) {
    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET latest_version_id = ?1, updated_at = ?2
      WHERE id = ?3;
    `).bind(latest?.id ?? null, now, pluginId).run()
  }
  else {
    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const index = plugins.findIndex(candidate => candidate.id === pluginId)
    if (index >= 0 && plugins[index]) {
      plugins[index] = {
        ...plugins[index]!,
        latestVersionId: latest?.id ?? null,
        updatedAt: now,
      }
      await writeCollection(PLUGINS_KEY, plugins)
    }
  }

  await appendPluginTimelineEvent(event, {
    pluginId,
    versionId,
    eventType: 'version.status.changed',
    actorId,
    actorRole: actorId ? 'admin' : 'system',
    fromStatus: version.status,
    toStatus: version.status,
    reason,
    meta: {
      version: version.version,
      channel: version.channel,
      artifactSha256: version.artifactSha256,
      artifactState: nextVersion.artifactState,
      revokedAt: nextVersion.revokedAt,
      admissionStatus: 'blocked',
      eligibilityRevision: nextVersion.eligibilityRevision,
      eligibilityReasons: nextVersion.eligibilityReasons,
    },
    createdAt: now,
  })
}

export async function publishPluginVersion(event: H3Event, input: PublishVersionInput) {
  validateChannel(input.channel)

  // Validate semantic version format
  if (!validateSemanticVersion(input.version)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Version must follow semantic versioning format (e.g., 1.0.0, 2.1.3-beta)',
    })
  }

  if (!input.changelog || !input.changelog.trim())
    throw createError({ statusCode: 400, statusMessage: 'Changelog is required.' })

  const plugin = await getPluginById(event, input.pluginId)

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const isCreator = plugin.userId === input.createdBy
  const canModerate = Boolean(input.canModerate)

  if (!isCreator && !canModerate)
    throw createError({ statusCode: 403, statusMessage: 'You cannot publish versions for this plugin.' })

  const pluginWithVersions = await getPluginById(event, plugin.id, {
    includeVersions: true,
    viewerId: input.createdBy,
    viewerOrgIds: plugin.ownerOrgId ? [plugin.ownerOrgId] : [],
    viewerIsAdmin: false,
  })
  const currentVersions = pluginWithVersions?.versions ?? []

  // Check for version downgrade and duplicates
  for (const existing of currentVersions) {
    // Check for exact duplicate
    if (existing.version === input.version) {
      throw createError({
        statusCode: 400,
        statusMessage: `Version ${input.version} already exists`,
      })
    }

    // Check for version downgrade
    const comparison = compareVersions(input.version, existing.version)
    if (comparison < 0) {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot downgrade version from ${existing.version} to ${input.version}`,
      })
    }
  }

  await ensureSubmissionCooldown(event, input.createdBy)

  const packageGovernanceResourceId = buildPluginPackageGovernanceResourceId({
    pluginId: plugin.id,
    channel: input.channel,
    version: input.version,
  })
  const packageAttempt = await startUploadGovernance(event, {
    actorId: input.createdBy,
    resourceType: 'plugin-package',
    resourceId: packageGovernanceResourceId,
    file: input.packageFile,
    metadata: {
      pluginId: plugin.id,
      channel: input.channel,
      version: input.version,
      surface: 'plugin-version-publish',
    },
  })
  const {
    artifactSha256,
    verifiedPublisher,
    metadata,
    iconKey,
    iconUrl,
    packageResult,
  } = await (async () => {
    try {
      const packageArrayBuffer = await input.packageFile.arrayBuffer()
      const packageBuffer = Buffer.from(packageArrayBuffer)
      const artifactSha256 = await sha256Hex(packageBuffer)
      const scanWaivers = await listActivePluginSecurityScanWaivers(event, artifactSha256)

      const metadata = await extractTpexForAdmission(
        event,
        packageBuffer,
        { pluginId: plugin.slug, version: input.version },
        scanWaivers,
        input.createdBy,
        packageGovernanceResourceId,
      )
      assertTpexAdmission(metadata)
      if (!metadata.manifest)
        throw createError({ statusCode: 400, statusMessage: 'PLUGIN_SIGNING_MANIFEST_REQUIRED' })
      const manifestName = typeof metadata.manifest.name === 'string'
        ? metadata.manifest.name.trim()
        : ''
      if (!manifestName)
        throw createError({ statusCode: 400, statusMessage: 'PLUGIN_SIGNING_IDENTITY_MISMATCH' })
      const verifiedPublisher = await verifyPluginPublisherSignature(event, {
        ownerId: input.createdBy,
        publicKey: {
          keyId: extractPublisherSignatureKeyId(input.publisherSignature),
          publicKeyPem: input.publisherPublicKey,
          validFrom: input.publisherKeyValidFrom,
          ...(input.publisherKeyValidUntil ? { validUntil: input.publisherKeyValidUntil } : {}),
        },
        publisherSignature: input.publisherSignature,
        artifactSha256,
        artifactSize: packageBuffer.length,
        pluginId: plugin.slug,
        pluginName: manifestName,
        version: input.version,
        channel: input.channel,
        policyVersion: metadata.packagePolicy.policyVersion,
        manifest: metadata.manifest,
      })

      let iconKey = plugin.iconKey ?? null
      let iconUrl = plugin.iconUrl ?? null

      if (!iconKey || !iconUrl) {
        if (metadata.iconBuffer && metadata.iconFileName && metadata.iconMimeType) {
          try {
            const iconResult = await uploadImageFromBuffer(
              event,
              metadata.iconBuffer,
              metadata.iconFileName,
              metadata.iconMimeType,
              {
                actorId: input.createdBy,
                resourceType: 'plugin-icon',
                uploadLifecycle: {
                  surface: 'plugin-icon-extract',
                  resourceId: `plugin:${plugin.id}:icon`,
                  metadata: {
                    pluginId: plugin.id,
                    channel: input.channel,
                    version: input.version,
                    source: 'plugin-version-publish',
                  },
                },
              },
            )
            iconKey = iconResult.key
            iconUrl = iconResult.url

            await updatePluginIcon(event, plugin.id, iconKey, iconUrl)
          }
          catch (err) {
            console.error('[publishPluginVersion] Failed to upload extracted icon:', err)
            throw createError({
              statusCode: 400,
              statusMessage: 'Failed to extract icon from package. Please ensure your package includes a valid icon file (SVG recommended).',
            })
          }
        }
        else {
          throw createError({
            statusCode: 400,
            statusMessage: 'Plugin icon is required. Please include an icon file (icon.svg or logo.svg recommended) in your package, or set the "icon" field in manifest.json.',
          })
        }
      }

      const packageResult = await uploadPluginPackage(event, input.packageFile, packageArrayBuffer, {
        actorId: input.createdBy,
        governanceResourceId: packageGovernanceResourceId,
      })

      await completeUploadGovernance(event, packageAttempt, {
        resourceId: packageGovernanceResourceId,
        contentType: packageResult.contentType,
        size: packageResult.size,
        storageChannel: packageResult.storageChannel,
        storageProvider: packageResult.storageProvider,
        metadata: {
          pluginId: plugin.id,
          channel: input.channel,
          version: input.version,
          surface: 'plugin-version-publish',
          ...(packageResult.uploadRetry ?? {}),
        },
      })

      return { artifactSha256, verifiedPublisher, metadata, iconKey, iconUrl, packageResult }
    }
    catch (error) {
      await failUploadGovernance(event, packageAttempt, error, {
        resourceId: packageGovernanceResourceId,
        reason: classifyPluginPackageUploadFailure(error),
        metadata: {
          pluginId: plugin.id,
          channel: input.channel,
          version: input.version,
          surface: 'plugin-version-publish',
        },
      })
      throw error
    }
  })()

  const now = new Date().toISOString()
  const securityScanReportDigest = await sha256Hex(
    Buffer.from(serializePluginSecurityScanReport(metadata.securityScan)),
  )
  const status: PluginVersionStatus = 'pending'
  const reviewedAt: string | null = null
  const rawVersion: DashboardPluginVersion = {
    id: randomUUID(),
    pluginId: plugin.id,
    createdBy: input.createdBy,
    channel: input.channel,
    version: input.version,
    artifactSha256,
    publisherSignature: verifiedPublisher.envelope,
    publisherKey: verifiedPublisher.key,
    publisherVerifiedAt: verifiedPublisher.verifiedAt,
    nexusAttestation: null,
    admissionStatus: 'pending',
    policyDecision: 'passed',
    artifactState: 'available',
    revokedAt: null,
    eligibilityRevision: 1,
    eligibilityEvaluatedAt: now,
    eligibilityReasons: [],
    packageKey: packageResult.key,
    packageUrl: packageResult.url,
    packageSize: packageResult.size,
    iconKey,
    iconUrl,
    readmeMarkdown: metadata.readmeMarkdown ?? null,
    manifest: metadata.manifest ?? null,
    changelog: input.changelog,
    status,
    reviewedAt,
    rejectReason: null,
    securityScanDecision: metadata.securityScan.decision,
    securityScanReportDigest,
    securityScannerVersion: metadata.securityScan.scannerVersion,
    securityRuleSetVersion: metadata.securityScan.ruleSetVersion,
    securityScanFindingCount: metadata.securityScan.findings.length,
    securityScanCompletedAt: metadata.securityScan.completedAt,
    createdAt: now,
    updatedAt: now,
  }
  rawVersion.eligibilityReasons = [...getPluginVersionEligibility(plugin, rawVersion, 'public').reasons]
  const version = sanitizeVersion(rawVersion)

  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    const existing = await db.prepare(`
      SELECT id FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE plugin_id = ?1 AND version = ?2 AND channel = ?3;
    `).bind(plugin.id, input.version, input.channel).first<{ id: string }>()

    if (existing)
      throw createError({ statusCode: 400, statusMessage: 'This version and channel have already been published.' })

    await db.prepare(`
      INSERT INTO ${PLUGIN_VERSIONS_TABLE} (
        id,
        plugin_id,
        created_by,
        channel,
        version,
        signature,
        artifact_sha256,
        publisher_signature,
        publisher_key,
        publisher_key_id,
        publisher_verified_at,
        nexus_attestation,
        admission_status,
        policy_decision,
        artifact_state,
        revoked_at,
        eligibility_revision,
        eligibility_evaluated_at,
        eligibility_reasons,
        package_key,
        package_url,
        package_size,
        icon_key,
        icon_url,
        readme_markdown,
        manifest,
        notes,
        status,
        reviewed_at,
        reject_reason,
        security_scan_decision,
        security_scan_report_digest,
        security_scanner_version,
        security_rule_set_version,
        security_scan_finding_count,
        security_scan_completed_at,
        created_at,
        updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38);
    `).bind(
      version.id,
      version.pluginId,
      version.createdBy,
      version.channel,
      version.version,
      version.artifactSha256,
      version.artifactSha256,
      version.publisherSignature ? JSON.stringify(version.publisherSignature) : null,
      version.publisherKey ? JSON.stringify(version.publisherKey) : null,
      version.publisherKey?.keyId ?? null,
      version.publisherVerifiedAt ?? null,
      version.nexusAttestation ? JSON.stringify(version.nexusAttestation) : null,
      version.admissionStatus ?? 'pending',
      version.policyDecision ?? 'not-evaluated',
      version.artifactState ?? 'missing',
      version.revokedAt ?? null,
      version.eligibilityRevision ?? 0,
      version.eligibilityEvaluatedAt ?? null,
      JSON.stringify(version.eligibilityReasons ?? []),
      version.packageKey,
      version.packageUrl,
      version.packageSize,
      version.iconKey,
      version.iconUrl,
      version.readmeMarkdown ?? null,
      version.manifest ? JSON.stringify(version.manifest) : null,
      version.changelog ?? null,
      version.status,
      version.reviewedAt ?? null,
      version.rejectReason ?? null,
      version.securityScanDecision ?? null,
      version.securityScanReportDigest ?? null,
      version.securityScannerVersion ?? null,
      version.securityRuleSetVersion ?? null,
      version.securityScanFindingCount ?? null,
      version.securityScanCompletedAt ?? null,
      version.createdAt,
      version.updatedAt,
    ).run()

    const latest = selectLatestVisibleVersion(
      [...currentVersions, version],
      { ...plugin, versions: currentVersions },
      { forStore: true },
    )

    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET
        latest_version_id = ?1,
        updated_at = ?2
      WHERE id = ?3;
    `).bind(
      latest?.id ?? plugin.latestVersionId ?? null,
      version.createdAt,
      plugin.id,
    ).run()
  }
  else {
    const versions = await readStoredPluginVersions()
    if (versions.some(item => item.pluginId === plugin.id && item.version === input.version && item.channel === input.channel)) {
      throw createError({ statusCode: 400, statusMessage: 'This version and channel have already been published.' })
    }

    const updatedVersions = [version, ...versions]
    await writeStoredPluginVersions(updatedVersions)

    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const index = plugins.findIndex(item => item.id === plugin.id)
    if (index !== -1) {
      const existing = plugins[index]
      if (!existing) {
        await writeCollection(PLUGINS_KEY, plugins)
        return version
      }
      const latest = selectLatestVisibleVersion(
        [...currentVersions, version],
        { ...plugin, versions: currentVersions },
        { forStore: true },
      )

      plugins[index] = {
        ...existing,
        latestVersionId: latest?.id ?? plugin.latestVersionId ?? null,
        updatedAt: version.createdAt,
      }

      await writeCollection(PLUGINS_KEY, plugins)
    }
  }

  await appendPluginTimelineEvent(event, {
    pluginId: plugin.id,
    versionId: version.id,
    eventType: 'version.created',
    actorId: input.createdBy,
    actorRole: canModerate ? 'admin' : 'owner',
    toStatus: version.status,
    meta: {
      version: version.version,
      channel: version.channel,
    },
    createdAt: version.createdAt,
  })

  if (!canModerate && plugin.status === 'draft') {
    await setPluginStatus(event, plugin.id, 'pending', {
      actorId: input.createdBy,
      actorRole: 'owner',
    })
  }
  else if (canModerate && plugin.status !== 'approved') {
    await setPluginStatus(event, plugin.id, 'approved', {
      actorId: input.createdBy,
      actorRole: 'admin',
    })
  }

  return version
}

export async function reeditPluginVersion(event: H3Event, input: ReeditVersionInput) {
  const plugin = await getPluginById(event, input.pluginId, {
    includeVersions: true,
    viewerId: input.updatedBy,
    viewerIsAdmin: Boolean(input.canModerate),
  })

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const targetVersion = (plugin.versions ?? []).find(item => item.id === input.versionId)
  if (!targetVersion)
    throw createError({ statusCode: 404, statusMessage: 'Version not found.' })

  const canModerate = Boolean(input.canModerate)
  const isOwner = plugin.userId === input.updatedBy
  if (!isOwner && !canModerate) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You cannot re-edit this version.',
    })
  }

  if (targetVersion.status !== 'rejected')
    throw createError({ statusCode: 400, statusMessage: 'Only rejected versions can be re-edited.' })

  const nextChangelog = input.changelog.trim()
  if (!nextChangelog)
    throw createError({ statusCode: 400, statusMessage: 'Changelog is required.' })

  const packageGovernanceResourceId = buildPluginPackageGovernanceResourceId({
    pluginId: plugin.id,
    channel: targetVersion.channel,
    version: targetVersion.version,
  })
  const packageAttempt = await startUploadGovernance(event, {
    actorId: input.updatedBy,
    resourceType: 'plugin-package',
    resourceId: packageGovernanceResourceId,
    file: input.packageFile,
    metadata: {
      pluginId: plugin.id,
      channel: targetVersion.channel,
      version: targetVersion.version,
      surface: 'plugin-version-reedit',
    },
  })
  const {
    artifactSha256,
    verifiedPublisher,
    metadata,
    iconKey,
    iconUrl,
    packageResult,
  } = await (async () => {
    try {
      const packageArrayBuffer = await input.packageFile.arrayBuffer()
      const packageBuffer = Buffer.from(packageArrayBuffer)
      const artifactSha256 = await sha256Hex(packageBuffer)
      const scanWaivers = await listActivePluginSecurityScanWaivers(event, artifactSha256)
      const metadata = await extractTpexForAdmission(
        event,
        packageBuffer,
        { pluginId: plugin.slug, version: targetVersion.version },
        scanWaivers,
        input.updatedBy,
        packageGovernanceResourceId,
      )
      assertTpexAdmission(metadata)
      if (!metadata.manifest)
        throw createError({ statusCode: 400, statusMessage: 'PLUGIN_SIGNING_MANIFEST_REQUIRED' })
      const manifestName = typeof metadata.manifest.name === 'string'
        ? metadata.manifest.name.trim()
        : ''
      if (!manifestName)
        throw createError({ statusCode: 400, statusMessage: 'PLUGIN_SIGNING_IDENTITY_MISMATCH' })
      const verifiedPublisher = await verifyPluginPublisherSignature(event, {
        ownerId: input.updatedBy,
        publicKey: {
          keyId: extractPublisherSignatureKeyId(input.publisherSignature),
          publicKeyPem: input.publisherPublicKey,
          validFrom: input.publisherKeyValidFrom,
          ...(input.publisherKeyValidUntil ? { validUntil: input.publisherKeyValidUntil } : {}),
        },
        publisherSignature: input.publisherSignature,
        artifactSha256,
        artifactSize: packageBuffer.length,
        pluginId: plugin.slug,
        pluginName: manifestName,
        version: targetVersion.version,
        channel: targetVersion.channel,
        policyVersion: metadata.packagePolicy.policyVersion,
        manifest: metadata.manifest,
      })

      let iconKey = targetVersion.iconKey ?? plugin.iconKey ?? null
      let iconUrl = targetVersion.iconUrl ?? plugin.iconUrl ?? null

      if (!iconKey || !iconUrl) {
        if (metadata.iconBuffer && metadata.iconFileName && metadata.iconMimeType) {
          const iconResult = await uploadImageFromBuffer(
            event,
            metadata.iconBuffer,
            metadata.iconFileName,
            metadata.iconMimeType,
            {
              actorId: input.updatedBy,
              resourceType: 'plugin-icon',
              uploadLifecycle: {
                surface: 'plugin-icon-extract',
                resourceId: `plugin:${plugin.id}:icon`,
                metadata: {
                  pluginId: plugin.id,
                  channel: targetVersion.channel,
                  version: targetVersion.version,
                  source: 'plugin-version-reedit',
                },
              },
            },
          )
          iconKey = iconResult.key
          iconUrl = iconResult.url
          await updatePluginIcon(event, plugin.id, iconKey, iconUrl)
        }
        else {
          throw createError({
            statusCode: 400,
            statusMessage: 'Plugin icon is required. Please include an icon file in your package.',
          })
        }
      }

      const packageResult = await uploadPluginPackage(event, input.packageFile, packageArrayBuffer, {
        actorId: input.updatedBy,
        governanceResourceId: packageGovernanceResourceId,
      })

      await completeUploadGovernance(event, packageAttempt, {
        resourceId: packageGovernanceResourceId,
        contentType: packageResult.contentType,
        size: packageResult.size,
        storageChannel: packageResult.storageChannel,
        storageProvider: packageResult.storageProvider,
        metadata: {
          pluginId: plugin.id,
          channel: targetVersion.channel,
          version: targetVersion.version,
          surface: 'plugin-version-reedit',
          ...(packageResult.uploadRetry ?? {}),
        },
      })

      return { artifactSha256, verifiedPublisher, metadata, iconKey, iconUrl, packageResult }
    }
    catch (error) {
      await failUploadGovernance(event, packageAttempt, error, {
        resourceId: packageGovernanceResourceId,
        reason: classifyPluginPackageUploadFailure(error),
        metadata: {
          pluginId: plugin.id,
          channel: targetVersion.channel,
          version: targetVersion.version,
          surface: 'plugin-version-reedit',
        },
      })
      throw error
    }
  })()
  const now = new Date().toISOString()
  const securityScanReportDigest = await sha256Hex(
    Buffer.from(serializePluginSecurityScanReport(metadata.securityScan)),
  )

  const updatedVersion: DashboardPluginVersion = sanitizeVersion({
    ...targetVersion,
    artifactSha256,
    publisherSignature: verifiedPublisher.envelope,
    publisherKey: verifiedPublisher.key,
    publisherVerifiedAt: verifiedPublisher.verifiedAt,
    nexusAttestation: null,
    admissionStatus: 'pending',
    policyDecision: 'passed',
    artifactState: 'available',
    revokedAt: null,
    eligibilityRevision: (targetVersion.eligibilityRevision ?? 0) + 1,
    eligibilityEvaluatedAt: now,
    eligibilityReasons: [],
    packageKey: packageResult.key,
    packageUrl: packageResult.url,
    packageSize: packageResult.size,
    iconKey,
    iconUrl,
    readmeMarkdown: metadata.readmeMarkdown ?? null,
    manifest: metadata.manifest ?? null,
    changelog: nextChangelog,
    status: 'pending',
    reviewedAt: null,
    rejectReason: null,
    securityScanDecision: metadata.securityScan.decision,
    securityScanReportDigest,
    securityScannerVersion: metadata.securityScan.scannerVersion,
    securityRuleSetVersion: metadata.securityScan.ruleSetVersion,
    securityScanFindingCount: metadata.securityScan.findings.length,
    securityScanCompletedAt: metadata.securityScan.completedAt,
    updatedAt: now,
  })
  updatedVersion.eligibilityReasons = [...getPluginVersionEligibility(plugin, updatedVersion, 'public').reasons]

  const db = getD1Database(event)
  if (db) {
    await ensurePluginSchema(db)
    await db.prepare(`
      UPDATE ${PLUGIN_VERSIONS_TABLE}
      SET
        signature = ?1,
        artifact_sha256 = ?2,
        publisher_signature = ?3,
        publisher_key = ?4,
        publisher_key_id = ?5,
        publisher_verified_at = ?6,
        nexus_attestation = ?7,
        admission_status = ?8,
        policy_decision = ?9,
        artifact_state = ?10,
        revoked_at = ?11,
        eligibility_revision = ?12,
        eligibility_evaluated_at = ?13,
        eligibility_reasons = ?14,
        package_key = ?15,
        package_url = ?16,
        package_size = ?17,
        icon_key = ?18,
        icon_url = ?19,
        readme_markdown = ?20,
        manifest = ?21,
        notes = ?22,
        status = ?23,
        reviewed_at = NULL,
        reject_reason = NULL,
        security_scan_decision = ?24,
        security_scan_report_digest = ?25,
        security_scanner_version = ?26,
        security_rule_set_version = ?27,
        security_scan_finding_count = ?28,
        security_scan_completed_at = ?29,
        updated_at = ?30
      WHERE id = ?31;
    `).bind(
      updatedVersion.artifactSha256,
      updatedVersion.artifactSha256,
      updatedVersion.publisherSignature ? JSON.stringify(updatedVersion.publisherSignature) : null,
      updatedVersion.publisherKey ? JSON.stringify(updatedVersion.publisherKey) : null,
      updatedVersion.publisherKey?.keyId ?? null,
      updatedVersion.publisherVerifiedAt ?? null,
      null,
      updatedVersion.admissionStatus ?? 'pending',
      updatedVersion.policyDecision ?? 'not-evaluated',
      updatedVersion.artifactState ?? 'missing',
      updatedVersion.revokedAt ?? null,
      updatedVersion.eligibilityRevision ?? 0,
      updatedVersion.eligibilityEvaluatedAt ?? null,
      JSON.stringify(updatedVersion.eligibilityReasons ?? []),
      updatedVersion.packageKey,
      updatedVersion.packageUrl,
      updatedVersion.packageSize,
      updatedVersion.iconKey,
      updatedVersion.iconUrl,
      updatedVersion.readmeMarkdown ?? null,
      updatedVersion.manifest ? JSON.stringify(updatedVersion.manifest) : null,
      updatedVersion.changelog ?? null,
      updatedVersion.status,
      updatedVersion.securityScanDecision ?? null,
      updatedVersion.securityScanReportDigest ?? null,
      updatedVersion.securityScannerVersion ?? null,
      updatedVersion.securityRuleSetVersion ?? null,
      updatedVersion.securityScanFindingCount ?? null,
      updatedVersion.securityScanCompletedAt ?? null,
      updatedVersion.updatedAt,
      updatedVersion.id,
    ).run()

    const refreshed = await getPluginById(event, plugin.id, {
      includeVersions: true,
      viewerIsAdmin: true,
    })
    if (refreshed) {
      const latest = selectLatestVisibleVersion(refreshed.versions ?? [], refreshed, {
        forStore: true,
      })
      await db.prepare(`
        UPDATE ${PLUGINS_TABLE}
        SET latest_version_id = ?1, updated_at = ?2
        WHERE id = ?3;
      `).bind(
        latest?.id ?? null,
        now,
        plugin.id,
      ).run()
    }
  }
  else {
    const versions = await readStoredPluginVersions()
    const index = versions.findIndex(item => item.id === updatedVersion.id)
    if (index === -1)
      throw createError({ statusCode: 404, statusMessage: 'Version not found.' })
    versions[index] = updatedVersion
    await writeStoredPluginVersions(versions)

    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const pluginIndex = plugins.findIndex(item => item.id === plugin.id)
    if (pluginIndex !== -1) {
      const existing = plugins[pluginIndex]
      if (existing) {
        const refreshed = await getPluginById(event, plugin.id, {
          includeVersions: true,
          viewerIsAdmin: true,
        })
        const latest = selectLatestVisibleVersion(refreshed?.versions ?? [], refreshed ?? plugin, {
          forStore: true,
        })
        plugins[pluginIndex] = {
          ...existing,
          latestVersionId: latest?.id ?? null,
          updatedAt: now,
        }
        await writeCollection(PLUGINS_KEY, plugins)
      }
    }
  }

  await deletePluginPackage(event, targetVersion.packageKey, {
    governanceResourceId: buildPluginPackageGovernanceResourceId(targetVersion),
  })
  if (targetVersion.iconKey && targetVersion.iconKey !== updatedVersion.iconKey && targetVersion.iconKey !== plugin.iconKey)
    await deleteImage(event, targetVersion.iconKey)

  await appendPluginTimelineEvent(event, {
    pluginId: plugin.id,
    versionId: targetVersion.id,
    eventType: 'version.reedited',
    actorId: input.updatedBy,
    actorRole: canModerate ? 'admin' : 'owner',
    fromStatus: 'rejected',
    toStatus: 'pending',
    meta: {
      version: targetVersion.version,
      channel: targetVersion.channel,
    },
    createdAt: now,
  })

  if (!canModerate && plugin.status === 'rejected') {
    await setPluginStatus(event, plugin.id, 'pending', {
      actorId: input.updatedBy,
      actorRole: 'owner',
    })
  }
  else if (canModerate && plugin.status !== 'approved') {
    await setPluginStatus(event, plugin.id, 'approved', {
      actorId: input.updatedBy,
      actorRole: 'admin',
    })
  }

  return updatedVersion
}

export async function listPluginVersions(event: H3Event | undefined, pluginId: string, options: PluginVisibilityOptions = {}) {
  const plugin = await getPluginById(event, pluginId, { includeVersions: true, ...options })
  return plugin?.versions ?? []
}

export async function listPluginTimeline(event: H3Event | undefined, pluginId: string): Promise<PluginTimelineEvent[]> {
  const db = getD1Database(event)
  if (db) {
    await ensurePluginSchema(db)
    const rows = await db.prepare(`
      SELECT *
      FROM ${PLUGIN_TIMELINE_TABLE}
      WHERE plugin_id = ?1
      ORDER BY datetime(created_at) DESC;
    `).bind(pluginId).all<D1PluginTimelineRow>()
    return (rows.results ?? []).map(mapPluginTimelineRow)
  }

  const events = await readStoredPluginTimeline()
  return events.filter(item => item.pluginId === pluginId)
}

export async function deletePluginVersion(event: H3Event, pluginId: string, versionId: string, options: { bypassOwnerCheck?: boolean } = {}) {
  const plugin = await getPluginById(event, pluginId, { includeVersions: true })

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const version = (plugin.versions ?? []).find(item => item.id === versionId)

  if (!version)
    throw createError({ statusCode: 404, statusMessage: 'Version not found.' })

  if (!options.bypassOwnerCheck && version.createdBy !== plugin.userId)
    throw createError({ statusCode: 403, statusMessage: 'You cannot delete this version.' })

  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    await db.prepare(`
      DELETE FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE id = ?1;
    `).bind(version.id).run()

    await deletePluginPackage(event, version.packageKey, {
      governanceResourceId: buildPluginPackageGovernanceResourceId(version),
    })
    await deleteImage(event, version.iconKey)

    const latest = selectLatestVisibleVersion(
      (plugin.versions ?? []).filter(item => item.id !== version.id),
      plugin,
      { forStore: true },
    )

    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET latest_version_id = ?1, updated_at = ?2
      WHERE id = ?3;
    `).bind(
      latest?.id ?? null,
      new Date().toISOString(),
      plugin.id,
    ).run()
  }
  else {
    const versions = await readStoredPluginVersions()
    const remaining = versions.filter(item => item.id !== version.id)
    await writeStoredPluginVersions(remaining)

    await deletePluginPackage(event, version.packageKey, {
      governanceResourceId: buildPluginPackageGovernanceResourceId(version),
    })
    await deleteImage(event, version.iconKey)

    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const index = plugins.findIndex(item => item.id === plugin.id)
    if (index !== -1) {
      const existing = plugins[index]
      if (!existing)
        return version
      const remainingVersions = (plugin.versions ?? []).filter(item => item.id !== version.id)
      const latest = selectLatestVisibleVersion(
        remainingVersions,
        plugin,
        { forStore: true },
      )

      plugins[index] = {
        ...existing,
        latestVersionId: latest?.id ?? null,
        updatedAt: new Date().toISOString(),
      }

      await writeCollection(PLUGINS_KEY, plugins)
    }
  }

  return version
}

export async function incrementPluginInstalls(event: H3Event, pluginId: string): Promise<number> {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET installs = installs + 1
      WHERE id = ?1;
    `).bind(pluginId).run()

    const row = await db.prepare(`
      SELECT installs FROM ${PLUGINS_TABLE} WHERE id = ?1;
    `).bind(pluginId).first<{ installs: number }>()

    const installs = Number(row?.installs ?? 0)
    // region debug [H2]
    await dbgLog(
      'H2',
      'nexus/server/utils/pluginsStore.ts:incrementPluginInstalls',
      'increment installs (d1)',
      { pluginId, hasDb: true, installs },
    )
    // endregion
    return installs
  }

  const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const index = plugins.findIndex(item => item.id === pluginId)

  if (index === -1)
    return 0

  const existing = plugins[index]
  if (!existing)
    return 0

  const installs = (existing.installs ?? 0) + 1
  plugins[index] = {
    ...existing,
    installs,
  }
  await writeCollection(PLUGINS_KEY, plugins)

  // region debug [H2]
  await dbgLog(
    'H2',
    'nexus/server/utils/pluginsStore.ts:incrementPluginInstalls',
    'increment installs (fallback)',
    { pluginId, hasDb: false, installs },
  )
  // endregion
  return installs
}

export async function decrementPluginInstalls(event: H3Event, pluginId: string): Promise<number> {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET installs = MAX(0, installs - 1)
      WHERE id = ?1;
    `).bind(pluginId).run()

    const row = await db.prepare(`
      SELECT installs FROM ${PLUGINS_TABLE} WHERE id = ?1;
    `).bind(pluginId).first<{ installs: number }>()

    return Number(row?.installs ?? 0)
  }

  const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const index = plugins.findIndex(item => item.id === pluginId)

  if (index === -1)
    return 0

  const existing = plugins[index]
  if (!existing)
    return 0

  const installs = Math.max(0, (existing.installs ?? 0) - 1)
  plugins[index] = {
    ...existing,
    installs,
  }
  await writeCollection(PLUGINS_KEY, plugins)

  return installs
}

export async function findVersionByPackageKey(event: H3Event, packageKey: string) {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    const versionRow = await db.prepare(`
      SELECT *
      FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE package_key = ?1
      LIMIT 1;
    `).bind(packageKey).first<D1PluginVersionRow>()

    if (!versionRow)
      return null

    const pluginRow = await db.prepare(`
      SELECT *
      FROM ${PLUGINS_TABLE}
      WHERE id = ?1
      LIMIT 1;
    `).bind(versionRow.plugin_id).first<D1PluginRow>()

    if (!pluginRow)
      return null

    return {
      plugin: mapPluginRow(pluginRow),
      version: mapPluginVersionRow(versionRow),
    }
  }

  const versions = await readStoredPluginVersions()
  const version = versions.find(item => item.packageKey === packageKey)

  if (!version)
    return null

  const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const plugin = plugins.find(item => item.id === version.pluginId)

  if (!plugin)
    return null

  return {
    plugin,
    version,
  }
}
