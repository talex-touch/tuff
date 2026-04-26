const HTTP_ERROR_PREFIX = 'HTTP_ERROR_'

type StoreTranslate = (key: string, params?: unknown) => string

function isKnownStoreRatingErrorCode(message: string): boolean {
  return (
    message === 'NOT_AUTHENTICATED' ||
    message === 'UNAUTHORIZED' ||
    message === 'INVALID_RATING' ||
    message === 'UNKNOWN_ERROR' ||
    message.startsWith(HTTP_ERROR_PREFIX)
  )
}

export function normalizeStoreRatingError(error: unknown): string {
  const normalized =
    typeof error === 'string' ? error.trim() : error instanceof Error ? error.message.trim() : ''

  if (!normalized) {
    return 'UNKNOWN_ERROR'
  }

  if (isKnownStoreRatingErrorCode(normalized)) {
    return normalized
  }

  return 'UNKNOWN_ERROR'
}

export function resolveStoreRatingErrorMessage(
  errorCode: string | null | undefined,
  t: StoreTranslate
): string | null {
  const normalized = errorCode?.trim()

  if (!normalized) {
    return null
  }

  if (normalized === 'NOT_AUTHENTICATED' || normalized === 'UNAUTHORIZED') {
    return t('store.rating.loginRequired')
  }

  if (normalized === 'INVALID_RATING') {
    return t('store.rating.invalid')
  }

  if (normalized.startsWith(HTTP_ERROR_PREFIX)) {
    return t('store.rating.httpError')
  }

  return t('store.rating.unavailable')
}
