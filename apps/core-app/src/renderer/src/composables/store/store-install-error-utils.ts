import { isTransportFailureError } from '@talex-touch/utils/network'

const HTTP_STATUS_PATTERN = /^(?:NETWORK_HTTP_STATUS|STORE_HTTP_STATUS|HTTP_ERROR)_(\d{3})/
const NETWORK_TIMEOUT_PREFIX = 'NETWORK_TIMEOUT'
const ACTIVE_UI_PREFIX = 'PLUGIN_HAS_ACTIVE_UI:'
const REMOVE_OLD_PREFIX = 'Failed to remove old plugin:'
const ENTRY_FILES_PREFIX = 'Missing required webcontent entry files after install:'
const TRUST_PREFIX = 'PLUGIN_TRUST_'
// What the renderer transport puts in front of a failure it relays; the failure itself follows.
const TRANSPORT_WRAPPER = /^\[TuffTransport\] Failed to send "[^"]*": /

/**
 * The reason, under `store.installation.reasons`, for each failure the install chain reports by
 * code or by a fixed message. Several checks fail the same way for the person installing, so they
 * share a reason.
 */
const REASON_KEYS: Record<string, string> = {
  INSTALL_FAILED: 'installFailed',
  'Install failed': 'installFailed',
  STORE_INSTALL_NO_SOURCE: 'noSource',
  NOT_AUTHENTICATED: 'authRequired',
  UNAUTHORIZED: 'authRequired',
  'No provider found to handle this source': 'noProvider',
  'The operation was aborted': 'networkTimeout',
  'AbortError: The operation was aborted': 'networkTimeout',
  NETWORK_ABORTED: 'networkTimeout',
  NETWORK_COOLDOWN_ACTIVE: 'networkCooldown',
  PLUGIN_SOURCE_INVALID: 'sourceInvalid',
  INVALID_PATH: 'sourceInvalid',
  PLUGIN_SOURCE_FILE_NOT_FOUND: 'sourceFileMissing',
  PLUGIN_NOT_FOUND: 'pluginNotFound',
  PLUGIN_VERSION_UNAVAILABLE: 'versionUnavailable',
  PLUGIN_DOWNLOAD_INVALID_URL: 'downloadUrlInvalid',
  PLUGIN_DOWNLOAD_UNSUPPORTED_PROTOCOL: 'downloadUrlInvalid',
  PLUGIN_DOWNLOAD_REDIRECT_STATUS_UNSUPPORTED: 'downloadRedirectFailed',
  PLUGIN_DOWNLOAD_REDIRECT_LIMIT_EXCEEDED: 'downloadRedirectFailed',
  PLUGIN_DOWNLOAD_REDIRECT_LOCATION_MISSING: 'downloadRedirectFailed',
  PLUGIN_DOWNLOAD_EMPTY: 'downloadEmpty',
  PLUGIN_PACKAGE_UNREADABLE: 'packageUnreadable',
  PLUGIN_MANIFEST_NOT_FOUND: 'manifestMissing',
  MANIFEST_NOT_FOUND: 'manifestMissing',
  PLUGIN_MANIFEST_INVALID: 'manifestInvalid',
  MANIFEST_INVALID: 'manifestInvalid',
  'invalid plugin name': 'nameInvalid',
  INVALID_PLUGIN_NAME: 'nameInvalid',
  'plugin already exists': 'alreadyInstalled',
  PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED: 'replaceFailed',
  PLUGIN_UNINSTALL_INCOMPLETE: 'uninstallPending',
  PLUGIN_MANAGER_NOT_READY: 'notReady',
  PLUGIN_ROOT_MISSING: 'notReady',
  PLUGIN_INSTALL_DECLINED: 'declined',
  // The package checks against what the store attested. Any other `PLUGIN_TRUST_` failure is a
  // signature or key that did not verify.
  PLUGIN_TRUST_METADATA_REQUIRED: 'trustMetadataInvalid',
  PLUGIN_TRUST_METADATA_INVALID: 'trustMetadataInvalid',
  PLUGIN_TRUST_ARTIFACT_SIZE_MISMATCH: 'trustPackageMismatch',
  PLUGIN_TRUST_ARTIFACT_DIGEST_MISMATCH: 'trustPackageMismatch',
  PLUGIN_TRUST_ADMISSION_REJECTED: 'trustNotApproved',
  PLUGIN_TRUST_POLICY_REJECTED: 'trustNotApproved',
  PLUGIN_TRUST_SCAN_REJECTED: 'trustNotApproved',
  PLUGIN_TRUST_REVIEW_REQUIRED: 'trustReviewPending'
}

