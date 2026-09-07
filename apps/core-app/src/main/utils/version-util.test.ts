import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'

describe('getAppVersion', () => {
  it('uses the bundled CoreApp manifest instead of differing workspace metadata', async () => {
    const hadAppVersion = Object.hasOwn(process.env, 'APP_VERSION')
    const originalAppVersion = process.env.APP_VERSION
    const hadPackageGlobal = Object.hasOwn(globalThis, '$pkg')
    const originalPackageGlobal = globalThis.$pkg

    Reflect.deleteProperty(process.env, 'APP_VERSION')
    Reflect.deleteProperty(globalThis, '$pkg')
    vi.resetModules()
    vi.doMock('electron', () => ({
      app: { getVersion: vi.fn() }
    }))
    vi.doMock('../../../package.json', () => ({
      default: { version: '2.4.14-beta.30' }
    }))
    vi.doMock('../../../../../package.json', () => ({
      default: { version: '2.4.14-beta.29' }
    }))

    try {
      const { getAppVersion } = await import('./version-util')

      expect(getAppVersion()).toBe('2.4.14-beta.30')
    } finally {
      vi.doUnmock('electron')
      vi.doUnmock('../../../package.json')
      vi.doUnmock('../../../../../package.json')
      vi.resetModules()

      if (hadAppVersion) {
        process.env.APP_VERSION = originalAppVersion
      } else {
        Reflect.deleteProperty(process.env, 'APP_VERSION')
      }

      if (hadPackageGlobal) {
        globalThis.$pkg = originalPackageGlobal
      } else {
        Reflect.deleteProperty(globalThis, '$pkg')
      }
    }
  })

  it('uses Electron packaged metadata after an OTA relaunch with stale inherited metadata', async () => {
    const hadAppVersion = Object.hasOwn(process.env, 'APP_VERSION')
    const originalAppVersion = process.env.APP_VERSION
    const hadPackageGlobal = Object.hasOwn(globalThis, '$pkg')
    const originalPackageGlobal = globalThis.$pkg

    process.env.APP_VERSION = '2.4.14-beta.30'
    globalThis.$pkg = { version: '2.4.14-beta.30' } as typeof globalThis.$pkg
    vi.resetModules()
    vi.doMock('electron', () => ({
      app: { isPackaged: true, getVersion: vi.fn(() => '2.4.14-beta.31') }
    }))

    try {
      const { getAppVersion } = await import('./version-util')

      expect(getAppVersion()).toBe('2.4.14-beta.31')
    } finally {
      vi.doUnmock('electron')
      vi.resetModules()

      if (hadAppVersion) {
        process.env.APP_VERSION = originalAppVersion
      } else {
        Reflect.deleteProperty(process.env, 'APP_VERSION')
      }

      if (hadPackageGlobal) {
        globalThis.$pkg = originalPackageGlobal
      } else {
        Reflect.deleteProperty(globalThis, '$pkg')
      }
    }
  })
})
