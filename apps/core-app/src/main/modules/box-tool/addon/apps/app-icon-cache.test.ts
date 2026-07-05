import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const { getPathMock } = vi.hoisted(() => ({
  getPathMock: vi.fn((name: string) => {
    if (name === 'cache') return path.join(os.tmpdir(), 'core-app-cache')
    if (name === 'userData') return path.join(os.tmpdir(), 'core-app-user-data')
    return os.tmpdir()
  })
}))

vi.mock('electron', () => ({
  app: {
    getPath: getPathMock
  }
}))

describe('app icon cache', () => {
  it('stores app icon cache under the Electron cache directory', async () => {
    const { getAppIconCacheDir, getAppIconCacheDirs } = await import('./app-icon-cache')

    expect(getAppIconCacheDir('darwin')).toBe(
      path.join(os.tmpdir(), 'core-app-cache', 'app-icons', 'darwin')
    )
    expect(getAppIconCacheDirs('darwin')).toEqual([
      path.join(os.tmpdir(), 'core-app-cache', 'app-icons', 'darwin'),
      path.join(os.tmpdir(), 'core-app-user-data', 'cache', 'app-icons', 'darwin'),
      path.join(os.tmpdir(), 'Cache', 'app-icons', 'darwin'),
      path.join(os.tmpdir(), 'core-app', 'Cache', 'app-icons', 'darwin'),
      path.join(os.tmpdir(), 'talex-touch-test-cache', 'app-icons', 'darwin')
    ])
  })

  it('includes the dev core-app cache when userData is nested below core-app', async () => {
    getPathMock.mockImplementation((name: string) => {
      if (name === 'cache') {
        return path.join(os.tmpdir(), '@talex-touch', 'tuff-dev', 'Cache')
      }
      if (name === 'userData') {
        return path.join(os.tmpdir(), '@talex-touch', 'core-app', 'tuff-dev')
      }
      return os.tmpdir()
    })

    const { getAppIconCacheDirs } = await import('./app-icon-cache')

    expect(getAppIconCacheDirs('darwin')).toContain(
      path.join(os.tmpdir(), '@talex-touch', 'core-app', 'Cache', 'app-icons', 'darwin')
    )
  })
})
