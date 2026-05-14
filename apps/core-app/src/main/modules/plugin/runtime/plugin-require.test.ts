import { describe, expect, it } from 'vitest'
import {
  PLUGIN_RUNTIME_DENIED_MODULE,
  PluginRuntimeDeniedModuleError,
  createPluginRequire
} from './plugin-require'
import { loadPluginFeatureContextFromContent } from '../plugin-feature'

function expectDenied(operation: () => unknown, moduleId: string): void {
  expect(operation).toThrow(PluginRuntimeDeniedModuleError)
  try {
    operation()
  } catch (error) {
    expect(error).toMatchObject({
      code: PLUGIN_RUNTIME_DENIED_MODULE,
      pluginName: 'test-plugin',
      moduleId
    })
  }
}

describe('createPluginRequire', () => {
  it('denies Electron and native-risk modules', () => {
    const pluginRequire = createPluginRequire('test-plugin')

    expectDenied(() => pluginRequire('electron'), 'electron')
    expectDenied(() => pluginRequire('@libsql/client'), '@libsql/client')
    expectDenied(() => pluginRequire('@libsql/win32-x64-msvc'), '@libsql/win32-x64-msvc')
    expectDenied(() => pluginRequire('@crosscopy/clipboard'), '@crosscopy/clipboard')
    expectDenied(() => pluginRequire('extract-file-icon'), 'extract-file-icon')
    expectDenied(() => pluginRequire('./native-addon.node'), './native-addon.node')
  })

  it('keeps worker_threads available through the instrumented wrapper', () => {
    const pluginRequire = createPluginRequire('test-plugin')

    const workerThreads = pluginRequire(
      'node:worker_threads'
    ) as typeof import('node:worker_threads')

    expect(workerThreads.Worker).toBeTypeOf('function')
    expect(workerThreads.isMainThread).toBe(true)
  })

  it('denies resolving native addons before loading them', () => {
    const pluginRequire = createPluginRequire('test-plugin')

    expectDenied(() => pluginRequire.resolve('./native-addon.node'), './native-addon.node')
  })

  it('preserves the denied error code through plugin script loading', () => {
    expect(() =>
      loadPluginFeatureContextFromContent(
        {
          name: 'test-plugin',
          pluginPath: '/tmp/test-plugin'
        } as never,
        "require('electron')",
        {}
      )
    ).toThrow(expect.objectContaining({ code: PLUGIN_RUNTIME_DENIED_MODULE }))
  })
})
