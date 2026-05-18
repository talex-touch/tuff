import type { TuffItem } from '@talex-touch/utils'
import type { ComposerTranslation } from 'vue-i18n'

interface SourceMetaResult {
  icon: string
  label: string
  type: string
}

export interface ResultSignal {
  label: string
  tone: 'info' | 'warning' | 'danger'
  reason?: string
  actionHint?: string
}

const SOURCE_ICON_MAP: Record<string, string> = {
  application: 'i-ri-apps-line',
  app: 'i-ri-apps-line',
  plugin: 'i-ri-puzzle-line',
  file: 'i-ri-file-3-line',
  command: 'i-ri-terminal-line',
  web: 'i-ri-global-line',
  data: 'i-ri-database-2-line',
  service: 'i-ri-cpu-line',
  feature: 'i-ri-star-line',
  system: 'i-ri-settings-3-line',
  default: 'i-ri-hashtag'
}

const SIGNAL_REASON_LABELS: Record<string, string> = {
  PROVIDER_TIMEOUT: 'coreBox.resultSignalReasons.providerTimeout',
  PROVIDER_UNAVAILABLE: 'coreBox.resultSignalReasons.providerUnavailable',
  PROVIDER_DISABLED: 'coreBox.resultSignalReasons.providerDisabled',
  CREDENTIALS_MISSING: 'coreBox.resultSignalReasons.credentialsMissing',
  MISSING_CREDENTIALS: 'coreBox.resultSignalReasons.credentialsMissing',
  INVALID_CREDENTIALS: 'coreBox.resultSignalReasons.invalidCredentials',
  AUTH_REF_MISSING: 'coreBox.resultSignalReasons.credentialsMissing',
  SECURE_STORE_UNAVAILABLE: 'coreBox.resultSignalReasons.secureStoreUnavailable',
  SECURE_STORE_DEGRADED: 'coreBox.resultSignalReasons.secureStoreDegraded',
  CAPABILITY_UNSUPPORTED: 'coreBox.resultSignalReasons.capabilityUnsupported',
  UNSUPPORTED_CAPABILITY: 'coreBox.resultSignalReasons.capabilityUnsupported',
  MODEL_UNSUPPORTED: 'coreBox.resultSignalReasons.capabilityUnsupported',
  PERMISSION_MISSING: 'coreBox.resultSignalReasons.permissionDenied',
  PERMISSION_REQUIRED: 'coreBox.resultSignalReasons.permissionDenied',
  NEXUS_AUTH_REQUIRED: 'coreBox.resultSignalReasons.authRequired',
  NOT_AUTHENTICATED: 'coreBox.resultSignalReasons.authRequired',
  AUTH_REQUIRED: 'coreBox.resultSignalReasons.authRequired',
  QUOTA_EXCEEDED: 'coreBox.resultSignalReasons.quotaExceeded',
  RATE_LIMITED: 'coreBox.resultSignalReasons.rateLimited',
  UNSUPPORTED_PLATFORM: 'coreBox.resultSignalReasons.unsupportedPlatform',
  PERMISSION_DENIED: 'coreBox.resultSignalReasons.permissionDenied',
  DB_NOT_READY: 'coreBox.resultSignalReasons.dbNotReady',
  INDEX_WARMING: 'coreBox.resultSignalReasons.indexWarming'
}

const SIGNAL_ACTION_HINT_LABELS: Record<string, string> = {
  PROVIDER_TIMEOUT: 'coreBox.resultSignalActions.retryProvider',
  PROVIDER_UNAVAILABLE: 'coreBox.resultSignalActions.checkProvider',
  PROVIDER_DISABLED: 'coreBox.resultSignalActions.enableProvider',
  CREDENTIALS_MISSING: 'coreBox.resultSignalActions.checkCredentials',
  MISSING_CREDENTIALS: 'coreBox.resultSignalActions.checkCredentials',
  INVALID_CREDENTIALS: 'coreBox.resultSignalActions.checkCredentials',
  AUTH_REF_MISSING: 'coreBox.resultSignalActions.checkCredentials',
  SECURE_STORE_UNAVAILABLE: 'coreBox.resultSignalActions.repairSecureStore',
  SECURE_STORE_DEGRADED: 'coreBox.resultSignalActions.repairSecureStore',
  CAPABILITY_UNSUPPORTED: 'coreBox.resultSignalActions.switchCapability',
  UNSUPPORTED_CAPABILITY: 'coreBox.resultSignalActions.switchCapability',
  MODEL_UNSUPPORTED: 'coreBox.resultSignalActions.switchCapability',
  PERMISSION_MISSING: 'coreBox.resultSignalActions.grantPermission',
  PERMISSION_REQUIRED: 'coreBox.resultSignalActions.grantPermission',
  NEXUS_AUTH_REQUIRED: 'coreBox.resultSignalActions.signIn',
  NOT_AUTHENTICATED: 'coreBox.resultSignalActions.signIn',
  AUTH_REQUIRED: 'coreBox.resultSignalActions.signIn',
  QUOTA_EXCEEDED: 'coreBox.resultSignalActions.checkQuota',
  RATE_LIMITED: 'coreBox.resultSignalActions.retryLater',
  UNSUPPORTED_PLATFORM: 'coreBox.resultSignalActions.unsupportedPlatform',
  PERMISSION_DENIED: 'coreBox.resultSignalActions.grantPermission',
  DB_NOT_READY: 'coreBox.resultSignalActions.waitForDatabase',
  INDEX_WARMING: 'coreBox.resultSignalActions.waitForIndex'
}

