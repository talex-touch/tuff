import {
  checkSdkCompatibility,
  isSupportedSdkVersion,
  resolveSdkApiVersion,
  SdkApi,
} from '@talex-touch/utils/plugin'
import { describe, expect, it } from 'vitest'

describe('sdk-version', () => {
  it('accepts 261001 and keeps prior sdkapi markers supported', () => {
    for (const version of [
      SdkApi.V261001,
      SdkApi.V260817,
      SdkApi.V260713,
      SdkApi.V260626,
      SdkApi.V260615,
      SdkApi.V260428,
    ]) {
      expect(isSupportedSdkVersion(version)).toBe(true)
      expect(resolveSdkApiVersion(version)).toBe(version)
      expect(checkSdkCompatibility(version, 'touch-existing-plugin')).toMatchObject({
        compatible: true,
        enforcePermissions: true,
      })
    }
  })

  it('blocks unknown sdkapi markers instead of normalizing them', () => {
    const compatibility = checkSdkCompatibility(260421, 'touch-dev-utils')

    expect(resolveSdkApiVersion(260421)).toBeUndefined()
    expect(compatibility.compatible).toBe(false)
    expect(compatibility.enforcePermissions).toBe(false)
    expect(compatibility.warning).toContain('260421')
    expect(compatibility.warning).toContain('not a supported SDK marker')
  })

  it('blocks future sdkapi markers until the runtime explicitly supports them', () => {
    const compatibility = checkSdkCompatibility(261002, 'future-plugin')

    expect(resolveSdkApiVersion(261002)).toBeUndefined()
    expect(compatibility.compatible).toBe(false)
    expect(compatibility.enforcePermissions).toBe(false)
    expect(compatibility.warning).toContain('261002')
  })
})
