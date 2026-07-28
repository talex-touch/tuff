import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const pluginModuleRoot = path.resolve(__dirname)

function read(relativePath: string): string {
  return readFileSync(path.resolve(pluginModuleRoot, relativePath), 'utf8')
}

describe('plugin Prelude production hard cut', () => {
  it('has no singleton isolation flag or synthetic self-check in PluginModule', () => {
    const source = read('plugin-module.ts')

    expect(source).not.toContain('TUFF_PLUGIN_ISOLATION')
    expect(source).not.toContain('pluginHostBridge')
    expect(source).not.toContain('__c1b_selfcheck__')
  })

  it('does not import or call the main-process Prelude VM loader', () => {
    const pluginSource = read('plugin.ts')
    const featureSource = read('plugin-feature.ts')

    expect(pluginSource).not.toContain('loadPluginFeatureContext')
    expect(featureSource).not.toContain("from 'node:vm'")
    expect(featureSource).not.toContain('runInContext')
  })

  it('binds production activation to the fixed bundled host artifact', () => {
    const moduleSource = read('plugin-module.ts')
    const serviceSource = read('host/plugin-runtime-service.ts')

    expect(moduleSource).toContain('resolvePluginRuntimeArtifactPath()')
    expect(serviceSource).toContain("path.join(__dirname, 'plugin-host.js')")
  })
})