const PERMISSION_REASON_LABELS: Record<string, string> = {
  'clipboard.read': 'coreBox.permissionReasons.clipboardRead',
  'clipboard.write': 'coreBox.permissionReasons.clipboardWrite',
  'intelligence.basic': 'coreBox.permissionReasons.intelligenceBasic',
  'network.internet': 'coreBox.permissionReasons.networkInternet',
  'fs.read': 'coreBox.permissionReasons.fileRead',
  'fs.write': 'coreBox.permissionReasons.fileWrite',
  system: 'coreBox.permissionReasons.system',
  elevated: 'coreBox.permissionReasons.elevated'
}

const FAILED_REASON_KEYS = new Set([
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_DISABLED',
  'CREDENTIALS_MISSING',
  'MISSING_CREDENTIALS',
  'INVALID_CREDENTIALS',
  'AUTH_REF_MISSING',
  'SECURE_STORE_UNAVAILABLE',
  'NEXUS_AUTH_REQUIRED',
  'NOT_AUTHENTICATED',
  'AUTH_REQUIRED',
  'QUOTA_EXCEEDED',
  'RATE_LIMITED',
  'PERMISSION_DENIED',
  'DB_NOT_READY'
])

const DEGRADED_REASON_KEYS = new Set([
  'SECURE_STORE_DEGRADED',
  'CAPABILITY_UNSUPPORTED',
  'UNSUPPORTED_CAPABILITY',
  'MODEL_UNSUPPORTED',
  'PERMISSION_MISSING',
  'PERMISSION_REQUIRED',
  'UNSUPPORTED_PLATFORM',
  'INDEX_WARMING'
])

/**
 * Builds a display-friendly meta object for the badge area that shows
 * the origin of a search result (source type / plugin name).
 */
export function resolveSourceMeta(
  item: TuffItem | null | undefined,
  t: ComposerTranslation
): SourceMetaResult | null {
  if (!item) return null

  const sourceType = item.source?.type
  if (!sourceType) return null

  const icon = SOURCE_ICON_MAP[sourceType] ?? SOURCE_ICON_MAP.default
  const translationKey = `coreBox.sourceTypes.${sourceType}`
  const fallbackLabel = item.source?.name || sourceType.toUpperCase()

  let label = t(translationKey)
  if (label === translationKey) {
    label = fallbackLabel
  }

  if (sourceType === 'plugin') {
    label = (item.meta?.pluginName as string) || label
  }

  return {
    icon,
    label,
    type: sourceType
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function firstArray(...values: unknown[]): readonly string[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0
      )
    }
  }
  return []
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function toReasonKey(reason: string): string {
  return reason
    .trim()
    .replace(/[\s.-]+/g, '_')
    .toUpperCase()
}

function inferSignalToneFromReason(reason: string | undefined): ResultSignal['tone'] | null {
  const normalized = reason?.replace(/\s+/g, ' ').trim()
  if (!normalized) return null

  const reasonKey = toReasonKey(normalized)
  if (FAILED_REASON_KEYS.has(reasonKey)) return 'danger'
  if (DEGRADED_REASON_KEYS.has(reasonKey)) return 'warning'
  return null
}

export function formatResultSignalReason(reason: string | undefined, maxLength = 28): string {
  const normalized = reason?.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
}

