import { describe, expect, it } from 'vitest'
import { resolveRendererPlatformState } from './renderer-platform'

describe('resolveRendererPlatformState', () => {
  it('prefers startup platform over other runtime hints', () => {
    expect(
      resolveRendererPlatformState({
        startupPlatform: 'linux',
        electronPlatform: 'darwin',
        navigatorPlatform: 'MacIntel',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'
      })
    ).toMatchObject({
      platform: 'linux',
      isLinux: true,
      isMac: false,
      isWindows: false
    })
  })

  it('falls back to electron platform when startup info is unavailable', () => {
    expect(
      resolveRendererPlatformState({
        startupPlatform: null,
        electronPlatform: 'win32',
        navigatorPlatform: 'MacIntel',
        userAgent: ''
      })
    ).toMatchObject({
      platform: 'win32',
      isWindows: true,
      isMac: false,
      isLinux: false
    })
  })

  it('infers mac platform from browser hints as last fallback', () => {
    expect(
      resolveRendererPlatformState({
        startupPlatform: null,
        electronPlatform: null,
        navigatorPlatform: 'MacIntel',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'
      })
    ).toMatchObject({
      platform: 'darwin',
      isMac: true,
      isWindows: false,
      isLinux: false
    })
  })

  it('returns unknown when no supported platform hint is available', () => {
    expect(
      resolveRendererPlatformState({
        startupPlatform: null,
        electronPlatform: null,
        navigatorPlatform: 'Plan9',
        userAgent: 'Custom Agent'
      })
    ).toMatchObject({
      platform: 'unknown',
      isMac: false,
      isWindows: false,
      isLinux: false
    })
  })
})
