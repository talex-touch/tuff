const HTTP_ERROR_PREFIX = 'HTTP_ERROR_'

type StoreTranslate = (key: string, params?: unknown) => string

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

  if (message.includes('sdkapi compatibility gate')) {
    return t('store.installation.reasons.sdkapiBlocked')
  }

  return null
}

export function resolveStoreInstallFailureReason(
  errorMessage: string | null | undefined,
  t: StoreTranslate
): string {
  const normalized = errorMessage?.trim()

  if (!normalized || normalized === 'INSTALL_FAILED') {
    return t('store.installation.reasons.installFailed')
  }

  if (normalized === 'STORE_INSTALL_NO_SOURCE') {
    return t('store.installation.reasons.noSource')
  }

  if (normalized === 'NOT_AUTHENTICATED' || normalized === 'UNAUTHORIZED') {
    return t('store.installation.reasons.authRequired')
  }

  if (normalized.startsWith(HTTP_ERROR_PREFIX)) {
    return t('store.installation.reasons.httpError', {
      status: normalized.slice(HTTP_ERROR_PREFIX.length)
    })
  }

  if (normalized === 'No provider found to handle this source') {
    return t('store.installation.reasons.noProvider')
  }

  const sdkBlockedReason = resolveSdkBlockedReason(normalized, t)
  if (sdkBlockedReason) {
    return sdkBlockedReason
  }

  return normalized
}