type StoreTranslate = (key: string, params?: Record<string, unknown>) => string

function resolveSdkBlockedReason(message: string, t: StoreTranslate): string | null {
  if (message === 'SDKAPI_BLOCKED') {
    return t('store.installation.reasons.sdkapiBlocked')
  }

  if (message.includes('manifest.json must declare sdkapi')) {
    return t('store.installation.reasons.sdkapiMissing')
  }

  if (message.includes(' is invalid. Use YYMMDD format')) {
    return t('store.installation.reasons.sdkapiInvalid')
  }

  const outdatedMatch = message.match(
    /sdkapi (\d{6}) is below the minimum supported baseline (\d{6})/
  )
  if (outdatedMatch) {
    return t('store.installation.reasons.sdkapiOutdated', {
      declared: outdatedMatch[1],
      minimum: outdatedMatch[2]
    })
  }

  if (message.includes('sdkapi hard-cut gate')) {
    return t('store.installation.reasons.sdkapiBlocked')
  }

  return null
}

function unwrapTransportFailure(errorMessage: string | null | undefined): string {
  return (errorMessage?.trim() ?? '').replace(TRANSPORT_WRAPPER, '').trim()
}

/**
 * Where a plugin an update has to replace is open, worded for the user: main reports it as
 * `PLUGIN_HAS_ACTIVE_UI:{"coreBox":true,"windows":2}`. Null when the failure is anything else.
 */
export function resolveStoreInstallActiveUi(
  errorMessage: string | null | undefined,
  t: StoreTranslate
): string | null {
  const normalized = unwrapTransportFailure(errorMessage)
  if (!normalized.startsWith(ACTIVE_UI_PREFIX)) return null

  const detail = normalized.slice(ACTIVE_UI_PREFIX.length)
  let where: { coreBox?: unknown; windows?: unknown } | null = null
  try {
    where = JSON.parse(detail) as { coreBox?: unknown; windows?: unknown }
  } catch {
    return detail
  }

  const coreBox = where?.coreBox === true
  const windows = typeof where?.windows === 'number' ? where.windows : 0
  if (coreBox && windows > 0) {
    return t('store.installation.activeUi.coreBoxAndWindows', { count: windows })
  }
  if (windows > 0) return t('store.installation.activeUi.windows', { count: windows })
  return t('store.installation.activeUi.coreBox')
}

export function resolveStoreInstallFailureReason(
  errorMessage: string | null | undefined,
  t: StoreTranslate
): string {
  const normalized = unwrapTransportFailure(errorMessage)

  if (!normalized) {
    return t('store.installation.reasons.installFailed')
  }

  if (
    normalized === 'PRIVILEGED_PLUGIN_NAME_RESERVED' ||
    normalized === 'privileged plugin name is reserved for the bundled runtime'
  ) {
    return t('store.clientManagedHint')
  }

  const reasonKey = REASON_KEYS[normalized]
  if (reasonKey) {
    return t(`store.installation.reasons.${reasonKey}`)
  }

  const activeUi = resolveStoreInstallActiveUi(normalized, t)
  if (activeUi !== null) {
    return t('store.installation.reasons.activeUi', { ui: activeUi })
  }

  const httpStatus = normalized.match(HTTP_STATUS_PATTERN)
  if (httpStatus) {
    return t('store.installation.reasons.httpError', { status: httpStatus[1] })
  }

  if (normalized.startsWith(NETWORK_TIMEOUT_PREFIX)) {
    return t('store.installation.reasons.networkTimeout')
  }

  if (normalized.startsWith(TRUST_PREFIX)) {
    return t('store.installation.reasons.trustUnverified')
  }

  if (normalized.startsWith(REMOVE_OLD_PREFIX)) {
    return t('store.installation.reasons.replaceFailed')
  }

  if (normalized.startsWith(ENTRY_FILES_PREFIX)) {
    return t('store.installation.reasons.entryFilesMissing')
  }

  const sdkBlockedReason = resolveSdkBlockedReason(normalized, t)
  if (sdkBlockedReason) {
    return sdkBlockedReason
  }

  if (isTransportFailureError(new Error(normalized))) {
    return t('store.installation.reasons.networkUnavailable')
  }

  // Text from the system or a library is the only diagnosis the user has, so it is shown as it is.
  return normalized
}
