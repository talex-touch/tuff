import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkSdkCompatibility,
  CURRENT_SDK_VERSION,
  isSupportedSdkVersion,
} from '@talex-touch/utils/plugin'
import {
  resolveIndexedSourceManifestDescriptors,
  resolveSearchProviderManifestDescriptors,
  resolveSearchProviderPermissionIds,
} from '@talex-touch/utils/search'
import { describe, expect, it } from 'vitest'

interface PluginManifest {
  name: string
  sdkapi?: number
  permissions?: {
    required?: string[]
    optional?: string[]
  }
  permissionReasons?: Record<string, string | { default: string }>
  features?: Array<{
    id: string
    push?: boolean
  }>
  searchProviders?: Array<Record<string, unknown>>
  indexedSources?: Array<Record<string, unknown>>
}

function defaultManifestText(value: string | { default: string } | undefined): string {
  return typeof value === 'string' ? value : value?.default ?? ''
}

interface LoadedManifest {
  dirName: string
  manifest: PluginManifest
}

const pluginsRoot = fileURLToPath(new URL('../../../../plugins/', import.meta.url))

function loadOfficialManifests(): LoadedManifest[] {
  return readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => {
      if (!entry.isDirectory()) {
        return false
      }
      return existsSync(join(pluginsRoot, entry.name, 'manifest.json'))
    })
    .map((entry) => {
      const manifestPath = join(pluginsRoot, entry.name, 'manifest.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginManifest
      return {
        dirName: entry.name,
        manifest,
      }
    })
    .sort((a, b) => a.dirName.localeCompare(b.dirName))
}

function declaredPermissionIds(manifest: PluginManifest): string[] {
  return [
    ...(manifest.permissions?.required ?? []),
    ...(manifest.permissions?.optional ?? []),
  ]
}

function pushFeatureIds(manifest: PluginManifest): string[] {
  return (manifest.features ?? [])
    .filter(feature => feature.push === true)
    .map(feature => feature.id)
}

