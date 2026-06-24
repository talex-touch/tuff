import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { readCloudflareBindings } from './cloudflare'

export type PlatformGovernanceD1ReadinessStatus = 'ready' | 'warning' | 'blocked'

export interface PlatformGovernanceD1ReadinessCheck {
  id: string
  label: string
  status: PlatformGovernanceD1ReadinessStatus
  required: boolean
  reasons: string[]
  tables: string[]
  indexes: string[]
  missingTables: string[]
  missingIndexes: string[]
  observedCount: number | null
  minimumCount: number | null
}

export interface PlatformGovernanceD1Readiness {
  status: PlatformGovernanceD1ReadinessStatus
  database: {
    present: boolean
    binding: 'DB' | null
  }
  summary: {
    total: number
    ready: number
    warning: number
    blocked: number
    missingTables: number
    missingIndexes: number
    backfillRequired: number
  }
  checks: PlatformGovernanceD1ReadinessCheck[]
  generatedAt: string
}

interface SqliteObjectRow {
  name?: string
  type?: string
}

interface ReadinessRequirement {
  id: string
  label: string
  required: boolean
  tables: string[]
  indexes: string[]
  minimumCount?: number
  count?: {
    table: string
    where?: string
    binds?: string[]
  }
  emptyReason?: string
}

const GOVERNANCE_EVENTS_TABLE = 'platform_governance_events'
const GOVERNANCE_CONFIGS_TABLE = 'platform_governance_configs'
const STORAGE_CREDENTIALS_TABLE = 'storage_secure_store'
const NOTIFICATION_CREDENTIALS_TABLE = 'notification_secure_store'
const BROWSER_PUSH_SUBSCRIPTIONS_TABLE = 'browser_push_subscriptions'
const BROWSER_NOTIFICATION_INBOX_TABLE = 'browser_notification_inbox'

