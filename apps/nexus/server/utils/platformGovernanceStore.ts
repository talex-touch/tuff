import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createHash, randomUUID } from 'node:crypto'
import { createError, getHeader } from 'h3'
import { useRuntimeConfig } from '#imports'
import { readCloudflareBindings } from './cloudflare'
import { resolveRequestIp } from './ipSecurityStore'
import { assertNotificationChannelConfig, resolveNotificationChannelProfile, resolveNotificationChannelReadiness } from './notificationChannelCatalog'
import { getPlatformGovernanceD1Readiness } from './platformGovernanceD1Readiness'
import { assertStorageChannelPolicyConfig } from './storageChannelCatalog'
import { isPlainObject, normalizeNumber, normalizeString } from './telemetrySanitizer'
import { scheduleTelemetryRetentionMaintenance } from './telemetryRetentionMaintenance'

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

export interface RecordGovernanceOperatorCockpitViewInput {
  actorId?: unknown
  surface?: unknown
  format?: unknown
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

export interface StorageChannelAnalyticsOptions extends GovernanceAnalyticsOptions {
  channel?: string | null
  provider?: string | null
}

export type PlatformGovernanceReportStatus = 'ok' | 'watch' | 'critical'
export type PlatformGovernanceReportPriority = 'critical' | 'high' | 'medium' | 'low'
export type PlatformGovernanceReportEvidenceStatus = 'live' | 'd1' | 'r2' | 'local-only' | 'memory' | 'open'
const GOVERNANCE_REPORT_EVIDENCE_STATUSES = new Set<PlatformGovernanceReportEvidenceStatus>([
  'live',
  'd1',
  'r2',
  'local-only',
  'memory',
  'open',
])

export interface PlatformGovernanceReportScorecard {
  key: string
  label: string
  value: number
  total: number | null
  unit: string
  delta: number | null
  rate: number | null
  status: PlatformGovernanceReportStatus
  reason: string | null
}

export interface PlatformGovernanceReportRiskQueueItem {
  key: string
  area: 'search' | 'upload' | 'storage' | 'notification' | 'provider-quota'
  priority: PlatformGovernanceReportPriority
  suggestedAction: string
  reason: string
  status: string
  metric: number
  latestAt: string | null
  details: Record<string, string | number | boolean | null>
}

export interface PlatformGovernanceReportEvidenceItem {
  key: string
  label: string
  status: PlatformGovernanceReportEvidenceStatus
  evidenceCount: number
  blocker: string | null
}

export interface PlatformGovernanceReportSnapshot {
  days: number
  generatedAt: string
  report: {
    status: PlatformGovernanceReportStatus
    riskScore: number
    scorecards: PlatformGovernanceReportScorecard[]
    evidenceStatus: PlatformGovernanceReportEvidenceItem[]
    riskQueue: PlatformGovernanceReportRiskQueueItem[]
    leaderboards: {
      hotPlugins: ReturnType<typeof createOperationsDashboardSummary>['leaderboards']['hotPlugins']
      topModels: ReturnType<typeof createOperationsDashboardSummary>['leaderboards']['topModels']
      topProviders: ReturnType<typeof createProviderAnalytics>['leaderboard']
    }
    trendSummary: {
      latestDate: string | null
      operationsDays: number
      peakSearches: number
      peakPluginInstalls: number
      peakProviderTokens: number
      peakRiskScore: number
    }
  }
}

interface PlatformGovernanceD1ReportEvidence {
  status: PlatformGovernanceReportEvidenceStatus
  evidenceCount: number
  blocker: string | null
}

interface GovernanceOperatorCockpitEvidenceItem {
  environment: string
  surface: string | null
  format: string | null
  evidenceSource: PlatformGovernanceReportEvidenceStatus
  views: number
  uniqueActors: number
  authenticatedActors: number
  latestAt: string
}

function formatReportCell(value: unknown): string {
  if (value == null || value === '')
    return '-'
  return String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|')
}

function formatReportNumber(value: number | null | undefined): string {
  return value == null ? '-' : String(Math.round(value * 100) / 100)
}

function formatReportRate(value: number | null | undefined): string {
  return value == null ? '-' : `${formatReportNumber(value)}%`
}

function createMarkdownTable(headers: string[], rows: unknown[][]): string[] {
  return [
    `| ${headers.map(formatReportCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(formatReportCell).join(' | ')} |`),
  ]
}

