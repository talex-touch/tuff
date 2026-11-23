import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { checkSdkCompatibility } from '@talex-touch/utils/plugin'
import {
  resolveIndexedSourceManifestDescriptors,
  resolveSearchProviderManifestDescriptors,
  resolveSearchProviderPermissionIds,
} from '@talex-touch/utils/search'
import { describe, expect, it } from 'vitest'

interface PluginManifest {
  name: string
  sdkapi?: number
  main?: string
  build?: {
    index?: {
      entry?: string
    }
  }
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
  return typeof value === 'string' ? value : (value?.default ?? '')
}

interface LoadedManifest {
  dirName: string
  manifest: PluginManifest
}

interface PluginPackageJson {
  name?: string
}

interface LoadedPluginPackage {
  dirName: string
  packageJson: PluginPackageJson
}
const pluginsRoot = new URL('../../../../plugins/', import.meta.url)
const pluginDocsRoot = new URL('../../../../apps/nexus/content/docs/guide/features/plugins/', import.meta.url)

const EXPECTED_PLUGIN_DOC_GAPS = new Set([
  'clipboard-history',
  'json-formatter',
  'touch-ai-sessions',
  'touch-api-lens',
  'touch-browser-data',
  'touch-calc-pad',
  'touch-color-studio',
  'touch-cron-craft',
  'touch-diagram-sketch',
  'touch-dictation',
  'touch-docs-atlas',
  'touch-emoji-symbols',
  'touch-hosts',
  'touch-image',
  'touch-markdown-craft',
  'touch-music',
  'touch-orca',
  'touch-pomodoro-zen',
  'touch-quickops',
  'touch-regex-lab',
  'touch-snipaste',
  'touch-snippets',
  'touch-svg-craft',
  'touch-text-tools',
  'touch-totp-vault',
  'touch-vscode-projects',
  'touch-world-time',
])

function loadOfficialManifests(): LoadedManifest[] {
  return readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => {
      if (!entry.isDirectory()) {
        return false
      }
      return existsSync(join(pluginsRoot.pathname, entry.name, 'manifest.json'))
    })
    .map((entry) => {
      const manifestPath = join(pluginsRoot.pathname, entry.name, 'manifest.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginManifest
      return {
        dirName: entry.name,
        manifest,
      }
    })
    .sort((a, b) => a.dirName.localeCompare(b.dirName))
}

function loadOfficialPluginPackages(): LoadedPluginPackage[] {
  return readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => {
      if (!entry.isDirectory()) {
        return false
      }
      return existsSync(join(pluginsRoot.pathname, entry.name, 'package.json'))
    })
    .map((entry) => {
      const packagePath = join(pluginsRoot.pathname, entry.name, 'package.json')
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as PluginPackageJson
      return {
        dirName: entry.name,
        packageJson,
      }
    })
    .sort((a, b) => a.dirName.localeCompare(b.dirName))
}

function declaredPermissionIds(manifest: PluginManifest): string[] {
  return [...(manifest.permissions?.required ?? []), ...(manifest.permissions?.optional ?? [])]
}

function pushFeatureIds(manifest: PluginManifest): string[] {
  return (manifest.features ?? []).filter(feature => feature.push === true).map(feature => feature.id)
}

function pluginDocSlug(dirName: string): string {
  return dirName.startsWith('touch-') ? dirName.slice('touch-'.length) : dirName
}

function hasLocalizedPluginDocs(dirName: string): boolean {
  const slug = pluginDocSlug(dirName)
  return (
    existsSync(join(pluginDocsRoot.pathname, `${slug}.zh.mdc`))
    && existsSync(join(pluginDocsRoot.pathname, `${slug}.en.mdc`))
  )
}

