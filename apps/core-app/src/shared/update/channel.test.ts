import { AppPreviewChannel } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import { normalizeStoredUpdateChannel, normalizeSupportedUpdateChannel } from './channel'

describe('update channel compatibility', () => {
  it('normalizes snapshot and numeric legacy inputs to supported channels', () => {
    expect(normalizeStoredUpdateChannel('SNAPSHOT')).toBe(AppPreviewChannel.BETA)
    expect(normalizeStoredUpdateChannel('snapshot')).toBe(AppPreviewChannel.BETA)
    expect(normalizeStoredUpdateChannel(2)).toBe(AppPreviewChannel.BETA)
    expect(normalizeStoredUpdateChannel('1')).toBe(AppPreviewChannel.BETA)
  })

  it('keeps release and beta values unchanged', () => {
    expect(normalizeStoredUpdateChannel('RELEASE')).toBe(AppPreviewChannel.RELEASE)
    expect(normalizeStoredUpdateChannel('BETA')).toBe(AppPreviewChannel.BETA)
  })

  it('coerces unsupported or empty values to fallback channel', () => {
    expect(normalizeStoredUpdateChannel('nightly-dev')).toBeUndefined()
    expect(normalizeSupportedUpdateChannel(undefined)).toBe(AppPreviewChannel.RELEASE)
    expect(normalizeSupportedUpdateChannel(AppPreviewChannel.SNAPSHOT)).toBe(
      AppPreviewChannel.BETA
    )
  })
})
