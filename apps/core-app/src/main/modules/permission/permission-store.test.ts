import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PermissionStore } from './permission-store'

describe('PermissionStore sqlite backend', () => {
  let tempDir = ''

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'permission-store-'))
  })

  afterEach(async () => {
    if (!tempDir) return
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('migrates legacy JSON data to sqlite and keeps a backup', async () => {
    const legacyPath = path.join(tempDir, 'permissions.json')
    await fs.writeFile(
      legacyPath,
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
    expect(store.hasPermission('touch-demo', 'fs.read', 251212)).toBe(true)
    await store.shutdown()

    const files = await fs.readdir(tempDir)
    expect(files.some((file) => file.startsWith('permissions.json.backup-'))).toBe(true)
    expect(files.includes('permissions.db')).toBe(true)
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

  it('blocks permission access when sdkapi is below enforcement threshold', async () => {
    const store = new PermissionStore(tempDir)
    await store.initialize()
    await store.grant('touch-demo', 'fs.read', 'user')

    expect(store.hasPermission('touch-demo', 'fs.read', undefined)).toBe(false)
    expect(store.hasPermission('touch-demo', 'fs.read', 251111)).toBe(false)
    expect(store.hasPermission('touch-demo', 'fs.read', 251212)).toBe(true)

    await store.shutdown()
  })
})
