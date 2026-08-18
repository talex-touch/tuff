import { describe, expect, it, vi } from 'vitest'
import { resolveApplicationProjection } from './app-resolution-service'

const appRow = {
  id: 1,
  path: '/Applications/Demo.app',
  name: 'Demo',
  displayName: 'Demo App',
  type: 'app',
  size: null,
  mtime: new Date(0),
  ctime: new Date(0)
}

describe('resolveApplicationProjection', () => {
  it('projects an exact bundle id without exposing the native application path', async () => {
    const getFilesByPaths = vi.fn(async () => [])
    const getFilesByBundleIds = vi.fn(async () => [appRow])
    const ensureIcon = vi.fn(async () => null)
    const persistIcon = vi.fn()

    const result = await resolveApplicationProjection('com.demo.app', {
      dbUtils: { getFilesByPaths, getFilesByBundleIds } as never,
      fetchExtensions: vi.fn(async () => [
        { ...appRow, extensions: { bundleId: 'com.demo.app' } }
      ]) as never,
      repairIconPointers: vi.fn(async () => undefined),
      mapApplication: vi.fn(() => ({
        name: 'Demo',
        displayName: 'Demo App',
        path: appRow.path,
        bundleId: 'com.demo.app',
        uniqueId: 'com.demo.app',
        stableId: 'com.demo.app',
        icon: '',
        lastModified: new Date(0)
      })) as never,
      ensureIcon,
      persistIcon
    })

    expect(result).toEqual({
      identifier: 'com.demo.app',
      displayName: 'Demo App',
      icon: null
    })
    expect(result).not.toHaveProperty('path')
    expect(getFilesByPaths).toHaveBeenCalledWith(['com.demo.app'])
    expect(getFilesByBundleIds).toHaveBeenCalledWith(['com.demo.app'])
    expect(ensureIcon).toHaveBeenCalledWith(appRow.path, 'com.demo.app')
    expect(persistIcon).not.toHaveBeenCalled()
  })

  it('rejects invalid identifiers before touching the database', async () => {
    const getFilesByPaths = vi.fn()
    const getFilesByBundleIds = vi.fn()

    await expect(
      resolveApplicationProjection('   ', {
        dbUtils: { getFilesByPaths, getFilesByBundleIds } as never
      } as never)
    ).resolves.toBeNull()
    expect(getFilesByPaths).not.toHaveBeenCalled()
    expect(getFilesByBundleIds).not.toHaveBeenCalled()
  })
})