export function formatPlatformGovernanceReportMarkdown(snapshot: PlatformGovernanceReportSnapshot): string {
  const report = snapshot.report
  const lines = [
    '# Nexus Data Governance Operations Report',
    '',
    `- Generated at: ${formatReportCell(snapshot.generatedAt)}`,
    `- Window: ${formatReportNumber(snapshot.days)} days`,
    `- Status: ${formatReportCell(report.status)}`,
    `- Risk score: ${formatReportNumber(report.riskScore)}`,
    '',
    '## Scorecards',
    '',
    ...createMarkdownTable(
      ['Key', 'Value', 'Total', 'Unit', 'Delta', 'Rate', 'Status', 'Reason'],
      report.scorecards.map(item => [
        item.key,
        formatReportNumber(item.value),
        formatReportNumber(item.total),
        item.unit,
        formatReportRate(item.delta),
        formatReportRate(item.rate),
        item.status,
        item.reason,
      ]),
    ),
    '',
    '## Evidence Status',
    '',
    ...createMarkdownTable(
      ['Key', 'Status', 'Evidence', 'Blocker'],
      report.evidenceStatus.map(item => [
        item.key,
        item.status,
        formatReportNumber(item.evidenceCount),
        item.blocker,
      ]),
    ),
    '',
    '## Risk Queue',
    '',
    ...createMarkdownTable(
      ['Area', 'Priority', 'Status', 'Metric', 'Reason', 'Suggested action', 'Latest at'],
      report.riskQueue.map(item => [
        item.area,
        item.priority,
        item.status,
        formatReportNumber(item.metric),
        item.reason,
        item.suggestedAction,
        item.latestAt,
      ]),
    ),
    '',
    '## Trend Summary',
    '',
    ...createMarkdownTable(
      ['Latest date', 'Timeline days', 'Peak searches', 'Peak plugin installs', 'Peak provider tokens', 'Peak risk score'],
      [[
        report.trendSummary.latestDate,
        formatReportNumber(report.trendSummary.operationsDays),
        formatReportNumber(report.trendSummary.peakSearches),
        formatReportNumber(report.trendSummary.peakPluginInstalls),
        formatReportNumber(report.trendSummary.peakProviderTokens),
        formatReportNumber(report.trendSummary.peakRiskScore),
      ]],
    ),
    '',
    '## Leaderboards',
    '',
    '### Hot Plugins',
    '',
    ...createMarkdownTable(
      ['Plugin', 'Hot score', 'Downloads', 'Installs', 'Invocations', 'Actors'],
      report.leaderboards.hotPlugins.map(item => [
        item.pluginId,
        formatReportNumber(item.hotScore),
        formatReportNumber(item.downloads),
        formatReportNumber(item.installs),
        formatReportNumber(item.invocations),
        formatReportNumber(item.uniqueActors),
      ]),
    ),
    '',
    '### Top Models',
    '',
    ...createMarkdownTable(
      ['Model', 'Tokens', 'Requests', 'Actors'],
      report.leaderboards.topModels.map(item => [
        item.model,
        formatReportNumber(item.tokens),
        formatReportNumber(item.requests),
        formatReportNumber(item.uniqueActors),
      ]),
    ),
    '',
    '### Top Providers',
    '',
    ...createMarkdownTable(
      ['Provider', 'Tokens', 'Requests', 'Quantity', 'Actors'],
      report.leaderboards.topProviders.map(item => [
        item.providerId,
        formatReportNumber(item.tokens),
        formatReportNumber(item.requests),
        formatReportNumber(item.quantity),
        formatReportNumber(item.uniqueActors),
      ]),
    ),
    '',
  ]

  return lines.join('\n')
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

export type IntelligenceProviderQuotaStatus = 'blocked' | 'warning' | 'ok' | 'disabled'

export interface IntelligenceProviderQuotaEvaluation {
  configId: string
  providerId: string
  name: string
  channel: string | null
  provider: string | null
  enabled: boolean
  windowDays: number
  status: IntelligenceProviderQuotaStatus
  usage: {
    requests: number
    tokens: number
  }
  limits: {
    maxRequests: number | null
    maxTokens: number | null
    warningThreshold: number
  }
  utilization: {
    requests: number | null
    tokens: number | null
  }
  remaining: {
    requests: number | null
    tokens: number | null
  }
  overage: {
    requests: number
    tokens: number
  }
  burnRate: {
    requestsPerDay: number
    tokensPerDay: number
  }
  projectedExhaustionDays: {
    requests: number | null
    tokens: number | null
  }
}

export type IntelligenceProviderQuotaSmokeMode = 'dry-run' | 'consume'
export type IntelligenceProviderQuotaSmokeStatus = 'allowed' | 'blocked' | 'consumed' | 'failed'

export interface RunIntelligenceProviderQuotaSmokeInput {
  providerId: unknown
  channel?: unknown
  mode?: unknown
  tokenQuantity?: unknown
  actorId?: unknown
}

export interface IntelligenceProviderQuotaSmokeResult {
  providerId: string
  channel: string | null
  mode: IntelligenceProviderQuotaSmokeMode
  status: IntelligenceProviderQuotaSmokeStatus
  reason: string
  requestRecorded: boolean
  tokensRecorded: number
  evaluation: IntelligenceProviderQuotaEvaluation | null
  generatedAt: string
}

export interface IntelligenceProviderQuotaSmokeEvidenceItem {
  key: string
  providerId: string
  channel: string | null
  mode: IntelligenceProviderQuotaSmokeMode
  evidenceSource: PlatformGovernanceReportEvidenceStatus
  status: IntelligenceProviderQuotaSmokeStatus
  reason: string | null
  requestRecorded: boolean
  tokensRecorded: number
  latestAt: string
  events: number
  allowed: number
  blocked: number
  consumed: number
  failed: number
  uniqueActors: number
}

export interface IntelligenceProviderQuotaBlockEvidenceItem {
  key: string
  providerId: string
  channel: string | null
  evidenceSource: PlatformGovernanceReportEvidenceStatus
  status: 'blocked'
  reason: string | null
  requestBlocked: boolean
  latestAt: string
  events: number
  uniqueActors: number
}

export interface IntelligenceProviderQuotaRiskItem {
  configId: string
  providerId: string
  name: string
  channel: string | null
  provider: string | null
  status: IntelligenceProviderQuotaStatus
  highestUtilization: number
  riskReason: 'blocked' | 'warning-threshold' | 'overage' | 'low-remaining' | 'projected-exhaustion'
  usage: {
    requests: number
    tokens: number
  }
  limits: {
    maxRequests: number | null
    maxTokens: number | null
  }
  remaining: {
    requests: number | null
    tokens: number | null
  }
  overage: {
    requests: number
    tokens: number
  }
  projectedExhaustionDays: {
    requests: number | null
    tokens: number | null
  }
}

export type ProviderQuotaActionQueuePriority = 'critical' | 'high' | 'medium' | 'low'
export type ProviderQuotaActionQueueSuggestedAction =
  | 'increase-token-limit'
  | 'increase-request-limit'
  | 'reduce-provider-traffic'
  | 'split-provider-channel'
  | 'enable-provider-quota'
  | 'set-provider-limit'
  | 'monitor-burn-rate'
export type ProviderQuotaActionQueueReason =
  | 'token-overage'
  | 'request-overage'
  | 'token-exhausted'
  | 'request-exhausted'
  | 'warning-threshold'
  | 'projected-exhaustion'
  | 'quota-disabled'
  | 'missing-hard-limit'

export interface ProviderQuotaActionQueueItem {
  key: string
  priority: ProviderQuotaActionQueuePriority
  suggestedAction: ProviderQuotaActionQueueSuggestedAction
  reason: ProviderQuotaActionQueueReason
  configId: string
  providerId: string
  name: string
  channel: string | null
  provider: string | null
  status: IntelligenceProviderQuotaStatus
  windowDays: number
  requests: number
  tokens: number
  maxRequests: number | null
  maxTokens: number | null
  requestUtilization: number | null
  tokenUtilization: number | null
  remainingRequests: number | null
  remainingTokens: number | null
  requestOverage: number
  tokenOverage: number
  requestsPerDay: number
  tokensPerDay: number
  projectedRequestExhaustionDays: number | null
  projectedTokenExhaustionDays: number | null
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
  remaining: {
    storedBytes: number | null
    trafficBytes: number | null
    operations: number | null
    alertBytes: number | null
  }
  overage: {
    storedBytes: number
    trafficBytes: number
    operations: number
    alertBytes: number
  }
  burnRate: {
    storedBytesPerDay: number
    trafficBytesPerDay: number
    operationsPerDay: number
  }
  projectedExhaustionDays: {
    storedBytes: number | null
    trafficBytes: number | null
    operations: number | null
    alertBytes: number | null
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

type StoragePolicyEvaluationStatus = StoragePolicyEvaluation['status']

interface StoragePolicyAnalyticsSummary {
  total: number
  active: number
  ok: number
  warning: number
  blocked: number
  disabled: number
  alerts: number
  highestStoredUtilization: number
  highestTrafficUtilization: number
  highestOperationUtilization: number
}

interface StoragePolicyAnalytics {
  policySummary: StoragePolicyAnalyticsSummary
  policyRisks: StoragePolicyEvaluation[]
}

type StorageChannelPressureStatus = StoragePolicyEvaluationStatus | 'unmanaged'
type StorageActionQueuePriority = 'critical' | 'high' | 'medium' | 'low'
type StorageActionQueueSuggestedAction =
  | 'configure-policy'
  | 'increase-storage-limit'
  | 'increase-traffic-limit'
  | 'increase-operation-limit'
  | 'review-burn-rate'
  | 'monitor-channel'
type StorageSmokeEvidenceMode = 'dry-run' | 'write' | 'unknown'
type StorageSmokeEvidenceStatus = 'ready' | 'sent' | 'failed'

interface StorageSmokeEvidenceItem {
  key: string
  policyId: string | null
  policyName: string | null
  channel: string | null
  provider: string | null
  mode: StorageSmokeEvidenceMode
  evidenceSource: PlatformGovernanceReportEvidenceStatus
  status: StorageSmokeEvidenceStatus
  reason: string | null
  operations: string[]
  bytesWritten: number
  bytesRead: number
  storageChannel: string | null
  storageProvider: string | null
  credentialRequired: boolean | null
  hasCredentialRef: boolean | null
  hasCredential: boolean | null
  latestAt: string
  events: number
  ready: number
  sent: number
  failed: number
  uniqueActors: number
}

interface StorageActionQueueItem {
  key: string
  priority: StorageActionQueuePriority
  suggestedAction: StorageActionQueueSuggestedAction
  reason: string
  channel: string
  provider: string | null
  policyId: string | null
  policyName: string | null
  pressureStatus: StorageChannelPressureStatus
  events: number
  storedBytes: number
  trafficBytes: number
  operations: number
  writes: number
  reads: number
  deletes: number
  uniqueActors: number
  highestUtilization: number
  policyAlerts: number
  policyReasons: string[]
  remaining: StoragePolicyEvaluation['remaining']
  overage: StoragePolicyEvaluation['overage']
  burnRate: StoragePolicyEvaluation['burnRate']
  projectedExhaustionDays: StoragePolicyEvaluation['projectedExhaustionDays']
  latestTrendDate: string | null
}

interface StorageChannelPressureTrendPoint {
  date: string
  events: number
  storedBytes: number
  trafficBytes: number
  operations: number
  writes: number
  reads: number
  deletes: number
  uniqueActors: number
}

interface StorageChannelPressure {
  channel: string
  provider: string | null
  events: number
  storedBytes: number
  trafficBytes: number
  operations: number
  writes: number
  reads: number
  deletes: number
  uniqueActors: number
  pressureStatus: StorageChannelPressureStatus
  policyId: string | null
  policyName: string | null
  matchedPolicies: number
  policyAlerts: number
  policyReasons: string[]
  highestUtilization: number
  remaining: {
    storedBytes: number | null
    trafficBytes: number | null
    operations: number | null
    alertBytes: number | null
  }
  overage: {
    storedBytes: number
    trafficBytes: number
    operations: number
    alertBytes: number
  }
  burnRate: StoragePolicyEvaluation['burnRate']
  projectedExhaustionDays: StoragePolicyEvaluation['projectedExhaustionDays']
  trend: StorageChannelPressureTrendPoint[]
}

type NotificationChannelRiskStatus = 'ok' | 'warning' | 'disabled'
type NotificationChannelReadinessStatus = 'ready' | 'warning' | 'disabled'
type NotificationActionQueuePriority = 'critical' | 'high' | 'medium' | 'low'
type NotificationActionQueueSource = 'channel-config' | 'delivery-health'
type NotificationDeliveryStatus = 'planned' | 'sent' | 'skipped' | 'failed'
type NotificationActionQueueSuggestedAction =
  | 'enable-channel'
  | 'fix-channel-config'
  | 'bind-credential-ref'
  | 'configure-runtime'
  | 'configure-relay'
  | 'enable-send-mode'
  | 'investigate-failures'
  | 'review-skipped-deliveries'
  | 'monitor-provider'

interface NotificationNumberStat {
  count: number
  average: number
  max: number
}

interface NotificationProviderHealthItem {
  provider: string
  providerType: string | null
  adapter: string | null
  channel: string | null
  total: number
  planned: number
  sent: number
  skipped: number
  failed: number
  sentRate: number
  failureRate: number
  durationMs: NotificationNumberStat
  latestFailureReason: string | null
  latestFailureStatusCode: number | null
  latestFailureAt: string | null
}

interface NotificationTestEvidenceItem {
  key: string
  configId: string
  configName: string | null
  notificationAction: string | null
  channel: string | null
  provider: string | null
  providerType: string | null
  adapter: string | null
  status: NotificationDeliveryStatus
  reason: string | null
  durationMs: number | null
  statusCode: number | null
  latestAt: string
  events: number
  planned: number
  sent: number
  skipped: number
  failed: number
  uniqueActors: number
}

interface NotificationDeliveryEvidenceItem {
  key: string
  configId: string | null
  configName: string | null
  notificationAction: string | null
  resourceType: string | null
  channel: string | null
  provider: string | null
  providerType: string | null
  adapter: string | null
  credentialRequired: boolean | null
  hasCredentialRef: boolean | null
  evidenceSource: PlatformGovernanceReportEvidenceStatus
  status: NotificationDeliveryStatus
  reason: string | null
  durationMs: number | null
  statusCode: number | null
  latestAt: string
  events: number
  planned: number
  sent: number
  skipped: number
  failed: number
  uniqueActors: number
}

interface NotificationActionQueueItem {
  key: string
  source: NotificationActionQueueSource
  priority: NotificationActionQueuePriority
  suggestedAction: NotificationActionQueueSuggestedAction
  reason: string
  configId: string | null
  name: string | null
  channel: string | null
  provider: string | null
  providerType: string | null
  adapter: string | null
  status: NotificationChannelRiskStatus | 'delivery-risk'
  reasons: string[]
  enabled: boolean | null
  credentialRequired: boolean
  hasCredentialRef: boolean
  productionReady: boolean | null
  total: number
  planned: number
  sent: number
  skipped: number
  failed: number
  sentRate: number
  failureRate: number
  durationMs: NotificationNumberStat
  latestFailureReason: string | null
  latestFailureStatusCode: number | null
  latestFailureAt: string | null
}

interface NotificationChannelAnalytics {
  channelSummary: {
    total: number
    enabled: number
    disabled: number
    unsupported: number
    credentialMissing: number
    credentialed: number
    productionReady: number
    runtimeMissing: number
    relayMissing: number
    sendModeMissing: number
  }
  providerMix: Array<{
    key: string
    channel: string
    providerType: string | null
    adapter: string
    total: number
    enabled: number
    productionReady: number
    warning: number
    disabled: number
    credentialMissing: number
    sendModeMissing: number
    relayMissing: number
    runtimeMissing: number
  }>
  channelRisks: Array<{
    configId: string
    name: string
    channel: string
    provider: string | null
    providerType: string | null
    adapter: string
    enabled: boolean
    status: NotificationChannelRiskStatus
    reasons: string[]
    credentialRequired: boolean
    hasCredentialRef: boolean
    readiness: {
      status: NotificationChannelReadinessStatus
      productionReady: boolean
      reasons: string[]
      sendMode: boolean
      requiresPublicRuntime: boolean
      hasPublicRuntime: boolean
      requiresRelayEndpoint: boolean
      hasRelayEndpoint: boolean
    }
  }>
  actionQueue: NotificationActionQueueItem[]
}

type UploadFailureDisposition = 'retry-scheduled' | 'retry-exhausted' | 'retryable' | 'not-retryable' | 'unknown'

type UploadFailureCalibrationStatus = 'verified' | 'sampled' | 'needs-calibration'

type UploadFailureSampleSource = 'live' | 'manual' | 'synthetic' | 'unknown'

interface UploadFailureMatrixItem {
  key: string
  resourceType: string
  surface: string | null
  storageChannel: string | null
  storageProvider: string | null
  reason: string
  disposition: UploadFailureDisposition
  statusCode: number | null
  events: number
  quantity: number
  uniqueActors: number
  latestAt: string
  retryable: number
  scheduled: number
  exhausted: number
  totalRetryCount: number
  nextRetryDelayMs: number | null
  calibrationStatus: UploadFailureCalibrationStatus
  sampleSource: UploadFailureSampleSource
  sampleCount: number
  latestSampleAt: string | null
  suggestedAction: 'retry-monitor' | 'storage-provider-check' | 'quota-policy-check' | 'payload-validation' | 'manual-investigation'
}

type UploadActionQueuePriority = 'critical' | 'high' | 'medium' | 'low'

type UploadActionQueueSuggestedAction = UploadFailureMatrixItem['suggestedAction'] | 'stuck-attempt-check'

interface UploadActionQueueItem {
  key: string
  priority: UploadActionQueuePriority
  suggestedAction: UploadActionQueueSuggestedAction
  reason: string
  resourceType: string
  surface: string | null
  storageChannel: string | null
  storageProvider: string | null
  statusCode: number | null
  events: number
  failedAttempts: number
  stuckAttempts: number
  retryableFailures: number
  scheduledRetries: number
  exhaustedRetries: number
  sampleCount: number
  calibrationStatus: UploadFailureCalibrationStatus | 'unknown'
  sampleSource: UploadFailureSampleSource
  latestAt: string
  oldestAgeMs: number | null
  nextRetryDelayMs: number | null
  evidenceAttemptHashes: string[]
  evidenceResourceHashes: string[]
}

interface UploadProblemAttempt {
  attemptHash: string
  resourceHash: string
  status: 'failed' | 'stuck'
  resourceType: string
  surface: string | null
  storageChannel: string | null
  storageProvider: string | null
  contentType: string | null
  reason: string | null
  statusCode: number | null
  durationMs: number | null
  size: number | null
  retryable: boolean | null
  retryCount: number | null
  maxRetries: number | null
  nextRetryDelayMs: number | null
  latestAt: string
  ageMs: number | null
}

interface UploadRecoveredEvidenceItem {
  attemptHash: string
  resourceHash: string
  resourceType: string
  surface: string | null
  storageChannel: string | null
  storageProvider: string | null
  contentType: string | null
  durationMs: number | null
  size: number | null
  retryCount: number | null
  maxRetries: number | null
  attempts: number | null
  storageOperation: string | null
  storageStatusCode: number | null
  latestAt: string
}

interface UploadSceneAssetHealthItem {
  key: string
  sceneId: string | null
  capability: string | null
  providerId: string | null
  assetKind: string | null
  resourceType: string
  storageChannel: string | null
  storageProvider: string | null
  surface: string
  started: number
  completed: number
  failed: number
  bytes: number
  failureRate: number
  avgDurationMs: number
  avgSize: number
  latestAt: string
  failureReasons: Array<{ key: string, events: number }>
  statusCodes: Array<{ key: string, events: number }>
}

interface UploadAttemptSummary {
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
  retryable: boolean | null
  retryCount: number | null
  maxRetries: number | null
  nextRetryDelayMs: number | null
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
  if (configType === 'notification_channel') {
    assertNoPersistentNotificationRecipients(config.data, 'config')
    assertNotificationChannelConfig({
      channel: optionalString(input.channel, 'channel', 120),
      provider: optionalString(input.provider, 'provider', 120),
      config: config.data,
    })
  }
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

function readEventMetadataStringAny(event: PlatformGovernanceEvent, keys: string[]): string | null {
  for (const key of keys) {
    const value = readEventMetadataString(event, key)
    if (value)
      return value
  }
  return null
}

function readEventMetadataNumber(event: PlatformGovernanceEvent, key: string): number | null {
  const value = event.metadata?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readEventMetadataBoolean(event: PlatformGovernanceEvent, key: string): boolean | null {
  const value = event.metadata?.[key]
  return typeof value === 'boolean' ? value : null
}

function readEventEvidenceSource(event: PlatformGovernanceEvent): PlatformGovernanceReportEvidenceStatus {
  const source = readEventMetadataString(event, 'evidenceSource')
    ?? readEventMetadataString(event, 'source')
  return GOVERNANCE_REPORT_EVIDENCE_STATUSES.has(source as PlatformGovernanceReportEvidenceStatus)
    ? source as PlatformGovernanceReportEvidenceStatus
    : 'local-only'
}

function readEventMetadataNumberAny(event: PlatformGovernanceEvent, keys: string[]): number | null {
  for (const key of keys) {
    const value = readEventMetadataNumber(event, key)
    if (typeof value === 'number')
      return value
  }
  return null
}

function readEventMetadataObject(event: PlatformGovernanceEvent, key: string): Record<string, unknown> | null {
  const value = event.metadata?.[key]
  return isPlainObject(value) ? value : null
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

function normalizeLocalHour(value: number): number | null {
  if (!Number.isFinite(value))
    return null
  const hour = Math.floor(value)
  return hour >= 0 && hour <= 23 ? hour : null
}

function numericBucket(value: number | null, ranges: Array<{ max: number, label: string }>, overflowLabel: string): string | null {
  if (value == null || value < 0)
    return null
  for (const range of ranges) {
    if (value <= range.max)
      return range.label
  }
  return overflowLabel
}

function resultCountBucket(value: number | null): string | null {
  return numericBucket(value, [
    { max: 0, label: '0' },
    { max: 3, label: '1-3' },
    { max: 10, label: '4-10' },
  ], '11+')
}

function queryLengthBucket(value: number | null): string | null {
  return numericBucket(value, [
    { max: 0, label: '0' },
    { max: 10, label: '1-10' },
    { max: 30, label: '11-30' },
    { max: 80, label: '31-80' },
  ], '81+')
}

function latencyBucket(value: number | null): string | null {
  return numericBucket(value, [
    { max: 100, label: '<=100ms' },
    { max: 300, label: '101-300ms' },
    { max: 1000, label: '301-1000ms' },
  ], '1000ms+')
}

function rankBucket(value: number | null): string | null {
  return numericBucket(value, [
    { max: 1, label: '1' },
    { max: 3, label: '2-3' },
    { max: 10, label: '4-10' },
  ], '11+')
}

function localTimeSlotFromHour(hour: number): string {
  if (hour >= 5 && hour < 12)
    return 'morning'
  if (hour >= 12 && hour < 18)
    return 'afternoon'
  if (hour >= 18 && hour < 22)
    return 'evening'
  return 'night'
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

function percentage(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 10000) / 100 : 0
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

function createDailyGrowthTrend(events: PlatformGovernanceEvent[]) {
  let cumulative = 0
  let previousQuantity = 0

  return createDailyTrend(events).map((item) => {
    cumulative += item.quantity
    const growthRate = previousQuantity > 0
      ? ((item.quantity - previousQuantity) / previousQuantity) * 100
      : item.quantity > 0 ? 100 : 0
    previousQuantity = item.quantity

    return {
      ...item,
      cumulative,
      growthRate: Math.round(growthRate * 100) / 100,
    }
  })
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

function createPluginConversionTrend(events: PlatformGovernanceEvent[]) {
  return createPluginDailyTrend(events)
    .map(item => ({
      date: item.date,
      downloads: item.downloads,
      installs: item.installs,
      invocations: item.invocations,
      uniqueActors: item.uniqueActors,
      installRate: item.downloads > 0 ? Math.round((item.installs / item.downloads) * 10000) / 100 : 0,
      invocationRate: item.installs > 0 ? Math.round((item.invocations / item.installs) * 10000) / 100 : 0,
      invocationsPerActor: item.uniqueActors > 0 ? Math.round((item.invocations / item.uniqueActors) * 100) / 100 : 0,
    }))
}

function createPluginActionTrend(events: PlatformGovernanceEvent[], topLimit: number) {
  const timeline = new Map<string, {
    date: string
    actions: Map<string, ReturnType<typeof createMetricBucket>>
  }>()
  for (const event of events) {
    const date = event.occurredAt.slice(0, 10)
    const item = timeline.get(date) ?? {
      date,
      actions: new Map<string, ReturnType<typeof createMetricBucket>>(),
    }
    addMetricBucket(item.actions, event.action, event)
    timeline.set(date, item)
  }
  return Array.from(timeline.values())
    .map(item => ({
      date: item.date,
      actions: mapMetricBuckets(item.actions, topLimit),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function createPluginDimensionTrend(
  events: PlatformGovernanceEvent[],
  topLimit: number,
  dimension: 'channel' | 'version',
) {
  const timeline = new Map<string, {
    date: string
    items: Map<string, ReturnType<typeof createMetricBucket>>
  }>()
  for (const event of events) {
    const date = event.occurredAt.slice(0, 10)
    const item = timeline.get(date) ?? {
      date,
      items: new Map<string, ReturnType<typeof createMetricBucket>>(),
    }
    const key = dimension === 'channel' ? event.channel : readEventMetadataString(event, 'version')
    addMetricBucket(item.items, key, event)
    timeline.set(date, item)
  }
  return Array.from(timeline.values())
    .map(item => ({
      date: item.date,
      items: mapMetricBuckets(item.items, topLimit),
    }))
    .filter(item => item.items.length)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function createPluginLocationTrend(events: PlatformGovernanceEvent[], topLimit: number) {
  const timeline = new Map<string, {
    date: string
    countries: Map<string, ReturnType<typeof createMetricBucket>>
    regions: Map<string, ReturnType<typeof createMetricBucket>>
  }>()
  for (const event of events) {
    const date = event.occurredAt.slice(0, 10)
    const item = timeline.get(date) ?? {
      date,
      countries: new Map<string, ReturnType<typeof createMetricBucket>>(),
      regions: new Map<string, ReturnType<typeof createMetricBucket>>(),
    }
    addMetricBucket(item.countries, readEventMetadataString(event, 'countryCode'), event)
    addMetricBucket(item.regions, readEventMetadataString(event, 'regionCode'), event)
    timeline.set(date, item)
  }
  return Array.from(timeline.values())
    .map(item => ({
      date: item.date,
      countries: mapMetricBuckets(item.countries, topLimit),
      regions: mapMetricBuckets(item.regions, topLimit),
    }))
    .filter(item => item.countries.length || item.regions.length)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function activeDaysBucket(activeDays: number): string {
  if (activeDays <= 1)
    return '1'
  if (activeDays <= 3)
    return '2-3'
  if (activeDays <= 7)
    return '4-7'
  if (activeDays <= 14)
    return '8-14'
  return '15+'
}

function createPluginRetentionAnalytics(events: PlatformGovernanceEvent[], topLimit: number) {
  const actors = new Map<string, {
    activeDates: Set<string>
    invocationDates: Set<string>
    invocations: number
  }>()
  const timeline = new Map<string, {
    date: string
    activeActors: Set<string>
    invocationActors: Set<string>
    invocations: number
  }>()
  const byActiveDays = new Map<string, ReturnType<typeof createMetricBucket>>()

  for (const event of events) {
    const actor = readEventActor(event)
    if (!actor)
      continue

    const date = event.occurredAt.slice(0, 10)
    const actorStats = actors.get(actor) ?? {
      activeDates: new Set<string>(),
      invocationDates: new Set<string>(),
      invocations: 0,
    }
    actorStats.activeDates.add(date)

    const timelineItem = timeline.get(date) ?? {
      date,
      activeActors: new Set<string>(),
      invocationActors: new Set<string>(),
      invocations: 0,
    }
    timelineItem.activeActors.add(actor)

    if (event.action === 'invoke') {
      actorStats.invocations += event.quantity
      actorStats.invocationDates.add(date)
      timelineItem.invocations += event.quantity
      timelineItem.invocationActors.add(actor)
    }

    actors.set(actor, actorStats)
    timeline.set(date, timelineItem)
  }

  let returningActors = 0
  let repeatActors = 0
  let invocationActors = 0
  let totalActiveDays = 0
  let totalInvocations = 0
  let returningInvocations = 0

  for (const [actor, actorStats] of actors.entries()) {
    const activeDays = actorStats.activeDates.size
    totalActiveDays += activeDays
    totalInvocations += actorStats.invocations
    if (activeDays > 1) {
      returningActors += 1
      returningInvocations += actorStats.invocations
    }
    if (actorStats.invocations > 1 || actorStats.invocationDates.size > 1)
      repeatActors += 1
    if (actorStats.invocations > 0)
      invocationActors += 1

    const bucket = byActiveDays.get(activeDaysBucket(activeDays)) ?? createMetricBucket()
    bucket.events += 1
    bucket.quantity += 1
    bucket.actors.add(actor)
    byActiveDays.set(activeDaysBucket(activeDays), bucket)
  }

  const activeActors = actors.size

  return {
    activeActors,
    newActors: Math.max(activeActors - returningActors, 0),
    returningActors,
    repeatActors,
    invocationActors,
    retentionRate: percentage(returningActors, activeActors),
    repeatRate: percentage(repeatActors, invocationActors),
    averageActiveDays: activeActors > 0 ? Math.round((totalActiveDays / activeActors) * 100) / 100 : 0,
    averageInvocationsPerActor: activeActors > 0 ? Math.round((totalInvocations / activeActors) * 100) / 100 : 0,
    averageInvocationsPerReturningActor: returningActors > 0 ? Math.round((returningInvocations / returningActors) * 100) / 100 : 0,
    byActiveDays: mapMetricBuckets(byActiveDays, topLimit),
    trend: Array.from(timeline.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item, index, sorted) => {
        const previousActors = new Set<string>()
        for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
          for (const actor of sorted[previousIndex]?.activeActors ?? [])
            previousActors.add(actor)
        }

        let returning = 0
        for (const actor of item.activeActors) {
          if (previousActors.has(actor))
            returning += 1
        }

        const active = item.activeActors.size
        return {
          date: item.date,
          newActors: Math.max(active - returning, 0),
          returningActors: returning,
          activeActors: active,
          invocationActors: item.invocationActors.size,
          invocations: item.invocations,
          retentionRate: percentage(returning, active),
        }
      }),
  }
}

type PluginInvocationStatus = 'successful' | 'failed' | 'skipped' | 'unknown'

interface PluginUsageTimingTrendPoint {
  date: string
  hours: ReturnType<typeof mapMetricBuckets>
  weekdays: ReturnType<typeof mapMetricBuckets>
  timeSlots: ReturnType<typeof mapMetricBuckets>
}

interface PluginUsageTiming {
  byHour: ReturnType<typeof mapMetricBuckets>
  byWeekday: ReturnType<typeof mapMetricBuckets>
  byTimeSlot: ReturnType<typeof mapMetricBuckets>
  trend: PluginUsageTimingTrendPoint[]
}

type PluginOwnerActionQueuePriority = 'high' | 'medium' | 'low'
type PluginOwnerActionQueueSuggestedAction =
  | 'improve-install-conversion'
  | 'improve-invocation-conversion'
  | 'investigate-invocation-failures'
  | 'improve-retention'
  | 'expand-location-coverage'

interface PluginOwnerActionQueueItem {
  key: string
  priority: PluginOwnerActionQueuePriority
  suggestedAction: PluginOwnerActionQueueSuggestedAction
  reason: string
  downloads: number
  installs: number
  invocations: number
  uniqueActors: number
  installRate: number
  invocationRate: number
  invocationsPerActor: number
  failureRate: number
  retentionRate: number
  topCountryKey: string | null
  topCountryShare: number
  latestDate: string | null
}

function sanitizePluginInvocationDimension(value: string | null): string | null {
  if (!value)
    return null
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, '-')
  if (!normalized)
    return null
  if (normalized.length > 64 || /[@/\\]|https?:|token|secret|password/.test(normalized))
    return 'redacted'
  return normalized
}

function resolvePluginInvocationStatus(event: PlatformGovernanceEvent): PluginInvocationStatus {
  const explicitStatus = sanitizePluginInvocationDimension(readEventMetadataStringAny(event, ['status', 'result', 'outcome', 'state']))
  if (explicitStatus) {
    if (['success', 'successful', 'succeeded', 'ok', 'completed', 'complete', 'resolved'].includes(explicitStatus))
      return 'successful'
    if (['failed', 'failure', 'error', 'errored', 'exception', 'timeout', 'timed-out', 'crashed', 'rejected'].includes(explicitStatus))
      return 'failed'
    if (['skipped', 'skip', 'cancelled', 'canceled', 'ignored', 'blocked', 'noop', 'no-op'].includes(explicitStatus))
      return 'skipped'
  }

  const success = readEventMetadataBoolean(event, 'success')
  if (success === true)
    return 'successful'
  if (success === false)
    return 'failed'

  const skipped = readEventMetadataBoolean(event, 'skipped')
  if (skipped === true)
    return 'skipped'

  return 'unknown'
}

function readPluginInvocationLocalTimeSlot(event: PlatformGovernanceEvent): string {
  const localHour = normalizeLocalHour(readEventMetadataNumber(event, 'localHour') ?? Number.NaN)
  return localHour == null
    ? sanitizePluginInvocationDimension(readEventMetadataString(event, 'localTimeSlot')) ?? 'unknown'
    : localTimeSlotFromHour(localHour)
}

function readPluginLocalHour(event: PlatformGovernanceEvent): number | null {
  return normalizeLocalHour(readEventMetadataNumber(event, 'localHour') ?? Number.NaN)
}

function readPluginLocalWeekday(event: PlatformGovernanceEvent): string | null {
  const localDayOfWeek = readEventMetadataNumber(event, 'localDayOfWeek')
  if (typeof localDayOfWeek === 'number' && localDayOfWeek >= 0 && localDayOfWeek <= 6)
    return String(Math.floor(localDayOfWeek))

  const localWeekday = readEventMetadataNumber(event, 'localWeekday')
  if (typeof localWeekday === 'number' && localWeekday >= 0 && localWeekday <= 6)
    return String(Math.floor(localWeekday))

  return null
}

function createPluginUsageTiming(events: PlatformGovernanceEvent[], topLimit: number): PluginUsageTiming {
  const byHour = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byWeekday = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byTimeSlot = new Map<string, ReturnType<typeof createMetricBucket>>()
  const trend = new Map<string, {
    date: string
    hours: Map<string, ReturnType<typeof createMetricBucket>>
    weekdays: Map<string, ReturnType<typeof createMetricBucket>>
    timeSlots: Map<string, ReturnType<typeof createMetricBucket>>
  }>()

  for (const event of events) {
    const localHour = readPluginLocalHour(event)
    const hourKey = localHour == null ? null : localHour.toString().padStart(2, '0')
    const weekdayKey = readPluginLocalWeekday(event)
    const timeSlotKey = localHour == null
      ? sanitizePluginInvocationDimension(readEventMetadataString(event, 'localTimeSlot'))
      : localTimeSlotFromHour(localHour)
    const date = event.occurredAt.slice(0, 10)
    const trendItem = trend.get(date) ?? {
      date,
      hours: new Map<string, ReturnType<typeof createMetricBucket>>(),
      weekdays: new Map<string, ReturnType<typeof createMetricBucket>>(),
      timeSlots: new Map<string, ReturnType<typeof createMetricBucket>>(),
    }

    addMetricBucket(byHour, hourKey, event)
    addMetricBucket(byWeekday, weekdayKey, event)
    addMetricBucket(byTimeSlot, timeSlotKey, event)
    addMetricBucket(trendItem.hours, hourKey, event)
    addMetricBucket(trendItem.weekdays, weekdayKey, event)
    addMetricBucket(trendItem.timeSlots, timeSlotKey, event)
    trend.set(date, trendItem)
  }

  return {
    byHour: mapMetricBuckets(byHour, 24),
    byWeekday: mapMetricBuckets(byWeekday, 7),
    byTimeSlot: mapMetricBuckets(byTimeSlot, topLimit),
    trend: Array.from(trend.values())
      .map(item => ({
        date: item.date,
        hours: mapMetricBuckets(item.hours, 24),
        weekdays: mapMetricBuckets(item.weekdays, 7),
        timeSlots: mapMetricBuckets(item.timeSlots, topLimit),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
}

function createPluginInvocationHealth(events: PlatformGovernanceEvent[], topLimit: number) {
  const invocationEvents = events.filter(event => event.action === 'invoke')
  const durationMs = createNumberStats()
  const actors = new Set<string>()
  const byStatus = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byFailureReason = new Map<string, ReturnType<typeof createMetricBucket>>()
  const bySurface = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byCountry = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byRegion = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byChannel = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byVersion = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byLocalTimeSlot = new Map<string, ReturnType<typeof createMetricBucket>>()
  const trend = new Map<string, {
    date: string
    total: number
    successful: number
    failed: number
    skipped: number
    unknown: number
    actors: Set<string>
    durationMs: ReturnType<typeof createNumberStats>
  }>()
  let successful = 0
  let failed = 0
  let skipped = 0
  let unknown = 0

  for (const event of invocationEvents) {
    const status = resolvePluginInvocationStatus(event)
    const eventQuantity = event.quantity
    const eventDurationMs = readEventMetadataNumberAny(event, ['durationMs', 'latencyMs', 'elapsedMs'])
    const actor = readEventActor(event)
    const date = event.occurredAt.slice(0, 10)
    const trendItem = trend.get(date) ?? {
      date,
      total: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      unknown: 0,
      actors: new Set<string>(),
      durationMs: createNumberStats(),
    }

    if (actor) {
      actors.add(actor)
      trendItem.actors.add(actor)
    }

    if (status === 'successful')
      successful += eventQuantity
    else if (status === 'failed')
      failed += eventQuantity
    else if (status === 'skipped')
      skipped += eventQuantity
    else
      unknown += eventQuantity

    trendItem.total += eventQuantity
    trendItem[status] += eventQuantity
    addNumberStat(durationMs, eventDurationMs)
    addNumberStat(trendItem.durationMs, eventDurationMs)
    addMetricBucket(byStatus, status, event, eventQuantity)
    addMetricBucket(bySurface, sanitizePluginInvocationDimension(readEventMetadataString(event, 'surface')), event, eventQuantity)
    addMetricBucket(byCountry, sanitizePluginInvocationDimension(readEventMetadataString(event, 'countryCode')), event, eventQuantity)
    addMetricBucket(byRegion, sanitizePluginInvocationDimension(readEventMetadataString(event, 'regionCode')), event, eventQuantity)
    addMetricBucket(byChannel, sanitizePluginInvocationDimension(event.channel), event, eventQuantity)
    addMetricBucket(byVersion, sanitizePluginInvocationDimension(readEventMetadataString(event, 'version')), event, eventQuantity)
    addMetricBucket(byLocalTimeSlot, readPluginInvocationLocalTimeSlot(event), event, eventQuantity)

    if (status === 'failed') {
      addMetricBucket(
        byFailureReason,
        sanitizePluginInvocationDimension(readEventMetadataStringAny(event, ['reason', 'failureReason', 'errorCode', 'errorType'])),
        event,
        eventQuantity,
      )
    }

    trend.set(date, trendItem)
  }

  const total = successful + failed + skipped + unknown

  return {
    total,
    successful,
    failed,
    skipped,
    unknown,
    uniqueActors: actors.size,
    successRate: percentage(successful, total),
    failureRate: percentage(failed, total),
    durationMs: mapNumberStat(durationMs),
    byStatus: mapMetricBuckets(byStatus, topLimit),
    byFailureReason: mapMetricBuckets(byFailureReason, topLimit),
    bySurface: mapMetricBuckets(bySurface, topLimit),
    byCountry: mapMetricBuckets(byCountry, topLimit),
    byRegion: mapMetricBuckets(byRegion, topLimit),
    byChannel: mapMetricBuckets(byChannel, topLimit),
    byVersion: mapMetricBuckets(byVersion, topLimit),
    byLocalTimeSlot: mapMetricBuckets(byLocalTimeSlot, topLimit),
    trend: Array.from(trend.values())
      .map(item => ({
        date: item.date,
        total: item.total,
        successful: item.successful,
        failed: item.failed,
        skipped: item.skipped,
        unknown: item.unknown,
        uniqueActors: item.actors.size,
        successRate: percentage(item.successful, item.total),
        failureRate: percentage(item.failed, item.total),
        durationMs: mapNumberStat(item.durationMs),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
}

function rankPluginOwnerActionQueuePriority(priority: PluginOwnerActionQueuePriority): number {
  switch (priority) {
    case 'high':
      return 3
    case 'medium':
      return 2
    default:
      return 1
  }
}

function createPluginOwnerActionQueue(input: {
  downloads: number
  installs: number
  invocations: number
  uniqueActors: number
  conversion: {
    installRate: number
    invocationRate: number
    invocationsPerActor: number
  }
  invocationHealth: ReturnType<typeof createPluginInvocationHealth>
  retention: ReturnType<typeof createPluginRetentionAnalytics>
  trend: ReturnType<typeof createPluginDailyTrend>
  byCountry: ReturnType<typeof mapMetricBuckets>
}): PluginOwnerActionQueueItem[] {
  if (input.downloads <= 0 && input.installs <= 0 && input.invocations <= 0)
    return []

  const knownCountries = input.byCountry
    .map(item => ({
      ...item,
      key: sanitizePluginInvocationDimension(item.key),
    }))
    .filter(item => item.key && item.key !== 'unknown' && item.key !== 'redacted')
  const topCountry = knownCountries[0] ?? null
  const knownCountryQuantity = knownCountries.reduce((sum, item) => sum + item.quantity, 0)
  const topCountryShare = topCountry ? percentage(topCountry.quantity, knownCountryQuantity) : 0
  const latestDate = input.trend.at(-1)?.date
    ?? input.invocationHealth.trend.at(-1)?.date
    ?? input.retention.trend.at(-1)?.date
    ?? null
  const baseMetrics = {
    downloads: input.downloads,
    installs: input.installs,
    invocations: input.invocations,
    uniqueActors: input.uniqueActors,
    installRate: input.conversion.installRate,
    invocationRate: input.conversion.invocationRate,
    invocationsPerActor: input.conversion.invocationsPerActor,
    failureRate: input.invocationHealth.failureRate,
    retentionRate: input.retention.retentionRate,
    topCountryKey: topCountry?.key ?? null,
    topCountryShare,
    latestDate,
  }
  const queue: PluginOwnerActionQueueItem[] = []

  if (input.downloads >= 5 && input.conversion.installRate < 25) {
    queue.push({
      key: 'low-install-conversion',
      priority: input.conversion.installRate < 10 ? 'high' : 'medium',
      suggestedAction: 'improve-install-conversion',
      reason: 'low-install-rate',
      ...baseMetrics,
    })
  }

  if (input.installs >= 3 && input.conversion.invocationRate < 50) {
    queue.push({
      key: 'low-invocation-conversion',
      priority: input.conversion.invocationRate < 25 ? 'high' : 'medium',
      suggestedAction: 'improve-invocation-conversion',
      reason: 'low-invocation-rate',
      ...baseMetrics,
    })
  }

  if (input.invocationHealth.total >= 5 && input.invocationHealth.failureRate >= 10) {
    queue.push({
      key: 'high-invocation-failure-rate',
      priority: input.invocationHealth.failureRate >= 25 ? 'high' : 'medium',
      suggestedAction: 'investigate-invocation-failures',
      reason: 'high-invocation-failure-rate',
      ...baseMetrics,
    })
  }

  if (input.retention.activeActors >= 3 && input.retention.retentionRate < 35) {
    queue.push({
      key: 'low-return-rate',
      priority: input.retention.retentionRate < 15 ? 'high' : 'medium',
      suggestedAction: 'improve-retention',
      reason: 'low-return-rate',
      ...baseMetrics,
    })
  }

  if (input.uniqueActors >= 5 && knownCountries.length === 1 && topCountryShare >= 80) {
    queue.push({
      key: 'single-country-concentration',
      priority: topCountryShare >= 95 ? 'medium' : 'low',
      suggestedAction: 'expand-location-coverage',
      reason: 'single-country-concentration',
      ...baseMetrics,
    })
  }

  return queue.sort((a, b) => {
    const priorityDelta = rankPluginOwnerActionQueuePriority(b.priority) - rankPluginOwnerActionQueuePriority(a.priority)
    return priorityDelta || a.key.localeCompare(b.key)
  })
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

function notificationChannelStatusRank(status: NotificationChannelRiskStatus): number {
  if (status === 'warning')
    return 3
  if (status === 'disabled')
    return 2
  return 1
}

function hasWebPushPublicKeyRuntime(event: H3Event | undefined): boolean {
  const bindings = event ? readCloudflareBindings(event) : undefined
  const runtimeConfig = event
    ? useRuntimeConfig(event) as { notificationWebPush?: { publicKey?: string } }
    : null
  return Boolean(
    normalizeString(bindings?.NOTIFICATION_WEB_PUSH_PUBLIC_KEY, 4096)
    ?? normalizeString(runtimeConfig?.notificationWebPush?.publicKey, 4096)
    ?? normalizeString(process.env.NOTIFICATION_WEB_PUSH_PUBLIC_KEY, 4096),
  )
}

type NotificationChannelRisk = NotificationChannelAnalytics['channelRisks'][number]

function notificationProviderMixKey(item: Pick<NotificationChannelRisk, 'channel' | 'providerType' | 'adapter'>): string {
  return `${item.channel}:${item.providerType ?? 'default'}:${item.adapter}`
}

function createNotificationProviderMix(risks: NotificationChannelRisk[], topLimit: number): NotificationChannelAnalytics['providerMix'] {
  const providers = new Map<string, NotificationChannelAnalytics['providerMix'][number]>()

  for (const item of risks) {
    const key = notificationProviderMixKey(item)
    const bucket = providers.get(key) ?? {
      key,
      channel: item.channel,
      providerType: item.providerType,
      adapter: item.adapter,
      total: 0,
      enabled: 0,
      productionReady: 0,
      warning: 0,
      disabled: 0,
      credentialMissing: 0,
      sendModeMissing: 0,
      relayMissing: 0,
      runtimeMissing: 0,
    }

    bucket.total += 1
    if (item.enabled)
      bucket.enabled += 1
    if (item.readiness.productionReady)
      bucket.productionReady += 1
    if (item.status === 'warning')
      bucket.warning += 1
    if (item.status === 'disabled')
      bucket.disabled += 1
    if (item.reasons.includes('credential-ref-required'))
      bucket.credentialMissing += 1
    if (item.readiness.reasons.includes('send-mode-required'))
      bucket.sendModeMissing += 1
    if (item.readiness.reasons.includes('smtp-relay-endpoint-required'))
      bucket.relayMissing += 1
    if (item.readiness.reasons.includes('webpush-vapid-public-key-missing'))
      bucket.runtimeMissing += 1

    providers.set(key, bucket)
  }

  return Array.from(providers.values())
    .sort((left, right) => {
      return right.warning + right.disabled - (left.warning + left.disabled)
        || right.productionReady - left.productionReady
        || right.total - left.total
        || left.key.localeCompare(right.key)
    })
    .slice(0, topLimit)
}

function emptyNotificationNumberStat(): NotificationNumberStat {
  return {
    count: 0,
    average: 0,
    max: 0,
  }
}

function rankNotificationActionQueuePriority(priority: NotificationActionQueuePriority): number {
  if (priority === 'critical')
    return 4
  if (priority === 'high')
    return 3
  if (priority === 'medium')
    return 2
  return 1
}

function resolveNotificationChannelActionPriority(item: NotificationChannelRisk): NotificationActionQueuePriority {
  if (item.status === 'warning')
    return 'high'
  if (item.status === 'disabled')
    return 'medium'
  return 'low'
}

function resolveNotificationChannelSuggestedAction(item: NotificationChannelRisk): NotificationActionQueueSuggestedAction {
  if (item.reasons.includes('unsupported-adapter'))
    return 'fix-channel-config'
  if (item.reasons.includes('credential-ref-required'))
    return 'bind-credential-ref'
  if (item.readiness.reasons.includes('webpush-vapid-public-key-missing'))
    return 'configure-runtime'
  if (item.readiness.reasons.includes('smtp-relay-endpoint-required'))
    return 'configure-relay'
  if (item.readiness.reasons.includes('send-mode-required'))
    return 'enable-send-mode'
  if (item.reasons.includes('channel-disabled'))
    return 'enable-channel'
  return 'fix-channel-config'
}

function resolveNotificationChannelActionReason(item: NotificationChannelRisk): string {
  const reasonOrder = [
    'unsupported-adapter',
    'credential-ref-required',
    'webpush-vapid-public-key-missing',
    'smtp-relay-endpoint-required',
    'send-mode-required',
    'channel-disabled',
  ]
  return reasonOrder.find(reason => item.reasons.includes(reason)) ?? item.reasons[0] ?? 'channel-risk'
}

function resolveNotificationProviderActionPriority(item: NotificationProviderHealthItem): NotificationActionQueuePriority {
  if (item.failed > 0 && item.failureRate >= 50)
    return 'critical'
  if (item.failed > 0)
    return 'high'
  if (item.skipped > 0)
    return 'medium'
  if (item.total >= 3 && item.sentRate < 50)
    return 'medium'
  return 'low'
}

function resolveNotificationProviderSuggestedAction(item: NotificationProviderHealthItem): NotificationActionQueueSuggestedAction {
  if (item.failed > 0)
    return 'investigate-failures'
  if (item.skipped > 0)
    return 'review-skipped-deliveries'
  return 'monitor-provider'
}

function resolveNotificationProviderActionReason(item: NotificationProviderHealthItem): string {
  if (item.failed > 0)
    return item.latestFailureReason ?? 'delivery-failure'
  if (item.skipped > 0)
    return 'skipped-deliveries'
  if (item.sentRate < 50)
    return 'low-sent-rate'
  return 'provider-monitor'
}

function createNotificationActionQueue(
  channelRisks: NotificationChannelRisk[],
  providerHealth: NotificationProviderHealthItem[],
  topLimit: number,
): NotificationActionQueueItem[] {
  const channelItems = channelRisks.map((item): NotificationActionQueueItem => ({
    key: `channel:${item.configId}`,
    source: 'channel-config',
    priority: resolveNotificationChannelActionPriority(item),
    suggestedAction: resolveNotificationChannelSuggestedAction(item),
    reason: resolveNotificationChannelActionReason(item),
    configId: item.configId,
    name: item.name,
    channel: item.channel,
    provider: item.provider,
    providerType: item.providerType,
    adapter: item.adapter,
    status: item.status,
    reasons: item.reasons,
    enabled: item.enabled,
    credentialRequired: item.credentialRequired,
    hasCredentialRef: item.hasCredentialRef,
    productionReady: item.readiness.productionReady,
    total: 0,
    planned: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    sentRate: 0,
    failureRate: 0,
    durationMs: emptyNotificationNumberStat(),
    latestFailureReason: null,
    latestFailureStatusCode: null,
    latestFailureAt: null,
  }))

  const providerItems = providerHealth.map((item): NotificationActionQueueItem => ({
    key: `provider:${item.provider}:${item.providerType ?? 'default'}:${item.adapter ?? 'default'}`,
    source: 'delivery-health',
    priority: resolveNotificationProviderActionPriority(item),
    suggestedAction: resolveNotificationProviderSuggestedAction(item),
    reason: resolveNotificationProviderActionReason(item),
    configId: null,
    name: null,
    channel: item.channel,
    provider: item.provider,
    providerType: item.providerType,
    adapter: item.adapter,
    status: 'delivery-risk',
    reasons: [resolveNotificationProviderActionReason(item)],
    enabled: null,
    credentialRequired: false,
    hasCredentialRef: false,
    productionReady: null,
    total: item.total,
    planned: item.planned,
    sent: item.sent,
    skipped: item.skipped,
    failed: item.failed,
    sentRate: item.sentRate,
    failureRate: item.failureRate,
    durationMs: item.durationMs,
    latestFailureReason: item.latestFailureReason,
    latestFailureStatusCode: item.latestFailureStatusCode,
    latestFailureAt: item.latestFailureAt,
  }))

  return [...channelItems, ...providerItems]
    .filter(item => item.priority !== 'low')
    .sort((left, right) => rankNotificationActionQueuePriority(right.priority) - rankNotificationActionQueuePriority(left.priority)
      || right.failed - left.failed
      || right.skipped - left.skipped
      || right.reasons.length - left.reasons.length
      || right.total - left.total
      || left.key.localeCompare(right.key))
    .slice(0, topLimit)
}

function createNotificationChannelAnalytics(
  configs: PlatformGovernanceConfig[],
  topLimit: number,
  event?: H3Event,
): NotificationChannelAnalytics {
  const runtime = {
    webPushPublicKeyConfigured: hasWebPushPublicKeyRuntime(event),
  }
  const risks = configs.map((config) => {
    const profile = resolveNotificationChannelProfile(config)
    const readiness = resolveNotificationChannelReadiness(config, runtime)
    const reasons: string[] = []
    if (!config.enabled)
      reasons.push('channel-disabled')
    if (!profile.supported)
      reasons.push('unsupported-adapter')
    if (profile.credentialRequired && !profile.credentialRef)
      reasons.push('credential-ref-required')
    const allReasons = Array.from(new Set([...reasons, ...readiness.reasons]))
    const status: NotificationChannelRiskStatus = !config.enabled
      ? 'disabled'
      : allReasons.length ? 'warning' : 'ok'

    return {
      configId: config.id,
      name: config.name,
      channel: profile.channel,
      provider: profile.provider,
      providerType: profile.providerType,
      adapter: profile.adapter,
      enabled: config.enabled,
      status,
      reasons: allReasons,
      credentialRequired: profile.credentialRequired,
      hasCredentialRef: Boolean(profile.credentialRef),
      readiness,
    }
  })
  const summary = risks.reduce((result, item) => {
    result.total += 1
    if (item.enabled)
      result.enabled += 1
    else
      result.disabled += 1
    if (item.reasons.includes('unsupported-adapter'))
      result.unsupported += 1
    if (item.reasons.includes('credential-ref-required'))
      result.credentialMissing += 1
    if (item.credentialRequired)
      result.credentialed += 1
    if (item.readiness.productionReady)
      result.productionReady += 1
    if (item.readiness.reasons.includes('webpush-vapid-public-key-missing'))
      result.runtimeMissing += 1
    if (item.readiness.reasons.includes('smtp-relay-endpoint-required'))
      result.relayMissing += 1
    if (item.readiness.reasons.includes('send-mode-required'))
      result.sendModeMissing += 1
    return result
  }, {
    total: 0,
    enabled: 0,
    disabled: 0,
    unsupported: 0,
    credentialMissing: 0,
    credentialed: 0,
    productionReady: 0,
    runtimeMissing: 0,
    relayMissing: 0,
    sendModeMissing: 0,
  })

  const channelRisks = risks
    .filter(item => item.status !== 'ok')
    .sort((left, right) => notificationChannelStatusRank(right.status) - notificationChannelStatusRank(left.status) || right.reasons.length - left.reasons.length)
    .slice(0, topLimit)

  return {
    channelSummary: summary,
    providerMix: createNotificationProviderMix(risks, topLimit),
    channelRisks,
    actionQueue: createNotificationActionQueue(channelRisks, [], topLimit),
  }
}

function parseNotificationDeliveryStatus(action: string): NotificationDeliveryStatus | null {
  const status = action.slice('notification.delivery.'.length)
  if (status === 'planned' || status === 'sent' || status === 'skipped' || status === 'failed')
    return status
  return null
}

function readNotificationTestConfigId(event: PlatformGovernanceEvent): string | null {
  const context = readEventMetadataObject(event, 'context')
  if (!context)
    return null

  const channelTestId = typeof context.channelTestId === 'string' && context.channelTestId.trim()
    ? context.channelTestId.trim()
    : null
  if (channelTestId)
    return channelTestId

  return context.test === true ? readEventMetadataString(event, 'configId') : null
}

function isNotificationTestDeliveryEvent(event: PlatformGovernanceEvent): boolean {
  return Boolean(readNotificationTestConfigId(event))
}

function readNotificationDeliveryEvidenceStatus(event: PlatformGovernanceEvent): NotificationDeliveryStatus | null {
  const status = parseNotificationDeliveryStatus(event.action)
  if (!status || isNotificationTestDeliveryEvent(event))
    return null
  return status
}

function createNotificationTestEvidence(
  deliveryEvents: PlatformGovernanceEvent[],
  topLimit: number,
): NotificationTestEvidenceItem[] {
  const buckets = new Map<string, NotificationTestEvidenceItem & { actors: Set<string>, latestTime: number }>()

  for (const event of deliveryEvents) {
    const status = parseNotificationDeliveryStatus(event.action)
    const configId = readNotificationTestConfigId(event)
    if (!status || !configId)
      continue

    const notificationAction = readEventMetadataString(event, 'notificationAction')
    const key = `${configId}:${notificationAction ?? 'unknown'}`
    const occurredTime = Date.parse(event.occurredAt)
    const latestTime = Number.isFinite(occurredTime) ? occurredTime : 0
    const item = buckets.get(key) ?? {
      key,
      configId,
      configName: readEventMetadataString(event, 'configName'),
      notificationAction,
      channel: event.channel,
      provider: readEventMetadataString(event, 'provider'),
      providerType: readEventMetadataString(event, 'providerType'),
      adapter: readEventMetadataString(event, 'adapter'),
      status,
      reason: readEventMetadataString(event, 'reason'),
      durationMs: readEventMetadataNumber(event, 'durationMs'),
      statusCode: readEventMetadataNumber(event, 'statusCode'),
      latestAt: event.occurredAt,
      latestTime,
      events: 0,
      planned: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      uniqueActors: 0,
      actors: new Set<string>(),
    }

    item.events += 1
    item[status] += 1
    if (latestTime >= item.latestTime) {
      item.configName = readEventMetadataString(event, 'configName') ?? item.configName
      item.notificationAction = notificationAction ?? item.notificationAction
      item.channel = event.channel
      item.provider = readEventMetadataString(event, 'provider')
      item.providerType = readEventMetadataString(event, 'providerType')
      item.adapter = readEventMetadataString(event, 'adapter')
      item.status = status
      item.reason = readEventMetadataString(event, 'reason')
      item.durationMs = readEventMetadataNumber(event, 'durationMs')
      item.statusCode = readEventMetadataNumber(event, 'statusCode')
      item.latestAt = event.occurredAt
      item.latestTime = latestTime
    }
    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)
    buckets.set(key, item)
  }

  return Array.from(buckets.values())
    .map(({ actors, latestTime: _latestTime, ...item }) => ({
      ...item,
      uniqueActors: actors.size,
    }))
    .sort((left, right) => right.latestAt.localeCompare(left.latestAt) || right.failed - left.failed || right.sent - left.sent || right.events - left.events)
    .slice(0, topLimit)
}

function createNotificationDeliveryEvidence(
  deliveryEvents: PlatformGovernanceEvent[],
  topLimit: number,
): NotificationDeliveryEvidenceItem[] {
  const buckets = new Map<string, NotificationDeliveryEvidenceItem & { actors: Set<string>, latestTime: number }>()

  for (const event of deliveryEvents) {
    const status = readNotificationDeliveryEvidenceStatus(event)
    if (!status)
      continue

    const configId = readEventMetadataString(event, 'configId')
    const notificationAction = readEventMetadataString(event, 'notificationAction')
    const provider = readEventMetadataString(event, 'provider') ?? event.channel ?? 'unknown'
    const providerType = readEventMetadataString(event, 'providerType')
    const adapter = readEventMetadataString(event, 'adapter')
    const resourceType = event.resourceType
    const key = `${configId ?? provider}:${notificationAction ?? 'unknown'}:${resourceType ?? 'unknown'}`
    const occurredTime = Date.parse(event.occurredAt)
    const latestTime = Number.isFinite(occurredTime) ? occurredTime : 0
    const item = buckets.get(key) ?? {
      key,
      configId,
      configName: readEventMetadataString(event, 'configName'),
      notificationAction,
      resourceType,
      channel: event.channel,
      provider,
      providerType,
      adapter,
      credentialRequired: readEventMetadataBoolean(event, 'credentialRequired'),
      hasCredentialRef: readEventMetadataBoolean(event, 'hasCredentialRef'),
      evidenceSource: readEventEvidenceSource(event),
      status,
      reason: readEventMetadataString(event, 'reason'),
      durationMs: readEventMetadataNumber(event, 'durationMs'),
      statusCode: readEventMetadataNumber(event, 'statusCode'),
      latestAt: event.occurredAt,
      latestTime,
      events: 0,
      planned: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      uniqueActors: 0,
      actors: new Set<string>(),
    }

    item.events += 1
    item[status] += 1
    if (latestTime >= item.latestTime) {
      item.configId = configId ?? item.configId
      item.configName = readEventMetadataString(event, 'configName') ?? item.configName
      item.notificationAction = notificationAction ?? item.notificationAction
      item.resourceType = resourceType ?? item.resourceType
      item.channel = event.channel
      item.provider = provider
      item.providerType = providerType
      item.adapter = adapter
      item.credentialRequired = readEventMetadataBoolean(event, 'credentialRequired')
      item.hasCredentialRef = readEventMetadataBoolean(event, 'hasCredentialRef')
      item.evidenceSource = readEventEvidenceSource(event)
      item.status = status
      item.reason = readEventMetadataString(event, 'reason')
      item.durationMs = readEventMetadataNumber(event, 'durationMs')
      item.statusCode = readEventMetadataNumber(event, 'statusCode')
      item.latestAt = event.occurredAt
      item.latestTime = latestTime
    }
    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)
    buckets.set(key, item)
  }

  return Array.from(buckets.values())
    .map(({ actors, latestTime: _latestTime, ...item }) => ({
      ...item,
      uniqueActors: actors.size,
    }))
    .sort((left, right) => right.latestAt.localeCompare(left.latestAt) || right.sent - left.sent || right.failed - left.failed || right.events - left.events)
    .slice(0, topLimit)
}

function createNotificationAnalytics(
  events: PlatformGovernanceEvent[],
  topLimit: number,
  configs: PlatformGovernanceConfig[] = [],
  event?: H3Event,
) {
  const deliveryEvents = events.filter(event => event.action.startsWith('notification.delivery.'))
  const pushSubscriptionEvents = events.filter(event => event.action.startsWith('browser_push.subscription.'))
  const byDeliveryStatus = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byProvider = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byAdapter = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byReason = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byStatusCode = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byNotificationAction = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byPushSubscriptionAction = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byPushEndpointHost = new Map<string, ReturnType<typeof createMetricBucket>>()
  const deliveryDurationMs = createNumberStats()
  const deliveryTrend = new Map<string, {
    date: string
    events: number
    planned: number
    sent: number
    skipped: number
    failed: number
    quantity: number
    actors: Set<string>
  }>()
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
    latestFailureStatusCode: number | null
    latestFailureAt: string | null
    durationMs: ReturnType<typeof createNumberStats>
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
    const durationMs = readEventMetadataNumber(event, 'durationMs')
    const statusCode = readEventMetadataNumber(event, 'statusCode')
    const date = event.occurredAt.slice(0, 10)
    const trendItem = deliveryTrend.get(date) ?? {
      date,
      events: 0,
      planned: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      quantity: 0,
      actors: new Set<string>(),
    }
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
      latestFailureStatusCode: null,
      latestFailureAt: null,
      durationMs: createNumberStats(),
    }
    providerItem.providerType ||= providerType
    providerItem.adapter ||= adapter
    providerItem.channel ||= event.channel
    providerItem.total += 1
    addNumberStat(providerItem.durationMs, durationMs)
    addNumberStat(deliveryDurationMs, durationMs)

    trendItem.events += 1
    trendItem.quantity += event.quantity
    const actor = readEventActor(event)
    if (actor)
      trendItem.actors.add(actor)

    if (status === 'planned') {
      planned += 1
      trendItem.planned += 1
    }
    else if (status === 'sent') {
      sent += 1
      trendItem.sent += 1
    }
    else if (status === 'skipped') {
      skipped += 1
      trendItem.skipped += 1
    }
    else if (status === 'failed') {
      failed += 1
      trendItem.failed += 1
      if (!providerItem.latestFailureAt || event.occurredAt.localeCompare(providerItem.latestFailureAt) > 0) {
        providerItem.latestFailureAt = event.occurredAt
        providerItem.latestFailureReason = reason
        providerItem.latestFailureStatusCode = statusCode
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
    deliveryTrend.set(date, trendItem)

    addMetricBucket(byDeliveryStatus, status, event, 1)
    addMetricBucket(byProvider, provider, event, 1)
    addMetricBucket(byAdapter, adapter, event, 1)
    addMetricBucket(byReason, reason, event, 1)
    if (typeof statusCode === 'number')
      addMetricBucket(byStatusCode, String(Math.round(statusCode)), event, 1)
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
  const channelAnalytics = createNotificationChannelAnalytics(configs, topLimit, event)
  const mappedProviderHealth: NotificationProviderHealthItem[] = Array.from(providerHealth.values())
    .map(item => ({
      ...item,
      sentRate: item.total ? Math.round((item.sent / item.total) * 10000) / 100 : 0,
      failureRate: item.total ? Math.round((item.failed / item.total) * 10000) / 100 : 0,
      durationMs: mapNumberStat(item.durationMs),
    }))
    .sort((a, b) => b.failed - a.failed || b.failureRate - a.failureRate || b.total - a.total)
    .slice(0, topLimit)

  return {
    ...createScopedAnalytics(events, topLimit),
    ...channelAnalytics,
    actionQueue: createNotificationActionQueue(channelAnalytics.channelRisks, mappedProviderHealth, topLimit),
    deliveries: {
      total,
      planned,
      sent,
      skipped,
      failed,
      plannedRate: total ? Math.round(((planned + sent) / total) * 10000) / 100 : 0,
      sentRate: total ? Math.round((sent / total) * 10000) / 100 : 0,
      failureRate: total ? Math.round((failed / total) * 10000) / 100 : 0,
      durationMs: mapNumberStat(deliveryDurationMs),
    },
    byDeliveryStatus: mapMetricBuckets(byDeliveryStatus, topLimit),
    byProvider: mapMetricBuckets(byProvider, topLimit),
    byAdapter: mapMetricBuckets(byAdapter, topLimit),
    byReason: mapMetricBuckets(byReason, topLimit),
    byStatusCode: mapMetricBuckets(byStatusCode, topLimit),
    byNotificationAction: mapMetricBuckets(byNotificationAction, topLimit),
    deliveryTrend: Array.from(deliveryTrend.values())
      .map(item => ({
        date: item.date,
        events: item.events,
        planned: item.planned,
        sent: item.sent,
        skipped: item.skipped,
        failed: item.failed,
        quantity: item.quantity,
        uniqueActors: item.actors.size,
    }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    providerHealth: mappedProviderHealth,
    deliveryEvidence: createNotificationDeliveryEvidence(deliveryEvents, topLimit),
    testEvidence: createNotificationTestEvidence(deliveryEvents, topLimit),
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
    signupGrowthTrend: createDailyGrowthTrend(signupEvents),
    heatmap: createTimeHeatmap(userEvents),
    byAction: mapMetricBuckets(byAction, topLimit),
    bySource: mapMetricBuckets(bySource, topLimit),
    byCountry: mapMetricBuckets(byCountry, topLimit),
    byRegion: mapMetricBuckets(byRegion, topLimit),
    byTimezone: mapMetricBuckets(byTimezone, topLimit),
  }
}

function createVisitAnalytics(events: PlatformGovernanceEvent[], days: number, topLimit: number) {
  const visitEvents = events.filter(item => item.scope === 'app' && item.action === 'visit')
  const byRoute = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byPage = new Map<string, ReturnType<typeof createMetricBucket>>()
  const bySurface = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byReferrer = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byLocalHour = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byLocalTimeSlot = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byLocalDayOfWeek = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byCountry = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byRegion = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byTimezone = new Map<string, ReturnType<typeof createMetricBucket>>()

  for (const event of visitEvents) {
    addMetricBucket(byRoute, readEventMetadataString(event, 'route') ?? event.resourceId, event)
    addMetricBucket(byPage, readEventMetadataString(event, 'page') ?? readEventMetadataString(event, 'screen'), event)
    addMetricBucket(bySurface, readEventMetadataString(event, 'surface') ?? event.channel, event)
    addMetricBucket(byReferrer, readEventMetadataString(event, 'referrer') ?? readEventMetadataString(event, 'source'), event)
    addMetricBucket(byCountry, readEventMetadataString(event, 'countryCode'), event)
    addMetricBucket(byRegion, readEventMetadataString(event, 'regionCode'), event)
    addMetricBucket(byTimezone, readEventMetadataString(event, 'timezone'), event)

    const localHour = normalizeLocalHour(readEventMetadataNumber(event, 'localHour') ?? Number.NaN)
    if (localHour != null) {
      const hourKey = localHour.toString().padStart(2, '0')
      addMetricBucket(byLocalHour, hourKey, event)
      addMetricBucket(byLocalTimeSlot, localTimeSlotFromHour(localHour), event)
    }
    const localDayOfWeek = readEventMetadataNumber(event, 'localDayOfWeek')
    if (typeof localDayOfWeek === 'number')
      addMetricBucket(byLocalDayOfWeek, String(Math.round(localDayOfWeek)), event)
  }

  return {
    ...createScopedAnalytics(visitEvents, topLimit),
    growth: createGrowth(visitEvents, days),
    trend: createDailyTrend(visitEvents),
    heatmap: createTimeHeatmap(visitEvents),
    byRoute: mapMetricBuckets(byRoute, topLimit),
    byPage: mapMetricBuckets(byPage, topLimit),
    bySurface: mapMetricBuckets(bySurface, topLimit),
    byReferrer: mapMetricBuckets(byReferrer, topLimit),
    byLocalHour: mapMetricBuckets(byLocalHour, 24),
    byLocalTimeSlot: mapMetricBuckets(byLocalTimeSlot, 4),
    byLocalDayOfWeek: mapMetricBuckets(byLocalDayOfWeek, 7),
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
  const byLocalTimeSlot = new Map<string, ReturnType<typeof createMetricBucket>>()
  const bySelectedProvider = new Map<string, ReturnType<typeof createMetricBucket>>()
  const bySelectedCategory = new Map<string, ReturnType<typeof createMetricBucket>>()
  const bySelectedPluginId = new Map<string, ReturnType<typeof createMetricBucket>>()
  const bySelectedRankBucket = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byQueryLengthBucket = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byResultCountBucket = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byFirstResultLatencyBucket = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byTotalDurationBucket = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byCountry = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byRegion = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byTimezone = new Map<string, ReturnType<typeof createMetricBucket>>()
  const pluginPreferenceByTimeSlot = new Map<string, {
    slot: string
    plugins: Map<string, ReturnType<typeof createMetricBucket>>
    selectedPlugins: Map<string, ReturnType<typeof createMetricBucket>>
  }>()
  const queryLength = createNumberStats()
  const firstResultMs = createNumberStats()
  const totalDurationMs = createNumberStats()
  const resultCount = createNumberStats()
  const firstResultCount = createNumberStats()
  const providerErrorCount = createNumberStats()
  const providerTimeoutCount = createNumberStats()
  const reliabilityTrend = new Map<string, {
    date: string
    events: number
    selected: number
    zeroResult: number
    providerErrors: number
    providerTimeouts: number
    problemSearches: number
    actors: Set<string>
  }>()
  let withFilters = 0
  let withoutFilters = 0
  let zeroResult = 0
  let providerErrors = 0
  let providerTimeouts = 0
  let problemSearches = 0
  let selectedSearches = 0

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
    const selectedProvider = readEventMetadataString(event, 'selectedProvider')
    const selectedCategory = readEventMetadataString(event, 'selectedCategory')
    const selectedPluginId = readEventMetadataString(event, 'selectedPluginId')
    const selectedRank = readEventMetadataNumber(event, 'selectedRank')
    if (selectedProvider)
      addMetricBucket(bySelectedProvider, selectedProvider, event)
    if (selectedCategory)
      addMetricBucket(bySelectedCategory, selectedCategory, event)
    if (selectedPluginId)
      addMetricBucket(bySelectedPluginId, selectedPluginId, event)
    if (selectedRank != null)
      addMetricBucket(bySelectedRankBucket, rankBucket(selectedRank), event)
    const localHour = normalizeLocalHour(readEventMetadataNumber(event, 'localHour') ?? Number.NaN)
    if (typeof localHour === 'number') {
      const localTimeSlot = localTimeSlotFromHour(localHour)
      addMetricBucket(byLocalHour, String(localHour).padStart(2, '0'), event)
      addMetricBucket(byLocalTimeSlot, localTimeSlot, event)
      const preference = pluginPreferenceByTimeSlot.get(localTimeSlot) ?? {
        slot: localTimeSlot,
        plugins: new Map<string, ReturnType<typeof createMetricBucket>>(),
        selectedPlugins: new Map<string, ReturnType<typeof createMetricBucket>>(),
      }
      const pluginIds = event.metadata?.pluginIds
      if (Array.isArray(pluginIds)) {
        for (const pluginId of pluginIds) {
          if (typeof pluginId === 'string')
            addMetricBucket(preference.plugins, pluginId, event)
        }
      }
      if (selectedPluginId)
        addMetricBucket(preference.selectedPlugins, selectedPluginId, event)
      pluginPreferenceByTimeSlot.set(localTimeSlot, preference)
    }
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
    const firstResultMsValue = readEventMetadataNumber(event, 'firstResultMs')
    const totalDurationMsValue = readEventMetadataNumber(event, 'totalDurationMs') ?? readEventMetadataNumber(event, 'searchDurationMs')
    const queryLengthValue = readEventMetadataNumber(event, 'queryLength')
    addMetricBucket(byQueryLengthBucket, queryLengthBucket(queryLengthValue), event)
    addNumberStat(queryLength, queryLengthValue)
    addNumberStat(firstResultMs, firstResultMsValue)
    addNumberStat(totalDurationMs, totalDurationMsValue)
    const resultCountValue = readEventMetadataNumber(event, 'searchResultCount')
    const providerErrorCountValue = readEventMetadataNumber(event, 'providerErrorCount') ?? 0
    const providerTimeoutCountValue = readEventMetadataNumber(event, 'providerTimeoutCount') ?? 0
    const isZeroResult = resultCountValue === 0
    const hasProviderProblem = providerErrorCountValue > 0 || providerTimeoutCountValue > 0
    const date = event.occurredAt.slice(0, 10)
    const trendItem = reliabilityTrend.get(date) ?? {
      date,
      events: 0,
      selected: 0,
      zeroResult: 0,
      providerErrors: 0,
      providerTimeouts: 0,
      problemSearches: 0,
      actors: new Set<string>(),
    }

    trendItem.events += 1
    trendItem.providerErrors += providerErrorCountValue
    trendItem.providerTimeouts += providerTimeoutCountValue
    if (isZeroResult)
      trendItem.zeroResult += 1
    if (isZeroResult || hasProviderProblem)
      trendItem.problemSearches += 1
    if (isSearchSelected(event))
      trendItem.selected += 1
    const actor = readEventActor(event)
    if (actor)
      trendItem.actors.add(actor)
    reliabilityTrend.set(date, trendItem)

    if (isZeroResult)
      zeroResult += 1
    providerErrors += providerErrorCountValue
    providerTimeouts += providerTimeoutCountValue
    if (isZeroResult || hasProviderProblem)
      problemSearches += 1

    addMetricBucket(byResultCountBucket, resultCountBucket(resultCountValue), event)
    addMetricBucket(byFirstResultLatencyBucket, latencyBucket(firstResultMsValue), event)
    addMetricBucket(byTotalDurationBucket, latencyBucket(totalDurationMsValue), event)
    addNumberStat(resultCount, resultCountValue)
    addNumberStat(firstResultCount, readEventMetadataNumber(event, 'firstResultCount'))
    addNumberStat(providerErrorCount, providerErrorCountValue)
    addNumberStat(providerTimeoutCount, providerTimeoutCountValue)
    if (isSearchSelected(event))
      selectedSearches += 1
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
    timeHeatmap: createSearchTimeHeatmap(searchEvents, topLimit),
    frequencyCohorts: createSearchFrequencyCohorts(searchEvents, topLimit),
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
    byLocalTimeSlot: mapMetricBuckets(byLocalTimeSlot, 4),
    bySelectedProvider: mapMetricBuckets(bySelectedProvider, topLimit),
    bySelectedCategory: mapMetricBuckets(bySelectedCategory, topLimit),
    bySelectedPluginId: mapMetricBuckets(bySelectedPluginId, topLimit),
    bySelectedRankBucket: mapMetricBuckets(bySelectedRankBucket, 4),
    byQueryLengthBucket: mapMetricBuckets(byQueryLengthBucket, 5),
    byResultCountBucket: mapMetricBuckets(byResultCountBucket, 4),
    byFirstResultLatencyBucket: mapMetricBuckets(byFirstResultLatencyBucket, 4),
    byTotalDurationBucket: mapMetricBuckets(byTotalDurationBucket, 4),
    byCountry: mapMetricBuckets(byCountry, topLimit),
    byRegion: mapMetricBuckets(byRegion, topLimit),
    byTimezone: mapMetricBuckets(byTimezone, topLimit),
    pluginPreferenceByTimeSlot: Array.from(pluginPreferenceByTimeSlot.values())
      .map(item => ({
        slot: item.slot,
        plugins: mapMetricBuckets(item.plugins, topLimit),
        selectedPlugins: mapMetricBuckets(item.selectedPlugins, topLimit),
      }))
      .filter(item => item.plugins.length || item.selectedPlugins.length)
      .sort((a, b) => a.slot.localeCompare(b.slot)),
    pluginPreferenceByContext: createSearchPluginPreferenceByContext(searchEvents, topLimit),
    journey: createSearchJourneyAnalytics(searchEvents, topLimit),
    filterUsage: {
      withFilters,
      withoutFilters,
      filterRate: searchEvents.length ? Math.round((withFilters / searchEvents.length) * 10000) / 100 : 0,
    },
    selectionSummary: {
      selected: selectedSearches,
      selectionRate: searchEvents.length ? Math.round((selectedSearches / searchEvents.length) * 10000) / 100 : 0,
    },
    reliabilitySummary: {
      total: searchEvents.length,
      zeroResult,
      providerErrors,
      providerTimeouts,
      problemSearches,
      zeroResultRate: searchEvents.length ? Math.round((zeroResult / searchEvents.length) * 10000) / 100 : 0,
      problemRate: searchEvents.length ? Math.round((problemSearches / searchEvents.length) * 10000) / 100 : 0,
    },
    reliabilityTrend: Array.from(reliabilityTrend.values())
      .map(item => ({
        date: item.date,
        events: item.events,
        selected: item.selected,
        selectionRate: item.events ? Math.round((item.selected / item.events) * 10000) / 100 : 0,
        zeroResult: item.zeroResult,
        providerErrors: item.providerErrors,
        providerTimeouts: item.providerTimeouts,
        problemSearches: item.problemSearches,
        uniqueActors: item.actors.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
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
    contextSelectionMatrix: createSearchContextSelectionMatrix(searchEvents, topLimit),
  }
}

function readSearchLocalTimeSlot(event: PlatformGovernanceEvent): string {
  const localHour = normalizeLocalHour(readEventMetadataNumber(event, 'localHour') ?? Number.NaN)
  return localHour == null
    ? readEventMetadataString(event, 'localTimeSlot') ?? 'unknown'
    : localTimeSlotFromHour(localHour)
}

function readSearchLocalDayOfWeek(event: PlatformGovernanceEvent): number | null {
  const localDayOfWeek = readEventMetadataNumber(event, 'localDayOfWeek')
  if (typeof localDayOfWeek === 'number' && localDayOfWeek >= 0 && localDayOfWeek <= 6)
    return Math.floor(localDayOfWeek)

  const localWeekday = readEventMetadataNumber(event, 'localWeekday')
  if (typeof localWeekday === 'number' && localWeekday >= 0 && localWeekday <= 6)
    return Math.floor(localWeekday)

  return null
}

function searchFrequencyCohort(searches: number): string {
  if (searches <= 1)
    return 'single-search'
  if (searches <= 3)
    return 'light-search'
  if (searches <= 9)
    return 'regular-search'
  return 'power-search'
}

function searchFrequencyCohortRank(cohort: string): number {
  if (cohort === 'power-search')
    return 4
  if (cohort === 'regular-search')
    return 3
  if (cohort === 'light-search')
    return 2
  return 1
}

function mergeMetricBuckets(
  target: Map<string, ReturnType<typeof createMetricBucket>>,
  source: Map<string, ReturnType<typeof createMetricBucket>>,
): void {
  for (const [key, sourceBucket] of source.entries()) {
    const targetBucket = target.get(key) ?? createMetricBucket()
    targetBucket.events += sourceBucket.events
    targetBucket.quantity += sourceBucket.quantity
    for (const actor of sourceBucket.actors)
      targetBucket.actors.add(actor)
    target.set(key, targetBucket)
  }
}

function createSearchFrequencyCohorts(events: PlatformGovernanceEvent[], topLimit: number) {
  const users = new Map<string, {
    searches: number
    quantity: number
    selected: number
    zeroResult: number
    problemSearches: number
    activeDays: Set<string>
    localTimeSlots: Map<string, ReturnType<typeof createMetricBucket>>
    userPreferenceModes: Map<string, ReturnType<typeof createMetricBucket>>
    contextAppCategories: Map<string, ReturnType<typeof createMetricBucket>>
    plugins: Map<string, ReturnType<typeof createMetricBucket>>
    selectedPlugins: Map<string, ReturnType<typeof createMetricBucket>>
  }>()

  for (const event of events) {
    const actor = readEventActor(event)
    if (!actor)
      continue

    const item = users.get(actor) ?? {
      searches: 0,
      quantity: 0,
      selected: 0,
      zeroResult: 0,
      problemSearches: 0,
      activeDays: new Set<string>(),
      localTimeSlots: new Map<string, ReturnType<typeof createMetricBucket>>(),
      userPreferenceModes: new Map<string, ReturnType<typeof createMetricBucket>>(),
      contextAppCategories: new Map<string, ReturnType<typeof createMetricBucket>>(),
      plugins: new Map<string, ReturnType<typeof createMetricBucket>>(),
      selectedPlugins: new Map<string, ReturnType<typeof createMetricBucket>>(),
    }

    item.searches += 1
    item.quantity += event.quantity
    item.activeDays.add(event.occurredAt.slice(0, 10))

    const resultCount = readEventMetadataNumber(event, 'searchResultCount')
    const providerErrorCount = readEventMetadataNumber(event, 'providerErrorCount') ?? 0
    const providerTimeoutCount = readEventMetadataNumber(event, 'providerTimeoutCount') ?? 0
    if (isSearchSelected(event))
      item.selected += 1
    if (resultCount === 0)
      item.zeroResult += 1
    if (resultCount === 0 || providerErrorCount > 0 || providerTimeoutCount > 0)
      item.problemSearches += 1

    addMetricBucket(item.localTimeSlots, readSearchLocalTimeSlot(event), event)
    addMetricBucket(item.userPreferenceModes, readEventMetadataString(event, 'userPreferenceMode'), event)
    addMetricBucket(item.contextAppCategories, readEventMetadataString(event, 'contextAppCategory'), event)
    addStringArrayBuckets(item.plugins, event.metadata?.pluginIds, event)
    const selectedPluginId = readEventMetadataString(event, 'selectedPluginId')
    if (selectedPluginId)
      addMetricBucket(item.selectedPlugins, selectedPluginId, event)

    users.set(actor, item)
  }

  const cohorts = new Map<string, {
    cohort: string
    users: number
    searches: number
    quantity: number
    selected: number
    zeroResult: number
    problemSearches: number
    activeDays: number
    localTimeSlots: Map<string, ReturnType<typeof createMetricBucket>>
    userPreferenceModes: Map<string, ReturnType<typeof createMetricBucket>>
    contextAppCategories: Map<string, ReturnType<typeof createMetricBucket>>
    plugins: Map<string, ReturnType<typeof createMetricBucket>>
    selectedPlugins: Map<string, ReturnType<typeof createMetricBucket>>
  }>()

  for (const user of users.values()) {
    const cohort = searchFrequencyCohort(user.searches)
    const item = cohorts.get(cohort) ?? {
      cohort,
      users: 0,
      searches: 0,
      quantity: 0,
      selected: 0,
      zeroResult: 0,
      problemSearches: 0,
      activeDays: 0,
      localTimeSlots: new Map<string, ReturnType<typeof createMetricBucket>>(),
      userPreferenceModes: new Map<string, ReturnType<typeof createMetricBucket>>(),
      contextAppCategories: new Map<string, ReturnType<typeof createMetricBucket>>(),
      plugins: new Map<string, ReturnType<typeof createMetricBucket>>(),
      selectedPlugins: new Map<string, ReturnType<typeof createMetricBucket>>(),
    }

    item.users += 1
    item.searches += user.searches
    item.quantity += user.quantity
    item.selected += user.selected
    item.zeroResult += user.zeroResult
    item.problemSearches += user.problemSearches
    item.activeDays += user.activeDays.size
    mergeMetricBuckets(item.localTimeSlots, user.localTimeSlots)
    mergeMetricBuckets(item.userPreferenceModes, user.userPreferenceModes)
    mergeMetricBuckets(item.contextAppCategories, user.contextAppCategories)
    mergeMetricBuckets(item.plugins, user.plugins)
    mergeMetricBuckets(item.selectedPlugins, user.selectedPlugins)
    cohorts.set(cohort, item)
  }

  return Array.from(cohorts.values())
    .map(item => ({
      cohort: item.cohort,
      users: item.users,
      searches: item.searches,
      quantity: item.quantity,
      activeDays: item.activeDays,
      avgSearchesPerUser: Math.round((item.searches / Math.max(item.users, 1)) * 100) / 100,
      avgActiveDaysPerUser: Math.round((item.activeDays / Math.max(item.users, 1)) * 100) / 100,
      selectionRate: percentage(item.selected, item.searches),
      zeroResultRate: percentage(item.zeroResult, item.searches),
      problemRate: percentage(item.problemSearches, item.searches),
      topLocalTimeSlots: mapMetricBuckets(item.localTimeSlots, topLimit),
      topUserPreferenceModes: mapMetricBuckets(item.userPreferenceModes, topLimit),
      topContextAppCategories: mapMetricBuckets(item.contextAppCategories, topLimit),
      topPlugins: mapMetricBuckets(item.plugins, topLimit),
      selectedPlugins: mapMetricBuckets(item.selectedPlugins, topLimit),
    }))
    .sort((left, right) => searchFrequencyCohortRank(right.cohort) - searchFrequencyCohortRank(left.cohort)
      || right.searches - left.searches
      || left.cohort.localeCompare(right.cohort))
    .slice(0, topLimit)
}

function isSearchSelected(event: PlatformGovernanceEvent): boolean {
  return readEventMetadataBoolean(event, 'selected') === true
    || readEventMetadataNumber(event, 'selectedRank') != null
    || Boolean(readEventMetadataString(event, 'selectedPluginId') || readEventMetadataString(event, 'selectedProvider'))
}

function createSearchTimeHeatmap(events: PlatformGovernanceEvent[], topLimit: number) {
  const buckets = new Map<string, {
    dayOfWeek: number
    hour: string
    timeSlot: string
    events: number
    quantity: number
    selected: number
    zeroResult: number
    providerProblem: number
    providerErrors: number
    providerTimeouts: number
    actors: Set<string>
    contextAppCategories: Map<string, ReturnType<typeof createMetricBucket>>
    contextSources: Map<string, ReturnType<typeof createMetricBucket>>
    plugins: Map<string, ReturnType<typeof createMetricBucket>>
    selectedPlugins: Map<string, ReturnType<typeof createMetricBucket>>
  }>()

  for (const event of events) {
    const localHour = normalizeLocalHour(readEventMetadataNumber(event, 'localHour') ?? Number.NaN)
    const dayOfWeek = readSearchLocalDayOfWeek(event)
    if (localHour == null || dayOfWeek == null)
      continue

    const hour = localHour.toString().padStart(2, '0')
    const key = `${dayOfWeek}:${hour}`
    const item = buckets.get(key) ?? {
      dayOfWeek,
      hour,
      timeSlot: localTimeSlotFromHour(localHour),
      events: 0,
      quantity: 0,
      selected: 0,
      zeroResult: 0,
      providerProblem: 0,
      providerErrors: 0,
      providerTimeouts: 0,
      actors: new Set<string>(),
      contextAppCategories: new Map<string, ReturnType<typeof createMetricBucket>>(),
      contextSources: new Map<string, ReturnType<typeof createMetricBucket>>(),
      plugins: new Map<string, ReturnType<typeof createMetricBucket>>(),
      selectedPlugins: new Map<string, ReturnType<typeof createMetricBucket>>(),
    }

    item.events += 1
    item.quantity += event.quantity

    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)

    const resultCount = readEventMetadataNumber(event, 'searchResultCount')
    const providerErrorCount = readEventMetadataNumber(event, 'providerErrorCount') ?? 0
    const providerTimeoutCount = readEventMetadataNumber(event, 'providerTimeoutCount') ?? 0
    const hasProviderProblem = providerErrorCount > 0 || providerTimeoutCount > 0
    if (isSearchSelected(event))
      item.selected += 1
    if (resultCount === 0)
      item.zeroResult += 1
    if (resultCount === 0 || hasProviderProblem)
      item.providerProblem += 1
    item.providerErrors += providerErrorCount
    item.providerTimeouts += providerTimeoutCount

    addMetricBucket(item.contextAppCategories, readEventMetadataString(event, 'contextAppCategory'), event)
    addMetricBucket(item.contextSources, readEventMetadataString(event, 'contextSource'), event)
    addStringArrayBuckets(item.plugins, event.metadata?.pluginIds, event)
    const selectedPluginId = readEventMetadataString(event, 'selectedPluginId')
    if (selectedPluginId)
      addMetricBucket(item.selectedPlugins, selectedPluginId, event)

    buckets.set(key, item)
  }

  return Array.from(buckets.values())
    .map(item => ({
      dayOfWeek: item.dayOfWeek,
      hour: item.hour,
      timeSlot: item.timeSlot,
      events: item.events,
      quantity: item.quantity,
      selected: item.selected,
      selectionRate: percentage(item.selected, item.events),
      zeroResult: item.zeroResult,
      zeroResultRate: percentage(item.zeroResult, item.events),
      providerProblem: item.providerProblem,
      problemRate: percentage(item.providerProblem, item.events),
      providerErrors: item.providerErrors,
      providerTimeouts: item.providerTimeouts,
      uniqueActors: item.actors.size,
      topContextAppCategories: mapMetricBuckets(item.contextAppCategories, topLimit),
      topContextSources: mapMetricBuckets(item.contextSources, topLimit),
      topPlugins: mapMetricBuckets(item.plugins, topLimit),
      selectedPlugins: mapMetricBuckets(item.selectedPlugins, topLimit),
    }))
    .sort((left, right) => left.dayOfWeek - right.dayOfWeek || left.hour.localeCompare(right.hour))
}

function createSearchJourneyAnalytics(events: PlatformGovernanceEvent[], topLimit: number) {
  interface SearchJourneySegmentBucket {
    key: string
    contextAppCategory: string
    contextSource: string
    localTimeSlot: string
    sessionBucket: string
    userPreferenceMode: string
    entryPoint: string
    triggerType: string
    events: number
    withFilters: number
    withResults: number
    selected: number
    zeroResult: number
    providerProblem: number
    providerErrors: number
    providerTimeouts: number
    actors: Set<string>
    scenes: Map<string, ReturnType<typeof createMetricBucket>>
    providers: Map<string, ReturnType<typeof createMetricBucket>>
    plugins: Map<string, ReturnType<typeof createMetricBucket>>
    selectedPlugins: Map<string, ReturnType<typeof createMetricBucket>>
  }
  const segments = new Map<string, SearchJourneySegmentBucket>()
  const summary = {
    total: 0,
    withFilters: 0,
    withResults: 0,
    selected: 0,
    zeroResult: 0,
    providerProblem: 0,
    providerErrors: 0,
    providerTimeouts: 0,
  }

  for (const event of events) {
    const contextAppCategory = readEventMetadataString(event, 'contextAppCategory') ?? 'unknown'
    const contextSource = readEventMetadataString(event, 'contextSource') ?? 'unknown'
    const localTimeSlot = readSearchLocalTimeSlot(event)
    const sessionBucket = readEventMetadataString(event, 'sessionBucket') ?? 'unknown'
    const userPreferenceMode = readEventMetadataString(event, 'userPreferenceMode') ?? 'unknown'
    const entryPoint = readEventMetadataString(event, 'entryPoint') ?? 'unknown'
    const triggerType = readEventMetadataString(event, 'triggerType') ?? 'unknown'
    const key = [
      contextAppCategory,
      contextSource,
      localTimeSlot,
      sessionBucket,
      userPreferenceMode,
      entryPoint,
      triggerType,
    ].join(':')
    const item = segments.get(key) ?? {
      key,
      contextAppCategory,
      contextSource,
      localTimeSlot,
      sessionBucket,
      userPreferenceMode,
      entryPoint,
      triggerType,
      events: 0,
      withFilters: 0,
      withResults: 0,
      selected: 0,
      zeroResult: 0,
      providerProblem: 0,
      providerErrors: 0,
      providerTimeouts: 0,
      actors: new Set<string>(),
      scenes: new Map<string, ReturnType<typeof createMetricBucket>>(),
      providers: new Map<string, ReturnType<typeof createMetricBucket>>(),
      plugins: new Map<string, ReturnType<typeof createMetricBucket>>(),
      selectedPlugins: new Map<string, ReturnType<typeof createMetricBucket>>(),
    }

    const resultCount = readEventMetadataNumber(event, 'searchResultCount')
    const providerErrorCount = readEventMetadataNumber(event, 'providerErrorCount') ?? 0
    const providerTimeoutCount = readEventMetadataNumber(event, 'providerTimeoutCount') ?? 0
    const hasFilters = readEventMetadataBoolean(event, 'hasFilters') === true
    const hasResults = typeof resultCount === 'number' && resultCount > 0
    const isZeroResult = resultCount === 0
    const hasProviderProblem = providerErrorCount > 0 || providerTimeoutCount > 0
    const selected = isSearchSelected(event)

    item.events += 1
    summary.total += 1
    if (hasFilters) {
      item.withFilters += 1
      summary.withFilters += 1
    }
    if (hasResults) {
      item.withResults += 1
      summary.withResults += 1
    }
    if (selected) {
      item.selected += 1
      summary.selected += 1
    }
    if (isZeroResult) {
      item.zeroResult += 1
      summary.zeroResult += 1
    }
    if (hasProviderProblem) {
      item.providerProblem += 1
      summary.providerProblem += 1
    }
    item.providerErrors += providerErrorCount
    item.providerTimeouts += providerTimeoutCount
    summary.providerErrors += providerErrorCount
    summary.providerTimeouts += providerTimeoutCount

    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)
    addMetricBucket(item.scenes, readEventMetadataString(event, 'searchScene') ?? event.resourceId, event)

    const providerKeys = new Set<string>()
    for (const rawProviders of [event.metadata?.providerTimings, event.metadata?.providerResults, event.metadata?.providerStatus]) {
      if (isPlainObject(rawProviders)) {
        for (const providerId of Object.keys(rawProviders)) {
          if (providerId.trim())
            providerKeys.add(providerId.trim())
        }
      }
    }
    const selectedProvider = readEventMetadataString(event, 'selectedProvider')
    if (selectedProvider)
      providerKeys.add(selectedProvider)
    for (const providerId of providerKeys)
      addMetricBucket(item.providers, providerId, event)

    const pluginIds = event.metadata?.pluginIds
    if (Array.isArray(pluginIds)) {
      for (const pluginId of new Set(pluginIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))
        addMetricBucket(item.plugins, pluginId, event)
    }
    const selectedPluginId = readEventMetadataString(event, 'selectedPluginId')
    if (selectedPluginId)
      addMetricBucket(item.selectedPlugins, selectedPluginId, event)

    segments.set(key, item)
  }

  const mapSegment = (item: SearchJourneySegmentBucket) => ({
    key: item.key,
    contextAppCategory: item.contextAppCategory,
    contextSource: item.contextSource,
    localTimeSlot: item.localTimeSlot,
    sessionBucket: item.sessionBucket,
    userPreferenceMode: item.userPreferenceMode,
    entryPoint: item.entryPoint,
    triggerType: item.triggerType,
    events: item.events,
    withFilters: item.withFilters,
    withResults: item.withResults,
    selected: item.selected,
    zeroResult: item.zeroResult,
    providerProblem: item.providerProblem,
    providerErrors: item.providerErrors,
    providerTimeouts: item.providerTimeouts,
    filterRate: percentage(item.withFilters, item.events),
    withResultsRate: percentage(item.withResults, item.events),
    selectionRate: percentage(item.selected, item.events),
    zeroResultRate: percentage(item.zeroResult, item.events),
    problemRate: percentage(item.providerProblem, item.events),
    uniqueActors: item.actors.size,
    scenes: mapMetricBuckets(item.scenes, topLimit),
    providers: mapMetricBuckets(item.providers, topLimit),
    plugins: mapMetricBuckets(item.plugins, topLimit),
    selectedPlugins: mapMetricBuckets(item.selectedPlugins, topLimit),
  })

  return {
    ...summary,
    filterRate: percentage(summary.withFilters, summary.total),
    withResultsRate: percentage(summary.withResults, summary.total),
    selectionRate: percentage(summary.selected, summary.total),
    zeroResultRate: percentage(summary.zeroResult, summary.total),
    problemRate: percentage(summary.providerProblem, summary.total),
    segments: Array.from(segments.values())
      .map(mapSegment)
      .sort((left, right) => right.events - left.events || right.selected - left.selected || right.problemRate - left.problemRate || left.key.localeCompare(right.key))
      .slice(0, topLimit),
  }
}

function createSearchPluginPreferenceByContext(events: PlatformGovernanceEvent[], topLimit: number) {
  const contexts = new Map<string, {
    key: string
    contextAppCategory: string
    contextSource: string
    localTimeSlot: string
    events: number
    selected: number
    actors: Set<string>
    plugins: Map<string, ReturnType<typeof createMetricBucket>>
    selectedPlugins: Map<string, ReturnType<typeof createMetricBucket>>
  }>()

  for (const event of events) {
    const contextAppCategory = readEventMetadataString(event, 'contextAppCategory') ?? 'unknown'
    const contextSource = readEventMetadataString(event, 'contextSource') ?? 'unknown'
    const localTimeSlot = readSearchLocalTimeSlot(event)
    const key = `${contextAppCategory}:${contextSource}:${localTimeSlot}`
    const item = contexts.get(key) ?? {
      key,
      contextAppCategory,
      contextSource,
      localTimeSlot,
      events: 0,
      selected: 0,
      actors: new Set<string>(),
      plugins: new Map<string, ReturnType<typeof createMetricBucket>>(),
      selectedPlugins: new Map<string, ReturnType<typeof createMetricBucket>>(),
    }

    item.events += 1
    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)

    const selectedPluginId = readEventMetadataString(event, 'selectedPluginId')
    if (isSearchSelected(event))
      item.selected += 1

    const pluginIds = event.metadata?.pluginIds
    if (Array.isArray(pluginIds)) {
      for (const pluginId of pluginIds) {
        if (typeof pluginId === 'string')
          addMetricBucket(item.plugins, pluginId, event)
      }
    }
    if (selectedPluginId)
      addMetricBucket(item.selectedPlugins, selectedPluginId, event)

    contexts.set(key, item)
  }

  return Array.from(contexts.values())
    .map(item => ({
      key: item.key,
      contextAppCategory: item.contextAppCategory,
      contextSource: item.contextSource,
      localTimeSlot: item.localTimeSlot,
      events: item.events,
      selected: item.selected,
      selectionRate: item.events > 0 ? Math.round((item.selected / item.events) * 10000) / 100 : 0,
      uniqueActors: item.actors.size,
      plugins: mapMetricBuckets(item.plugins, topLimit),
      selectedPlugins: mapMetricBuckets(item.selectedPlugins, topLimit),
    }))
    .filter(item => item.plugins.length || item.selectedPlugins.length)
    .sort((a, b) => b.events - a.events || b.selected - a.selected || a.key.localeCompare(b.key))
    .slice(0, topLimit)
}

function createSearchContextSelectionMatrix(events: PlatformGovernanceEvent[], topLimit: number) {
  const matrix = new Map<string, {
    key: string
    contextAppCategory: string
    contextSource: string
    localTimeSlot: string
    selectedCategory: string
    events: number
    selected: number
    actors: Set<string>
    plugins: Map<string, ReturnType<typeof createMetricBucket>>
    selectedPlugins: Map<string, ReturnType<typeof createMetricBucket>>
  }>()

  for (const event of events) {
    const contextAppCategory = readEventMetadataString(event, 'contextAppCategory') ?? 'unknown'
    const contextSource = readEventMetadataString(event, 'contextSource') ?? 'unknown'
    const selectedCategory = readEventMetadataString(event, 'selectedCategory') ?? 'unknown'
    const localTimeSlot = readSearchLocalTimeSlot(event)
    const key = `${contextAppCategory}:${contextSource}:${localTimeSlot}:${selectedCategory}`
    const item = matrix.get(key) ?? {
      key,
      contextAppCategory,
      contextSource,
      localTimeSlot,
      selectedCategory,
      events: 0,
      selected: 0,
      actors: new Set<string>(),
      plugins: new Map<string, ReturnType<typeof createMetricBucket>>(),
      selectedPlugins: new Map<string, ReturnType<typeof createMetricBucket>>(),
    }
    item.events += 1

    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)

    const selectedPluginId = readEventMetadataString(event, 'selectedPluginId')
    if (isSearchSelected(event))
      item.selected += 1

    const pluginIds = event.metadata?.pluginIds
    if (Array.isArray(pluginIds)) {
      for (const pluginId of pluginIds) {
        if (typeof pluginId === 'string')
          addMetricBucket(item.plugins, pluginId, event)
      }
    }
    if (selectedPluginId)
      addMetricBucket(item.selectedPlugins, selectedPluginId, event)

    matrix.set(key, item)
  }

  return Array.from(matrix.values())
    .map(item => ({
      key: item.key,
      contextAppCategory: item.contextAppCategory,
      contextSource: item.contextSource,
      localTimeSlot: item.localTimeSlot,
      selectedCategory: item.selectedCategory,
      events: item.events,
      selected: item.selected,
      selectionRate: item.events > 0 ? Math.round((item.selected / item.events) * 10000) / 100 : 0,
      uniqueActors: item.actors.size,
      plugins: mapMetricBuckets(item.plugins, topLimit),
      selectedPlugins: mapMetricBuckets(item.selectedPlugins, topLimit),
    }))
    .sort((a, b) => b.events - a.events || b.selected - a.selected || a.key.localeCompare(b.key))
    .slice(0, topLimit)
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

  const conversion = {
    installRate: downloads > 0 ? Math.round((installs / downloads) * 10000) / 100 : 0,
    invocationRate: installs > 0 ? Math.round((invocations / installs) * 10000) / 100 : 0,
    invocationsPerActor: actors.size > 0 ? Math.round((invocations / actors.size) * 100) / 100 : 0,
  }
  const invocationHealth = createPluginInvocationHealth(scoped, topLimit)
  const retention = createPluginRetentionAnalytics(scoped, topLimit)
  const trend = createPluginDailyTrend(scoped)
  const byCountryBuckets = mapMetricBuckets(byCountry, topLimit)

  return {
    days,
    pluginId,
    downloads,
    installs,
    invocations,
    events: scoped.length,
    uniqueActors: actors.size,
    conversion,
    actionQueue: createPluginOwnerActionQueue({
      downloads,
      installs,
      invocations,
      uniqueActors: actors.size,
      conversion,
      invocationHealth,
      retention,
      trend,
      byCountry: byCountryBuckets,
    }),
    conversionTrend: createPluginConversionTrend(scoped),
    actionTrend: createPluginActionTrend(scoped, topLimit),
    locationTrend: createPluginLocationTrend(scoped, topLimit),
    channelTrend: createPluginDimensionTrend(scoped, topLimit, 'channel'),
    versionTrend: createPluginDimensionTrend(scoped, topLimit, 'version'),
    invocationHealth,
    retention,
    usageTiming: createPluginUsageTiming(scoped, topLimit),
    growth: createGrowth(scoped, days),
    trend,
    installTrend: createPluginDailyTrend(scoped.filter(event => event.action === 'install')),
    heatmap: createTimeHeatmap(scoped),
    byAction: mapMetricBuckets(byAction, topLimit),
    byChannel: mapMetricBuckets(byChannel, topLimit),
    byCountry: byCountryBuckets,
    byRegion: mapMetricBuckets(byRegion, topLimit),
    byVersion: mapMetricBuckets(byVersion, topLimit),
    byArtifactType: mapMetricBuckets(byArtifactType, topLimit),
    packageSize: mapNumberStat(packageSize),
  }
}

function resolveUploadFailureDisposition(event: PlatformGovernanceEvent): UploadFailureDisposition {
  const retryable = readEventMetadataBoolean(event, 'retryable')
  const retryCount = readEventMetadataNumber(event, 'retryCount')
  const maxRetries = readEventMetadataNumber(event, 'maxRetries')
  const nextRetryDelayMs = readEventMetadataNumberAny(event, ['nextRetryDelayMs', 'retryAfterMs', 'backoffMs'])
  const exhausted = retryable === true
    && typeof retryCount === 'number'
    && typeof maxRetries === 'number'
    && retryCount >= maxRetries

  if (retryable === true && typeof nextRetryDelayMs === 'number' && nextRetryDelayMs > 0 && !exhausted)
    return 'retry-scheduled'
  if (exhausted)
    return 'retry-exhausted'
  if (retryable === true)
    return 'retryable'
  if (retryable === false)
    return 'not-retryable'
  return 'unknown'
}

function resolveUploadFailureSuggestedAction(
  reason: string,
  disposition: UploadFailureDisposition,
  statusCode: number | null,
  failureCategory: string | null,
  storageChannel: string | null,
  storageProvider: string | null,
): UploadFailureMatrixItem['suggestedAction'] {
  const normalizedReason = reason.toLowerCase()
  if (disposition === 'retry-scheduled')
    return 'retry-monitor'
  if (failureCategory === 'payload-validation')
    return 'payload-validation'
  if (normalizedReason.includes('quota') || normalizedReason.includes('limit') || statusCode === 429)
    return 'quota-policy-check'
  if (normalizedReason.includes('type') || normalizedReason.includes('size') || normalizedReason.includes('invalid'))
    return 'payload-validation'
  if (storageProvider || storageChannel || normalizedReason.includes('storage') || normalizedReason.includes('timeout') || normalizedReason.includes('retry-exhausted'))
    return 'storage-provider-check'
  return 'manual-investigation'
}

function resolveUploadFailureSampleSource(event: PlatformGovernanceEvent): UploadFailureSampleSource {
  const source = readEventMetadataString(event, 'failureSampleSource') ?? readEventMetadataString(event, 'sampleSource')
  if (source === 'live' || source === 'manual' || source === 'synthetic')
    return source
  if (readEventMetadataBoolean(event, 'liveFailureSample') === true)
    return 'live'
  if (readEventMetadataBoolean(event, 'manualFailureSample') === true)
    return 'manual'
  if (readEventMetadataBoolean(event, 'syntheticFailureSample') === true)
    return 'synthetic'
  return 'unknown'
}

function resolveUploadFailureCalibrationStatus(event: PlatformGovernanceEvent): UploadFailureCalibrationStatus {
  const status = readEventMetadataString(event, 'failureCalibrationStatus') ?? readEventMetadataString(event, 'calibrationStatus')
  if (status === 'verified' || status === 'sampled' || status === 'needs-calibration')
    return status

  const source = resolveUploadFailureSampleSource(event)
  if (readEventMetadataBoolean(event, 'failureCalibrated') === true || source === 'manual')
    return 'verified'
  if (source === 'live')
    return 'sampled'
  return 'needs-calibration'
}

function rankUploadFailureCalibrationStatus(status: UploadFailureCalibrationStatus): number {
  switch (status) {
    case 'verified':
      return 3
    case 'sampled':
      return 2
    default:
      return 1
  }
}

function rankUploadFailureSampleSource(source: UploadFailureSampleSource): number {
  switch (source) {
    case 'manual':
      return 4
    case 'live':
      return 3
    case 'synthetic':
      return 2
    default:
      return 1
  }
}

function mergeUploadFailureCalibrationStatus(
  current: UploadFailureCalibrationStatus,
  next: UploadFailureCalibrationStatus,
): UploadFailureCalibrationStatus {
  return rankUploadFailureCalibrationStatus(next) > rankUploadFailureCalibrationStatus(current) ? next : current
}

function mergeUploadFailureSampleSource(
  current: UploadFailureSampleSource,
  next: UploadFailureSampleSource,
): UploadFailureSampleSource {
  return rankUploadFailureSampleSource(next) > rankUploadFailureSampleSource(current) ? next : current
}

function addUploadFailureMatrixItem(
  matrix: Map<string, UploadFailureMatrixItem & { actors: Set<string> }>,
  event: PlatformGovernanceEvent,
): void {
  const resourceType = readEventMetadataString(event, 'resourceType') ?? event.resourceType ?? 'unknown'
  const surface = readEventMetadataString(event, 'surface')
  const storageChannel = readEventMetadataString(event, 'storageChannel')
  const storageProvider = readEventMetadataString(event, 'storageProvider')
  const reason = readEventMetadataString(event, 'reason') ?? 'unknown'
  const statusCode = readEventMetadataNumber(event, 'statusCode')
  const failureCategory = readEventMetadataString(event, 'failureCategory')
  const disposition = resolveUploadFailureDisposition(event)
  const calibrationStatus = resolveUploadFailureCalibrationStatus(event)
  const sampleSource = resolveUploadFailureSampleSource(event)
  const isSampled = sampleSource !== 'unknown' || calibrationStatus !== 'needs-calibration'
  const key = [
    resourceType,
    surface ?? 'unknown',
    storageChannel ?? 'unknown',
    storageProvider ?? 'unknown',
    reason,
    disposition,
    statusCode == null ? 'none' : String(Math.round(statusCode)),
  ].join('|')
  const item = matrix.get(key) ?? {
    key,
    resourceType,
    surface,
    storageChannel,
    storageProvider,
    reason,
    disposition,
    statusCode,
    events: 0,
    quantity: 0,
    uniqueActors: 0,
    latestAt: event.occurredAt,
    retryable: 0,
    scheduled: 0,
    exhausted: 0,
    totalRetryCount: 0,
    nextRetryDelayMs: null,
    calibrationStatus,
    sampleSource,
    sampleCount: 0,
    latestSampleAt: null,
    suggestedAction: resolveUploadFailureSuggestedAction(reason, disposition, statusCode, failureCategory, storageChannel, storageProvider),
    actors: new Set<string>(),
  }
  item.events += 1
  item.quantity += event.quantity
  item.latestAt = event.occurredAt.localeCompare(item.latestAt) > 0 ? event.occurredAt : item.latestAt
  if (readEventMetadataBoolean(event, 'retryable') === true)
    item.retryable += 1
  if (disposition === 'retry-scheduled')
    item.scheduled += 1
  if (disposition === 'retry-exhausted')
    item.exhausted += 1
  item.totalRetryCount += readEventMetadataNumber(event, 'retryCount') ?? 0
  item.calibrationStatus = mergeUploadFailureCalibrationStatus(item.calibrationStatus, calibrationStatus)
  item.sampleSource = mergeUploadFailureSampleSource(item.sampleSource, sampleSource)
  if (isSampled) {
    item.sampleCount += 1
    item.latestSampleAt = item.latestSampleAt && item.latestSampleAt.localeCompare(event.occurredAt) > 0
      ? item.latestSampleAt
      : event.occurredAt
  }
  const nextRetryDelayMs = readEventMetadataNumberAny(event, ['nextRetryDelayMs', 'retryAfterMs', 'backoffMs'])
  if (nextRetryDelayMs != null)
    item.nextRetryDelayMs = Math.max(item.nextRetryDelayMs ?? 0, nextRetryDelayMs)
  const actor = readEventActor(event)
  if (actor)
    item.actors.add(actor)
  item.uniqueActors = item.actors.size
  matrix.set(key, item)
}

function mapUploadFailureMatrix(
  matrix: Map<string, UploadFailureMatrixItem & { actors: Set<string> }>,
  topLimit: number,
): UploadFailureMatrixItem[] {
  return Array.from(matrix.values())
    .map(({ actors: _actors, ...item }) => item)
    .sort((left, right) => {
      return right.events - left.events
        || right.exhausted - left.exhausted
        || right.scheduled - left.scheduled
        || right.quantity - left.quantity
        || right.latestAt.localeCompare(left.latestAt)
    })
    .slice(0, topLimit)
}

function rankUploadActionQueuePriority(priority: UploadActionQueuePriority): number {
  switch (priority) {
    case 'critical':
      return 4
    case 'high':
      return 3
    case 'medium':
      return 2
    default:
      return 1
  }
}

function rankUploadActionQueueCalibrationStatus(status: UploadFailureCalibrationStatus | 'unknown'): number {
  switch (status) {
    case 'verified':
      return 4
    case 'sampled':
      return 3
    case 'needs-calibration':
      return 2
    default:
      return 1
  }
}

function mergeUploadActionQueueCalibrationStatus(
  current: UploadFailureCalibrationStatus | 'unknown',
  next: UploadFailureCalibrationStatus | 'unknown',
): UploadFailureCalibrationStatus | 'unknown' {
  return rankUploadActionQueueCalibrationStatus(next) > rankUploadActionQueueCalibrationStatus(current) ? next : current
}

function resolveUploadActionQueuePriority(item: Pick<UploadActionQueueItem, 'stuckAttempts' | 'exhaustedRetries' | 'failedAttempts' | 'scheduledRetries' | 'sampleCount'>): UploadActionQueuePriority {
  if (item.stuckAttempts > 0 || item.exhaustedRetries > 0)
    return 'critical'
  if (item.failedAttempts >= 2 || item.scheduledRetries > 0)
    return 'high'
  if (item.failedAttempts > 0)
    return 'medium'
  return item.sampleCount > 0 ? 'low' : 'medium'
}

function resolveUploadProblemAttemptDisposition(attempt: UploadProblemAttempt): UploadFailureDisposition {
  if (attempt.retryable === true && attempt.maxRetries != null && attempt.retryCount != null && attempt.retryCount >= attempt.maxRetries)
    return 'retry-exhausted'
  if (attempt.retryable === true && attempt.nextRetryDelayMs != null && attempt.nextRetryDelayMs > 0)
    return 'retry-scheduled'
  if (attempt.retryable === true)
    return 'retryable'
  if (attempt.retryable === false)
    return 'not-retryable'
  return 'unknown'
}

function createUploadActionQueue(
  failureMatrix: UploadFailureMatrixItem[],
  problemAttempts: UploadProblemAttempt[],
  topLimit: number,
): UploadActionQueueItem[] {
  const queue = new Map<string, UploadActionQueueItem>()

  const upsert = (key: string, input: Omit<UploadActionQueueItem, 'key' | 'priority'>): void => {
    const item = queue.get(key) ?? {
      key,
      priority: 'medium',
      suggestedAction: input.suggestedAction,
      reason: input.reason,
      resourceType: input.resourceType,
      surface: input.surface,
      storageChannel: input.storageChannel,
      storageProvider: input.storageProvider,
      statusCode: input.statusCode,
      events: 0,
      failedAttempts: 0,
      stuckAttempts: 0,
      retryableFailures: 0,
      scheduledRetries: 0,
      exhaustedRetries: 0,
      sampleCount: 0,
      calibrationStatus: 'unknown',
      sampleSource: 'unknown',
      latestAt: input.latestAt,
      oldestAgeMs: null,
      nextRetryDelayMs: null,
      evidenceAttemptHashes: [],
      evidenceResourceHashes: [],
    }

    item.events += input.events
    item.failedAttempts += input.failedAttempts
    item.stuckAttempts += input.stuckAttempts
    item.retryableFailures += input.retryableFailures
    item.scheduledRetries += input.scheduledRetries
    item.exhaustedRetries += input.exhaustedRetries
    item.sampleCount += input.sampleCount
    item.latestAt = input.latestAt.localeCompare(item.latestAt) > 0 ? input.latestAt : item.latestAt
    item.oldestAgeMs = item.oldestAgeMs == null && input.oldestAgeMs == null
      ? null
      : Math.max(item.oldestAgeMs ?? 0, input.oldestAgeMs ?? 0)
    item.nextRetryDelayMs = item.nextRetryDelayMs == null && input.nextRetryDelayMs == null
      ? null
      : Math.max(item.nextRetryDelayMs ?? 0, input.nextRetryDelayMs ?? 0)
    item.calibrationStatus = mergeUploadActionQueueCalibrationStatus(item.calibrationStatus, input.calibrationStatus)
    item.sampleSource = mergeUploadFailureSampleSource(item.sampleSource, input.sampleSource)
    item.evidenceAttemptHashes = Array.from(new Set([...item.evidenceAttemptHashes, ...input.evidenceAttemptHashes])).slice(0, 3)
    item.evidenceResourceHashes = Array.from(new Set([...item.evidenceResourceHashes, ...input.evidenceResourceHashes])).slice(0, 3)
    item.priority = resolveUploadActionQueuePriority(item)
    queue.set(key, item)
  }

  for (const item of failureMatrix) {
    const key = [
      item.suggestedAction,
      item.resourceType,
      item.surface ?? 'unknown',
      item.storageChannel ?? 'unknown',
      item.storageProvider ?? 'unknown',
      item.reason,
      item.statusCode == null ? 'none' : String(item.statusCode),
    ].join('|')
    upsert(key, {
      suggestedAction: item.suggestedAction,
      reason: item.reason,
      resourceType: item.resourceType,
      surface: item.surface,
      storageChannel: item.storageChannel,
      storageProvider: item.storageProvider,
      statusCode: item.statusCode,
      events: item.events,
      failedAttempts: item.events,
      stuckAttempts: 0,
      retryableFailures: item.retryable,
      scheduledRetries: item.scheduled,
      exhaustedRetries: item.exhausted,
      sampleCount: item.sampleCount,
      calibrationStatus: item.calibrationStatus,
      sampleSource: item.sampleSource,
      latestAt: item.latestAt,
      oldestAgeMs: null,
      nextRetryDelayMs: item.nextRetryDelayMs,
      evidenceAttemptHashes: [],
      evidenceResourceHashes: [],
    })
  }

  for (const attempt of problemAttempts) {
    const disposition = resolveUploadProblemAttemptDisposition(attempt)
    const suggestedAction: UploadActionQueueSuggestedAction = attempt.status === 'stuck'
      ? 'stuck-attempt-check'
      : resolveUploadFailureSuggestedAction(
          attempt.reason ?? attempt.contentType ?? attempt.status,
          disposition,
          attempt.statusCode,
          null,
          attempt.storageChannel,
          attempt.storageProvider,
        )
    const key = [
      suggestedAction,
      attempt.resourceType,
      attempt.surface ?? 'unknown',
      attempt.storageChannel ?? 'unknown',
      attempt.storageProvider ?? 'unknown',
      attempt.reason ?? attempt.contentType ?? attempt.status,
      attempt.statusCode == null ? 'none' : String(attempt.statusCode),
    ].join('|')
    const hasFailureAggregate = attempt.status === 'failed' && queue.has(key)
    upsert(key, {
      suggestedAction,
      reason: attempt.reason ?? attempt.contentType ?? attempt.status,
      resourceType: attempt.resourceType,
      surface: attempt.surface,
      storageChannel: attempt.storageChannel,
      storageProvider: attempt.storageProvider,
      statusCode: attempt.statusCode,
      events: hasFailureAggregate ? 0 : 1,
      failedAttempts: hasFailureAggregate ? 0 : attempt.status === 'failed' ? 1 : 0,
      stuckAttempts: attempt.status === 'stuck' ? 1 : 0,
      retryableFailures: hasFailureAggregate ? 0 : attempt.retryable ? 1 : 0,
      scheduledRetries: hasFailureAggregate ? 0 : disposition === 'retry-scheduled' ? 1 : 0,
      exhaustedRetries: hasFailureAggregate ? 0 : disposition === 'retry-exhausted' ? 1 : 0,
      sampleCount: 0,
      calibrationStatus: 'unknown',
      sampleSource: 'unknown',
      latestAt: attempt.latestAt,
      oldestAgeMs: attempt.ageMs,
      nextRetryDelayMs: attempt.nextRetryDelayMs,
      evidenceAttemptHashes: [attempt.attemptHash],
      evidenceResourceHashes: [attempt.resourceHash],
    })
  }

  return Array.from(queue.values())
    .sort((left, right) => rankUploadActionQueuePriority(right.priority) - rankUploadActionQueuePriority(left.priority)
      || (right.failedAttempts + right.stuckAttempts) - (left.failedAttempts + left.stuckAttempts)
      || right.events - left.events
      || right.latestAt.localeCompare(left.latestAt))
    .slice(0, topLimit)
}

function uploadPipelineKey(item: UploadAttemptSummary): string {
  return [
    item.resourceType || 'unknown',
    item.surface || 'unknown',
    item.storageChannel || 'unknown',
    item.storageProvider || 'unknown',
  ].join(':')
}

function createUploadPipelineSummary(
  attempts: Iterable<UploadAttemptSummary>,
  stuckAttemptIds: Set<string>,
  topLimit: number,
) {
  const buckets = new Map<string, {
    key: string
    resourceType: string
    surface: string | null
    storageChannel: string | null
    storageProvider: string | null
    attempts: number
    started: number
    completed: number
    failed: number
    stuck: number
    pending: number
    latestAt: string
    durationMs: ReturnType<typeof createNumberStats>
    size: ReturnType<typeof createNumberStats>
  }>()

  for (const attempt of attempts) {
    const key = uploadPipelineKey(attempt)
    const bucket = buckets.get(key) ?? {
      key,
      resourceType: attempt.resourceType,
      surface: attempt.surface,
      storageChannel: attempt.storageChannel,
      storageProvider: attempt.storageProvider,
      attempts: 0,
      started: 0,
      completed: 0,
      failed: 0,
      stuck: 0,
      pending: 0,
      latestAt: attempt.latestAt,
      durationMs: createNumberStats(),
      size: createNumberStats(),
    }

    bucket.attempts += 1
    if (attempt.started)
      bucket.started += 1
    if (attempt.completed)
      bucket.completed += 1
    if (attempt.failed)
      bucket.failed += 1
    if (stuckAttemptIds.has(attempt.attemptId))
      bucket.stuck += 1
    else if (attempt.started && !attempt.completed && !attempt.failed)
      bucket.pending += 1
    addNumberStat(bucket.durationMs, attempt.durationMs)
    addNumberStat(bucket.size, attempt.size)
    if (attempt.latestAt.localeCompare(bucket.latestAt) > 0)
      bucket.latestAt = attempt.latestAt

    buckets.set(key, bucket)
  }

  return Array.from(buckets.values())
    .map(item => ({
      key: item.key,
      resourceType: item.resourceType,
      surface: item.surface,
      storageChannel: item.storageChannel,
      storageProvider: item.storageProvider,
      attempts: item.attempts,
      started: item.started,
      completed: item.completed,
      failed: item.failed,
      stuck: item.stuck,
      pending: item.pending,
      completionRate: item.attempts ? Math.round((item.completed / item.attempts) * 10000) / 100 : 0,
      failureRate: item.attempts ? Math.round((item.failed / item.attempts) * 10000) / 100 : 0,
      stuckRate: item.attempts ? Math.round((item.stuck / item.attempts) * 10000) / 100 : 0,
      avgDurationMs: mapNumberStat(item.durationMs).average,
      avgSize: mapNumberStat(item.size).average,
      latestAt: item.latestAt,
    }))
    .sort((left, right) => {
      return (right.failed + right.stuck) - (left.failed + left.stuck)
        || right.attempts - left.attempts
        || right.latestAt.localeCompare(left.latestAt)
    })
    .slice(0, topLimit)
}

function createUploadRecoveredEvidence(
  events: PlatformGovernanceEvent[],
  topLimit: number,
): UploadRecoveredEvidenceItem[] {
  const items: UploadRecoveredEvidenceItem[] = []

  for (const event of events) {
    const recovered = event.action === 'resource.completed'
      && (readEventMetadataBoolean(event, 'recovered') === true || readEventMetadataBoolean(event, 'recoveredRetry') === true)
    if (!recovered)
      continue

    const attemptId = readEventMetadataString(event, 'attemptId') ?? `${event.resourceId ?? event.id}:${event.occurredAt}`
    const resourceId = event.resourceId ?? attemptId
    items.push({
      attemptHash: hashIdentifier(attemptId)?.slice(0, 16) ?? 'unknown',
      resourceHash: hashIdentifier(resourceId)?.slice(0, 16) ?? 'unknown',
      resourceType: readEventMetadataString(event, 'resourceType') ?? event.resourceType ?? 'unknown',
      surface: readEventMetadataString(event, 'surface'),
      storageChannel: readEventMetadataString(event, 'storageChannel'),
      storageProvider: readEventMetadataString(event, 'storageProvider'),
      contentType: readEventMetadataString(event, 'contentType') ?? event.channel,
      durationMs: readEventMetadataNumber(event, 'durationMs'),
      size: readEventMetadataNumber(event, 'size') ?? (event.unit === 'byte' ? event.quantity : null),
      retryCount: readEventMetadataNumber(event, 'retryCount'),
      maxRetries: readEventMetadataNumber(event, 'maxRetries'),
      attempts: readEventMetadataNumberAny(event, ['attempts', 'storageAttempts']),
      storageOperation: readEventMetadataString(event, 'storageOperation'),
      storageStatusCode: readEventMetadataNumber(event, 'storageStatusCode'),
      latestAt: event.occurredAt,
    })
  }

  return items
    .sort((left, right) => right.latestAt.localeCompare(left.latestAt) || (right.retryCount ?? 0) - (left.retryCount ?? 0))
    .slice(0, topLimit)
}

function isSceneAdapterUploadEvent(event: PlatformGovernanceEvent): boolean {
  return event.scope === 'upload'
    && readEventMetadataString(event, 'surface') === 'scene-adapter-upload'
}

function createSceneAssetUploadHealth(
  attempts: Iterable<UploadAttemptSummary>,
  events: PlatformGovernanceEvent[],
  topLimit: number,
): UploadSceneAssetHealthItem[] {
  const sceneAttempts = new Map<string, {
    attemptId: string
    sceneId: string | null
    capability: string | null
    providerId: string | null
    assetKind: string | null
    resourceType: string
    storageChannel: string | null
    storageProvider: string | null
    surface: string
    started: boolean
    completed: boolean
    failed: boolean
    bytes: number
    durationMs: number | null
    size: number | null
    latestAt: string
    failureReasons: Map<string, number>
    statusCodes: Map<string, number>
  }>()

  const ensureAttempt = (attemptId: string, event: PlatformGovernanceEvent) => {
    const item = sceneAttempts.get(attemptId) ?? {
      attemptId,
      sceneId: null,
      capability: null,
      providerId: null,
      assetKind: null,
      resourceType: readEventMetadataString(event, 'resourceType') ?? event.resourceType ?? 'unknown',
      storageChannel: null,
      storageProvider: null,
      surface: 'scene-adapter-upload',
      started: false,
      completed: false,
      failed: false,
      bytes: 0,
      durationMs: null,
      size: null,
      latestAt: event.occurredAt,
      failureReasons: new Map<string, number>(),
      statusCodes: new Map<string, number>(),
    }

    item.sceneId ??= readEventMetadataString(event, 'sceneId')
    item.capability ??= readEventMetadataString(event, 'capability')
    item.providerId ??= readEventMetadataString(event, 'providerId')
    item.assetKind ??= readEventMetadataString(event, 'assetKind')
    item.storageChannel ??= readEventMetadataString(event, 'storageChannel')
    item.storageProvider ??= readEventMetadataString(event, 'storageProvider')
    item.resourceType = readEventMetadataString(event, 'resourceType') ?? event.resourceType ?? item.resourceType
    item.started = item.started || event.action === 'resource.started'
    item.completed = item.completed || event.action === 'resource.completed'
    item.failed = item.failed || event.action === 'resource.failed'
    if (event.action === 'resource.completed' && event.unit === 'byte')
      item.bytes += event.quantity
    item.durationMs ??= readEventMetadataNumber(event, 'durationMs')
    item.size ??= readEventMetadataNumber(event, 'size') ?? (event.unit === 'byte' ? event.quantity : null)
    if (event.action === 'resource.failed') {
      const reason = readEventMetadataString(event, 'reason') ?? 'unknown'
      item.failureReasons.set(reason, (item.failureReasons.get(reason) ?? 0) + 1)
      const statusCode = readEventMetadataNumber(event, 'statusCode')
      if (typeof statusCode === 'number') {
        const statusKey = String(Math.round(statusCode))
        item.statusCodes.set(statusKey, (item.statusCodes.get(statusKey) ?? 0) + 1)
      }
    }
    if (event.occurredAt.localeCompare(item.latestAt) > 0)
      item.latestAt = event.occurredAt
    sceneAttempts.set(attemptId, item)
    return item
  }

  for (const event of events) {
    if (!isSceneAdapterUploadEvent(event))
      continue
    const attemptId = readEventMetadataString(event, 'attemptId')
    if (attemptId)
      ensureAttempt(attemptId, event)
  }

  for (const attempt of attempts) {
    const item = sceneAttempts.get(attempt.attemptId)
    if (!item)
      continue
    item.storageChannel ??= attempt.storageChannel
    item.storageProvider ??= attempt.storageProvider
    item.resourceType = attempt.resourceType || item.resourceType
    item.durationMs ??= attempt.durationMs
    item.size ??= attempt.size
  }

  const buckets = new Map<string, {
    key: string
    sceneId: string | null
    capability: string | null
    providerId: string | null
    assetKind: string | null
    resourceType: string
    storageChannel: string | null
    storageProvider: string | null
    surface: string
    started: number
    completed: number
    failed: number
    bytes: number
    durationMs: ReturnType<typeof createNumberStats>
    size: ReturnType<typeof createNumberStats>
    latestAt: string
    failureReasons: Map<string, number>
    statusCodes: Map<string, number>
  }>()

  for (const attempt of sceneAttempts.values()) {
    const key = [
      attempt.sceneId ?? 'unknown',
      attempt.capability ?? 'unknown',
      attempt.providerId ?? 'unknown',
      attempt.assetKind ?? 'unknown',
      attempt.resourceType,
      attempt.storageChannel ?? 'unknown',
      attempt.storageProvider ?? 'unknown',
    ].join(':')
    const bucket = buckets.get(key) ?? {
      key,
      sceneId: attempt.sceneId,
      capability: attempt.capability,
      providerId: attempt.providerId,
      assetKind: attempt.assetKind,
      resourceType: attempt.resourceType,
      storageChannel: attempt.storageChannel,
      storageProvider: attempt.storageProvider,
      surface: attempt.surface,
      started: 0,
      completed: 0,
      failed: 0,
      bytes: 0,
      durationMs: createNumberStats(),
      size: createNumberStats(),
      latestAt: attempt.latestAt,
      failureReasons: new Map<string, number>(),
      statusCodes: new Map<string, number>(),
    }
    bucket.started += attempt.started ? 1 : 0
    bucket.completed += attempt.completed ? 1 : 0
    bucket.failed += attempt.failed ? 1 : 0
    bucket.bytes += attempt.bytes
    addNumberStat(bucket.durationMs, attempt.durationMs)
    addNumberStat(bucket.size, attempt.size)
    if (attempt.latestAt.localeCompare(bucket.latestAt) > 0)
      bucket.latestAt = attempt.latestAt
    for (const [reason, count] of attempt.failureReasons.entries())
      bucket.failureReasons.set(reason, (bucket.failureReasons.get(reason) ?? 0) + count)
    for (const [statusCode, count] of attempt.statusCodes.entries())
      bucket.statusCodes.set(statusCode, (bucket.statusCodes.get(statusCode) ?? 0) + count)
    buckets.set(key, bucket)
  }

  const mapRankedCounts = (values: Map<string, number>) => Array.from(values.entries())
    .map(([key, events]) => ({ key, events }))
    .sort((left, right) => right.events - left.events || left.key.localeCompare(right.key))
    .slice(0, 5)

  return Array.from(buckets.values())
    .map(item => ({
      key: item.key,
      sceneId: item.sceneId,
      capability: item.capability,
      providerId: item.providerId,
      assetKind: item.assetKind,
      resourceType: item.resourceType,
      storageChannel: item.storageChannel,
      storageProvider: item.storageProvider,
      surface: item.surface,
      started: item.started,
      completed: item.completed,
      failed: item.failed,
      bytes: item.bytes,
      failureRate: percentage(item.failed, item.completed + item.failed),
      avgDurationMs: mapNumberStat(item.durationMs).average,
      avgSize: mapNumberStat(item.size).average,
      latestAt: item.latestAt,
      failureReasons: mapRankedCounts(item.failureReasons),
      statusCodes: mapRankedCounts(item.statusCodes),
    }))
    .sort((left, right) => right.failed - left.failed
      || right.failureRate - left.failureRate
      || right.started - left.started
      || right.latestAt.localeCompare(left.latestAt))
    .slice(0, topLimit)
}

function createUploadAnalytics(events: PlatformGovernanceEvent[], topLimit: number) {
  const uploadEvents = events.filter(event => event.scope === 'upload')
  const started = uploadEvents.filter(event => event.action === 'resource.started')
  const completed = uploadEvents.filter(event => event.action === 'resource.completed')
  const failed = uploadEvents.filter(event => event.action === 'resource.failed')
  const terminalEvents = [...completed, ...failed]
  const attempts = new Map<string, UploadAttemptSummary>()
  const byExtension = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byResourceType = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byContentType = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byStorageChannel = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byStorageProvider = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byFailureReason = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byStatusCode = new Map<string, ReturnType<typeof createMetricBucket>>()
  const bySurface = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byRetryDisposition = new Map<string, ReturnType<typeof createMetricBucket>>()
  const failureMatrix = new Map<string, UploadFailureMatrixItem & { actors: Set<string> }>()
  const uploadSize = createNumberStats()
  const uploadDurationMs = createNumberStats()
  const retryCountStats = createNumberStats()
  const nextRetryDelayMsStats = createNumberStats()
  const recoveredAttemptsStats = createNumberStats()
  const statusTrend = new Map<string, {
    date: string
    events: number
    started: number
    completed: number
    failed: number
    bytes: number
    actors: Set<string>
  }>()
  const retryTrend = new Map<string, {
    date: string
    events: number
    failed: number
    retryable: number
    scheduled: number
    exhausted: number
    recovered: number
    quantity: number
    actors: Set<string>
  }>()

  let retryableFailures = 0
  let nonRetryableFailures = 0
  let scheduledRetries = 0
  let exhaustedFailures = 0
  let recoveredUploads = 0
  let recoveredRetryCount = 0
  let calibratedFailureSamples = 0
  let verifiedFailureSamples = 0
  let liveFailureSamples = 0
  let manualFailureSamples = 0

  for (const event of uploadEvents) {
    const date = event.occurredAt.slice(0, 10)
    const trendItem = statusTrend.get(date) ?? {
      date,
      events: 0,
      started: 0,
      completed: 0,
      failed: 0,
      bytes: 0,
      actors: new Set<string>(),
    }
    trendItem.events += 1
    if (event.action === 'resource.started')
      trendItem.started += 1
    else if (event.action === 'resource.completed') {
      trendItem.completed += 1
      if (event.unit === 'byte')
        trendItem.bytes += event.quantity
    }
    else if (event.action === 'resource.failed') {
      trendItem.failed += 1
    }
    const actor = readEventActor(event)
    if (actor)
      trendItem.actors.add(actor)
    statusTrend.set(date, trendItem)

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
        retryable: null,
        retryCount: null,
        maxRetries: null,
        nextRetryDelayMs: null,
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
      item.retryable ??= readEventMetadataBoolean(event, 'retryable')
      item.retryCount ??= readEventMetadataNumber(event, 'retryCount')
      item.maxRetries ??= readEventMetadataNumber(event, 'maxRetries')
      item.nextRetryDelayMs ??= readEventMetadataNumberAny(event, ['nextRetryDelayMs', 'retryAfterMs', 'backoffMs'])
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
    const recovered = event.action === 'resource.completed'
      && (readEventMetadataBoolean(event, 'recovered') === true || readEventMetadataBoolean(event, 'recoveredRetry') === true)
    if (recovered) {
      const retryCount = readEventMetadataNumber(event, 'retryCount') ?? 0
      recoveredUploads += 1
      recoveredRetryCount += retryCount
      addNumberStat(recoveredAttemptsStats, readEventMetadataNumberAny(event, ['attempts', 'storageAttempts']))
      addMetricBucket(byRetryDisposition, 'retry-recovered', event, 1)

      const date = event.occurredAt.slice(0, 10)
      const retryItem = retryTrend.get(date) ?? {
        date,
        events: 0,
        failed: 0,
        retryable: 0,
        scheduled: 0,
        exhausted: 0,
        recovered: 0,
        quantity: 0,
        actors: new Set<string>(),
      }
      retryItem.events += 1
      retryItem.recovered += 1
      retryItem.quantity += event.quantity
      const actor = readEventActor(event)
      if (actor)
        retryItem.actors.add(actor)
      retryTrend.set(date, retryItem)
    }
    if (event.action === 'resource.failed') {
      addUploadFailureMatrixItem(failureMatrix, event)
      addMetricBucket(byFailureReason, readEventMetadataString(event, 'reason'), event, 1)
      const statusCode = readEventMetadataNumber(event, 'statusCode')
      if (typeof statusCode === 'number')
        addMetricBucket(byStatusCode, String(Math.round(statusCode)), event, 1)

      const retryable = readEventMetadataBoolean(event, 'retryable')
      const retryCount = readEventMetadataNumber(event, 'retryCount')
      const maxRetries = readEventMetadataNumber(event, 'maxRetries')
      const nextRetryDelayMs = readEventMetadataNumberAny(event, ['nextRetryDelayMs', 'retryAfterMs', 'backoffMs'])
      const disposition = resolveUploadFailureDisposition(event)
      const scheduled = disposition === 'retry-scheduled'
      const exhausted = disposition === 'retry-exhausted'

      if (retryable === true)
        retryableFailures += 1
      else if (retryable === false)
        nonRetryableFailures += 1
      if (scheduled)
        scheduledRetries += 1
      if (exhausted)
        exhaustedFailures += 1
      const calibrationStatus = resolveUploadFailureCalibrationStatus(event)
      const sampleSource = resolveUploadFailureSampleSource(event)
      if (calibrationStatus !== 'needs-calibration')
        calibratedFailureSamples += 1
      if (calibrationStatus === 'verified')
        verifiedFailureSamples += 1
      if (sampleSource === 'live')
        liveFailureSamples += 1
      if (sampleSource === 'manual')
        manualFailureSamples += 1

      addMetricBucket(byRetryDisposition, disposition, event, 1)
      addNumberStat(retryCountStats, retryCount)
      addNumberStat(nextRetryDelayMsStats, nextRetryDelayMs)

      const date = event.occurredAt.slice(0, 10)
      const retryItem = retryTrend.get(date) ?? {
        date,
        events: 0,
        failed: 0,
        retryable: 0,
        scheduled: 0,
        exhausted: 0,
        recovered: 0,
        quantity: 0,
        actors: new Set<string>(),
      }
      retryItem.events += 1
      retryItem.failed += 1
      retryItem.quantity += event.quantity
      if (retryable === true)
        retryItem.retryable += 1
      if (scheduled)
        retryItem.scheduled += 1
      if (exhausted)
        retryItem.exhausted += 1
      const actor = readEventActor(event)
      if (actor)
        retryItem.actors.add(actor)
      retryTrend.set(date, retryItem)
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
  const problemAttempts: UploadProblemAttempt[] = Array.from(attempts.values())
    .filter(item => item.failed || stuckAttemptIds.has(item.attemptId))
    .map((item): UploadProblemAttempt => {
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
        retryable: item.retryable,
        retryCount: item.retryCount,
        maxRetries: item.maxRetries,
        nextRetryDelayMs: item.nextRetryDelayMs,
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
  const mappedFailureMatrix = mapUploadFailureMatrix(failureMatrix, topLimit)
  const recoveredEvidence = createUploadRecoveredEvidence(completed, topLimit)
  const sceneAssetHealth = createSceneAssetUploadHealth(attempts.values(), uploadEvents, topLimit)

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
    pipelineSummary: createUploadPipelineSummary(attempts.values(), stuckAttemptIds, topLimit),
    byExtension: mapMetricBuckets(byExtension, topLimit),
    byResourceType: mapMetricBuckets(byResourceType, topLimit),
    byContentType: mapMetricBuckets(byContentType, topLimit),
    byStorageChannel: mapMetricBuckets(byStorageChannel, topLimit),
    byStorageProvider: mapMetricBuckets(byStorageProvider, topLimit),
    byFailureReason: mapMetricBuckets(byFailureReason, topLimit),
    byStatusCode: mapMetricBuckets(byStatusCode, topLimit),
    bySurface: mapMetricBuckets(bySurface, topLimit),
    sceneAssetHealth,
    failureMatrix: mappedFailureMatrix,
    actionQueue: createUploadActionQueue(mappedFailureMatrix, problemAttempts, topLimit),
    retrySummary: {
      retryableFailures,
      nonRetryableFailures,
      scheduledRetries,
      exhaustedFailures,
      recoveredUploads,
      recoveredRetryCount,
      recoveredRetryRate: completed.length ? Math.round((recoveredUploads / completed.length) * 10000) / 100 : 0,
      calibratedFailureSamples,
      verifiedFailureSamples,
      liveFailureSamples,
      manualFailureSamples,
      calibrationCoverageRate: failed.length ? Math.round((calibratedFailureSamples / failed.length) * 10000) / 100 : 0,
      retryCount: mapNumberStat(retryCountStats),
      nextRetryDelayMs: mapNumberStat(nextRetryDelayMsStats),
      recoveredAttempts: mapNumberStat(recoveredAttemptsStats),
    },
    byRetryDisposition: mapMetricBuckets(byRetryDisposition, topLimit),
    statusTrend: Array.from(statusTrend.values())
      .map(item => ({
        date: item.date,
        events: item.events,
        started: item.started,
        completed: item.completed,
        failed: item.failed,
        bytes: item.bytes,
        uniqueActors: item.actors.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    retryTrend: Array.from(retryTrend.values())
      .map(item => ({
        date: item.date,
        events: item.events,
        failed: item.failed,
        retryable: item.retryable,
        scheduled: item.scheduled,
        exhausted: item.exhausted,
        recovered: item.recovered,
        quantity: item.quantity,
        uniqueActors: item.actors.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    uploadSize: mapNumberStat(uploadSize),
    uploadDurationMs: mapNumberStat(uploadDurationMs),
    recoveredEvidence,
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

type StorageUsageBucket = ReturnType<typeof createStorageUsageBucket>

function parseStorageSmokeStatus(action: string): StorageSmokeEvidenceStatus | null {
  if (action === 'storage.channel_smoke.ready')
    return 'ready'
  if (action === 'storage.channel_smoke.sent')
    return 'sent'
  if (action === 'storage.channel_smoke.failed')
    return 'failed'
  return null
}

function normalizeStorageSmokeMode(value: string | null): StorageSmokeEvidenceMode {
  if (value === 'dry-run' || value === 'write')
    return value
  return 'unknown'
}

function readStringArrayMetadata(event: PlatformGovernanceEvent, key: string): string[] {
  const value = event.metadata?.[key]
  if (!Array.isArray(value))
    return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
    .slice(0, 8)
}

function createStorageSmokeEvidence(events: PlatformGovernanceEvent[], limit: number): StorageSmokeEvidenceItem[] {
  const buckets = new Map<string, StorageSmokeEvidenceItem & { actors: Set<string>, latestTime: number }>()

  for (const event of events) {
    const status = parseStorageSmokeStatus(event.action)
    if (!status)
      continue

    const policyId = event.resourceId ?? null
    const mode = normalizeStorageSmokeMode(readEventMetadataString(event, 'mode'))
    const key = `${policyId ?? 'unknown'}:${mode}`
    const occurredTime = Date.parse(event.occurredAt)
    const latestTime = Number.isFinite(occurredTime) ? occurredTime : 0
    const item = buckets.get(key) ?? {
      key,
      policyId,
      policyName: readEventMetadataString(event, 'policyName'),
      channel: event.channel,
      provider: readEventMetadataString(event, 'provider'),
      mode,
      evidenceSource: readEventEvidenceSource(event),
      status,
      reason: readEventMetadataString(event, 'reason'),
      operations: readStringArrayMetadata(event, 'operations'),
      bytesWritten: 0,
      bytesRead: 0,
      storageChannel: readEventMetadataString(event, 'storageChannel'),
      storageProvider: readEventMetadataString(event, 'storageProvider'),
      credentialRequired: readEventMetadataBoolean(event, 'credentialRequired'),
      hasCredentialRef: readEventMetadataBoolean(event, 'hasCredentialRef'),
      hasCredential: readEventMetadataBoolean(event, 'hasCredential'),
      latestAt: event.occurredAt,
      latestTime,
      events: 0,
      ready: 0,
      sent: 0,
      failed: 0,
      uniqueActors: 0,
      actors: new Set<string>(),
    }

    item.events += 1
    item[status] += 1
    if (latestTime >= item.latestTime) {
      item.status = status
      item.reason = readEventMetadataString(event, 'reason')
      item.evidenceSource = readEventEvidenceSource(event)
      item.operations = readStringArrayMetadata(event, 'operations')
      item.bytesWritten = readEventMetadataNumber(event, 'bytesWritten') ?? 0
      item.bytesRead = readEventMetadataNumber(event, 'bytesRead') ?? 0
      item.storageChannel = readEventMetadataString(event, 'storageChannel')
      item.storageProvider = readEventMetadataString(event, 'storageProvider')
      item.credentialRequired = readEventMetadataBoolean(event, 'credentialRequired')
      item.hasCredentialRef = readEventMetadataBoolean(event, 'hasCredentialRef')
      item.hasCredential = readEventMetadataBoolean(event, 'hasCredential')
      item.policyName = readEventMetadataString(event, 'policyName') ?? item.policyName
      item.provider = readEventMetadataString(event, 'provider')
      item.channel = event.channel
      item.latestAt = event.occurredAt
      item.latestTime = latestTime
    }
    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)
    buckets.set(key, item)
  }

  return Array.from(buckets.values())
    .map(({ actors, latestTime: _latestTime, ...item }) => ({
      ...item,
      uniqueActors: actors.size,
    }))
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt) || b.events - a.events)
    .slice(0, limit)
}

interface ProviderChannelDistributionBucket {
  providerId: string
  channel: string
  requests: number
  tokens: number
  quantity: number
  actors: Set<string>
  models: Map<string, number>
  providerTypes: Map<string, number>
}

function addStorageUsageBucket(
  buckets: Map<string, StorageUsageBucket>,
  key: string | null | undefined,
  event: PlatformGovernanceEvent,
): void {
  const bucketKey = key && key.trim() ? key.trim() : 'unknown'
  const bucket = buckets.get(bucketKey) ?? createStorageUsageBucket()
  addStorageUsageBucketToItem(bucket, event)
  buckets.set(bucketKey, bucket)
}

function mapStorageUsageBuckets(buckets: Map<string, StorageUsageBucket>, limit: number) {
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

function createStorageChannelPressureBucket() {
  return {
    ...createStorageUsageBucket(),
    daily: new Map<string, StorageUsageBucket & { date: string }>(),
  }
}

type StorageChannelPressureBucket = ReturnType<typeof createStorageChannelPressureBucket>

function storageChannelPressureKey(channel: string | null | undefined, provider: string | null | undefined): string {
  const normalizedChannel = channel && channel.trim() ? channel.trim() : 'unknown'
  const normalizedProvider = provider && provider.trim() ? provider.trim() : 'default'
  return `${normalizedChannel}\u0000${normalizedProvider}`
}

function addStorageChannelPressureBucket(
  buckets: Map<string, StorageChannelPressureBucket>,
  event: PlatformGovernanceEvent,
): void {
  const provider = readEventMetadataString(event, 'provider')
  const key = storageChannelPressureKey(event.channel, provider)
  const bucket = buckets.get(key) ?? createStorageChannelPressureBucket()
  addStorageUsageBucketToItem(bucket, event)

  const date = event.occurredAt.slice(0, 10)
  const trendItem = bucket.daily.get(date) ?? { ...createStorageUsageBucket(), date }
  addStorageUsageBucketToItem(trendItem, event)
  bucket.daily.set(date, trendItem)
  buckets.set(key, bucket)
}

function addStorageUsageBucketToItem(bucket: StorageUsageBucket, event: PlatformGovernanceEvent): void {
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
}

function chooseStoragePolicyCandidate(left: StoragePolicyEvaluation, right: StoragePolicyEvaluation): StoragePolicyEvaluation {
  const statusDiff = storagePolicyStatusRank(right.status) - storagePolicyStatusRank(left.status)
  if (statusDiff > 0)
    return right
  if (statusDiff < 0)
    return left

  const rightUtilization = maxNullableRatio(right.utilization.storedBytes, right.utilization.trafficBytes, right.utilization.operations)
  const leftUtilization = maxNullableRatio(left.utilization.storedBytes, left.utilization.trafficBytes, left.utilization.operations)
  if (rightUtilization > leftUtilization)
    return right
  if (rightUtilization < leftUtilization)
    return left

  return right.usage.operations > left.usage.operations ? right : left
}

function findStorageChannelPolicies(
  evaluations: StoragePolicyEvaluation[],
  channel: string,
  provider: string | null,
): StoragePolicyEvaluation[] {
  return evaluations.filter((item) => {
    if (item.channel !== channel)
      return false
    if (!item.provider)
      return true
    return provider != null && item.provider === provider
  })
}

function mapStorageChannelPressure(
  buckets: Map<string, StorageChannelPressureBucket>,
  policyEvaluations: StoragePolicyEvaluation[],
  topLimit: number,
): StorageChannelPressure[] {
  const pressureBuckets = new Map(buckets)
  for (const policy of policyEvaluations) {
    const key = storageChannelPressureKey(policy.channel, policy.provider)
    if (!pressureBuckets.has(key))
      pressureBuckets.set(key, createStorageChannelPressureBucket())
  }

  return Array.from(pressureBuckets.entries())
    .map(([key, item]) => {
      const [channel, providerKey] = key.split('\u0000')
      const safeChannel = channel ?? 'unknown'
      const provider: string | null = !providerKey || providerKey === 'default' ? null : providerKey
      const policies = findStorageChannelPolicies(policyEvaluations, safeChannel, provider)
      const policy = policies.reduce<StoragePolicyEvaluation | null>((candidate, next) => {
        return candidate ? chooseStoragePolicyCandidate(candidate, next) : next
      }, null)
      const policyAlerts = policies.filter(next => next.status === 'warning' || next.status === 'blocked')
      const highestUtilization = policy
        ? maxNullableRatio(policy.utilization.storedBytes, policy.utilization.trafficBytes, policy.utilization.operations)
        : 0

      return {
        channel: safeChannel,
        provider,
        events: item.events,
        storedBytes: item.storedBytes,
        trafficBytes: item.trafficBytes,
        operations: item.operations,
        writes: item.writes,
        reads: item.reads,
        deletes: item.deletes,
        uniqueActors: item.actors.size,
        pressureStatus: (policy?.status ?? 'unmanaged') as StorageChannelPressureStatus,
        policyId: policy?.policyId ?? null,
        policyName: policy?.name ?? null,
        matchedPolicies: policies.length,
        policyAlerts: policyAlerts.length,
        policyReasons: [...new Set(policyAlerts.flatMap(next => next.reasons))].slice(0, 6),
        highestUtilization,
        remaining: policy?.remaining ?? {
          storedBytes: null,
          trafficBytes: null,
          operations: null,
          alertBytes: null,
        },
        overage: policy?.overage ?? {
          storedBytes: 0,
          trafficBytes: 0,
          operations: 0,
          alertBytes: 0,
        },
        burnRate: policy?.burnRate ?? {
          storedBytesPerDay: 0,
          trafficBytesPerDay: 0,
          operationsPerDay: 0,
        },
        projectedExhaustionDays: policy?.projectedExhaustionDays ?? {
          storedBytes: null,
          trafficBytes: null,
          operations: null,
          alertBytes: null,
        },
        trend: Array.from(item.daily.values())
          .map(next => ({
            date: next.date,
            events: next.events,
            storedBytes: next.storedBytes,
            trafficBytes: next.trafficBytes,
            operations: next.operations,
            writes: next.writes,
            reads: next.reads,
            deletes: next.deletes,
            uniqueActors: next.actors.size,
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      }
    })
    .sort((a, b) => {
      const rightStatus: StoragePolicyEvaluationStatus = b.pressureStatus === 'unmanaged' ? 'ok' : b.pressureStatus
      const leftStatus: StoragePolicyEvaluationStatus = a.pressureStatus === 'unmanaged' ? 'ok' : a.pressureStatus
      return storagePolicyStatusRank(rightStatus)
        - storagePolicyStatusRank(leftStatus)
        || b.highestUtilization - a.highestUtilization
        || (b.storedBytes + b.trafficBytes) - (a.storedBytes + a.trafficBytes)
        || b.operations - a.operations
    })
    .slice(0, topLimit)
}

function rankStorageActionQueuePriority(priority: StorageActionQueuePriority): number {
  switch (priority) {
    case 'critical':
      return 4
    case 'high':
      return 3
    case 'medium':
      return 2
    default:
      return 1
  }
}

function nearestStorageProjectedExhaustionDays(item: StorageChannelPressure): number | null {
  const values = [
    item.projectedExhaustionDays.storedBytes,
    item.projectedExhaustionDays.trafficBytes,
    item.projectedExhaustionDays.operations,
    item.projectedExhaustionDays.alertBytes,
  ].filter((value): value is number => value != null && Number.isFinite(value))

  return values.length ? Math.min(...values) : null
}

function resolveStorageActionQueuePriority(item: StorageChannelPressure): StorageActionQueuePriority {
  const nearestExhaustion = nearestStorageProjectedExhaustionDays(item)
  if (
    item.pressureStatus === 'blocked'
    || item.overage.storedBytes > 0
    || item.overage.trafficBytes > 0
    || item.overage.operations > 0
  ) {
    return 'critical'
  }
  if (
    item.pressureStatus === 'warning'
    || item.policyAlerts > 0
    || item.highestUtilization >= 90
    || (nearestExhaustion != null && nearestExhaustion <= 7)
  ) {
    return 'high'
  }
  if (
    (item.pressureStatus === 'unmanaged' && item.operations > 0)
    || item.highestUtilization >= 70
    || (nearestExhaustion != null && nearestExhaustion <= 30)
  ) {
    return 'medium'
  }
  return 'low'
}

function resolveStorageActionQueueSuggestedAction(item: StorageChannelPressure): StorageActionQueueSuggestedAction {
  if (item.pressureStatus === 'unmanaged')
    return 'configure-policy'
  if (
    item.overage.operations > 0
    || item.remaining.operations === 0
    || (item.projectedExhaustionDays.operations != null && item.projectedExhaustionDays.operations <= 14)
  ) {
    return 'increase-operation-limit'
  }
  if (
    item.overage.trafficBytes > 0
    || item.remaining.trafficBytes === 0
    || (item.projectedExhaustionDays.trafficBytes != null && item.projectedExhaustionDays.trafficBytes <= 14)
  ) {
    return 'increase-traffic-limit'
  }
  if (
    item.overage.storedBytes > 0
    || item.overage.alertBytes > 0
    || item.remaining.storedBytes === 0
    || item.remaining.alertBytes === 0
    || (item.projectedExhaustionDays.storedBytes != null && item.projectedExhaustionDays.storedBytes <= 14)
    || (item.projectedExhaustionDays.alertBytes != null && item.projectedExhaustionDays.alertBytes <= 14)
  ) {
    return 'increase-storage-limit'
  }
  if (
    item.highestUtilization >= 70
    || item.burnRate.storedBytesPerDay > 0
    || item.burnRate.trafficBytesPerDay > 0
    || item.burnRate.operationsPerDay > 0
  ) {
    return 'review-burn-rate'
  }
  return 'monitor-channel'
}

function resolveStorageActionQueueReason(item: StorageChannelPressure): string {
  if (item.pressureStatus === 'unmanaged')
    return 'unmanaged-channel'
  if (item.overage.operations > 0)
    return 'operation-limit-overage'
  if (item.overage.trafficBytes > 0)
    return 'traffic-limit-overage'
  if (item.overage.storedBytes > 0)
    return 'storage-limit-overage'
  if (item.overage.alertBytes > 0)
    return 'alert-bytes-reached'
  const nearestExhaustion = nearestStorageProjectedExhaustionDays(item)
  if (nearestExhaustion != null && nearestExhaustion <= 30)
    return 'projected-exhaustion'
  if (item.policyReasons.length)
    return item.policyReasons[0] ?? 'policy-risk'
  if (item.highestUtilization >= 70)
    return 'high-utilization'
  return 'monitor-channel'
}

function createStorageActionQueue(
  channelPressure: StorageChannelPressure[],
  topLimit: number,
): StorageActionQueueItem[] {
  return channelPressure
    .map((item): StorageActionQueueItem => {
      const priority = resolveStorageActionQueuePriority(item)
      const latestTrend = item.trend.length ? item.trend[item.trend.length - 1] : null
      return {
        key: `${item.channel}|${item.provider ?? 'default'}|${item.policyId ?? 'unmanaged'}`,
        priority,
        suggestedAction: resolveStorageActionQueueSuggestedAction(item),
        reason: resolveStorageActionQueueReason(item),
        channel: item.channel,
        provider: item.provider,
        policyId: item.policyId,
        policyName: item.policyName,
        pressureStatus: item.pressureStatus,
        events: item.events,
        storedBytes: item.storedBytes,
        trafficBytes: item.trafficBytes,
        operations: item.operations,
        writes: item.writes,
        reads: item.reads,
        deletes: item.deletes,
        uniqueActors: item.uniqueActors,
        highestUtilization: item.highestUtilization,
        policyAlerts: item.policyAlerts,
        policyReasons: item.policyReasons,
        remaining: item.remaining,
        overage: item.overage,
        burnRate: item.burnRate,
        projectedExhaustionDays: item.projectedExhaustionDays,
        latestTrendDate: latestTrend?.date ?? null,
      }
    })
    .filter(item => item.priority !== 'low')
    .sort((left, right) => rankStorageActionQueuePriority(right.priority) - rankStorageActionQueuePriority(left.priority)
      || right.highestUtilization - left.highestUtilization
      || (right.storedBytes + right.trafficBytes) - (left.storedBytes + left.trafficBytes)
      || right.operations - left.operations)
    .slice(0, topLimit)
}

function storagePolicyStatusRank(status: StoragePolicyEvaluationStatus): number {
  if (status === 'blocked')
    return 4
  if (status === 'warning')
    return 3
  if (status === 'disabled')
    return 2
  return 1
}

function maxNullableRatio(...values: Array<number | null>): number {
  return values.reduce<number>((max, value) => value == null ? max : Math.max(max, value), 0)
}

function createStoragePolicyAnalytics(evaluations: StoragePolicyEvaluation[], topLimit: number): StoragePolicyAnalytics {
  const summary: StoragePolicyAnalyticsSummary = {
    total: evaluations.length,
    active: evaluations.filter(item => item.enabled).length,
    ok: evaluations.filter(item => item.status === 'ok').length,
    warning: evaluations.filter(item => item.status === 'warning').length,
    blocked: evaluations.filter(item => item.status === 'blocked').length,
    disabled: evaluations.filter(item => item.status === 'disabled').length,
    alerts: buildStoragePolicyAlerts(evaluations).length,
    highestStoredUtilization: 0,
    highestTrafficUtilization: 0,
    highestOperationUtilization: 0,
  }

  for (const evaluation of evaluations) {
    summary.highestStoredUtilization = Math.max(summary.highestStoredUtilization, evaluation.utilization.storedBytes ?? 0)
    summary.highestTrafficUtilization = Math.max(summary.highestTrafficUtilization, evaluation.utilization.trafficBytes ?? 0)
    summary.highestOperationUtilization = Math.max(summary.highestOperationUtilization, evaluation.utilization.operations ?? 0)
  }

  return {
    policySummary: summary,
    policyRisks: [...evaluations]
      .filter(item => item.status !== 'ok')
      .sort((left, right) => {
        return storagePolicyStatusRank(right.status) - storagePolicyStatusRank(left.status)
          || maxNullableRatio(right.utilization.storedBytes, right.utilization.trafficBytes, right.utilization.operations)
            - maxNullableRatio(left.utilization.storedBytes, left.utilization.trafficBytes, left.utilization.operations)
          || right.usage.operations - left.usage.operations
      })
      .slice(0, topLimit),
  }
}

function createStorageAnalytics(events: PlatformGovernanceEvent[], topLimit: number, policyEvaluations: StoragePolicyEvaluation[] = []) {
  const storageEvents = events.filter(event => event.scope === 'storage')
  const byChannelUsage = new Map<string, StorageUsageBucket>()
  const byProviderUsage = new Map<string, StorageUsageBucket>()
  const byResourceTypeUsage = new Map<string, StorageUsageBucket>()
  const byActionUsage = new Map<string, StorageUsageBucket>()
  const trend = new Map<string, StorageUsageBucket & { date: string }>()
  const channelPressure = new Map<string, StorageChannelPressureBucket>()

  for (const event of storageEvents) {
    addStorageUsageBucket(byChannelUsage, event.channel, event)
    addStorageUsageBucket(byProviderUsage, readEventMetadataString(event, 'provider'), event)
    addStorageUsageBucket(byResourceTypeUsage, event.resourceType, event)
    addStorageUsageBucket(byActionUsage, event.action, event)
    addStorageChannelPressureBucket(channelPressure, event)

    const date = event.occurredAt.slice(0, 10)
    const item = trend.get(date) ?? { ...createStorageUsageBucket(), date }
    addStorageUsageBucketToItem(item, event)
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
  const mappedChannelPressure = mapStorageChannelPressure(channelPressure, policyEvaluations, topLimit)

  return {
    ...createScopedAnalytics(storageEvents, topLimit),
    ...totals,
    ...createStoragePolicyAnalytics(policyEvaluations, topLimit),
    byChannelUsage: mapStorageUsageBuckets(byChannelUsage, topLimit),
    byProviderUsage: mapStorageUsageBuckets(byProviderUsage, topLimit),
    byResourceTypeUsage: mapStorageUsageBuckets(byResourceTypeUsage, topLimit),
    byActionUsage: mapStorageUsageBuckets(byActionUsage, topLimit),
    channelPressure: mappedChannelPressure,
    actionQueue: createStorageActionQueue(mappedChannelPressure, topLimit),
    smokeEvidence: createStorageSmokeEvidence(storageEvents, topLimit),
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
  const providerEvents = events.filter(event =>
    event.scope === 'intelligence'
    && event.resourceType === 'provider'
    && (event.action === 'provider.request' || event.action === 'provider.usage'),
  )
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
  const models = new Map<string, {
    model: string
    requests: number
    tokens: number
    quantity: number
    actors: Set<string>
    providers: Map<string, number>
    channels: Map<string, number>
    providerTypes: Map<string, number>
  }>()
  const modelChannels = new Map<string, {
    model: string
    channel: string
    requests: number
    tokens: number
    quantity: number
    actors: Set<string>
    providers: Map<string, number>
    providerTypes: Map<string, number>
  }>()
  const channelDistribution = new Map<string, ProviderChannelDistributionBucket>()
  const byModel = new Map<string, ReturnType<typeof createMetricBucket>>()
  const byProviderType = new Map<string, ReturnType<typeof createMetricBucket>>()
  const trend = new Map<string, {
    date: string
    events: number
    requests: number
    tokens: number
    quantity: number
    actors: Set<string>
  }>()
  const usageSummary = {
    events: providerEvents.length,
    requests: 0,
    tokens: 0,
  }

  for (const event of providerEvents) {
    const providerId = event.resourceId ?? 'unknown'
    const model = readEventMetadataString(event, 'model') ?? 'unknown'
    const providerType = readEventMetadataString(event, 'providerType')
    const channel = event.channel ?? 'unknown'
    const date = event.occurredAt.slice(0, 10)
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
    const trendItem = trend.get(date) ?? {
      date,
      events: 0,
      requests: 0,
      tokens: 0,
      quantity: 0,
      actors: new Set<string>(),
    }
    const modelItem = models.get(model) ?? {
      model,
      requests: 0,
      tokens: 0,
      quantity: 0,
      actors: new Set<string>(),
      providers: new Map<string, number>(),
      channels: new Map<string, number>(),
      providerTypes: new Map<string, number>(),
    }
    const channelKey = `${providerId}:${channel}`
    const modelChannelKey = `${model}:${channel}`
    const channelItem = channelDistribution.get(channelKey) ?? {
      providerId,
      channel,
      requests: 0,
      tokens: 0,
      quantity: 0,
      actors: new Set<string>(),
      models: new Map<string, number>(),
      providerTypes: new Map<string, number>(),
    }
    const modelChannelItem = modelChannels.get(modelChannelKey) ?? {
      model,
      channel,
      requests: 0,
      tokens: 0,
      quantity: 0,
      actors: new Set<string>(),
      providers: new Map<string, number>(),
      providerTypes: new Map<string, number>(),
    }
    if (event.action === 'provider.request') {
      item.requests += event.quantity
      channelItem.requests += event.quantity
      trendItem.requests += event.quantity
      usageSummary.requests += event.quantity
      modelItem.requests += event.quantity
      modelChannelItem.requests += event.quantity
    }
    if (event.action === 'provider.usage' && event.unit === 'token') {
      item.tokens += event.quantity
      channelItem.tokens += event.quantity
      trendItem.tokens += event.quantity
      usageSummary.tokens += event.quantity
      modelItem.tokens += event.quantity
      modelChannelItem.tokens += event.quantity
    }
    item.quantity += event.quantity
    modelItem.quantity += event.quantity
    channelItem.quantity += event.quantity
    modelChannelItem.quantity += event.quantity
    trendItem.events += 1
    trendItem.quantity += event.quantity
    const actor = readEventActor(event)
    if (actor) {
      item.actors.add(actor)
      modelItem.actors.add(actor)
      channelItem.actors.add(actor)
      modelChannelItem.actors.add(actor)
      trendItem.actors.add(actor)
    }
    item.units.set(event.unit, (item.units.get(event.unit) ?? 0) + event.quantity)
    modelItem.providers.set(providerId, (modelItem.providers.get(providerId) ?? 0) + event.quantity)
    modelChannelItem.providers.set(providerId, (modelChannelItem.providers.get(providerId) ?? 0) + event.quantity)
    if (event.channel) {
      item.channels.set(event.channel, (item.channels.get(event.channel) ?? 0) + event.quantity)
      modelItem.channels.set(event.channel, (modelItem.channels.get(event.channel) ?? 0) + event.quantity)
    }
    if (event.action === 'provider.usage' && event.unit === 'token') {
      addMetricBucket(byModel, model, event)
      item.models.set(model, (item.models.get(model) ?? 0) + event.quantity)
      channelItem.models.set(model, (channelItem.models.get(model) ?? 0) + event.quantity)
    }
    if (providerType) {
      addMetricBucket(byProviderType, providerType, event)
      modelItem.providerTypes.set(providerType, (modelItem.providerTypes.get(providerType) ?? 0) + event.quantity)
      channelItem.providerTypes.set(providerType, (channelItem.providerTypes.get(providerType) ?? 0) + event.quantity)
      modelChannelItem.providerTypes.set(providerType, (modelChannelItem.providerTypes.get(providerType) ?? 0) + event.quantity)
    }
    providers.set(providerId, item)
    models.set(model, modelItem)
    modelChannels.set(modelChannelKey, modelChannelItem)
    channelDistribution.set(channelKey, channelItem)
    trend.set(date, trendItem)
  }

  return {
    ...createScopedAnalytics(providerEvents, topLimit),
    growth: createGrowth(providerEvents, days),
    usageSummary,
    trend: Array.from(trend.values())
      .map(item => ({
        date: item.date,
        events: item.events,
        requests: item.requests,
        tokens: item.tokens,
        quantity: item.quantity,
        uniqueActors: item.actors.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byModel: mapMetricBuckets(byModel, topLimit),
    byProviderType: mapMetricBuckets(byProviderType, topLimit),
    channelDistribution: Array.from(channelDistribution.values())
      .map(item => ({
        providerId: item.providerId,
        channel: item.channel,
        requests: item.requests,
        tokens: item.tokens,
        quantity: item.quantity,
        uniqueActors: item.actors.size,
        byModel: Array.from(item.models.entries())
          .map(([model, tokens]) => ({ model, tokens }))
          .sort((a, b) => b.tokens - a.tokens)
          .slice(0, 5),
        byProviderType: Array.from(item.providerTypes.entries())
          .map(([providerType, quantity]) => ({ providerType, quantity }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5),
      }))
      .sort((a, b) => b.tokens - a.tokens || b.requests - a.requests || b.quantity - a.quantity)
      .slice(0, topLimit),
    modelDistribution: Array.from(models.values())
      .map(item => ({
        model: item.model,
        requests: item.requests,
        tokens: item.tokens,
        quantity: item.quantity,
        uniqueActors: item.actors.size,
        byProvider: Array.from(item.providers.entries())
          .map(([providerId, quantity]) => ({ providerId, quantity }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5),
        byChannel: Array.from(item.channels.entries())
          .map(([channel, quantity]) => ({ channel, quantity }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5),
        byProviderType: Array.from(item.providerTypes.entries())
          .map(([providerType, quantity]) => ({ providerType, quantity }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5),
      }))
      .sort((a, b) => b.tokens - a.tokens || b.requests - a.requests || b.quantity - a.quantity)
      .slice(0, topLimit),
    modelChannelDistribution: Array.from(modelChannels.values())
      .map(item => ({
        model: item.model,
        channel: item.channel,
        requests: item.requests,
        tokens: item.tokens,
        quantity: item.quantity,
        uniqueActors: item.actors.size,
        byProvider: Array.from(item.providers.entries())
          .map(([providerId, quantity]) => ({ providerId, quantity }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5),
        byProviderType: Array.from(item.providerTypes.entries())
          .map(([providerType, quantity]) => ({ providerType, quantity }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5),
      }))
      .sort((a, b) => b.tokens - a.tokens || b.requests - a.requests || b.quantity - a.quantity)
      .slice(0, topLimit),
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
  const items = evaluateIntelligenceProviderQuotaConfigs(providerEvents, quotas)
  const riskItems = createProviderQuotaRiskItems(items, topLimit)
  const actionQueue = createProviderQuotaActionQueue(items, topLimit)
  const smokeEvidence = createProviderQuotaSmokeEvidence(providerEvents, topLimit)
  const blockEvidence = createProviderQuotaBlockEvidence(providerEvents, topLimit)

  const summary = items.reduce((result, item) => {
    result.total += 1
    result.highestRequestUtilization = Math.max(result.highestRequestUtilization, item.utilization.requests ?? 0)
    result.highestTokenUtilization = Math.max(result.highestTokenUtilization, item.utilization.tokens ?? 0)

    if (item.status === 'disabled')
      result.disabled += 1
    else
      result.active += 1

    if (item.status === 'blocked')
      result.blocked += 1
    if (item.status === 'warning')
      result.warning += 1
    if (item.overage.requests > 0)
      result.requestOverage += item.overage.requests
    if (item.overage.tokens > 0)
      result.tokenOverage += item.overage.tokens
    if (item.remaining.requests != null)
      result.lowestRemainingRequests = result.lowestRemainingRequests == null
        ? item.remaining.requests
        : Math.min(result.lowestRemainingRequests, item.remaining.requests)
    if (item.remaining.tokens != null)
      result.lowestRemainingTokens = result.lowestRemainingTokens == null
        ? item.remaining.tokens
        : Math.min(result.lowestRemainingTokens, item.remaining.tokens)
    if (item.projectedExhaustionDays.requests != null)
      result.nearestRequestExhaustionDays = result.nearestRequestExhaustionDays == null
        ? item.projectedExhaustionDays.requests
        : Math.min(result.nearestRequestExhaustionDays, item.projectedExhaustionDays.requests)
    if (item.projectedExhaustionDays.tokens != null)
      result.nearestTokenExhaustionDays = result.nearestTokenExhaustionDays == null
        ? item.projectedExhaustionDays.tokens
        : Math.min(result.nearestTokenExhaustionDays, item.projectedExhaustionDays.tokens)

    return result
  }, {
    total: 0,
    active: 0,
    blocked: 0,
    warning: 0,
    disabled: 0,
    highestRequestUtilization: 0,
    highestTokenUtilization: 0,
    requestOverage: 0,
    tokenOverage: 0,
    lowestRemainingRequests: null as number | null,
    lowestRemainingTokens: null as number | null,
    nearestRequestExhaustionDays: null as number | null,
    nearestTokenExhaustionDays: null as number | null,
  })

  return {
    summary,
    riskItems,
    actionQueue,
    smokeEvidence,
    blockEvidence,
    items: items.slice(0, topLimit),
  }
}

function parseProviderQuotaSmokeStatus(action: string): IntelligenceProviderQuotaSmokeStatus | null {
  if (action === 'provider.quota_smoke.allowed')
    return 'allowed'
  if (action === 'provider.quota_smoke.blocked')
    return 'blocked'
  if (action === 'provider.quota_smoke.consumed')
    return 'consumed'
  if (action === 'provider.quota_smoke.failed')
    return 'failed'
  return null
}

function normalizeProviderQuotaSmokeMode(value: string | null): IntelligenceProviderQuotaSmokeMode {
  return value === 'consume' ? 'consume' : 'dry-run'
}

function createProviderQuotaSmokeEvidence(
  events: PlatformGovernanceEvent[],
  limit: number,
): IntelligenceProviderQuotaSmokeEvidenceItem[] {
  const buckets = new Map<string, IntelligenceProviderQuotaSmokeEvidenceItem & { actors: Set<string>, latestTime: number }>()

  for (const event of events) {
    const status = parseProviderQuotaSmokeStatus(event.action)
    if (!status)
      continue

    const providerId = event.resourceId ?? readEventMetadataString(event, 'providerId') ?? 'unknown'
    const channel = event.channel ?? readEventMetadataString(event, 'channel')
    const mode = normalizeProviderQuotaSmokeMode(readEventMetadataString(event, 'mode'))
    const key = `${providerId}:${channel ?? 'global'}:${mode}`
    const occurredTime = Date.parse(event.occurredAt)
    const latestTime = Number.isFinite(occurredTime) ? occurredTime : 0
    const item = buckets.get(key) ?? {
      key,
      providerId,
      channel,
      mode,
      evidenceSource: readEventEvidenceSource(event),
      status,
      reason: readEventMetadataString(event, 'reason'),
      requestRecorded: readEventMetadataBoolean(event, 'requestRecorded') ?? false,
      tokensRecorded: readEventMetadataNumber(event, 'tokensRecorded') ?? 0,
      latestAt: event.occurredAt,
      latestTime,
      events: 0,
      allowed: 0,
      blocked: 0,
      consumed: 0,
      failed: 0,
      uniqueActors: 0,
      actors: new Set<string>(),
    }

    item.events += 1
    item[status] += 1
    if (latestTime >= item.latestTime) {
      item.status = status
      item.evidenceSource = readEventEvidenceSource(event)
      item.reason = readEventMetadataString(event, 'reason')
      item.requestRecorded = readEventMetadataBoolean(event, 'requestRecorded') ?? false
      item.tokensRecorded = readEventMetadataNumber(event, 'tokensRecorded') ?? 0
      item.latestAt = event.occurredAt
      item.latestTime = latestTime
    }
    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)
    buckets.set(key, item)
  }

  return Array.from(buckets.values())
    .map(({ actors, latestTime: _latestTime, ...item }) => ({
      ...item,
      uniqueActors: actors.size,
    }))
    .sort((left, right) => right.latestAt.localeCompare(left.latestAt) || right.events - left.events)
    .slice(0, limit)
}

function createProviderQuotaBlockEvidence(
  events: PlatformGovernanceEvent[],
  limit: number,
): IntelligenceProviderQuotaBlockEvidenceItem[] {
  const buckets = new Map<string, IntelligenceProviderQuotaBlockEvidenceItem & { actors: Set<string>, latestTime: number }>()

  for (const event of events) {
    if (event.action !== 'provider.quota_blocked')
      continue

    const providerId = event.resourceId ?? readEventMetadataString(event, 'providerId') ?? 'unknown'
    const channel = event.channel ?? readEventMetadataString(event, 'channel')
    const key = `${providerId}:${channel ?? 'global'}`
    const occurredTime = Date.parse(event.occurredAt)
    const latestTime = Number.isFinite(occurredTime) ? occurredTime : 0
    const item = buckets.get(key) ?? {
      key,
      providerId,
      channel,
      evidenceSource: readEventEvidenceSource(event),
      status: 'blocked',
      reason: readEventMetadataString(event, 'reason'),
      requestBlocked: readEventMetadataBoolean(event, 'requestBlocked') ?? false,
      latestAt: event.occurredAt,
      latestTime,
      events: 0,
      uniqueActors: 0,
      actors: new Set<string>(),
    }

    item.events += 1
    if (latestTime >= item.latestTime) {
      item.evidenceSource = readEventEvidenceSource(event)
      item.reason = readEventMetadataString(event, 'reason')
      item.requestBlocked = readEventMetadataBoolean(event, 'requestBlocked') ?? false
      item.latestAt = event.occurredAt
      item.latestTime = latestTime
    }
    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)
    buckets.set(key, item)
  }

  return Array.from(buckets.values())
    .map(({ actors, latestTime: _latestTime, ...item }) => ({
      ...item,
      uniqueActors: actors.size,
    }))
    .sort((left, right) => right.latestAt.localeCompare(left.latestAt) || right.events - left.events)
    .slice(0, limit)
}

function rankProviderQuotaActionQueuePriority(priority: ProviderQuotaActionQueuePriority): number {
  switch (priority) {
    case 'critical':
      return 4
    case 'high':
      return 3
    case 'medium':
      return 2
    default:
      return 1
  }
}

function nearestProviderQuotaProjectedExhaustionDays(item: IntelligenceProviderQuotaEvaluation): number | null {
  const values = [
    item.projectedExhaustionDays.requests,
    item.projectedExhaustionDays.tokens,
  ].filter((value): value is number => value != null && Number.isFinite(value))

  return values.length ? Math.min(...values) : null
}

function providerQuotaHasUsage(item: IntelligenceProviderQuotaEvaluation): boolean {
  return item.usage.requests > 0 || item.usage.tokens > 0
}

function resolveProviderQuotaActionQueueReason(item: IntelligenceProviderQuotaEvaluation): ProviderQuotaActionQueueReason | null {
  if (!item.enabled && providerQuotaHasUsage(item))
    return 'quota-disabled'
  if (item.limits.maxRequests == null && item.limits.maxTokens == null && providerQuotaHasUsage(item))
    return 'missing-hard-limit'
  if (item.overage.tokens > 0)
    return 'token-overage'
  if (item.overage.requests > 0)
    return 'request-overage'
  if (item.remaining.tokens === 0)
    return 'token-exhausted'
  if (item.remaining.requests === 0)
    return 'request-exhausted'
  const nearestExhaustion = nearestProviderQuotaProjectedExhaustionDays(item)
  if (nearestExhaustion != null && nearestExhaustion <= 3)
    return 'projected-exhaustion'
  if (item.status === 'warning')
    return 'warning-threshold'
  return null
}

function resolveProviderQuotaActionQueuePriority(reason: ProviderQuotaActionQueueReason): ProviderQuotaActionQueuePriority {
  if (
    reason === 'token-overage'
    || reason === 'request-overage'
    || reason === 'token-exhausted'
    || reason === 'request-exhausted'
  ) {
    return 'critical'
  }
  if (reason === 'projected-exhaustion')
    return 'high'
  return 'medium'
}

function resolveProviderQuotaActionQueueSuggestedAction(
  item: IntelligenceProviderQuotaEvaluation,
  reason: ProviderQuotaActionQueueReason,
): ProviderQuotaActionQueueSuggestedAction {
  if (reason === 'quota-disabled')
    return 'enable-provider-quota'
  if (reason === 'missing-hard-limit')
    return 'set-provider-limit'
  if (reason === 'token-overage' || reason === 'token-exhausted')
    return 'increase-token-limit'
  if (reason === 'request-overage' || reason === 'request-exhausted')
    return 'increase-request-limit'
  if (reason === 'projected-exhaustion')
    return item.channel ? 'reduce-provider-traffic' : 'split-provider-channel'
  return 'monitor-burn-rate'
}

function createProviderQuotaActionQueue(
  items: IntelligenceProviderQuotaEvaluation[],
  topLimit: number,
): ProviderQuotaActionQueueItem[] {
  return items
    .map((item): ProviderQuotaActionQueueItem | null => {
      const reason = resolveProviderQuotaActionQueueReason(item)
      if (!reason)
        return null

      return {
        key: `${item.configId}:${reason}`,
        priority: resolveProviderQuotaActionQueuePriority(reason),
        suggestedAction: resolveProviderQuotaActionQueueSuggestedAction(item, reason),
        reason,
        configId: item.configId,
        providerId: item.providerId,
        name: item.name,
        channel: item.channel,
        provider: item.provider,
        status: item.status,
        windowDays: item.windowDays,
        requests: item.usage.requests,
        tokens: item.usage.tokens,
        maxRequests: item.limits.maxRequests,
        maxTokens: item.limits.maxTokens,
        requestUtilization: item.utilization.requests,
        tokenUtilization: item.utilization.tokens,
        remainingRequests: item.remaining.requests,
        remainingTokens: item.remaining.tokens,
        requestOverage: item.overage.requests,
        tokenOverage: item.overage.tokens,
        requestsPerDay: item.burnRate.requestsPerDay,
        tokensPerDay: item.burnRate.tokensPerDay,
        projectedRequestExhaustionDays: item.projectedExhaustionDays.requests,
        projectedTokenExhaustionDays: item.projectedExhaustionDays.tokens,
      }
    })
    .filter((item): item is ProviderQuotaActionQueueItem => item != null)
    .sort((left, right) => {
      const leftProjected = Math.min(left.projectedRequestExhaustionDays ?? Number.POSITIVE_INFINITY, left.projectedTokenExhaustionDays ?? Number.POSITIVE_INFINITY)
      const rightProjected = Math.min(right.projectedRequestExhaustionDays ?? Number.POSITIVE_INFINITY, right.projectedTokenExhaustionDays ?? Number.POSITIVE_INFINITY)
      return rankProviderQuotaActionQueuePriority(right.priority) - rankProviderQuotaActionQueuePriority(left.priority)
        || (right.requestOverage + right.tokenOverage) - (left.requestOverage + left.tokenOverage)
        || Math.max(right.requestUtilization ?? 0, right.tokenUtilization ?? 0) - Math.max(left.requestUtilization ?? 0, left.tokenUtilization ?? 0)
        || leftProjected - rightProjected
        || (right.requests + right.tokens) - (left.requests + left.tokens)
        || left.key.localeCompare(right.key)
    })
    .slice(0, topLimit)
}

function createProviderQuotaRiskItems(
  items: IntelligenceProviderQuotaEvaluation[],
  topLimit: number,
): IntelligenceProviderQuotaRiskItem[] {
  return items
    .map((item) => {
      const highestUtilization = Math.max(item.utilization.requests ?? 0, item.utilization.tokens ?? 0)
      const projectedDays = [item.projectedExhaustionDays.requests, item.projectedExhaustionDays.tokens]
        .filter((value): value is number => value != null)
      const nearestExhaustionDays = projectedDays.length ? Math.min(...projectedDays) : null
      const hasOverage = item.overage.requests > 0 || item.overage.tokens > 0
      const hasLowRemaining = item.remaining.requests === 0 || item.remaining.tokens === 0
      const hasProjectedExhaustion = nearestExhaustionDays != null && nearestExhaustionDays <= Math.max(item.windowDays, 1)
      const riskReason: IntelligenceProviderQuotaRiskItem['riskReason'] = hasOverage
        ? 'overage'
        : item.status === 'blocked'
          ? 'blocked'
          : hasLowRemaining
            ? 'low-remaining'
            : item.status === 'warning'
              ? 'warning-threshold'
              : hasProjectedExhaustion
                ? 'projected-exhaustion'
                : 'warning-threshold'

      return {
        configId: item.configId,
        providerId: item.providerId,
        name: item.name,
        channel: item.channel,
        provider: item.provider,
        status: item.status,
        highestUtilization,
        riskReason,
        usage: item.usage,
        limits: {
          maxRequests: item.limits.maxRequests,
          maxTokens: item.limits.maxTokens,
        },
        remaining: item.remaining,
        overage: item.overage,
        projectedExhaustionDays: item.projectedExhaustionDays,
      }
    })
    .filter(item => item.status === 'blocked' || item.status === 'warning' || item.overage.requests > 0 || item.overage.tokens > 0)
    .sort((left, right) => {
      const statusRank: Record<IntelligenceProviderQuotaStatus, number> = { blocked: 3, warning: 2, ok: 1, disabled: 0 }
      const leftProjected = Math.min(left.projectedExhaustionDays.requests ?? Number.POSITIVE_INFINITY, left.projectedExhaustionDays.tokens ?? Number.POSITIVE_INFINITY)
      const rightProjected = Math.min(right.projectedExhaustionDays.requests ?? Number.POSITIVE_INFINITY, right.projectedExhaustionDays.tokens ?? Number.POSITIVE_INFINITY)
      return statusRank[right.status] - statusRank[left.status]
        || right.overage.tokens - left.overage.tokens
        || right.overage.requests - left.overage.requests
        || right.highestUtilization - left.highestUtilization
        || leftProjected - rightProjected
    })
    .slice(0, topLimit)
}

function evaluateIntelligenceProviderQuotaConfigs(
  providerEvents: PlatformGovernanceEvent[],
  quotas: PlatformGovernanceConfig[],
): IntelligenceProviderQuotaEvaluation[] {
  const statusRank: Record<IntelligenceProviderQuotaStatus, number> = { blocked: 3, warning: 2, ok: 1, disabled: 0 }
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
        if (quota.channel && event.channel !== quota.channel)
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
      const remainingRequests = calculateRemainingBudget(requests, maxRequests)
      const remainingTokens = calculateRemainingBudget(tokens, maxTokens)
      const blocked = (maxRequests != null && requests >= maxRequests) || (maxTokens != null && tokens >= maxTokens)
      const warning = (requestUtilization != null && requestUtilization >= warningThreshold)
        || (tokenUtilization != null && tokenUtilization >= warningThreshold)
      const status: IntelligenceProviderQuotaStatus = !quota.enabled ? 'disabled' : blocked ? 'blocked' : warning ? 'warning' : 'ok'

      return {
        configId: quota.id,
        providerId,
        name: quota.name,
        channel: quota.channel,
        provider: quota.provider,
        enabled: quota.enabled,
        windowDays,
        status,
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
        remaining: {
          requests: remainingRequests,
          tokens: remainingTokens,
        },
        overage: {
          requests: calculateOverageBudget(requests, maxRequests),
          tokens: calculateOverageBudget(tokens, maxTokens),
        },
        burnRate: {
          requestsPerDay: roundRatePerDay(requests, windowDays),
          tokensPerDay: roundRatePerDay(tokens, windowDays),
        },
        projectedExhaustionDays: {
          requests: estimateBudgetExhaustionDays(requests, remainingRequests, windowDays),
          tokens: estimateBudgetExhaustionDays(tokens, remainingTokens, windowDays),
        },
      }
    })
    .sort((left, right) => {
      const leftUtilization = Math.max(left.utilization.requests ?? 0, left.utilization.tokens ?? 0)
      const rightUtilization = Math.max(right.utilization.requests ?? 0, right.utilization.tokens ?? 0)
      return statusRank[right.status] - statusRank[left.status] || rightUtilization - leftUtilization
    })
}

function latestTrendPoint<T extends { date: string }>(items: T[]): T | null {
  return items.at(-1) ?? null
}

function createOperationsTimeline(input: {
  users: ReturnType<typeof createUserAnalytics>
  searches: ReturnType<typeof createSearchAnalytics>
  plugins: ReturnType<typeof createPluginAnalytics>
  uploads: ReturnType<typeof createUploadAnalytics>
  storage: ReturnType<typeof createStorageAnalytics>
  providers: ReturnType<typeof createProviderAnalytics>
}, topLimit: number) {
  const timeline = new Map<string, {
    date: string
    userSignups: number
    userSignupGrowthRate: number
    userCumulative: number
    searches: number
    searchSelected: number
    searchSelectionRate: number
    searchProblems: number
    searchProblemRate: number
    searchZeroResultRate: number
    pluginDownloads: number
    pluginInstalls: number
    pluginInvocations: number
    providerRequests: number
    providerTokens: number
    uploadStarted: number
    uploadCompleted: number
    uploadFailed: number
    uploadFailureRate: number
    uploadBytes: number
    storageOperations: number
    storageBytes: number
    riskScore: number
  }>()

  const getItem = (date: string) => {
    const item = timeline.get(date) ?? {
      date,
      userSignups: 0,
      userSignupGrowthRate: 0,
      userCumulative: 0,
      searches: 0,
      searchSelected: 0,
      searchSelectionRate: 0,
      searchProblems: 0,
      searchProblemRate: 0,
      searchZeroResultRate: 0,
      pluginDownloads: 0,
      pluginInstalls: 0,
      pluginInvocations: 0,
      providerRequests: 0,
      providerTokens: 0,
      uploadStarted: 0,
      uploadCompleted: 0,
      uploadFailed: 0,
      uploadFailureRate: 0,
      uploadBytes: 0,
      storageOperations: 0,
      storageBytes: 0,
      riskScore: 0,
    }
    timeline.set(date, item)
    return item
  }

  for (const item of input.users.signupGrowthTrend) {
    const entry = getItem(item.date)
    entry.userSignups = item.quantity
    entry.userSignupGrowthRate = item.growthRate
    entry.userCumulative = item.cumulative
  }
  for (const item of input.searches.trend) {
    const entry = getItem(item.date)
    entry.searches = item.quantity
  }
  for (const item of input.searches.reliabilityTrend) {
    const entry = getItem(item.date)
    entry.searchSelected = item.selected
    entry.searchSelectionRate = item.selectionRate
    entry.searchProblems = item.problemSearches
    entry.searchProblemRate = percentage(item.problemSearches, item.events)
    entry.searchZeroResultRate = percentage(item.zeroResult, item.events)
  }
  for (const item of input.plugins.installTrend) {
    const entry = getItem(item.date)
    entry.pluginDownloads = item.downloads
    entry.pluginInstalls = item.installs
    entry.pluginInvocations = item.invocations
  }
  for (const item of input.providers.trend) {
    const entry = getItem(item.date)
    entry.providerRequests = item.requests
    entry.providerTokens = item.tokens
  }
  for (const item of input.uploads.statusTrend) {
    const entry = getItem(item.date)
    entry.uploadStarted = item.started
    entry.uploadCompleted = item.completed
    entry.uploadFailed = item.failed
    entry.uploadFailureRate = percentage(item.failed, Math.max(item.started, item.completed + item.failed))
    entry.uploadBytes = item.bytes
  }
  for (const item of input.storage.trend) {
    const entry = getItem(item.date)
    entry.storageOperations = item.operations
    entry.storageBytes = item.storedBytes + item.trafficBytes
  }

  return Array.from(timeline.values())
    .map(item => ({
      ...item,
      riskScore: item.searchProblems + item.uploadFailed,
    }))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-topLimit)
}

function createOperationsDashboardSummary(input: {
  users: ReturnType<typeof createUserAnalytics>
  searches: ReturnType<typeof createSearchAnalytics>
  plugins: ReturnType<typeof createPluginAnalytics>
  uploads: ReturnType<typeof createUploadAnalytics>
  notifications: ReturnType<typeof createNotificationAnalytics>
  storage: ReturnType<typeof createStorageAnalytics>
  providers: ReturnType<typeof createProviderAnalytics> & {
    quotaSummary: ReturnType<typeof createProviderQuotaAnalytics>['summary']
    quotaActionQueue: ReturnType<typeof createProviderQuotaAnalytics>['actionQueue']
    quotaRiskItems: ReturnType<typeof createProviderQuotaAnalytics>['riskItems']
    quotaBlockEvidence: ReturnType<typeof createProviderQuotaAnalytics>['blockEvidence']
    quotaSmokeEvidence: ReturnType<typeof createProviderQuotaAnalytics>['smokeEvidence']
    quotas: ReturnType<typeof createProviderQuotaAnalytics>['items']
  }
}, topLimit: number) {
  const searchLatest = latestTrendPoint(input.searches.trend)
  const signupLatest = latestTrendPoint(input.users.signupGrowthTrend)
  const pluginInstallLatest = latestTrendPoint(input.plugins.installTrend)
  const providerLatest = latestTrendPoint(input.providers.trend)
  const uploadLatest = latestTrendPoint(input.uploads.statusTrend)

  return {
    growth: {
      userSignups: {
        total: input.users.signups,
        latestDate: signupLatest?.date ?? null,
        latestQuantity: signupLatest?.quantity ?? 0,
        cumulative: signupLatest?.cumulative ?? input.users.signups,
        growthRate: input.users.signupGrowth.eventGrowthRate,
      },
      searches: {
        total: input.searches.totalEvents,
        latestDate: searchLatest?.date ?? null,
        latestQuantity: searchLatest?.quantity ?? 0,
        growthRate: input.searches.growth.eventGrowthRate,
        zeroResultRate: input.searches.reliabilitySummary.zeroResultRate,
        problemRate: input.searches.reliabilitySummary.problemRate,
        selectionRate: input.searches.selectionSummary.selectionRate,
      },
      pluginInstalls: {
        total: input.plugins.leaderboard.reduce((sum, item) => sum + item.installs, 0),
        latestDate: pluginInstallLatest?.date ?? null,
        latestQuantity: pluginInstallLatest?.installs ?? 0,
        growthRate: input.plugins.growth.eventGrowthRate,
      },
      providerUsage: {
        requests: input.providers.usageSummary.requests,
        tokens: input.providers.usageSummary.tokens,
        latestDate: providerLatest?.date ?? null,
        latestRequests: providerLatest?.requests ?? 0,
        latestTokens: providerLatest?.tokens ?? 0,
      },
      uploads: {
        latestDate: uploadLatest?.date ?? null,
        latestStarted: uploadLatest?.started ?? 0,
        latestCompleted: uploadLatest?.completed ?? 0,
        latestFailed: uploadLatest?.failed ?? 0,
        failureRate: input.uploads.failureRate,
        stuckRate: input.uploads.stuckRate,
      },
    },
    leaderboards: {
      hotPlugins: input.plugins.leaderboard.slice(0, topLimit),
      topModels: input.providers.modelDistribution.slice(0, topLimit),
      topProviders: input.providers.leaderboard.slice(0, topLimit),
    },
    riskSummary: {
      uploadProblems: input.uploads.problemAttempts.length,
      storageAlerts: input.storage.policySummary.alerts,
      storageBlockedPolicies: input.storage.policySummary.blocked,
      notificationRisks: input.notifications.channelRisks.length,
      notificationFailedDeliveries: input.notifications.deliveries.failed,
      providerQuotaBlocked: input.providers.quotaSummary.blocked,
      providerQuotaWarning: input.providers.quotaSummary.warning,
    },
    trends: {
      userGrowth: input.users.signupGrowthTrend.slice(-topLimit),
      searches: input.searches.trend.slice(-topLimit),
      pluginInstalls: input.plugins.installTrend.slice(-topLimit),
      providerUsage: input.providers.trend.slice(-topLimit),
      uploadStatus: input.uploads.statusTrend.slice(-topLimit),
      operationsTimeline: createOperationsTimeline(input, topLimit),
    },
  }
}

function createGovernanceOperatorCockpitEvidence(events: PlatformGovernanceEvent[], limit: number): GovernanceOperatorCockpitEvidenceItem[] {
  const evidence = new Map<string, {
    environment: string
    surface: string | null
    format: string | null
    evidenceSource: PlatformGovernanceReportEvidenceStatus
    views: number
    actors: Set<string>
    authenticatedActors: Set<string>
    latestAt: string
  }>()

  for (const event of events) {
    if (event.scope !== 'governance' || event.action !== 'governance.operator_cockpit.viewed')
      continue

    const environment = readEventMetadataString(event, 'environment') ?? event.resourceId ?? 'unknown'
    const evidenceSource = readEventEvidenceSource(event)
    const item = evidence.get(environment) ?? {
      environment,
      surface: event.channel,
      format: readEventMetadataString(event, 'format'),
      evidenceSource,
      views: 0,
      actors: new Set<string>(),
      authenticatedActors: new Set<string>(),
      latestAt: event.occurredAt,
    }
    if (evidenceSource === 'live')
      item.evidenceSource = 'live'
    item.views += Math.max(1, event.quantity)
    const actor = readEventActor(event)
    if (actor)
      item.actors.add(actor)
    if (event.actorHash)
      item.authenticatedActors.add(event.actorHash)
    if (event.occurredAt >= item.latestAt) {
      item.latestAt = event.occurredAt
      item.surface = event.channel
      item.format = readEventMetadataString(event, 'format')
    }
    evidence.set(environment, item)
  }

  return Array.from(evidence.values())
    .map(item => ({
      environment: item.environment,
      surface: item.surface,
      format: item.format,
      evidenceSource: item.evidenceSource,
      views: item.views,
      uniqueActors: item.actors.size,
      authenticatedActors: item.authenticatedActors.size,
      latestAt: item.latestAt,
    }))
    .sort((left, right) => right.latestAt.localeCompare(left.latestAt) || left.environment.localeCompare(right.environment))
    .slice(0, limit)
}

function rankGovernanceReportPriority(priority: PlatformGovernanceReportPriority): number {
  switch (priority) {
    case 'critical':
      return 4
    case 'high':
      return 3
    case 'medium':
      return 2
    default:
      return 1
  }
}

function resolveGovernanceReportStatus(riskScore: number): PlatformGovernanceReportStatus {
  if (riskScore >= 100)
    return 'critical'
  if (riskScore > 0)
    return 'watch'
  return 'ok'
}

function createGovernanceReportScorecards(
  analytics: Awaited<ReturnType<typeof getPlatformGovernanceAnalytics>>,
): PlatformGovernanceReportScorecard[] {
  const dashboard = analytics.dashboard
  return [
    {
      key: 'user-growth',
      label: 'User growth',
      value: dashboard.growth.userSignups.latestQuantity,
      total: dashboard.growth.userSignups.cumulative,
      unit: 'users',
      delta: dashboard.growth.userSignups.growthRate,
      rate: null,
      status: 'ok',
      reason: null,
    },
    {
      key: 'search-demand',
      label: 'Search demand',
      value: dashboard.growth.searches.latestQuantity,
      total: dashboard.growth.searches.total,
      unit: 'searches',
      delta: dashboard.growth.searches.growthRate,
      rate: dashboard.growth.searches.selectionRate,
      status: dashboard.growth.searches.problemRate >= 10 || dashboard.growth.searches.zeroResultRate >= 30 ? 'watch' : 'ok',
      reason: dashboard.growth.searches.problemRate >= 10
        ? 'search-problem-rate'
        : dashboard.growth.searches.zeroResultRate >= 30
          ? 'search-zero-result-rate'
          : null,
    },
    {
      key: 'plugin-installs',
      label: 'Plugin installs',
      value: dashboard.growth.pluginInstalls.latestQuantity,
      total: dashboard.growth.pluginInstalls.total,
      unit: 'installs',
      delta: dashboard.growth.pluginInstalls.growthRate,
      rate: null,
      status: 'ok',
      reason: null,
    },
    {
      key: 'provider-tokens',
      label: 'Provider tokens',
      value: dashboard.growth.providerUsage.latestTokens,
      total: dashboard.growth.providerUsage.tokens,
      unit: 'tokens',
      delta: null,
      rate: analytics.providers.quotaSummary.highestTokenUtilization,
      status: analytics.providers.quotaSummary.blocked > 0 || analytics.providers.quotaSummary.tokenOverage > 0
        ? 'critical'
        : analytics.providers.quotaSummary.warning > 0
          ? 'watch'
          : 'ok',
      reason: analytics.providers.quotaSummary.blocked > 0 || analytics.providers.quotaSummary.tokenOverage > 0
        ? 'provider-quota-blocked'
        : analytics.providers.quotaSummary.warning > 0
          ? 'provider-quota-warning'
          : null,
    },
    {
      key: 'upload-health',
      label: 'Upload health',
      value: dashboard.growth.uploads.latestCompleted,
      total: dashboard.growth.uploads.latestStarted,
      unit: 'uploads',
      delta: null,
      rate: dashboard.growth.uploads.failureRate,
      status: dashboard.growth.uploads.failureRate >= 10 || dashboard.riskSummary.uploadProblems > 0 ? 'watch' : 'ok',
      reason: dashboard.riskSummary.uploadProblems > 0 ? 'upload-problem-attempts' : null,
    },
    {
      key: 'storage-risk',
      label: 'Storage risk',
      value: analytics.storage.policySummary.alerts,
      total: analytics.storage.policySummary.total,
      unit: 'alerts',
      delta: null,
      rate: Math.max(
        analytics.storage.policySummary.highestStoredUtilization,
        analytics.storage.policySummary.highestTrafficUtilization,
        analytics.storage.policySummary.highestOperationUtilization,
      ),
      status: analytics.storage.policySummary.blocked > 0
        ? 'critical'
        : analytics.storage.policySummary.alerts > 0
          ? 'watch'
          : 'ok',
      reason: analytics.storage.policySummary.blocked > 0
        ? 'storage-policy-blocked'
        : analytics.storage.policySummary.alerts > 0
          ? 'storage-policy-alert'
          : null,
    },
    {
      key: 'notification-health',
      label: 'Notification health',
      value: analytics.notifications.deliveries.failed,
      total: analytics.notifications.deliveries.total,
      unit: 'failed',
      delta: null,
      rate: analytics.notifications.deliveries.failureRate,
      status: analytics.notifications.deliveries.failed > 0 || analytics.notifications.channelRisks.length > 0 ? 'watch' : 'ok',
      reason: analytics.notifications.deliveries.failed > 0
        ? 'notification-delivery-failed'
        : analytics.notifications.channelRisks.length > 0
          ? 'notification-channel-risk'
          : null,
    },
  ]
}

function createGovernanceReportEvidenceStatus(
  analytics: Awaited<ReturnType<typeof getPlatformGovernanceAnalytics>>,
  d1Evidence: PlatformGovernanceD1ReportEvidence,
): PlatformGovernanceReportEvidenceItem[] {
  function operatorCockpitEvidence(environment: 'preview' | 'production') {
    const items = analytics.governance.operatorCockpitEvidence.filter(item => item.environment === environment)
    const hasLiveEvidence = items.some(item => item.evidenceSource === 'live' && item.authenticatedActors > 0)
    return {
      status: hasLiveEvidence ? 'live' : items.length > 0 ? 'local-only' : 'open',
      evidenceCount: items.reduce((sum, item) => sum + item.views, 0),
    } satisfies Pick<PlatformGovernanceReportEvidenceItem, 'status' | 'evidenceCount'>
  }

  const previewCockpit = operatorCockpitEvidence('preview')
  const productionCockpit = operatorCockpitEvidence('production')
  const hasLiveNotificationSend = analytics.notifications.deliveryEvidence.some(item =>
    item.sent > 0
    && item.credentialRequired === true
    && item.hasCredentialRef === true
    && item.adapter !== 'browser'
    && item.evidenceSource === 'live',
  )
  const providerQuotaEvidenceCount = analytics.providers.quotaBlockEvidence.length + analytics.providers.quotaSmokeEvidence.length
  const hasLiveProviderQuotaFailClosed = analytics.providers.quotaBlockEvidence.some(item =>
    item.status === 'blocked'
    && item.requestBlocked
    && item.evidenceSource === 'live',
  )
  const notificationEvidenceCount = analytics.notifications.deliveryEvidence.length + analytics.notifications.testEvidence.length

  return [
    {
      key: 'preview-admin-cockpit',
      label: 'Preview authenticated admin cockpit',
      status: previewCockpit.status,
      evidenceCount: previewCockpit.evidenceCount,
      blocker: previewCockpit.status === 'live' ? null : 'preview-authenticated-browser-evidence-required',
    },
    {
      key: 'production-admin-cockpit',
      label: 'Production authenticated admin cockpit',
      status: productionCockpit.status,
      evidenceCount: productionCockpit.evidenceCount,
      blocker: productionCockpit.status === 'live' ? null : 'production-authenticated-browser-evidence-required',
    },
    {
      key: 'storage-smoke',
      label: 'Storage smoke evidence',
      status: analytics.storage.smokeEvidence.some(item => item.mode === 'write' && item.status === 'sent' && item.storageChannel === 'r2' && item.evidenceSource === 'r2') ? 'r2' : analytics.storage.smokeEvidence.length > 0 ? 'local-only' : 'open',
      evidenceCount: analytics.storage.smokeEvidence.length,
      blocker: 'live-r2-s3-oss-smoke-required',
    },
    {
      key: 'notification-send',
      label: 'Notification live-send evidence',
      status: hasLiveNotificationSend ? 'live' : notificationEvidenceCount > 0 ? 'local-only' : 'open',
      evidenceCount: notificationEvidenceCount,
      blocker: 'real-credential-backed-send-required',
    },
    {
      key: 'provider-quota',
      label: 'Provider quota fail-closed evidence',
      status: hasLiveProviderQuotaFailClosed ? 'live' : providerQuotaEvidenceCount > 0 ? 'local-only' : 'open',
      evidenceCount: providerQuotaEvidenceCount,
      blocker: 'real-provider-call-evidence-required',
    },
    {
      key: 'd1-production',
      label: 'Production D1 migration/backfill',
      status: d1Evidence.status,
      evidenceCount: d1Evidence.evidenceCount,
      blocker: d1Evidence.blocker,
    },
  ]
}

function createGovernanceReportRiskQueue(
  analytics: Awaited<ReturnType<typeof getPlatformGovernanceAnalytics>>,
  topLimit: number,
): PlatformGovernanceReportRiskQueueItem[] {
  const queue: PlatformGovernanceReportRiskQueueItem[] = []

  if (analytics.searches.reliabilitySummary.problemRate > 0 || analytics.searches.reliabilitySummary.zeroResultRate > 0) {
    queue.push({
      key: 'search:reliability',
      area: 'search',
      priority: analytics.searches.reliabilitySummary.problemRate >= 10 ? 'high' : 'medium',
      suggestedAction: 'review-search-provider-and-zero-result-segments',
      reason: 'search-reliability-risk',
      status: analytics.searches.reliabilitySummary.problemRate >= 10 ? 'watch' : 'ok',
      metric: analytics.searches.reliabilitySummary.problemRate,
      latestAt: latestTrendPoint(analytics.searches.reliabilityTrend)?.date ?? null,
      details: {
        total: analytics.searches.reliabilitySummary.total,
        zeroResultRate: analytics.searches.reliabilitySummary.zeroResultRate,
        selectionRate: analytics.searches.selectionSummary.selectionRate,
      },
    })
  }

  for (const item of analytics.uploads.actionQueue.slice(0, topLimit)) {
    queue.push({
      key: `upload:${item.key}`,
      area: 'upload',
      priority: item.priority,
      suggestedAction: item.suggestedAction,
      reason: item.reason,
      status: item.calibrationStatus,
      metric: item.failedAttempts + item.stuckAttempts,
      latestAt: item.latestAt,
      details: {
        resourceType: item.resourceType,
        storageChannel: item.storageChannel,
        storageProvider: item.storageProvider,
        failedAttempts: item.failedAttempts,
        stuckAttempts: item.stuckAttempts,
      },
    })
  }

  for (const item of analytics.storage.actionQueue.slice(0, topLimit)) {
    queue.push({
      key: `storage:${item.key}`,
      area: 'storage',
      priority: item.priority,
      suggestedAction: item.suggestedAction,
      reason: item.reason,
      status: item.pressureStatus,
      metric: item.highestUtilization,
      latestAt: item.latestTrendDate,
      details: {
        channel: item.channel,
        provider: item.provider,
        operations: item.operations,
        storedBytes: item.storedBytes,
        trafficBytes: item.trafficBytes,
      },
    })
  }

  for (const item of analytics.notifications.actionQueue.slice(0, topLimit)) {
    queue.push({
      key: `notification:${item.key}`,
      area: 'notification',
      priority: item.priority,
      suggestedAction: item.suggestedAction,
      reason: item.reason,
      status: item.status,
      metric: item.failed || item.failureRate || item.total,
      latestAt: item.latestFailureAt,
      details: {
        channel: item.channel,
        provider: item.provider,
        adapter: item.adapter,
        failed: item.failed,
        failureRate: item.failureRate,
      },
    })
  }

  for (const item of analytics.providers.quotaActionQueue.slice(0, topLimit)) {
    queue.push({
      key: `provider-quota:${item.key}`,
      area: 'provider-quota',
      priority: item.priority,
      suggestedAction: item.suggestedAction,
      reason: item.reason,
      status: item.status,
      metric: Math.max(item.requestUtilization ?? 0, item.tokenUtilization ?? 0),
      latestAt: null,
      details: {
        providerId: item.providerId,
        channel: item.channel,
        requests: item.requests,
        tokens: item.tokens,
        remainingRequests: item.remainingRequests,
        remainingTokens: item.remainingTokens,
      },
    })
  }

  return queue
    .sort((left, right) =>
      rankGovernanceReportPriority(right.priority) - rankGovernanceReportPriority(left.priority)
      || right.metric - left.metric
      || left.key.localeCompare(right.key),
    )
    .slice(0, topLimit)
}

function createPlatformGovernanceReportSnapshot(
  analytics: Awaited<ReturnType<typeof getPlatformGovernanceAnalytics>>,
  topLimit: number,
  d1Evidence: PlatformGovernanceD1ReportEvidence,
): PlatformGovernanceReportSnapshot {
  const riskQueue = createGovernanceReportRiskQueue(analytics, topLimit)
  const riskScore = riskQueue.reduce((sum, item) => {
    if (item.priority === 'critical')
      return sum + 20
    if (item.priority === 'high')
      return sum + 10
    if (item.priority === 'medium')
      return sum + 5
    return sum + 1
  }, 0)
  const operationsTimeline = analytics.dashboard.trends.operationsTimeline

  return {
    days: analytics.days,
    generatedAt: analytics.generatedAt,
    report: {
      status: resolveGovernanceReportStatus(riskScore),
      riskScore,
      scorecards: createGovernanceReportScorecards(analytics),
      evidenceStatus: createGovernanceReportEvidenceStatus(analytics, d1Evidence),
      riskQueue,
      leaderboards: {
        hotPlugins: analytics.dashboard.leaderboards.hotPlugins.slice(0, topLimit),
        topModels: analytics.dashboard.leaderboards.topModels.slice(0, topLimit),
        topProviders: analytics.providers.leaderboard.slice(0, topLimit),
      },
      trendSummary: {
        latestDate: operationsTimeline.at(-1)?.date ?? null,
        operationsDays: operationsTimeline.length,
        peakSearches: Math.max(0, ...operationsTimeline.map(item => item.searches)),
        peakPluginInstalls: Math.max(0, ...operationsTimeline.map(item => item.pluginInstalls)),
        peakProviderTokens: Math.max(0, ...operationsTimeline.map(item => item.providerTokens)),
        peakRiskScore: Math.max(0, ...operationsTimeline.map(item => item.riskScore)),
      },
    },
  }
}

function mapD1ReadinessToReportEvidence(
  readiness: Awaited<ReturnType<typeof getPlatformGovernanceD1Readiness>>,
): PlatformGovernanceD1ReportEvidence {
  if (readiness.status === 'ready') {
    return {
      status: 'd1',
      evidenceCount: readiness.summary.ready,
      blocker: null,
    }
  }

  if (!readiness.database.present) {
    return {
      status: 'open',
      evidenceCount: 0,
      blocker: 'production-d1-binding-required',
    }
  }

  if (readiness.summary.missingTables > 0) {
    return {
      status: 'open',
      evidenceCount: readiness.summary.ready,
      blocker: 'production-d1-migration-required',
    }
  }

  if (readiness.summary.backfillRequired > 0) {
    return {
      status: 'open',
      evidenceCount: readiness.summary.ready,
      blocker: 'production-d1-backfill-required',
    }
  }

  if (readiness.summary.missingIndexes > 0) {
    return {
      status: 'open',
      evidenceCount: readiness.summary.ready,
      blocker: 'production-d1-index-required',
    }
  }

  return {
    status: 'open',
    evidenceCount: readiness.summary.ready,
    blocker: 'production-d1-readiness-required',
  }
}

function normalizeLimit(limit?: number): number {
  return Number.isFinite(limit) && limit && limit > 0 ? Math.min(Math.floor(limit), 5000) : 100
}

function normalizeAnalyticsDays(days?: number): number {
  return Number.isFinite(days) && days && days > 0 ? Math.min(Math.floor(days), 366) : 30
}

function normalizeAnalyticsTopLimit(topLimit?: number): number {
  return Number.isFinite(topLimit) && topLimit && topLimit > 0 ? Math.min(Math.floor(topLimit), 50) : 12
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

  scheduleTelemetryRetentionMaintenance(event, db)

  return record
}

function resolveGovernanceOperatorEvidenceSource(): PlatformGovernanceReportEvidenceStatus {
  if (process.env.CF_PAGES_BRANCH)
    return 'live'
  return 'local-only'
}

function readDeploymentId(): string | null {
  return normalizeString(
    process.env.CF_PAGES_DEPLOYMENT_ID
    ?? process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.COMMIT_SHA,
    180,
  ) ?? null
}

function readDeploymentEnvironment(): string {
  const pagesBranch = normalizeString(process.env.CF_PAGES_BRANCH, 120)
  const productionBranch = normalizeString(process.env.CF_PAGES_PRODUCTION_BRANCH, 120)
  if (pagesBranch)
    return productionBranch && pagesBranch === productionBranch ? 'production' : 'preview'
  return 'local'
}

export async function recordGovernanceOperatorCockpitView(
  event: H3Event | undefined,
  input: RecordGovernanceOperatorCockpitViewInput = {},
): Promise<PlatformGovernanceEvent> {
  const environment = readDeploymentEnvironment()
  return await recordPlatformGovernanceEvent(event, {
    scope: 'governance',
    action: 'governance.operator_cockpit.viewed',
    actorId: input.actorId,
    resourceType: 'governance_report',
    resourceId: environment,
    channel: normalizeString(input.surface, 80) ?? 'data-governance',
    unit: 'view',
    quantity: 1,
    metadata: {
      environment,
      format: normalizeString(input.format, 40) ?? 'json',
      deploymentId: readDeploymentId(),
      evidenceSource: resolveGovernanceOperatorEvidenceSource(),
    },
  })
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
  const days = normalizeAnalyticsDays(options.days)
  const topLimit = normalizeAnalyticsTopLimit(options.topLimit)
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
  const days = normalizeAnalyticsDays(options.days)
  const topLimit = normalizeAnalyticsTopLimit(options.topLimit)
  const events = await listPlatformGovernanceEvents(event, {
    days,
    limit: options.limit ?? 5000,
  })
  const notificationEvents = events.filter(item => item.scope === 'notification')
  const providerEvents = events.filter(item => item.scope === 'intelligence' && item.resourceType === 'provider')
  const notificationChannels = await listPlatformGovernanceConfigs(event, {
    configType: 'notification_channel',
  })
  const providerQuotas = await listPlatformGovernanceConfigs(event, {
    configType: 'intelligence_provider_quota',
  })
  const storagePolicies = await listPlatformGovernanceConfigs(event, {
    configType: 'storage_channel',
  })
  const storagePolicyEvaluations = await Promise.all(
    storagePolicies.map(policy => evaluateStorageChannelPolicy(event, policy, { days, limit: options.limit ?? 5000 })),
  )
  const visits = createVisitAnalytics(events, days, topLimit)
  const searches = createSearchAnalytics(events, days, topLimit)
  const users = createUserAnalytics(events, days, topLimit)
  const plugins = createPluginAnalytics(events, days, topLimit)
  const uploads = createUploadAnalytics(events, topLimit)
  const notifications = createNotificationAnalytics(notificationEvents, topLimit, notificationChannels, event)
  const storage = createStorageAnalytics(events, topLimit, storagePolicyEvaluations)
  const providers = createProviderAnalytics(events, days, topLimit)
  const providerQuotaAnalytics = createProviderQuotaAnalytics(providerEvents, providerQuotas, topLimit)
  const governance = {
    operatorCockpitEvidence: createGovernanceOperatorCockpitEvidence(events, topLimit),
  }
  const providerDashboard = {
    ...providers,
    quotaSummary: providerQuotaAnalytics.summary,
    quotaActionQueue: providerQuotaAnalytics.actionQueue,
    quotaRiskItems: providerQuotaAnalytics.riskItems,
    quotaBlockEvidence: providerQuotaAnalytics.blockEvidence,
    quotaSmokeEvidence: providerQuotaAnalytics.smokeEvidence,
    quotas: providerQuotaAnalytics.items,
  }

  return {
    days,
    generatedAt: new Date().toISOString(),
    overview: {
      ...summarizeEvents(events, topLimit),
      growth: createGrowth(events, days),
    },
    dashboard: createOperationsDashboardSummary({
      users,
      searches,
      plugins,
      uploads,
      notifications,
      storage,
      providers: providerDashboard,
    }, topLimit),
    visits,
    searches,
    users,
    plugins,
    uploads,
    notifications,
    storage,
    governance,
    providers: providerDashboard,
  }
}

export async function getPlatformGovernanceReportSnapshot(
  event: H3Event | undefined,
  options: GovernanceAnalyticsOptions = {},
): Promise<PlatformGovernanceReportSnapshot> {
  const topLimit = normalizeAnalyticsTopLimit(options.topLimit)
  const [analytics, d1Readiness] = await Promise.all([
    getPlatformGovernanceAnalytics(event, options),
    getPlatformGovernanceD1Readiness(event),
  ])
  return createPlatformGovernanceReportSnapshot(analytics, topLimit, mapD1ReadinessToReportEvidence(d1Readiness))
}

function matchesStorageProvider(event: PlatformGovernanceEvent, provider: string): boolean {
  return readEventMetadataString(event, 'provider') === provider
}

function matchesStoragePolicyTarget(policy: PlatformGovernanceConfig, channel: string | null, provider: string | null): boolean {
  if (channel && policy.channel !== channel)
    return false
  if (provider && policy.provider && policy.provider !== provider)
    return false
  if (provider && !policy.provider)
    return true
  return true
}

function sanitizeStorageChannelPolicies(policies: PlatformGovernanceConfig[]) {
  return policies.map(policy => ({
    id: policy.id,
    name: policy.name,
    ownerScope: policy.ownerScope,
    targetId: policy.targetId,
    channel: policy.channel,
    provider: policy.provider,
    enabled: policy.enabled,
    limits: policy.limits,
    warningThreshold: policy.warningThreshold,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
  }))
}

export async function getStorageChannelGovernanceAnalytics(
  event: H3Event | undefined,
  options: StorageChannelAnalyticsOptions = {},
) {
  const days = normalizeAnalyticsDays(options.days)
  const topLimit = normalizeAnalyticsTopLimit(options.topLimit)
  const limit = options.limit ?? 5000
  const channel = normalizeString(options.channel, 120)
  const provider = normalizeString(options.provider, 120)
  const events = (await listPlatformGovernanceEvents(event, {
    scope: 'storage',
    channel: channel || undefined,
    days,
    limit,
  })).filter(item => !provider || matchesStorageProvider(item, provider))
  const policies = (await listPlatformGovernanceConfigs(event, {
    configType: 'storage_channel',
    channel: channel || undefined,
  })).filter(policy => matchesStoragePolicyTarget(policy, channel ?? null, provider ?? null))
  const evaluations = await Promise.all(
    policies.map(policy => evaluateStorageChannelPolicy(event, policy, { days, limit })),
  )
  const storage = createStorageAnalytics(events, topLimit, evaluations)

  return {
    days,
    channel: channel || null,
    provider: provider || null,
    generatedAt: new Date().toISOString(),
    ...storage,
    policies: sanitizeStorageChannelPolicies(policies),
    evaluations,
    alerts: buildStoragePolicyAlerts(evaluations),
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

function calculateRemainingBudget(used: number, limit: number | null): number | null {
  return limit == null ? null : Math.max(limit - used, 0)
}

function calculateOverageBudget(used: number, limit: number | null): number {
  return limit == null ? 0 : Math.max(used - limit, 0)
}

function roundRatePerDay(value: number, days: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(days) || days <= 0)
    return 0
  return Math.round((value / days) * 100) / 100
}

function estimateBudgetExhaustionDays(used: number, remaining: number | null, days: number): number | null {
  if (remaining == null)
    return null
  if (remaining <= 0)
    return 0
  if (used <= 0 || days <= 0)
    return null
  return Math.round((remaining / (used / days)) * 100) / 100
}

function calculateStorageBurnRate(
  usage: StoragePolicyEvaluation['usage'],
  days: number,
): StoragePolicyEvaluation['burnRate'] {
  return {
    storedBytesPerDay: roundRatePerDay(usage.storedBytes, days),
    trafficBytesPerDay: roundRatePerDay(usage.trafficBytes, days),
    operationsPerDay: roundRatePerDay(usage.operations, days),
  }
}

function calculateStorageProjectedExhaustionDays(
  usage: StoragePolicyEvaluation['usage'],
  remaining: StoragePolicyEvaluation['remaining'],
  days: number,
): StoragePolicyEvaluation['projectedExhaustionDays'] {
  return {
    storedBytes: estimateBudgetExhaustionDays(usage.storedBytes, remaining.storedBytes, days),
    trafficBytes: estimateBudgetExhaustionDays(usage.trafficBytes, remaining.trafficBytes, days),
    operations: estimateBudgetExhaustionDays(usage.operations, remaining.operations, days),
    alertBytes: estimateBudgetExhaustionDays(usage.storedBytes, remaining.alertBytes, days),
  }
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
  const emptyUsage = {
    storedBytes: 0,
    trafficBytes: 0,
    operations: 0,
    writes: 0,
    reads: 0,
    deletes: 0,
  }
  const emptyRemaining = {
    storedBytes: calculateRemainingBudget(emptyUsage.storedBytes, maxBytes),
    trafficBytes: calculateRemainingBudget(emptyUsage.trafficBytes, trafficBytes),
    operations: calculateRemainingBudget(emptyUsage.operations, maxOperations),
    alertBytes: calculateRemainingBudget(emptyUsage.storedBytes, alertBytes),
  }

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
      usage: emptyUsage,
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
      remaining: emptyRemaining,
      overage: {
        storedBytes: calculateOverageBudget(emptyUsage.storedBytes, maxBytes),
        trafficBytes: calculateOverageBudget(emptyUsage.trafficBytes, trafficBytes),
        operations: calculateOverageBudget(emptyUsage.operations, maxOperations),
        alertBytes: calculateOverageBudget(emptyUsage.storedBytes, alertBytes),
      },
      burnRate: calculateStorageBurnRate(emptyUsage, days),
      projectedExhaustionDays: calculateStorageProjectedExhaustionDays(emptyUsage, emptyRemaining, days),
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
  const remaining = {
    storedBytes: calculateRemainingBudget(usage.storedBytes, maxBytes),
    trafficBytes: calculateRemainingBudget(usage.trafficBytes, trafficBytes),
    operations: calculateRemainingBudget(usage.operations, maxOperations),
    alertBytes: calculateRemainingBudget(usage.storedBytes, alertBytes),
  }
  const overage = {
    storedBytes: calculateOverageBudget(usage.storedBytes, maxBytes),
    trafficBytes: calculateOverageBudget(usage.trafficBytes, trafficBytes),
    operations: calculateOverageBudget(usage.operations, maxOperations),
    alertBytes: calculateOverageBudget(usage.storedBytes, alertBytes),
  }
  const burnRate = calculateStorageBurnRate(usage, days)
  const projectedExhaustionDays = calculateStorageProjectedExhaustionDays(usage, remaining, days)
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
    remaining,
    overage,
    burnRate,
    projectedExhaustionDays,
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
  channel?: string,
): Promise<void> {
  const quotas = await listPlatformGovernanceConfigs(event, {
    configType: 'intelligence_provider_quota',
    targetId: providerId,
    enabled: true,
  })
  const scopedQuotas = quotas
    .filter(quota => !quota.channel || !channel || quota.channel === channel)
    .sort((left, right) => Number(Boolean(right.channel)) - Number(Boolean(left.channel)))
  if (!scopedQuotas.length)
    return

  for (const quota of scopedQuotas) {
    const quotaChannel = quota.channel ?? undefined
    const windowDays = readLimitNumber(quota.limits, ['windowDays', 'periodDays']) ?? 30
    const summaryOptions = {
      scope: 'intelligence' as const,
      resourceType: 'provider',
      resourceId: providerId,
      days: windowDays,
      limit: 5000,
      channel: quotaChannel,
    }
    const requestSummary = await getPlatformGovernanceSummary(event, {
      ...summaryOptions,
      action: 'provider.request',
    })
    const maxRequests = readLimitNumber(quota.limits, ['maxRequests', 'requestLimit'])
    if (maxRequests != null && requestSummary.totalEvents >= maxRequests) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Intelligence provider request quota exceeded.',
        data: {
          code: 'INTELLIGENCE_PROVIDER_REQUEST_QUOTA_EXCEEDED',
          providerId,
          channel: quotaChannel ?? null,
          windowDays,
          limit: maxRequests,
        },
      })
    }

    const usageSummary = await getPlatformGovernanceSummary(event, {
      ...summaryOptions,
      action: 'provider.usage',
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
          channel: quotaChannel ?? null,
          windowDays,
          limit: maxTokens,
        },
      })
    }
  }
}

function normalizeProviderQuotaSmokeModeInput(value: unknown): IntelligenceProviderQuotaSmokeMode {
  if (value == null || value === '')
    return 'dry-run'
  if (value === 'dry-run' || value === 'consume')
    return value
  throw createError({ statusCode: 400, statusMessage: 'mode must be dry-run or consume.' })
}

function findProviderQuotaEvaluation(
  evaluations: IntelligenceProviderQuotaEvaluation[],
  channel: string | null,
): IntelligenceProviderQuotaEvaluation | null {
  return evaluations.find(item => item.channel === channel)
    ?? evaluations.find(item => item.channel == null)
    ?? evaluations[0]
    ?? null
}

async function recordProviderQuotaSmokeAudit(
  event: H3Event,
  actorId: unknown,
  result: IntelligenceProviderQuotaSmokeResult,
): Promise<void> {
  await recordPlatformGovernanceEvent(event, {
    scope: 'intelligence',
    action: `provider.quota_smoke.${result.status}`,
    actorId,
    resourceType: 'provider',
    resourceId: result.providerId,
    channel: result.channel ?? undefined,
    unit: 'smoke',
    quantity: result.status === 'blocked' || result.status === 'failed' ? 0 : 1,
    metadata: {
      providerId: result.providerId,
      channel: result.channel,
      mode: result.mode,
      evidenceSource: 'local-only',
      reason: result.reason,
      requestRecorded: result.requestRecorded,
      tokensRecorded: result.tokensRecorded,
      quotaConfigId: result.evaluation?.configId ?? null,
      quotaName: result.evaluation?.name ?? null,
      quotaStatus: result.evaluation?.status ?? null,
      remainingRequests: result.evaluation?.remaining.requests ?? null,
      remainingTokens: result.evaluation?.remaining.tokens ?? null,
      requestUtilization: result.evaluation?.utilization.requests ?? null,
      tokenUtilization: result.evaluation?.utilization.tokens ?? null,
    },
  })
}

function providerQuotaSmokeErrorReason(error: unknown): string {
  if (error && typeof error === 'object') {
    const data = (error as { data?: { code?: unknown } }).data
    if (data?.code === 'INTELLIGENCE_PROVIDER_REQUEST_QUOTA_EXCEEDED')
      return 'request-quota-exceeded'
    if (data?.code === 'INTELLIGENCE_PROVIDER_TOKEN_QUOTA_EXCEEDED')
      return 'token-quota-exceeded'
    const statusMessage = (error as { statusMessage?: unknown }).statusMessage
    if (typeof statusMessage === 'string' && statusMessage.trim())
      return statusMessage
  }
  return error instanceof Error && error.message ? error.message : 'provider-quota-smoke-failed'
}

export async function runIntelligenceProviderQuotaSmoke(
  event: H3Event,
  input: RunIntelligenceProviderQuotaSmokeInput,
): Promise<IntelligenceProviderQuotaSmokeResult> {
  const providerId = assertString(input.providerId, 'providerId', 180)
  const channel = normalizeString(input.channel, 120) ?? null
  const mode = normalizeProviderQuotaSmokeModeInput(input.mode)
  const tokenQuantity = normalizeQuantity(input.tokenQuantity)
  const generatedAt = new Date().toISOString()

  try {
    await assertIntelligenceProviderQuota(event, providerId, channel ?? undefined)

    if (mode === 'dry-run') {
      const evaluations = await evaluateIntelligenceProviderQuotas(event, providerId)
      const result: IntelligenceProviderQuotaSmokeResult = {
        providerId,
        channel,
        mode,
        status: 'allowed',
        reason: 'provider-quota-allows-request',
        requestRecorded: false,
        tokensRecorded: 0,
        evaluation: findProviderQuotaEvaluation(evaluations, channel),
        generatedAt,
      }
      await recordProviderQuotaSmokeAudit(event, input.actorId, result)
      return result
    }

    await recordPlatformGovernanceEvent(event, {
      scope: 'intelligence',
      action: 'provider.request',
      actorId: input.actorId,
      resourceType: 'provider',
      resourceId: providerId,
      channel: channel ?? undefined,
      unit: 'request',
      quantity: 1,
      metadata: {
        source: 'provider-quota-smoke',
        mode,
      },
    })
    if (tokenQuantity > 0) {
      await recordPlatformGovernanceEvent(event, {
        scope: 'intelligence',
        action: 'provider.usage',
        actorId: input.actorId,
        resourceType: 'provider',
        resourceId: providerId,
        channel: channel ?? undefined,
        unit: 'token',
        quantity: tokenQuantity,
        metadata: {
          source: 'provider-quota-smoke',
          mode,
        },
      })
    }

    let status: IntelligenceProviderQuotaSmokeStatus = 'consumed'
    let reason = 'provider-quota-consumed'
    try {
      await assertIntelligenceProviderQuota(event, providerId, channel ?? undefined)
    }
    catch (error) {
      status = 'blocked'
      reason = providerQuotaSmokeErrorReason(error)
    }

    const evaluations = await evaluateIntelligenceProviderQuotas(event, providerId)
    const result: IntelligenceProviderQuotaSmokeResult = {
      providerId,
      channel,
      mode,
      status,
      reason,
      requestRecorded: true,
      tokensRecorded: tokenQuantity,
      evaluation: findProviderQuotaEvaluation(evaluations, channel),
      generatedAt,
    }
    await recordProviderQuotaSmokeAudit(event, input.actorId, result)
    return result
  }
  catch (error) {
    const evaluations = await evaluateIntelligenceProviderQuotas(event, providerId)
    const result: IntelligenceProviderQuotaSmokeResult = {
      providerId,
      channel,
      mode,
      status: 'failed',
      reason: providerQuotaSmokeErrorReason(error),
      requestRecorded: false,
      tokensRecorded: 0,
      evaluation: findProviderQuotaEvaluation(evaluations, channel),
      generatedAt,
    }
    await recordProviderQuotaSmokeAudit(event, input.actorId, result)
    return result
  }
}

export async function evaluateIntelligenceProviderQuotas(
  event: H3Event,
  providerId: string,
): Promise<IntelligenceProviderQuotaEvaluation[]> {
  const quotas = await listPlatformGovernanceConfigs(event, {
    configType: 'intelligence_provider_quota',
    targetId: providerId,
  })
  if (!quotas.length)
    return []

  const maxWindowDays = quotas.reduce((maxDays, quota) => {
    const windowDays = readLimitNumber(quota.limits, ['windowDays', 'periodDays']) ?? 30
    return Math.max(maxDays, windowDays)
  }, 30)
  const providerEvents = await listPlatformGovernanceEvents(event, {
    scope: 'intelligence',
    resourceType: 'provider',
    resourceId: providerId,
    days: maxWindowDays,
    limit: 5000,
  })
  return evaluateIntelligenceProviderQuotaConfigs(providerEvents, quotas)
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
