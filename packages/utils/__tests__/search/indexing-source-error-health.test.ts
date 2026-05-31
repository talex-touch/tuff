import { describe, expect, it } from 'vitest'
import { buildIndexedSourceErrorHealth, getIndexedSourceErrorMessage } from '../../search'

describe('indexed source error health', () => {
  it('builds default error health from an Error', () => {
    expect(buildIndexedSourceErrorHealth(new Error('health failed'))).toEqual({
      status: 'error',
      permissionState: 'not-required',
      itemCount: 0,
      watchState: 'unavailable',
      reconcileState: 'failed',
      reason: undefined,
      lastError: 'health failed'
    })
  })

  it('stringifies non-error values', () => {
    expect(getIndexedSourceErrorMessage('failed')).toBe('failed')
    expect(getIndexedSourceErrorMessage(null)).toBe('unknown')
  })

  it('allows source-specific health context', () => {
    expect(
      buildIndexedSourceErrorHealth(new Error('permission probe failed'), {
        permissionState: 'promptable',
        watchState: 'pending-permission',
        reconcileState: 'scheduled',
        reason: 'permission-check-failed'
      })
    ).toEqual({
      status: 'error',
      permissionState: 'promptable',
      itemCount: 0,
      watchState: 'pending-permission',
      reconcileState: 'scheduled',
      reason: 'permission-check-failed',
      lastError: 'permission probe failed'
    })
  })
})
