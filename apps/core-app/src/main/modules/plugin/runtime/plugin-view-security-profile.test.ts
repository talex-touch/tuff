import { beforeEach, describe, expect, it } from 'vitest'
import { SdkApi } from '@talex-touch/utils/plugin'
import {
  getPluginViewSecurityDiagnostics,
  resetPluginViewSecurityDiagnostics,
  resolvePluginViewSecurityProfile
} from './plugin-view-security-profile'

function createPlugin(overrides: { sdkapi?: number; webViewInit?: boolean } = {}) {
  const hasSdkapi = Object.prototype.hasOwnProperty.call(overrides, 'sdkapi')

  return {
    name: 'touch-test',
    sdkapi: hasSdkapi ? overrides.sdkapi : SdkApi.V260615,
    webViewInit: overrides.webViewInit ?? false,
    __getInjections__: () => ({
      _: {
        isWebviewInit: overrides.webViewInit ?? false
      },
      attrs: {},
      styles: '',
      js: ''
    })
  }
}

describe('resolvePluginViewSecurityProfile', () => {
  beforeEach(() => {
    resetPluginViewSecurityDiagnostics()
  })

  it('activates the trusted profile for supported plugins without legacy needs', () => {
    const profile = resolvePluginViewSecurityProfile(createPlugin(), {
      source: 'test'
    })

    expect(profile).toEqual({
      candidateProfile: 'trusted-plugin-view',
      effectiveProfile: 'trusted-plugin-view',
      reason: 'trusted-candidate'
    })
  })

  it('keeps candidate and effective profiles aligned', () => {
    const profile = resolvePluginViewSecurityProfile(createPlugin(), {
      source: 'test'
    })

    expect(profile.candidateProfile).toBe('trusted-plugin-view')
    expect(profile.effectiveProfile).toBe('trusted-plugin-view')
  })

  it('retains 260428 plugins on the compatibility candidate path', () => {
    const profile = resolvePluginViewSecurityProfile(createPlugin({ sdkapi: SdkApi.V260428 }), {
      source: 'test'
    })

    expect(profile).toEqual({
      candidateProfile: 'compat-plugin-view',
      effectiveProfile: 'compat-plugin-view',
      reason: 'sdkapi-before-trusted-marker'
    })
  })

  it('keeps missing, lower or unsupported future sdkapi values compatible', () => {
    const missing = resolvePluginViewSecurityProfile(createPlugin({ sdkapi: undefined }), {
      source: 'test'
    })
    const low = resolvePluginViewSecurityProfile(createPlugin({ sdkapi: 251211 }), {
      source: 'test'
    })
    const future = resolvePluginViewSecurityProfile(createPlugin({ sdkapi: 260701 }), {
      source: 'test'
    })

    expect(missing.reason).toBe('sdkapi-before-trusted-marker')
    expect(low.reason).toBe('sdkapi-before-trusted-marker')
    expect(future.reason).toBe('sdkapi-before-trusted-marker')
    expect(missing.effectiveProfile).toBe('compat-plugin-view')
    expect(low.effectiveProfile).toBe('compat-plugin-view')
    expect(future.effectiveProfile).toBe('compat-plugin-view')
  })

  it('downgrades plugins with legacy preload needs to compat candidate', () => {
    const profile = resolvePluginViewSecurityProfile(createPlugin(), {
      source: 'test',
      injections: {
        _: {
          preload: '/tmp/preload.js',
          isWebviewInit: false
        }
      }
    })

    expect(profile).toMatchObject({
      candidateProfile: 'compat-plugin-view',
      effectiveProfile: 'compat-plugin-view',
      reason: 'legacy-preload'
    })
  })

  it('downgrades legacy webview plugins to compat candidate', () => {
    const profile = resolvePluginViewSecurityProfile(createPlugin({ webViewInit: true }), {
      source: 'test',
      injections: {
        _: {
          isWebviewInit: true
        }
      }
    })

    expect(profile.reason).toBe('legacy-webview')
    expect(profile.candidateProfile).toBe('compat-plugin-view')
  })

  it('keeps explicit legacy runtime requests on compat candidate', () => {
    const profile = resolvePluginViewSecurityProfile(createPlugin(), {
      source: 'test',
      requiresLegacyRuntime: true
    })

    expect(profile.reason).toBe('explicit-legacy-runtime')
    expect(profile.candidateProfile).toBe('compat-plugin-view')
  })

  it('reports per-surface profile state and deduplicated compatibility blockers', () => {
    const plugin = createPlugin()
    resolvePluginViewSecurityProfile(plugin, { source: 'core-box' })
    resolvePluginViewSecurityProfile(plugin, {
      source: 'division-box',
      injections: { _: { preload: '/tmp/legacy.js', isWebviewInit: false } }
    })
    resolvePluginViewSecurityProfile(plugin, {
      source: 'division-box',
      injections: { _: { preload: '/tmp/legacy.js', isWebviewInit: false } }
    })

    expect(getPluginViewSecurityDiagnostics()).toEqual({
      surfaces: expect.arrayContaining([
        expect.objectContaining({ source: 'core-box', effectiveProfile: 'trusted-plugin-view' }),
        expect.objectContaining({ source: 'division-box', reason: 'legacy-preload' })
      ]),
      compatibilityBlockers: { 'legacy-preload': 1 }
    })
  })
})
