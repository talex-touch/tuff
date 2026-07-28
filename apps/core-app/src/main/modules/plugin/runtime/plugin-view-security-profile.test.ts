import { SdkApi } from '@talex-touch/utils/plugin'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  getPluginViewSecurityDiagnostics,
  PluginViewCompatibilityError,
  resetPluginViewSecurityDiagnostics,
  resolvePluginViewSecurityProfile
} from './plugin-view-security-profile'

function createPlugin(overrides: { sdkapi?: number; webViewInit?: boolean } = {}) {
  const hasSdkapi = Object.prototype.hasOwnProperty.call(overrides, 'sdkapi')
  return {
    name: 'touch-test',
    sdkapi: hasSdkapi ? overrides.sdkapi : SdkApi.V260615,
    webViewInit: overrides.webViewInit ?? false
  }
}

function expectLegacyGate(
  run: () => unknown,
  reason: PluginViewCompatibilityError['reason']
): void {
  expect(run).toThrowError(
    expect.objectContaining({
      code: 'PLUGIN_WINDOW_LEGACY_RUNTIME_UNSUPPORTED',
      reason,
      minimumSdkApi: SdkApi.V260615
    })
  )
}

describe('resolvePluginViewSecurityProfile', () => {
  beforeEach(() => {
    resetPluginViewSecurityDiagnostics()
    delete process.env.TUFF_PLUGIN_SECURE_VIEWS
  })

  it('returns only the trusted profile for supported plugins', () => {
    expect(resolvePluginViewSecurityProfile(createPlugin(), { source: 'test' })).toEqual({
      candidateProfile: 'trusted-plugin-view',
      effectiveProfile: 'trusted-plugin-view',
      reason: 'trusted-candidate'
    })
  })

  it.each([
    [undefined, 'sdkapi-before-trusted-marker'],
    [SdkApi.V260428, 'sdkapi-before-trusted-marker'],
    [251211, 'sdkapi-before-trusted-marker'],
    [260701, 'sdkapi-before-trusted-marker']
  ] as const)('rejects unsupported SDK %s before surface creation', (sdkapi, reason) => {
    expectLegacyGate(
      () => resolvePluginViewSecurityProfile(createPlugin({ sdkapi }), { source: 'test' }),
      reason
    )
  })

  it('rejects a custom preload before surface creation', () => {
    expectLegacyGate(
      () =>
        resolvePluginViewSecurityProfile(createPlugin(), {
          source: 'test',
          injections: { _: { preload: '/tmp/preload.js', isWebviewInit: false } }
        }),
      'legacy-preload'
    )
  })

  it('rejects webview and explicit legacy runtime requirements', () => {
    expectLegacyGate(
      () =>
        resolvePluginViewSecurityProfile(createPlugin({ webViewInit: true }), {
          source: 'test',
          injections: { _: { isWebviewInit: true } }
        }),
      'legacy-webview'
    )
    expectLegacyGate(
      () =>
        resolvePluginViewSecurityProfile(createPlugin(), {
          source: 'test',
          requiresLegacyRuntime: true
        }),
      'explicit-legacy-runtime'
    )
  })

  it('does not restore legacy execution through the former environment switch', () => {
    process.env.TUFF_PLUGIN_SECURE_VIEWS = '0'
    expectLegacyGate(
      () =>
        resolvePluginViewSecurityProfile(createPlugin({ sdkapi: SdkApi.V260428 }), {
          source: 'test'
        }),
      'sdkapi-before-trusted-marker'
    )
  })

  it('records blocked diagnostics without retaining paths or injected source', () => {
    const plugin = createPlugin()
    resolvePluginViewSecurityProfile(plugin, { source: 'core-box' })
    expect(() =>
      resolvePluginViewSecurityProfile(plugin, {
        source: 'division-box',
        injections: { _: { preload: '/private/sensitive/preload.js', isWebviewInit: false } }
      })
    ).toThrow(PluginViewCompatibilityError)

    const snapshot = getPluginViewSecurityDiagnostics()
    expect(snapshot).toEqual({
      surfaces: expect.arrayContaining([
        expect.objectContaining({ source: 'core-box', effectiveProfile: 'trusted-plugin-view' }),
        expect.objectContaining({
          source: 'division-box',
          effectiveProfile: 'blocked',
          reason: 'legacy-preload'
        })
      ]),
      compatibilityBlockers: { 'legacy-preload': 1 }
    })
    expect(JSON.stringify(snapshot)).not.toContain('/private/sensitive')
  })
})
