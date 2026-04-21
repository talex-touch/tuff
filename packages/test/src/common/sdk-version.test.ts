import {
  checkSdkCompatibility,
  CURRENT_SDK_VERSION,
  resolveSdkApiVersion,
  SdkApi,
} from '@talex-touch/utils/plugin'
import { describe, expect, it } from 'vitest'

describe('sdk-version', () => {
  it('treats 260428 as the current supported sdkapi marker', () => {
    expect(CURRENT_SDK_VERSION).toBe(SdkApi.V260428)
    expect(resolveSdkApiVersion(SdkApi.V260428)).toBe(SdkApi.V260428)
    expect(checkSdkCompatibility(SdkApi.V260428, 'touch-dev-utils').warning).toBeUndefined()
  })

  it('falls back unknown markers to the nearest supported baseline', () => {
    const compatibility = checkSdkCompatibility(260421, 'touch-dev-utils')

    expect(compatibility.compatible).toBe(true)
    expect(compatibility.enforcePermissions).toBe(true)
    expect(compatibility.warning).toContain('260421')
    expect(compatibility.warning).toContain(String(SdkApi.V260228))
  })
})
