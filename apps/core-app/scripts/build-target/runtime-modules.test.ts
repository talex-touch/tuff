import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { collectResourceModuleClosure, getPlatformRuntimeRootModules } =
  require('./runtime-modules.js') as {
    collectResourceModuleClosure: () => string[]
    getPlatformRuntimeRootModules: (platform: string, architecture: string) => string[]
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
