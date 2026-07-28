import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PLUGIN_RUNTIME_COMPATIBLE_OFFICIAL_PRELUDES,
  shouldInstallPluginRuntimeServiceByDefault
} from './plugin-runtime-rollout'

const workspaceRoot = path.resolve(__dirname, '../../../../../..')
const pluginsRoot = path.join(workspaceRoot, 'plugins')

const EXPECTED_UNMIGRATED = Object.freeze({
  'touch-browser-data': 'top-level require',
  'touch-browser-open': 'top-level require',
  'touch-intelligence': 'top-level require',
  'touch-quick-actions': 'top-level require',
  'touch-snipaste': 'top-level require',
  'touch-system-actions': 'top-level require',
  'touch-translation': 'top-level require',
  'touch-window-manager': 'top-level require',
  'touch-window-presets': 'top-level require',
  'touch-workspace-scripts': 'top-level require'
})

interface OfficialManifest {
  build?: { index?: { entry?: unknown } }
  main?: unknown
  name?: unknown
  permissions?: { required?: unknown; optional?: unknown }
}

function readOfficialManifests(): Map<string, OfficialManifest> {
  return new Map(
    fs
      .readdirSync(pluginsRoot)
      .flatMap((directory) => {
        const manifestPath = path.join(pluginsRoot, directory, 'manifest.json')
        if (!fs.existsSync(manifestPath)) return []
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as OfficialManifest
        return typeof manifest.name === 'string' ? [[manifest.name, manifest] as const] : []
      })
      .sort(([left], [right]) => left.localeCompare(right))
  )
}

function officialManifestNames(): string[] {
  return [...readOfficialManifests().keys()]
}