const READINESS_REQUIREMENTS: ReadinessRequirement[] = [
  {
    id: 'governance-events-schema',
    label: 'Governance event history',
    required: true,
    tables: [GOVERNANCE_EVENTS_TABLE],
    indexes: [
      'idx_platform_governance_events_scope_action_at',
      'idx_platform_governance_events_resource_at',
      'idx_platform_governance_events_channel_at',
    ],
    count: { table: GOVERNANCE_EVENTS_TABLE },
    minimumCount: 1,
    emptyReason: 'governance-event-history-backfill-required',
  },
  {
    id: 'analytics-config-seed',
    label: 'Analytics collection policy',
    required: true,
    tables: [GOVERNANCE_CONFIGS_TABLE],
    indexes: [
      'idx_platform_governance_configs_type_target',
      'idx_platform_governance_configs_unique',
    ],
    count: {
      table: GOVERNANCE_CONFIGS_TABLE,
      where: 'config_type = ?',
      binds: ['analytics_collection'],
    },
    minimumCount: 1,
    emptyReason: 'analytics-policy-seed-missing',
  },
  {
    id: 'storage-policy-seed',
    label: 'Storage channel policy',
    required: true,
    tables: [GOVERNANCE_CONFIGS_TABLE],
    indexes: [
      'idx_platform_governance_configs_type_target',
      'idx_platform_governance_configs_unique',
    ],
    count: {
      table: GOVERNANCE_CONFIGS_TABLE,
      where: 'config_type = ?',
      binds: ['storage_channel'],
    },
    minimumCount: 1,
    emptyReason: 'storage-policy-seed-missing',
  },
  {
    id: 'notification-policy-seed',
    label: 'Notification channel policy',
    required: true,
    tables: [GOVERNANCE_CONFIGS_TABLE],
    indexes: [
      'idx_platform_governance_configs_type_target',
      'idx_platform_governance_configs_unique',
    ],
    count: {
      table: GOVERNANCE_CONFIGS_TABLE,
      where: 'config_type = ?',
      binds: ['notification_channel'],
    },
    minimumCount: 1,
    emptyReason: 'notification-policy-seed-missing',
  },
  {
    id: 'provider-quota-policy-seed',
    label: 'Provider quota policy',
    required: true,
    tables: [GOVERNANCE_CONFIGS_TABLE],
    indexes: [
      'idx_platform_governance_configs_type_target',
      'idx_platform_governance_configs_unique',
    ],
    count: {
      table: GOVERNANCE_CONFIGS_TABLE,
      where: 'config_type = ?',
      binds: ['intelligence_provider_quota'],
    },
    minimumCount: 1,
    emptyReason: 'provider-quota-policy-seed-missing',
  },
  {
    id: 'storage-secure-store-schema',
    label: 'Encrypted storage credentials',
    required: true,
    tables: [STORAGE_CREDENTIALS_TABLE],
    indexes: ['idx_storage_secure_store_type'],
    count: { table: STORAGE_CREDENTIALS_TABLE },
    minimumCount: 1,
    emptyReason: 'storage-credential-backfill-required',
  },
  {
    id: 'notification-secure-store-schema',
    label: 'Encrypted notification credentials',
    required: true,
    tables: [NOTIFICATION_CREDENTIALS_TABLE],
    indexes: ['idx_notification_secure_store_type'],
    count: { table: NOTIFICATION_CREDENTIALS_TABLE },
    minimumCount: 1,
    emptyReason: 'notification-credential-backfill-required',
  },
  {
    id: 'browser-push-subscription-schema',
    label: 'Browser push subscriptions',
    required: true,
    tables: [BROWSER_PUSH_SUBSCRIPTIONS_TABLE],
    indexes: [
      'idx_browser_push_subscriptions_user_endpoint',
      'idx_browser_push_subscriptions_user_updated',
    ],
    count: { table: BROWSER_PUSH_SUBSCRIPTIONS_TABLE },
    minimumCount: 1,
    emptyReason: 'browser-push-subscription-backfill-required',
  },
  {
    id: 'browser-notification-inbox-schema',
    label: 'Browser notification inbox',
    required: true,
    tables: [BROWSER_NOTIFICATION_INBOX_TABLE],
    indexes: [
      'idx_browser_notification_inbox_user_status_created',
      'idx_browser_notification_inbox_resource',
    ],
  },
  {
    id: 'storage-smoke-evidence',
    label: 'Storage smoke evidence',
    required: false,
    tables: [GOVERNANCE_EVENTS_TABLE],
    indexes: ['idx_platform_governance_events_scope_action_at'],
    count: {
      table: GOVERNANCE_EVENTS_TABLE,
      where: 'action IN (?, ?)',
      binds: ['storage.channel_smoke.ready', 'storage.channel_smoke.sent'],
    },
    minimumCount: 1,
    emptyReason: 'storage-smoke-evidence-missing',
  },
  {
    id: 'notification-delivery-evidence',
    label: 'Notification delivery evidence',
    required: false,
    tables: [GOVERNANCE_EVENTS_TABLE],
    indexes: ['idx_platform_governance_events_scope_action_at'],
    count: {
      table: GOVERNANCE_EVENTS_TABLE,
      where: 'action LIKE ?',
      binds: ['notification.delivery.%'],
    },
    minimumCount: 1,
    emptyReason: 'notification-delivery-evidence-missing',
  },
  {
    id: 'upload-health-evidence',
    label: 'Upload health evidence',
    required: false,
    tables: [GOVERNANCE_EVENTS_TABLE],
    indexes: ['idx_platform_governance_events_scope_action_at'],
    count: {
      table: GOVERNANCE_EVENTS_TABLE,
      where: 'scope = ?',
      binds: ['upload'],
    },
    minimumCount: 1,
    emptyReason: 'upload-health-backfill-required',
  },
]

function toSafeInteger(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value))
    return Math.max(0, Math.floor(value))
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }
  return 0
}

function maxStatus(left: PlatformGovernanceD1ReadinessStatus, right: PlatformGovernanceD1ReadinessStatus): PlatformGovernanceD1ReadinessStatus {
  const rank = { ready: 0, warning: 1, blocked: 2 }
  return rank[right] > rank[left] ? right : left
}

async function listSqliteObjects(db: D1Database): Promise<{ tables: Set<string>, indexes: Set<string> }> {
  const result = await db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'index');").all<SqliteObjectRow>()
  const tables = new Set<string>()
  const indexes = new Set<string>()

  for (const row of result.results ?? []) {
    if (typeof row.name !== 'string')
      continue
    if (row.type === 'table')
      tables.add(row.name)
    else if (row.type === 'index')
      indexes.add(row.name)
  }

  return { tables, indexes }
}

