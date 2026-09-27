import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { collectResourceModuleClosure, getPlatformRuntimeRootModules, requiredNativeAddonNames } =
  require('./runtime-modules.js') as {
    collectResourceModuleClosure: () => string[]
    getPlatformRuntimeRootModules: (platform: string, architecture: string) => string[]
    requiredNativeAddonNames: (target: string) => string[]
  }

describe('runtime module resource projection', () => {
  it('projects the native Everything package into Resources', () => {
    expect(collectResourceModuleClosure()).toContain('@talex-touch/tuff-native')
  })

  it('returns string module names for platform runtime roots', () => {
    const modules = getPlatformRuntimeRootModules('win', 'x64')

    expect(modules).toContain('@talex-touch/tuff-native')
    expect(modules.every((moduleName) => typeof moduleName === 'string')).toBe(true)
  })
})

const TARGET_NATIVE_ADDONS: Array<[target: string, expectedAddons: string[]]> = [
  ['mac', ['tuff_native_ocr.node', 'tuff_native_audio.node']],
  ['darwin', ['tuff_native_ocr.node', 'tuff_native_audio.node']],
  ['linux', ['tuff_native_ocr.node', 'tuff_native_audio.node']],
  ['win', ['tuff_native_ocr.node', 'tuff_native_audio.node', 'tuff_native_everything.node']],
  ['win32', ['tuff_native_ocr.node', 'tuff_native_audio.node', 'tuff_native_everything.node']]
]

describe('required native addon projection', () => {
  it.each(TARGET_NATIVE_ADDONS)(
    'requires exactly OCR and audio, plus Everything on Windows, for %s',
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