describe('official plugin manifest trust boundary', () => {
  const manifests = loadOfficialManifests()

  it('keeps every repository plugin on an explicitly supported sdkapi marker', () => {
    expect(manifests.length).toBeGreaterThan(0)

    for (const { dirName, manifest } of manifests) {
      const compatibility = checkSdkCompatibility(manifest.sdkapi, manifest.name)

      expect(manifest.name, `${dirName} manifest name`).toBe(basename(dirName))
      expect(compatibility, `${manifest.name} sdkapi compatibility`).toMatchObject({
        compatible: true,
        enforcePermissions: true,
      })
      expect(isSupportedSdkVersion(manifest.sdkapi!), `${manifest.name} sdkapi allowlist`).toBe(true)
    }
  })

  it('keeps repository plugins off the newest SDK marker until runtime migration expands', () => {
    const currentMarkerPlugins = manifests
      .filter(({ manifest }) => manifest.sdkapi === CURRENT_SDK_VERSION)
      .map(({ manifest }) => manifest.name)

    expect(currentMarkerPlugins).toEqual([])
  })

  it('requires a permission reason for every declared plugin permission', () => {
    for (const { manifest } of manifests) {
      for (const permissionId of declaredPermissionIds(manifest)) {
        expect(
          defaultManifestText(manifest.permissionReasons?.[permissionId]).trim(),
          `${manifest.name} permission reason for ${permissionId}`,
        ).toBeTruthy()
      }
    }
  })

  it('keeps push features behind explicit root-result provider declarations', () => {
    for (const { manifest } of manifests) {
      const pushIds = pushFeatureIds(manifest)

      if (pushIds.length === 0) {
        expect(manifest.searchProviders ?? [], `${manifest.name} should not expose empty providers`).toEqual([])
        continue
      }

      const declaredPermissions = declaredPermissionIds(manifest)
      expect(declaredPermissions, `${manifest.name} root-results permission`).toContain('search.root-results')

      const providerResolution = resolveSearchProviderManifestDescriptors({
        manifestProviders: manifest.searchProviders,
        features: manifest.features,
        defaults: {
          pluginName: manifest.name,
          owner: 'official-plugin',
        },
        declaredPermissionIds: declaredPermissions,
      })

      expect(providerResolution.issues, `${manifest.name} search provider issues`).toEqual([])
      expect(providerResolution.derivedFromPushFeatures, `${manifest.name} must not use legacy provider derivation`).toBe(false)
      expect(providerResolution.descriptors.length, `${manifest.name} provider count`).toBeGreaterThanOrEqual(pushIds.length)

      for (const provider of providerResolution.descriptors) {
        expect(provider.policy.owner, `${manifest.name}/${provider.id} owner`).toBe('official-plugin')
        expect(provider.policy.permissionScopes, `${manifest.name}/${provider.id} root scope`).toContain('root-results')
        expect(provider.policy.defaultState, `${manifest.name}/${provider.id} default state`).toBe('ask')
        expect(provider.policy.requiresUserConsent, `${manifest.name}/${provider.id} consent`).toBe(true)
        expect(provider.policy.pushesToRootResults, `${manifest.name}/${provider.id} root push`).toBe(true)
      }
    }
  })

  it('keeps full-height plugin surfaces on the explicit forceMax contract', () => {
    const fullHeightSurfaces = manifests.flatMap(({ manifest }) =>
      (manifest.features ?? [])
        .filter(feature => feature.interaction?.forceMax === true)
        .map(feature => `${manifest.name}:${feature.id}`),
    )

    expect(fullHeightSurfaces.sort()).toEqual([
      'clipboard-history:clipboard-history',
      'touch-intelligence:intelligence-ask',
      'touch-intelligence:quick-review',
      'touch-translation:screenshot-translate',
      'touch-translation:touch-translate',
    ])
  })

  it('keeps high-risk capability plugins permission declared without widening provider scopes', () => {
    const shellPlugins = manifests
      .filter(({ manifest }) => declaredPermissionIds(manifest).includes('system.shell'))
      .map(({ manifest }) => manifest.name)
      .sort()

    expect(shellPlugins).toEqual([
      'touch-browser-open',
      'touch-quick-actions',
      'touch-snipaste',
      'touch-system-actions',
      'touch-window-manager',
      'touch-window-presets',
      'touch-workspace-scripts',
    ])

    for (const { manifest } of manifests.filter(({ manifest }) => declaredPermissionIds(manifest).includes('system.shell'))) {
      const declaredPermissions = declaredPermissionIds(manifest)
      expect(defaultManifestText(manifest.permissionReasons?.['system.shell']).trim(), `${manifest.name} shell reason`).toBeTruthy()

      for (const provider of manifest.searchProviders ?? []) {
        const permissionScopes = provider.permissionScopes as Parameters<typeof resolveSearchProviderPermissionIds>[0]
        expect(permissionScopes, `${manifest.name}/${String(provider.id)} root-results scope`).toContain('root-results')

        for (const permissionId of resolveSearchProviderPermissionIds(permissionScopes)) {
          expect(declaredPermissions, `${manifest.name}/${String(provider.id)} declared ${permissionId}`).toContain(permissionId)
        }
      }
    }
  })

  it('keeps indexed source declarations permission-gated and metadata-only at manifest level', () => {
    const manifestsWithIndexedSources = manifests.filter(({ manifest }) => (manifest.indexedSources ?? []).length > 0)

    expect(manifestsWithIndexedSources.map(({ manifest }) => manifest.name)).toEqual(['touch-browser-data'])

    for (const { manifest } of manifestsWithIndexedSources) {
      const indexedSourceResolution = resolveIndexedSourceManifestDescriptors({
        manifestSources: manifest.indexedSources,
        defaults: {
          pluginName: manifest.name,
          owner: 'official-plugin',
        },
        declaredPermissionIds: declaredPermissionIds(manifest),
      })

      expect(indexedSourceResolution.issues, `${manifest.name} indexed source issues`).toEqual([])
      expect(indexedSourceResolution.descriptors).toHaveLength(2)
      expect(indexedSourceResolution.descriptors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'browser-bookmarks',
            admission: expect.objectContaining({
              owner: 'official-plugin',
              permissionScopes: ['browser-data', 'file-system'],
              defaultState: 'disabled',
              requiresUserConsent: true,
            }),
          }),
          expect.objectContaining({
            id: 'browser-history',
            storage: 'ephemeral',
            admission: expect.objectContaining({
              defaultState: 'disabled',
              requiresUserConsent: true,
            }),
          }),
        ]),
      )
    }
  })
})
