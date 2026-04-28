import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkSdkCompatibility,
  CURRENT_SDK_VERSION,
  resolveSdkApiVersion,
  SdkApi,
} from '@talex-touch/utils/plugin'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const pluginsDir = join(repoRoot, 'plugins')

function readPluginManifests(): Array<{ pluginName: string, sdkapi: unknown }> {
  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap((entry) => {
      const manifestPath = join(pluginsDir, entry.name, 'manifest.json')
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { sdkapi?: unknown }
        return [{ pluginName: entry.name, sdkapi: manifest.sdkapi }]
      }
      catch {
        return []
      }
    })
}

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

  it('keeps bundled plugin manifests on the current sdkapi marker', () => {
    const outdated = readPluginManifests()
      .filter(({ sdkapi }) => sdkapi !== CURRENT_SDK_VERSION)
      .map(({ pluginName, sdkapi }) => `${pluginName}:${String(sdkapi)}`)

    expect(outdated).toEqual([])
  })
})