export function resolveSignalReasonLabel(
  reason: string | undefined,
  t: ComposerTranslation
): string {
  const normalized = reason?.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''

  const knownKey = SIGNAL_REASON_LABELS[toReasonKey(normalized)]
  if (knownKey) {
    return t(knownKey, normalized)
  }

  return normalized
}

export function resolveSignalActionHint(
  reason: string | undefined,
  tone: ResultSignal['tone'],
  t: ComposerTranslation
): string {
  const normalized = reason?.replace(/\s+/g, ' ').trim()
  if (normalized) {
    const actionKey = SIGNAL_ACTION_HINT_LABELS[toReasonKey(normalized)]
    if (actionKey) return t(actionKey, normalized)
  }

  if (tone === 'danger')
    return t(
      'coreBox.resultSignalActions.inspectFailure',
      'Inspect the failure detail, then retry.'
    )
  if (tone === 'warning')
    return t(
      'coreBox.resultSignalActions.reviewRequirement',
      'Review the requirement before executing.'
    )
  return ''
}

export function resolvePermissionReasonLabel(
  permissions: readonly string[],
  fallback: string | undefined,
  t: ComposerTranslation
): string {
  if (permissions.length === 0) {
    return fallback ? t(PERMISSION_REASON_LABELS[fallback] || fallback, fallback) : ''
  }

  return permissions
    .map((permission) => t(PERMISSION_REASON_LABELS[permission] || permission, permission))
    .join(', ')
}

export function resolveResultSignal(
  item: TuffItem | null | undefined,
  t: ComposerTranslation
): ResultSignal | null {
  if (!item) return null

  const meta = toRecord(item.meta)
  const extension = toRecord(meta.extension)
  const directSignal = toRecord(meta.resultSignal)
  const provider = toRecord(meta.provider)
  const security = toRecord(meta.security)
  const status =
    firstString(extension.status, extension.health, extension.state) ??
    firstString(
      directSignal.status,
      directSignal.health,
      directSignal.state,
      meta.status,
      meta.health,
      meta.state,
      provider.status,
      provider.health,
      provider.state
    )
  const reason = firstString(
    directSignal.reason,
    directSignal.errorCode,
    directSignal.errorMessage,
    extension.reason,
    extension.errorCode,
    extension.errorMessage,
    meta.reason,
    meta.errorCode,
    meta.errorMessage,
    meta.error,
    provider.reason,
    provider.errorCode,
    provider.errorMessage,
    item.render?.basic?.description
  )

  if (status === 'failed' || status === 'error' || status === 'unavailable') {
    const reasonLabel = resolveSignalReasonLabel(reason, t)
    return {
      label: t('coreBox.resultSignals.failed', 'Failed'),
      tone: 'danger',
      reason: reasonLabel,
      actionHint: resolveSignalActionHint(reason, 'danger', t)
    }
  }

  if (status === 'degraded' || status === 'warning' || status === 'unsupported') {
    const reasonLabel = resolveSignalReasonLabel(reason, t)
    return {
      label: t('coreBox.resultSignals.degraded', 'Degraded'),
      tone: 'warning',
      reason: reasonLabel,
      actionHint: resolveSignalActionHint(reason, 'warning', t)
    }
  }

  const inferredTone = inferSignalToneFromReason(reason)
  if (inferredTone) {
    const reasonLabel = resolveSignalReasonLabel(reason, t)
    return {
      label:
        inferredTone === 'danger'
          ? t('coreBox.resultSignals.failed', 'Failed')
          : t('coreBox.resultSignals.degraded', 'Degraded'),
      tone: inferredTone,
      reason: reasonLabel,
      actionHint: resolveSignalActionHint(reason, inferredTone, t)
    }
  }

  const requiredPermissions = firstArray(security.permissions, meta.permissions)
  if (requiredPermissions.length > 0 || item.source?.permission === 'elevated') {
    const reasonLabel = resolvePermissionReasonLabel(requiredPermissions, item.source.permission, t)
    return {
      label: t('coreBox.resultSignals.permission', 'Permission'),
      tone: 'warning',
      reason: reasonLabel,
      actionHint: t(
        'coreBox.resultSignalActions.grantPermission',
        'Grant the required permission before executing.'
      )
    }
  }

  if (item.source?.permission === 'system') {
    return {
      label: t('coreBox.resultSignals.system', 'System'),
      tone: 'info',
      reason: item.source.name || item.source.id
    }
  }

  return null
}

export type { SourceMetaResult }
