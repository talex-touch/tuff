import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkSdkCompatibility,
  CURRENT_SDK_VERSION,
  isSupportedSdkVersion,
  resolveSdkApiVersion,
  SdkApi,
} from '@talex-touch/utils/plugin'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
)
const pluginsDir = join(repoRoot, 'plugins')

function readPluginManifests(): Array<{ pluginName: string, sdkapi: unknown }> {
  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap((entry) => {
      const manifestPath = join(pluginsDir, entry.name, 'manifest.json')
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
          sdkapi?: unknown
        }
        return [{ pluginName: entry.name, sdkapi: manifest.sdkapi }]
      }
      catch {
        return []
      }
    })
}

describe('sdk-version', () => {
  it('treats 260713 as current and keeps prior sdkapi markers supported', () => {
    expect(CURRENT_SDK_VERSION).toBe(SdkApi.V260713)
    expect(resolveSdkApiVersion(SdkApi.V260713)).toBe(SdkApi.V260713)
    expect(
      checkSdkCompatibility(SdkApi.V260713, 'touch-intelligence').warning,
    ).toBeUndefined()

    expect(isSupportedSdkVersion(SdkApi.V260626)).toBe(true)
    expect(resolveSdkApiVersion(SdkApi.V260626)).toBe(SdkApi.V260626)
    expect(
      checkSdkCompatibility(SdkApi.V260626, 'touch-intelligence').warning,
    ).toBeUndefined()

    expect(isSupportedSdkVersion(SdkApi.V260615)).toBe(true)
    expect(resolveSdkApiVersion(SdkApi.V260615)).toBe(SdkApi.V260615)
    expect(
      checkSdkCompatibility(SdkApi.V260615, 'touch-intelligence').warning,
    ).toBeUndefined()

    expect(isSupportedSdkVersion(SdkApi.V260428)).toBe(true)
    expect(resolveSdkApiVersion(SdkApi.V260428)).toBe(SdkApi.V260428)
    expect(
      checkSdkCompatibility(SdkApi.V260428, 'touch-dev-utils').warning,
    ).toBeUndefined()
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
    const compatibility = checkSdkCompatibility(260801, 'future-plugin')

    expect(resolveSdkApiVersion(260801)).toBeUndefined()
    expect(compatibility.compatible).toBe(false)
    expect(compatibility.enforcePermissions).toBe(false)
    expect(compatibility.warning).toContain('260801')
  })

  it('keeps bundled plugin manifests on explicitly supported sdkapi markers', () => {
    const manifests = readPluginManifests()
    const unsupported = manifests
      .filter(({ sdkapi }) => !isSupportedSdkVersion(sdkapi))
      .map(({ pluginName, sdkapi }) => `${pluginName}:${String(sdkapi)}`)
    const currentMarkerPlugins = manifests
      .filter(({ sdkapi }) => sdkapi === CURRENT_SDK_VERSION)
      .map(({ pluginName }) => pluginName)
      .sort()

    expect(unsupported).toEqual([])
    expect(currentMarkerPlugins).toEqual(['touch-intelligence'])
  })
})
