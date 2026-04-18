import { AppPreviewChannel } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import { normalizeStoredUpdateChannel, normalizeSupportedUpdateChannel } from './channel'

describe('update channel compatibility', () => {
  it('accepts only canonical stored channel values', () => {
    expect(normalizeStoredUpdateChannel('RELEASE')).toBe(AppPreviewChannel.RELEASE)
    expect(normalizeStoredUpdateChannel('BETA')).toBe(AppPreviewChannel.BETA)
    expect(normalizeStoredUpdateChannel('SNAPSHOT')).toBe(AppPreviewChannel.SNAPSHOT)
    expect(normalizeStoredUpdateChannel('snapshot')).toBe(AppPreviewChannel.SNAPSHOT)
  })

  it('drops legacy aliases and unsupported values to fallback channel', () => {
    expect(normalizeStoredUpdateChannel(2)).toBeUndefined()
    expect(normalizeStoredUpdateChannel('1')).toBeUndefined()
    expect(normalizeStoredUpdateChannel('alpha')).toBeUndefined()
    expect(normalizeStoredUpdateChannel('master')).toBeUndefined()
    expect(normalizeStoredUpdateChannel('nightly-dev')).toBeUndefined()
    expect(normalizeSupportedUpdateChannel(undefined)).toBe(AppPreviewChannel.RELEASE)
    expect(normalizeSupportedUpdateChannel(AppPreviewChannel.SNAPSHOT)).toBe(AppPreviewChannel.BETA)
  })
})
