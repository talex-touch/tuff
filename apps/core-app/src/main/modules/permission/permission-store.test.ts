import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PermissionStore } from './permission-store'

function createUnavailableBackend(message = 'sqlite unavailable') {
  return {
    initialize: async () => {
      throw new Error(message)
    },
    load: async () => ({ version: 1, grants: {}, auditLogs: [] }),
    persist: async () => undefined,
    close: async () => undefined
  }
}

describe('PermissionStore sqlite backend', () => {
  let tempDir = ''

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'permission-store-'))
  })

  afterEach(async () => {
    if (!tempDir) return
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('initializes sqlite storage without importing retired JSON snapshots', async () => {
    const retiredJsonPath = path.join(tempDir, 'permissions.json')
    await fs.writeFile(
      retiredJsonPath,
      JSON.stringify({
        version: 1,
        grants: {
          'touch-demo': {
            'fs.read': {
              pluginId: 'touch-demo',
              permissionId: 'fs.read',
              grantedAt: 1700000000000,
              grantedBy: 'user'
            }
          }
        }
      }),
      'utf-8'
    )

    const store = new PermissionStore(tempDir)
    await store.initialize()

    expect(store.getBackendMode()).toBe('sqlite')
    expect(store.hasPermission('touch-demo', 'fs.read', 251212)).toBe(false)
    await store.shutdown()

    const files = await fs.readdir(tempDir)
    expect(files.includes('permissions.db')).toBe(true)
    expect(files.includes('permissions.json')).toBe(true)
  })

  it('persists grants in sqlite across store restarts', async () => {
    const storeA = new PermissionStore(tempDir)
    await storeA.initialize()
    await storeA.grant('touch-demo', 'fs.read', 'user')
    await storeA.shutdown()

    const storeB = new PermissionStore(tempDir)
    await storeB.initialize()
    expect(storeB.hasPermission('touch-demo', 'fs.read', 251212)).toBe(true)
    await storeB.shutdown()
  })

  it('blocks permission access when sdkapi is missing or below threshold', async () => {
    const store = new PermissionStore(tempDir)
    await store.initialize()
    await store.grant('touch-demo', 'fs.read', 'user')

    expect(store.hasPermission('touch-demo', 'fs.read', undefined)).toBe(false)
    expect(store.hasPermission('touch-demo', 'fs.read', 251111)).toBe(false)
    expect(store.hasPermission('touch-demo', 'fs.read', 251212)).toBe(true)

    await store.shutdown()
  })

  it('enters degraded backend-unavailable mode without reviving retired json fallback', async () => {
    const retiredJsonPath = path.join(tempDir, 'permissions.json')
    await fs.writeFile(
      retiredJsonPath,
      JSON.stringify({
        version: 1,
        grants: {
          'touch-demo': {
            'fs.read': {
              pluginId: 'touch-demo',
              permissionId: 'fs.read',
              grantedAt: 1700000000000,
              grantedBy: 'user'
            }
          }
        }
      }),
      'utf-8'
    )

    const store = new PermissionStore(tempDir, {
      createBackend: () => createUnavailableBackend('sqlite offline')
    })
    await store.initialize()

    expect(store.getBackendStatus()).toEqual(
      expect.objectContaining({
        mode: 'degraded/backend-unavailable',
        writable: false,
        reason: 'sqlite offline'
      })
    )
    expect(store.hasPermission('touch-demo', 'fs.read', 251212)).toBe(false)
    await store.shutdown()
  })

  it('rejects permission mutations when backend is unavailable and does not rewrite retired json fallback', async () => {
    const retiredJsonPath = path.join(tempDir, 'permissions.json')
    const retiredJsonPayload = {
      version: 1,
      grants: {
        'touch-demo': {
          'fs.read': {
            pluginId: 'touch-demo',
            permissionId: 'fs.read',
            grantedAt: 1700000000000,
            grantedBy: 'user'
          }
        }
      }
    }
    await fs.writeFile(retiredJsonPath, JSON.stringify(retiredJsonPayload), 'utf-8')

    const store = new PermissionStore(tempDir, {
      createBackend: () => createUnavailableBackend('sqlite init failed')
    })
    await store.initialize()

    await expect(store.grant('touch-demo', 'clipboard.read', 'user')).rejects.toMatchObject({
      code: 'PERMISSION_BACKEND_UNAVAILABLE'
    })
    await expect(store.revoke('touch-demo', 'fs.read')).rejects.toMatchObject({
      code: 'PERMISSION_BACKEND_UNAVAILABLE'
    })
    await expect(
      store.grantSessionMultiple('touch-demo', ['clipboard.read'])
    ).rejects.toMatchObject({
      code: 'PERMISSION_BACKEND_UNAVAILABLE'
    })

    expect(JSON.parse(await fs.readFile(retiredJsonPath, 'utf-8'))).toEqual(retiredJsonPayload)
    await store.shutdown()
  })
})