describe('plugin runtime production rollout gate', () => {
  it('computes the disabled default from all 22 manifested official activations', () => {
    const official = officialManifestNames()
    const compatible = new Set<string>(PLUGIN_RUNTIME_COMPATIBLE_OFFICIAL_PRELUDES)
    const unmigrated = official.filter((name) => !compatible.has(name))

    expect(official).toHaveLength(22)
    expect(PLUGIN_RUNTIME_COMPATIBLE_OFFICIAL_PRELUDES).toEqual([
      'clipboard-history',
      'touch-batch-rename',
      'touch-browser-bookmarks',
      'touch-code-snippets',
      'touch-dev-toolbox',
      'touch-dev-utils',
      'touch-dictation',
      'touch-emoji-symbols',
      'touch-quickops',
      'touch-snippets',
      'touch-text-snippets',
      'touch-text-tools'
    ])
    expect(unmigrated).toEqual(Object.keys(EXPECTED_UNMIGRATED).sort())
    expect(unmigrated).toHaveLength(10)
    expect(shouldInstallPluginRuntimeServiceByDefault()).toBe(unmigrated.length === 0)
  })

  it('excludes the two manifestless Surface directories from activation success', () => {
    const official = new Set(officialManifestNames())
    for (const name of ['touch-image', 'touch-music']) {
      expect(fs.existsSync(path.join(pluginsRoot, name))).toBe(true)
      expect(fs.existsSync(path.join(pluginsRoot, name, 'manifest.json'))).toBe(false)
      expect(official.has(name)).toBe(false)
    }
    expect(fs.existsSync(path.join(pluginsRoot, 'touch-music', 'preload.js'))).toBe(true)
  })

  it('requires clipboard-history canonical build input and declared root scripts for Batch A', () => {
    const manifests = readOfficialManifests()
    const clipboardManifest = manifests.get('clipboard-history')
    expect(clipboardManifest?.main).toBeUndefined()
    expect(clipboardManifest?.build?.index?.entry).toBe('index/main.ts')
    expect(
      fs.readFileSync(path.join(pluginsRoot, 'clipboard-history', 'index', 'main.ts'), 'utf8')
    ).toBe(
      ';(globalThis as unknown as { module: { exports: Record<string, never> } }).module.exports = {}\n'
    )

    for (const name of [
      'touch-batch-rename',
      'touch-browser-bookmarks',
      'touch-code-snippets',
      'touch-dev-toolbox',
      'touch-dev-utils',
      'touch-dictation',
      'touch-emoji-symbols',
      'touch-quickops',
      'touch-snippets',
      'touch-text-snippets',
      'touch-text-tools'
    ]) {
      expect(manifests.get(name)?.main).toBe('index.js')
      expect(fs.existsSync(path.join(pluginsRoot, name, 'index.js'))).toBe(true)
    }
  })

  it('keeps migrated scripts free of child-side privileged or test-only surfaces', () => {
    const forbidden = [
      /\b__test\b/,
      /\bfetch\s*\(/,
      /(?:^|[^.\w])process\s*(?:\.|\[)/m,
      /\btypeof\s+process\b/,
      /\brequire\s*\(/,
      /\bnode:(?:fs(?:\/promises)?|child_process|sqlite|worker_threads)\b/,
      /\belectron\b/
    ]
    for (const name of PLUGIN_RUNTIME_COMPATIBLE_OFFICIAL_PRELUDES) {
      const sourcePath =
        name === 'clipboard-history'
          ? path.join(pluginsRoot, name, 'index', 'main.ts')
          : path.join(pluginsRoot, name, 'index.js')
      const source = fs.readFileSync(sourcePath, 'utf8')
      for (const pattern of forbidden) expect(source).not.toMatch(pattern)
    }
  })

  it('declares every capability permission used by compatible Preludes', () => {
    const manifests = readOfficialManifests()
    for (const name of [
      'touch-batch-rename',
      'touch-browser-bookmarks',
      'touch-dev-toolbox',
      'touch-snippets'
    ]) {
      const permissions = manifests.get(name)?.permissions
      const declared = [
        ...(Array.isArray(permissions?.required) ? permissions.required : []),
        ...(Array.isArray(permissions?.optional) ? permissions.optional : [])
      ]
      expect(declared, `${name} must explicitly declare storage.plugin`).toContain('storage.plugin')
    }

    const snippets = manifests.get('touch-snippets')?.permissions
    const snippetPermissions = [
      ...(Array.isArray(snippets?.required) ? snippets.required : []),
      ...(Array.isArray(snippets?.optional) ? snippets.optional : [])
    ]
    expect(snippetPermissions).toContain('network.internet')

    const quickOps = manifests.get('touch-quickops')?.permissions
    const quickOpsPermissions = [
      ...(Array.isArray(quickOps?.required) ? quickOps.required : []),
      ...(Array.isArray(quickOps?.optional) ? quickOps.optional : [])
    ]
    expect(quickOpsPermissions).toContain('storage.shared')

    const dictation = manifests.get('touch-dictation')?.permissions
    const dictationPermissions = [
      ...(Array.isArray(dictation?.required) ? dictation.required : []),
      ...(Array.isArray(dictation?.optional) ? dictation.optional : [])
    ]
    expect(dictationPermissions).toEqual(
      expect.arrayContaining([
        'voice.dictation',
        'search.root-results',
        'clipboard.read',
        'clipboard.write'
      ])
    )
  })

  it('keeps every current top-level require plugin in the explicit failure inventory', () => {
    const manifests = readOfficialManifests()
    const requirePlugins = [...manifests].flatMap(([name, manifest]) => {
      if (typeof manifest.main !== 'string') return []
      const source = fs.readFileSync(path.join(pluginsRoot, name, manifest.main), 'utf8')
      return /\brequire\s*\(/.test(source) ? [name] : []
    })

    expect(requirePlugins.sort()).toEqual(
      Object.entries(EXPECTED_UNMIGRATED)
        .filter(([, reason]) => reason === 'top-level require')
        .map(([name]) => name)
        .sort()
    )
  })
})