describe('official plugin manifest trust boundary', () => {
  const manifests = loadOfficialManifests()
  const pluginPackages = loadOfficialPluginPackages()

  it('keeps every package-backed plugin on the official npm package-name convention', () => {
    expect(pluginPackages.length).toBeGreaterThan(0)

    for (const { dirName, packageJson } of pluginPackages) {
      expect(packageJson.name, `${dirName} package name`).toBe(`@talex-touch/${dirName}-plugin`)
    }
  })

  it('keeps every repository plugin on an explicitly supported sdkapi marker', () => {
    expect(manifests.length).toBeGreaterThan(0)

    for (const { dirName, manifest } of manifests) {
      const compatibility = checkSdkCompatibility(manifest.sdkapi, manifest.name)

      expect(manifest.name, `${dirName} manifest name`).toBe(basename(dirName))
      expect(compatibility, `${manifest.name} sdkapi compatibility`).toMatchObject({
        compatible: true,
        enforcePermissions: true,
      })
    }
  })

  it('keeps repository plugin Prelude ownership unambiguous', () => {
    for (const { manifest } of manifests) {
      const hasMain = typeof manifest.main === 'string' && manifest.main.trim().length > 0
      const buildIndexEntry = manifest.build?.index?.entry
      const hasBuildIndex = typeof buildIndexEntry === 'string' && buildIndexEntry.trim().length > 0

      expect(hasMain && hasBuildIndex, `${manifest.name} declares both Prelude owners`).toBe(false)
      if (hasBuildIndex) {
        expect(buildIndexEntry, `${manifest.name} build source must not be packaged index.js`).not.toBe('index.js')
      }
    }
  })

  it('keeps official plugin docs coverage gaps explicit', () => {
    const actualGaps = manifests.filter(({ dirName }) => !hasLocalizedPluginDocs(dirName)).map(({ dirName }) => dirName)

    expect(actualGaps).toEqual([...EXPECTED_PLUGIN_DOC_GAPS].sort())
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
      expect(
        providerResolution.derivedFromPushFeatures,
        `${manifest.name} must not use legacy provider derivation`,
      ).toBe(false)
      expect(providerResolution.descriptors.length, `${manifest.name} provider count`).toBeGreaterThanOrEqual(
        pushIds.length,
      )

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

    // This list is a review gate, so the four additions are spelled out rather than
    // folded in silently. All four are touch-intelligence surfaces, added in 7faea27bf
    // and 66ef800b6 alongside intelligence-ask, which was already here:
    //
    //   intelligence-command-registry, intelligence-explain,
    //   intelligence-rewrite, intelligence-summarize
    //
    // Full-height is plausible for AI answer panels, but that is a judgement the diff
    // should carry, not something the test should absorb quietly.
    //
    // touch-browser-open:browser-open-settings is the plugin's settings surface: a form
    // that manages engines, hot-search entries and the default engine, which needs the
    // full-height view to be usable rather than a squeezed panel.
    // touch-music:touch-music is the full-height Vue music player surface migrated from
    // legacy init.json onto manifest.json (sdkapi 261011).
    expect(fullHeightSurfaces.sort()).toEqual([
      'clipboard-history:clipboard-history',
      'json-formatter:json-formatter-format',
      'touch-browser-open:browser-open-settings',
      'touch-intelligence:intelligence-ask',
      'touch-intelligence:intelligence-command-registry',
      'touch-intelligence:intelligence-explain',
      'touch-intelligence:intelligence-rewrite',
      'touch-intelligence:intelligence-summarize',
      'touch-music:touch-music',
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
      // Declared optional, not required: the surface opens a copied link in the browser and
      // reveals a copied file in the file manager. Both go through the host's own shell
      // handlers, which carry this same permission — a plugin surface must not be the cheaper
      // route to a shell than the Prelude's `open-url` capability. A denial is a normal
      // outcome here and degrades to the clipboard.
      'clipboard-history',
      'touch-browser-open',
      'touch-hosts',
      'touch-quick-actions',
      'touch-snipaste',
      'touch-system-actions',
      'touch-vscode-projects',
      'touch-window-manager',
      'touch-window-presets',
      'touch-workspace-scripts',
    ])

    for (const { manifest } of manifests.filter(({ manifest }) =>
      declaredPermissionIds(manifest).includes('system.shell'),
    )) {
      const declaredPermissions = declaredPermissionIds(manifest)
      expect(
        defaultManifestText(manifest.permissionReasons?.['system.shell']).trim(),
        `${manifest.name} shell reason`,
      ).toBeTruthy()

      for (const provider of manifest.searchProviders ?? []) {
        const permissionScopes = provider.permissionScopes as Parameters<typeof resolveSearchProviderPermissionIds>[0]
        expect(permissionScopes, `${manifest.name}/${String(provider.id)} root-results scope`).toContain('root-results')

        for (const permissionId of resolveSearchProviderPermissionIds(permissionScopes)) {
          expect(declaredPermissions, `${manifest.name}/${String(provider.id)} declared ${permissionId}`).toContain(
            permissionId,
          )
        }
      }
    }
  })

  it('keeps indexed source declarations permission-gated and metadata-only at manifest level', () => {
    const manifestsWithIndexedSources = manifests.filter(({ manifest }) => (manifest.indexedSources ?? []).length > 0)

    expect(manifestsWithIndexedSources.map(({ manifest }) => manifest.name)).toEqual([
      'touch-browser-data',
      'touch-vscode-projects',
    ])

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

      if (manifest.name === 'touch-browser-data') {
        // Two sources now, not one. browser-history was added alongside bookmarks; both are
        // asserted so a third cannot arrive without this list moving.
        expect(indexedSourceResolution.descriptors.map(descriptor => descriptor.id)).toEqual([
          'browser-bookmarks',
          'browser-history',
        ])

        // The gate that matters is the same for both: disabled until the user consents, and
        // scoped to browser-data plus file-system. The manifest declares only an id -- the
        // policy comes from the resolver, which is what "metadata-only at manifest level"
        // means here.
        for (const descriptor of indexedSourceResolution.descriptors) {
          expect(descriptor.admission, `${descriptor.id} admission`).toMatchObject({
            owner: 'official-plugin',
            permissionScopes: ['browser-data', 'file-system'],
            defaultState: 'disabled',
            requiresUserConsent: true,
          })
        }

        // Where they differ, and why it is worth pinning: browser-history is neither
        // clearable nor rebuildable because it has no CoreApp indexed-source runtime handler
        // yet -- its own note says so. That asymmetry is a real gap rather than a setting,
        // so the test states it instead of letting both look alike.
        const byId = new Map(indexedSourceResolution.descriptors.map(d => [d.id, d]))
        expect(byId.get('browser-bookmarks')?.admission).toMatchObject({
          clearable: true,
          rebuildable: true,
        })
        expect(byId.get('browser-history')?.admission).toMatchObject({
          clearable: false,
          rebuildable: false,
        })
      }
      else if (manifest.name === 'touch-vscode-projects') {
        expect(indexedSourceResolution.descriptors.map(descriptor => descriptor.id)).toEqual([
          'vscode-projects',
        ])
        expect(indexedSourceResolution.descriptors[0]?.admission).toMatchObject({
          owner: 'official-plugin',
          permissionScopes: ['file-system'],
          defaultState: 'disabled',
          requiresUserConsent: true,
          clearable: true,
          rebuildable: true,
        })
      }
    }
  })
})
