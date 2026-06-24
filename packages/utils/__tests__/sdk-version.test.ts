import { describe, expect, it } from 'vitest'
import {
  CURRENT_SDK_VERSION,
  SdkApi,
  SUPPORTED_SDK_VERSIONS,
  checkSdkCompatibility,
  formatSdkVersion,
  isSupportedSdkVersion,
  resolveSdkApiVersion,
} from '../plugin'

describe('sdk version markers', () => {
  it('uses 260626 as the current supported sdkapi marker', () => {
    expect(CURRENT_SDK_VERSION).toBe(SdkApi.V260626)
    expect(SUPPORTED_SDK_VERSIONS[0]).toBe(SdkApi.V260626)
    expect(formatSdkVersion(CURRENT_SDK_VERSION)).toBe('26.06.26')
  })

  it('accepts 260626 without adding a new runtime gate', () => {
    expect(isSupportedSdkVersion(SdkApi.V260626)).toBe(true)
    expect(resolveSdkApiVersion(260626)).toBe(SdkApi.V260626)
    expect(checkSdkCompatibility(260626, 'touch-new-plugin')).toEqual({
      compatible: true,
      enforcePermissions: true,
    })
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
