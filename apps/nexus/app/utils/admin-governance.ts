import { isFallbackEvidenceSource, isProductionEvidenceSource } from '~/types/docs-engagement'
import type { EvidenceSource as PlatformGovernanceReportEvidenceStatus } from '~/types/docs-engagement'
import type {
  GovernanceConfigType, NotificationActionQueueItem, NotificationChannelDisplayStatus, NotificationChannelRiskStatus,
  NotificationDeliveryStatus, PlatformGovernanceD1ReadinessCheck, PlatformGovernanceD1ReadinessStatus,
  PlatformGovernanceReportPriority, PlatformGovernanceReportStatus, ProviderQuotaActionQueuePriority,
  ProviderQuotaActionQueueReason, ProviderQuotaRiskReason, ProviderQuotaSmokeStatus, ProviderQuotaStatus,
  StatusTone, StorageAlertMetric, StorageChannelPressureStatus, StoragePolicyAlert, StoragePolicyEvaluationStatus,
  StorageSmokeEvidenceStatus,
} from '~/types/admin-governance'

export type GovernanceTranslate = (key: string, fallback: string) => string

export function createGovernanceFormatters(tt: GovernanceTranslate, locale: () => string) {
  function formatNumber(value: number): string {
    return new Intl.NumberFormat().format(Math.round(value))
  }
  
  function formatBytes(value: number): string {
    if (value <= 0)
      return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
    const amount = value / 1024 ** index
    return `${amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`
  }
  
  function formatDurationMs(value: number): string {
    if (!Number.isFinite(value) || value <= 0)
      return '0 ms'
    if (value < 1000)
      return `${formatNumber(value)} ms`
    if (value < 60_000)
      return `${Math.round(value / 100) / 10} s`
    return `${Math.round(value / 6000) / 10} min`
  }
  
  function formatPercent(value: number): string {
    return `${Math.round(value * 100) / 100}%`
  }
  
  function formatDelta(value: number): string {
    return `${value >= 0 ? '+' : ''}${formatPercent(value)}`
  }
  
  function formatTrendWidth(value: number, peak: number): string {
    if (!Number.isFinite(value) || !Number.isFinite(peak) || value <= 0 || peak <= 0)
      return '0%'
    return `${Math.min(100, Math.max(4, Math.round((value / peak) * 100)))}%`
  }
  
  function formatHeatmapCellOpacity(value: number, peak: number): string {
    if (!Number.isFinite(value) || !Number.isFinite(peak) || value <= 0 || peak <= 0)
      return '0.08'
    return String(Math.min(0.96, Math.max(0.18, Math.round((value / peak) * 100) / 100)))
  }
  
  function formatWeekdayLabel(dayOfWeek: number): string {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek] ?? String(dayOfWeek)
  }
  
  function formatDate(value: string): string {
    if (!value) {
      return '-'
    }
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString(locale()) : value
  }
  
  function formatShortDate(value: string): string {
    if (!value)
      return '-'
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString(locale()) : value
  }
  
  function configTypeLabel(type: GovernanceConfigType): string {
    if (type === 'analytics_collection')
      return tt('dashboard.governance.types.analytics', 'Analytics')
    if (type === 'storage_channel')
      return tt('dashboard.governance.types.storage', 'Storage')
    if (type === 'notification_channel')
      return tt('dashboard.governance.types.notification', 'Notification')
    return tt('dashboard.governance.types.providerQuota', 'Provider quota')
  }
  
  function storageEvaluationTone(status: StoragePolicyEvaluationStatus): StatusTone {
    if (status === 'ok')
      return 'success'
    if (status === 'warning')
      return 'warning'
    if (status === 'blocked')
      return 'danger'
    return 'muted'
  }
  
  function storageEvaluationLabel(status: StoragePolicyEvaluationStatus): string {
    if (status === 'ok')
      return tt('dashboard.governance.storagePolicy.ok', 'OK')
    if (status === 'warning')
      return tt('dashboard.governance.storagePolicy.warning', 'Warning')
    if (status === 'blocked')
      return tt('dashboard.governance.storagePolicy.blocked', 'Blocked')
    return tt('dashboard.governance.storagePolicy.disabled', 'Disabled')
  }
  
  function storageChannelPressureTone(status: StorageChannelPressureStatus): StatusTone {
    return status === 'unmanaged' ? 'info' : storageEvaluationTone(status)
  }
  
  function storageChannelPressureLabel(status: StorageChannelPressureStatus): string {
    if (status === 'unmanaged')
      return tt('dashboard.governance.analytics.storageChannelUnmanaged', 'Unmanaged')
    return storageEvaluationLabel(status)
  }
  
  function storageSmokeEvidenceTone(status: StorageSmokeEvidenceStatus): StatusTone {
    if (status === 'failed')
      return 'danger'
    if (status === 'sent' || status === 'ready')
      return 'success'
    return 'info'
  }
  
  function storageSmokeEvidenceLabel(status: StorageSmokeEvidenceStatus): string {
    if (status === 'ready')
      return tt('dashboard.governance.storageSmoke.readyStatus', 'Ready')
    if (status === 'sent')
      return tt('dashboard.governance.storageSmoke.sentStatus', 'Sent')
    return tt('dashboard.governance.storageSmoke.failedStatus', 'Failed')
  }
  
  function providerQuotaTone(status: ProviderQuotaStatus): StatusTone {
    return storageEvaluationTone(status)
  }
  
  function providerQuotaLabel(status: ProviderQuotaStatus): string {
    if (status === 'ok')
      return tt('dashboard.governance.providerQuota.ok', 'OK')
    if (status === 'warning')
      return tt('dashboard.governance.providerQuota.warning', 'Warning')
    if (status === 'blocked')
      return tt('dashboard.governance.providerQuota.blocked', 'Blocked')
    return tt('dashboard.governance.providerQuota.disabled', 'Disabled')
  }
  
  function providerQuotaSmokeTone(status: ProviderQuotaSmokeStatus): StatusTone {
    if (status === 'blocked')
      return 'danger'
    if (status === 'failed')
      return 'warning'
    if (status === 'consumed' || status === 'allowed')
      return 'success'
    return 'info'
  }
  
  function providerQuotaSmokeLabel(status: ProviderQuotaSmokeStatus): string {
    if (status === 'allowed')
      return tt('dashboard.governance.providerQuotaSmoke.allowed', 'Allowed')
    if (status === 'consumed')
      return tt('dashboard.governance.providerQuotaSmoke.consumed', 'Consumed')
    if (status === 'blocked')
      return tt('dashboard.governance.providerQuotaSmoke.blocked', 'Blocked')
    return tt('dashboard.governance.providerQuotaSmoke.failed', 'Failed')
  }
  
  function providerQuotaRiskReasonLabel(reason: ProviderQuotaRiskReason): string {
    if (reason === 'overage')
      return tt('dashboard.governance.analytics.providerQuotaRiskOverage', 'Over limit')
    if (reason === 'low-remaining')
      return tt('dashboard.governance.analytics.providerQuotaRiskLowRemaining', 'Low remaining')
    if (reason === 'projected-exhaustion')
      return tt('dashboard.governance.analytics.providerQuotaRiskProjected', 'Projected exhaustion')
    if (reason === 'blocked')
      return tt('dashboard.governance.analytics.providerQuotaRiskBlocked', 'Blocked')
    return tt('dashboard.governance.analytics.providerQuotaRiskWarning', 'Warning threshold')
  }
  
  function providerQuotaActionTone(priority: ProviderQuotaActionQueuePriority): StatusTone {
    if (priority === 'critical')
      return 'danger'
    if (priority === 'high')
      return 'warning'
    if (priority === 'medium')
      return 'info'
    return 'muted'
  }
  
  function providerQuotaActionReasonLabel(reason: ProviderQuotaActionQueueReason): string {
    if (reason === 'token-overage')
      return tt('dashboard.governance.analytics.providerQuotaActionTokenOverage', 'Token overage')
    if (reason === 'request-overage')
      return tt('dashboard.governance.analytics.providerQuotaActionRequestOverage', 'Request overage')
    if (reason === 'token-exhausted')
      return tt('dashboard.governance.analytics.providerQuotaActionTokenExhausted', 'Tokens exhausted')
    if (reason === 'request-exhausted')
      return tt('dashboard.governance.analytics.providerQuotaActionRequestExhausted', 'Requests exhausted')
    if (reason === 'projected-exhaustion')
      return tt('dashboard.governance.analytics.providerQuotaActionProjected', 'Projected exhaustion')
    if (reason === 'quota-disabled')
      return tt('dashboard.governance.analytics.providerQuotaActionDisabled', 'Quota disabled')
    if (reason === 'missing-hard-limit')
      return tt('dashboard.governance.analytics.providerQuotaActionMissingLimit', 'Missing hard limit')
    return tt('dashboard.governance.analytics.providerQuotaActionWarning', 'Warning threshold')
  }
  
  function reportStatusTone(status: PlatformGovernanceReportStatus): StatusTone {
    if (status === 'critical')
      return 'danger'
    if (status === 'watch')
      return 'warning'
    return 'success'
  }
  
  function reportStatusLabel(status: PlatformGovernanceReportStatus): string {
    if (status === 'critical')
      return tt('dashboard.governance.report.critical', 'Critical')
    if (status === 'watch')
      return tt('dashboard.governance.report.watch', 'Watch')
    return tt('dashboard.governance.report.ok', 'OK')
  }
  
  function reportEvidenceTone(status: PlatformGovernanceReportEvidenceStatus): StatusTone {
    if (isProductionEvidenceSource(status))
      return 'success'
    if (isFallbackEvidenceSource(status))
      return 'warning'
    return 'muted'
  }
  
  function reportEvidenceLabel(status: PlatformGovernanceReportEvidenceStatus): string {
    if (status === 'live')
      return tt('dashboard.governance.report.evidenceLive', 'Live')
    if (status === 'd1')
      return tt('dashboard.governance.report.evidenceD1', 'D1')
    if (status === 'r2')
      return tt('dashboard.governance.report.evidenceR2', 'R2')
    if (status === 'local-only')
      return tt('dashboard.governance.report.evidenceLocalOnly', 'Local only')
    if (status === 'memory')
      return tt('dashboard.governance.report.evidenceMemory', 'Memory')
    return tt('dashboard.governance.report.evidenceOpen', 'Open')
  }
  
  function reportPriorityTone(priority: PlatformGovernanceReportPriority): StatusTone {
    if (priority === 'critical')
      return 'danger'
    if (priority === 'high')
      return 'warning'
    if (priority === 'medium')
      return 'info'
    return 'muted'
  }
  
  function storageAlertMetricLabel(metric: StorageAlertMetric): string {
    if (metric === 'storedBytes')
      return tt('dashboard.governance.storageAlerts.storedBytes', 'Stored bytes')
    if (metric === 'trafficBytes')
      return tt('dashboard.governance.storageAlerts.trafficBytes', 'Traffic bytes')
    return tt('dashboard.governance.storageAlerts.operations', 'Operations')
  }
  
  function formatStorageAlertValue(alert: StoragePolicyAlert, value: number | null): string {
    if (value == null)
      return '-'
    return alert.metric === 'operations' ? formatNumber(value) : formatBytes(value)
  }
  
  function formatStorageBudgetValue(value: number | null, unit: 'bytes' | 'operations'): string {
    if (value == null)
      return '-'
    return unit === 'operations' ? formatNumber(value) : formatBytes(value)
  }
  
  function formatProjectedDays(value: number | null): string {
    return value == null ? '-' : `${formatNumber(value)}d`
  }
  
  function notificationDeliveryTone(status: NotificationDeliveryStatus): StatusTone {
    if (status === 'sent')
      return 'success'
    if (status === 'failed')
      return 'danger'
    if (status === 'skipped')
      return 'warning'
    return 'info'
  }
  
  function notificationChannelTone(status: NotificationChannelDisplayStatus): StatusTone {
    if (status === 'warning')
      return 'warning'
    if (status === 'disabled')
      return 'muted'
    return 'success'
  }
  
  function notificationChannelLabel(status: NotificationChannelDisplayStatus): string {
    if (status === 'warning')
      return tt('dashboard.governance.analytics.notificationChannelWarning', 'Warning')
    if (status === 'disabled')
      return tt('dashboard.governance.analytics.notificationChannelDisabled', 'Disabled')
    return tt('dashboard.governance.analytics.notificationChannelOk', 'OK')
  }
  
  function notificationActionQueueStatusLabel(item: NotificationActionQueueItem): string {
    if (item.source === 'delivery-health')
      return tt('dashboard.governance.analytics.notificationDeliveryRisk', 'Delivery risk')
    return notificationChannelLabel(item.status as NotificationChannelRiskStatus)
  }
  
  function notificationChannelCredentialLabel(channel: { credentialRequired: boolean, hasCredentialRef?: boolean, credentialRef?: string | null }): string {
    if (!channel.credentialRequired)
      return tt('dashboard.governance.analytics.notificationChannelCredentialNotRequired', 'no credential required')
    return (channel.hasCredentialRef ?? Boolean(channel.credentialRef))
      ? tt('dashboard.governance.analytics.notificationChannelCredentialBound', 'credentialRef bound')
      : tt('dashboard.governance.analytics.notificationChannelCredentialMissing', 'credentialRef missing')
  }
  
  function notificationChannelReadinessLabel(channel: { readiness: { productionReady: boolean, reasons: string[] } }): string {
    if (channel.readiness.productionReady)
      return tt('dashboard.governance.analytics.notificationChannelProductionReady', 'production ready')
    return channel.readiness.reasons.join(', ') || tt('dashboard.governance.analytics.notificationChannelReadinessPending', 'readiness pending')
  }
  
  function formatRatio(value: number | null): string {
    return value == null ? '-' : formatPercent(value)
  }
  
  function d1ReadinessTone(status: PlatformGovernanceD1ReadinessStatus): StatusTone {
    if (status === 'ready')
      return 'success'
    if (status === 'warning')
      return 'warning'
    return 'danger'
  }
  
  function d1ReadinessLabel(status: PlatformGovernanceD1ReadinessStatus): string {
    if (status === 'ready')
      return tt('dashboard.governance.d1Readiness.ready', 'Ready')
    if (status === 'warning')
      return tt('dashboard.governance.d1Readiness.warning', 'Needs backfill')
    return tt('dashboard.governance.d1Readiness.blocked', 'Blocked')
  }
  
  function formatD1MissingObjects(check: PlatformGovernanceD1ReadinessCheck): string {
    return [...check.missingTables, ...check.missingIndexes].join(', ')
  }

  return {
    formatNumber, formatBytes, formatDurationMs, formatPercent, formatDelta, formatTrendWidth,
    formatHeatmapCellOpacity, formatWeekdayLabel, formatDate, formatShortDate, configTypeLabel,
    storageEvaluationTone, storageEvaluationLabel, storageChannelPressureTone, storageChannelPressureLabel,
    storageSmokeEvidenceTone, storageSmokeEvidenceLabel, providerQuotaTone, providerQuotaLabel,
    providerQuotaSmokeTone, providerQuotaSmokeLabel, providerQuotaRiskReasonLabel, providerQuotaActionTone,
    providerQuotaActionReasonLabel, reportStatusTone, reportStatusLabel, reportEvidenceTone,
    reportEvidenceLabel, reportPriorityTone, storageAlertMetricLabel, formatStorageAlertValue,
    formatStorageBudgetValue, formatProjectedDays, notificationDeliveryTone, notificationChannelTone,
    notificationChannelLabel, notificationActionQueueStatusLabel, notificationChannelCredentialLabel,
    notificationChannelReadinessLabel, formatRatio, d1ReadinessTone, d1ReadinessLabel, formatD1MissingObjects,
  }
}
