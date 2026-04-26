import { describe, expect, it } from 'vitest'
import {
  normalizeStoreRatingError,
  resolveStoreRatingErrorMessage
} from './store-rating-error-utils'

function translate(key: string, params?: unknown): string {
  return `${key}:${JSON.stringify(params ?? null)}`
}

describe('store-rating-error-utils', () => {
  it('preserves known rating error codes', () => {
    expect(normalizeStoreRatingError('NOT_AUTHENTICATED')).toBe('NOT_AUTHENTICATED')
    expect(normalizeStoreRatingError('HTTP_ERROR_503')).toBe('HTTP_ERROR_503')
    expect(normalizeStoreRatingError('UNKNOWN_ERROR')).toBe('UNKNOWN_ERROR')
  })

  it('collapses unexpected runtime messages to UNKNOWN_ERROR', () => {
    expect(normalizeStoreRatingError(new Error('Failed to fetch'))).toBe('UNKNOWN_ERROR')
    expect(normalizeStoreRatingError('Network Error')).toBe('UNKNOWN_ERROR')
    expect(normalizeStoreRatingError(null)).toBe('UNKNOWN_ERROR')
  })

  it('maps rating errors to translated user-facing copy', () => {
    expect(resolveStoreRatingErrorMessage('NOT_AUTHENTICATED', translate)).toBe(
      'store.rating.loginRequired:null'
    )
    expect(resolveStoreRatingErrorMessage('INVALID_RATING', translate)).toBe(
      'store.rating.invalid:null'
    )
    expect(resolveStoreRatingErrorMessage('HTTP_ERROR_500', translate)).toBe(
      'store.rating.httpError:null'
    )
    expect(resolveStoreRatingErrorMessage('UNKNOWN_ERROR', translate)).toBe(
      'store.rating.unavailable:null'
    )
  })
})