async function countRequirementRows(db: D1Database, requirement: ReadinessRequirement): Promise<number | null> {
  if (!requirement.count)
    return null

  const { table, where, binds = [] } = requirement.count
  const sql = where
    ? `SELECT COUNT(*) AS total FROM ${table} WHERE ${where};`
    : `SELECT COUNT(*) AS total FROM ${table};`
  const row = await db.prepare(sql).bind(...binds).first<{ total?: number | string }>()
  return toSafeInteger(row?.total)
}

function createMissingDatabaseCheck(requirement: ReadinessRequirement): PlatformGovernanceD1ReadinessCheck {
  return {
    id: requirement.id,
    label: requirement.label,
    status: 'blocked',
    required: requirement.required,
    reasons: ['d1-binding-missing'],
    tables: requirement.tables,
    indexes: requirement.indexes,
    missingTables: requirement.tables,
    missingIndexes: requirement.indexes,
    observedCount: null,
    minimumCount: requirement.minimumCount ?? null,
  }
}

async function evaluateRequirement(
  db: D1Database,
  objects: { tables: Set<string>, indexes: Set<string> },
  requirement: ReadinessRequirement,
): Promise<PlatformGovernanceD1ReadinessCheck> {
  const missingTables = requirement.tables.filter(table => !objects.tables.has(table))
  const missingIndexes = requirement.indexes.filter(index => !objects.indexes.has(index))
  const reasons: string[] = []
  let status: PlatformGovernanceD1ReadinessStatus = 'ready'
  let observedCount: number | null = null

  if (missingTables.length) {
    status = 'blocked'
    reasons.push('d1-table-missing')
  }
  if (missingIndexes.length) {
    status = maxStatus(status, 'warning')
    reasons.push('d1-index-missing')
  }

  if (!missingTables.length && requirement.count) {
    observedCount = await countRequirementRows(db, requirement)
    const minimumCount = requirement.minimumCount ?? 0
    if ((observedCount ?? 0) < minimumCount) {
      status = maxStatus(status, 'warning')
      reasons.push(requirement.emptyReason ?? 'd1-backfill-required')
    }
  }

  return {
    id: requirement.id,
    label: requirement.label,
    status,
    required: requirement.required,
    reasons,
    tables: requirement.tables,
    indexes: requirement.indexes,
    missingTables,
    missingIndexes,
    observedCount,
    minimumCount: requirement.minimumCount ?? null,
  }
}

function summarizeChecks(checks: PlatformGovernanceD1ReadinessCheck[]): PlatformGovernanceD1Readiness['summary'] {
  return checks.reduce((summary, check) => {
    summary.total += 1
    summary[check.status] += 1
    summary.missingTables += check.missingTables.length
    summary.missingIndexes += check.missingIndexes.length
    if (check.reasons.some(reason => reason.includes('backfill') || reason.includes('seed') || reason.includes('evidence')))
      summary.backfillRequired += 1
    return summary
  }, {
    total: 0,
    ready: 0,
    warning: 0,
    blocked: 0,
    missingTables: 0,
    missingIndexes: 0,
    backfillRequired: 0,
  })
}

export async function getPlatformGovernanceD1Readiness(event: H3Event | undefined): Promise<PlatformGovernanceD1Readiness> {
  const db = event ? readCloudflareBindings(event)?.DB ?? null : null
  const generatedAt = new Date().toISOString()

  if (!db) {
    const checks = READINESS_REQUIREMENTS.map(createMissingDatabaseCheck)
    return {
      status: 'blocked',
      database: {
        present: false,
        binding: null,
      },
      summary: summarizeChecks(checks),
      checks,
      generatedAt,
    }
  }

  const objects = await listSqliteObjects(db)
  const checks = await Promise.all(
    READINESS_REQUIREMENTS.map(requirement => evaluateRequirement(db, objects, requirement)),
  )
  const summary = summarizeChecks(checks)
  const status: PlatformGovernanceD1ReadinessStatus = summary.blocked > 0
    ? 'blocked'
    : summary.warning > 0 ? 'warning' : 'ready'

  return {
    status,
    database: {
      present: true,
      binding: 'DB',
    },
    summary,
    checks,
    generatedAt,
  }
}
