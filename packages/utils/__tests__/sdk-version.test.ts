import { describe, expect, it } from 'vitest'
import {
  SdkApi,
  checkSdkCompatibility,
  isSupportedSdkVersion,
  resolveSdkApiVersion,
} from '../plugin'

describe('sdk version markers', () => {
  it('accepts the 261001 marker with permission enforcement', () => {
    expect(isSupportedSdkVersion(SdkApi.V261001)).toBe(true)
    expect(resolveSdkApiVersion(261001)).toBe(SdkApi.V261001)
    expect(checkSdkCompatibility(261001, 'touch-current-plugin')).toEqual({
      compatible: true,
      enforcePermissions: true,
    })
  })

  it('keeps prior supported markers compatible', () => {
    for (const version of [SdkApi.V260817, SdkApi.V260713]) {
      expect(isSupportedSdkVersion(version)).toBe(true)
      expect(resolveSdkApiVersion(version)).toBe(version)
      expect(checkSdkCompatibility(version, 'touch-existing-plugin')).toEqual({
        compatible: true,
        enforcePermissions: true,
      })
    }
  })

  it('keeps non-canonical historical markers blocked', () => {
    expect(isSupportedSdkVersion(260421)).toBe(false)
    expect(resolveSdkApiVersion(260421)).toBeUndefined()
    expect(checkSdkCompatibility(260421, 'touch-old-dev')).toMatchObject({
      compatible: false,
      enforcePermissions: false,
    })
  })
})
