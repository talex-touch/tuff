import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  collectPackagedRuntimeModuleEntries,
  collectResourceModuleClosure,
  getPackagedRuntimeRootModules,
  getPlatformRuntimeRootModules,
  requiredNativeAddonNames,
  syncMissingPackagedRuntimeModules
} = require('./runtime-modules.js') as {
  collectPackagedRuntimeModuleEntries: (
    requiredModules?: readonly (string | { name: string; location?: string })[],
    options?: Record<string, unknown>
  ) => Array<{ name: string; pkgJson: { name?: string; version?: string } }>
  collectResourceModuleClosure: () => string[]
  getPackagedRuntimeRootModules: () => string[]
  getPlatformRuntimeRootModules: (platform: string, architecture: string) => string[]
  requiredNativeAddonNames: (target: string) => string[]
  syncMissingPackagedRuntimeModules: (
    searchRoot: string,
    options?: Record<string, unknown>
  ) => string[]
}

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true })
  }
})

describe('runtime module resource projection', () => {
  it('projects the native Everything package into Resources', () => {
    expect(collectResourceModuleClosure()).toContain('@talex-touch/tuff-native')
  })

  it('requires chokidar-fsevents in packaged runtime roots across all platforms', () => {
    expect(getPackagedRuntimeRootModules()).toEqual(
      expect.arrayContaining(['chokidar', 'chokidar-fsevents'])
    )

    for (const [platform, arch] of [
      ['mac', 'arm64'],
      ['darwin', 'arm64'],
      ['win', 'x64'],
      ['win32', 'x64'],
      ['linux', 'x64']
    ] as const) {
      const modules = getPlatformRuntimeRootModules(platform, arch)
      expect(modules).toContain('chokidar')
      expect(modules).toContain('chokidar-fsevents')
      expect(modules).toContain('@talex-touch/tuff-native')
      expect(modules.every((moduleName) => typeof moduleName === 'string')).toBe(true)
    }
  })

  it('resolves the aliased chokidar-fsevents package alongside chokidar in packaged entries', () => {
    const entries = collectPackagedRuntimeModuleEntries(['chokidar', 'chokidar-fsevents'])
    const chokidarEntry = entries.find((entry) => entry.name === 'chokidar')
    const fseventsEntry = entries.find((entry) => entry.name === 'chokidar-fsevents')

    expect(chokidarEntry?.pkgJson.name).toBe('chokidar')
    expect(fseventsEntry?.pkgJson.name).toBe('chokidar')
    expect(fseventsEntry?.pkgJson.version).toBe('3.6.0')
  })

  it('syncs missing chokidar-fsevents into packaged resources when dropped from app.asar', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tuff-runtime-chokidar-fsevents-'))
    tempRoots.push(root)

    const projectRoot = path.join(root, 'apps', 'core-app')
    const targetNodeModules = path.join(projectRoot, 'node_modules')
    const workspaceNodeModules = path.join(root, 'node_modules')
    const appOutDir = path.join(root, 'dist', 'win-unpacked')
    const resourcesDir = path.join(appOutDir, 'resources')
    const asarSource = path.join(root, 'asar-src')

    mkdirSync(path.join(targetNodeModules, 'chokidar'), { recursive: true })
    mkdirSync(path.join(targetNodeModules, 'chokidar-fsevents'), { recursive: true })
    mkdirSync(workspaceNodeModules, { recursive: true })
    mkdirSync(path.join(asarSource, 'node_modules', 'chokidar'), { recursive: true })
    mkdirSync(resourcesDir, { recursive: true })

    writeFileSync(
      path.join(targetNodeModules, 'chokidar', 'package.json'),
      JSON.stringify({ name: 'chokidar', version: '4.0.3' })
    )
    writeFileSync(
      path.join(targetNodeModules, 'chokidar-fsevents', 'package.json'),
      JSON.stringify({ name: 'chokidar', version: '3.6.0' })
    )
    writeFileSync(
      path.join(targetNodeModules, 'chokidar-fsevents', 'index.js'),
      'module.exports = {}\n'
    )
    writeFileSync(
      path.join(asarSource, 'node_modules', 'chokidar', 'package.json'),
      JSON.stringify({ name: 'chokidar', version: '4.0.3' })
    )
    writeFileSync(path.join(asarSource, 'package.json'), JSON.stringify({ name: 'tuff-test-app' }))

    const { createPackage: createAsarPackage } = require('@electron/asar') as {
      createPackage: (src: string, dest: string) => Promise<void>
    }
    await createAsarPackage(asarSource, path.join(resourcesDir, 'app.asar'))

    const synced = syncMissingPackagedRuntimeModules(appOutDir, {
      projectRoot,
      workspaceRoot: root,
      targetNodeModules,
      workspaceNodeModules,
      requiredModules: ['chokidar', 'chokidar-fsevents']
    })

    expect(synced).toContain('chokidar-fsevents')
    expect(
      existsSync(path.join(resourcesDir, 'node_modules', 'chokidar-fsevents', 'package.json'))
    ).toBe(true)
  })
})

const TARGET_NATIVE_ADDONS: Array<[target: string, expectedAddons: string[]]> = [
  [
    'mac',
    [
      'tuff_native_ocr.node',
      'tuff_native_audio.node',
      'tuff-native-translation',
      'tuff-native-update',
      'tuff-browser-bridge'
    ]
  ],
  [
    'darwin',
    [
      'tuff_native_ocr.node',
      'tuff_native_audio.node',
      'tuff-native-translation',
      'tuff-native-update',
      'tuff-browser-bridge'
    ]
  ],
  ['linux', ['tuff_native_ocr.node', 'tuff_native_audio.node', 'tuff-browser-bridge']],
  [
    'win',
    [
      'tuff_native_ocr.node',
      'tuff_native_audio.node',
      'tuff_native_everything.node',
      'tuff-browser-bridge.exe'
    ]
  ],
  [
    'win32',
    [
      'tuff_native_ocr.node',
      'tuff_native_audio.node',
      'tuff_native_everything.node',
      'tuff-browser-bridge.exe'
    ]
  ]
]

describe('required native addon projection', () => {
  it.each(TARGET_NATIVE_ADDONS)(
    'requires the platform runtime binaries for %s',
    (target, expectedAddons) => {
      expect(requiredNativeAddonNames(target)).toEqual(expectedAddons)
    }
  )

  it('keeps the screenshot addon out of every build target', () => {
    for (const [target] of TARGET_NATIVE_ADDONS) {
      expect(requiredNativeAddonNames(target)).not.toContain('tuff_native_screenshot.node')
    }
  })
})
