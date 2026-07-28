import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PermissionStore } from './permission-store'

vi.mock('@talex-touch/utils/permission', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/permission')>()
  const normalizePermissionId = (id: string): string =>
    id === 'filesystem.read' ? 'fs.read' : actual.normalizePermissionId(id)

  return {
    ...actual,
    normalizePermissionId,
    getPermissionIdCandidates(id: string): string[] {
      const canonicalId = normalizePermissionId(id)
      return canonicalId === 'fs.read'
        ? ['fs.read', 'filesystem.read']
        : actual.getPermissionIdCandidates(canonicalId)
    }
  }
})

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

type PermissionStoreOptions = NonNullable<ConstructorParameters<typeof PermissionStore>[1]>
type PermissionStoreBackend = ReturnType<NonNullable<PermissionStoreOptions['createBackend']>>
type PersistedPermissionData = Awaited<ReturnType<PermissionStoreBackend['load']>>
type PermissionStoreInternals = {
  data: PersistedPermissionData
  dirty: boolean
  sessionGrants: Record<string, Set<string>>
}

function getStoreInternals(store: PermissionStore): PermissionStoreInternals {
  return store as unknown as PermissionStoreInternals
}

function createPersistFailureBackend() {
  let persisted: PersistedPermissionData = { version: 1, grants: {}, auditLogs: [] }
  let nextPersistError: Error | null = null

  return {
    backend: {
      initialize: async () => undefined,
      load: async () => structuredClone(persisted),
      persist: async (data: PersistedPermissionData) => {
        if (nextPersistError) {
          const error = nextPersistError
          nextPersistError = null
          throw error
        }
        persisted = structuredClone(data)
      },
      close: async () => undefined
    },
    failNextPersist(message = 'persist failed') {
      nextPersistError = new Error(message)
    },
    getPersisted() {
      return structuredClone(persisted)
    }
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

  it('revokes a session-only permission immediately', async () => {
    const store = new PermissionStore(tempDir)
    await store.initialize()
    await store.grantSession('touch-demo', 'fs.read')

    expect(store.hasPermission('touch-demo', 'fs.read', 251212)).toBe(true)

    await expect(store.revoke('touch-demo', 'fs.read')).resolves.toEqual(['fs.read'])

    expect(store.hasPermission('touch-demo', 'fs.read', 251212)).toBe(false)
    expect(store.getAuditLogs({ pluginId: 'touch-demo', action: 'revoked' })).toHaveLength(1)
    await store.shutdown()
  })

  it('revokes a persistent-only permission and treats repeated revoke as a no-op', async () => {
    const store = new PermissionStore(tempDir)
    await store.initialize()
    await store.grant('touch-demo', 'fs.read', 'user')

    await expect(store.revoke('touch-demo', 'fs.read')).resolves.toEqual(['fs.read'])
    await expect(store.revoke('touch-demo', 'fs.read')).resolves.toEqual([])

    expect(store.hasPermission('touch-demo', 'fs.read', 251212)).toBe(false)
    expect(store.getAuditLogs({ pluginId: 'touch-demo', action: 'revoked' })).toHaveLength(1)
    await store.shutdown()
  })

  it('revokes combined grants once and keeps the revoke after restart', async () => {
    const storeA = new PermissionStore(tempDir)
    await storeA.initialize()
    await storeA.grant('touch-demo', 'fs.read', 'user')
    await storeA.grantSession('touch-demo', 'fs.read')

    await expect(storeA.revoke('touch-demo', 'fs.read')).resolves.toEqual(['fs.read'])

    expect(storeA.hasSessionPermission('touch-demo', 'fs.read')).toBe(false)
    expect(storeA.hasPermission('touch-demo', 'fs.read', 251212)).toBe(false)
    expect(
      storeA
        .getAuditLogs({ pluginId: 'touch-demo', action: 'revoked' })
        .filter((entry) => entry.permissionId === 'fs.read')
    ).toHaveLength(1)
    await storeA.shutdown()

    const storeB = new PermissionStore(tempDir)
    await storeB.initialize()
    expect(storeB.hasPermission('touch-demo', 'fs.read', 251212)).toBe(false)
    await storeB.shutdown()
  })

  it('revokes every canonical and alias representation through the shared candidates contract', async () => {
    const store = new PermissionStore(tempDir)
    await store.initialize()
    await store.grant('touch-demo', 'fs.read', 'user')
    await store.grantSession('touch-demo', 'fs.read')

    const internals = getStoreInternals(store)
    const canonicalGrant = internals.data.grants['touch-demo']['fs.read']
    internals.data.grants['touch-demo']['filesystem.read'] = {
      ...canonicalGrant,
      permissionId: 'filesystem.read'
    }
    internals.sessionGrants['touch-demo'].add('filesystem.read')

    await expect(store.revoke('touch-demo', 'filesystem.read')).resolves.toEqual(['fs.read'])

    expect(internals.data.grants['touch-demo']).toBeUndefined()
    expect(internals.sessionGrants['touch-demo']).toBeUndefined()
    expect(
      store
        .getAuditLogs({ pluginId: 'touch-demo', action: 'revoked' })
        .map((entry) => entry.permissionId)
    ).toEqual(['fs.read'])
    await store.shutdown()
  })

  it('revokeAll clears persistent and session grants with deduplicated audit entries', async () => {
    const store = new PermissionStore(tempDir)
    await store.initialize()
    await store.grant('touch-demo', 'fs.read', 'user')
    await store.grantSessionMultiple('touch-demo', ['fs.read', 'clipboard.read'])

    await expect(store.revokeAll('touch-demo')).resolves.toEqual(['clipboard.read', 'fs.read'])
    await expect(store.revokeAll('touch-demo')).resolves.toEqual([])

    expect(store.hasPermission('touch-demo', 'fs.read', 251212)).toBe(false)
    expect(store.hasPermission('touch-demo', 'clipboard.read', 251212)).toBe(false)
    expect(
      store
        .getAuditLogs({ pluginId: 'touch-demo', action: 'revoked' })
        .map((entry) => entry.permissionId)
        .sort()
    ).toEqual(['clipboard.read', 'fs.read'])
    await store.shutdown()
  })

  it('revokeAll canonicalizes alias representations before deduplicating audit entries', async () => {
    const store = new PermissionStore(tempDir)
    await store.initialize()
    await store.grant('touch-demo', 'fs.read', 'user')
    await store.grantSession('touch-demo', 'fs.read')

    const internals = getStoreInternals(store)
    const canonicalGrant = internals.data.grants['touch-demo']['fs.read']
    internals.data.grants['touch-demo']['filesystem.read'] = {
      ...canonicalGrant,
      permissionId: 'filesystem.read'
    }
    internals.sessionGrants['touch-demo'].add('filesystem.read')

    await expect(store.revokeAll('touch-demo')).resolves.toEqual(['fs.read'])

    expect(
      store
        .getAuditLogs({ pluginId: 'touch-demo', action: 'revoked' })
        .map((entry) => entry.permissionId)
    ).toEqual(['fs.read'])
    await store.shutdown()
  })

  it('rolls persistent and session grants back when revoke persistence fails', async () => {
    const controlled = createPersistFailureBackend()
    const store = new PermissionStore(tempDir, {
      createBackend: () => controlled.backend
    })
    await store.initialize()
    await store.grant('touch-demo', 'fs.read', 'user')
    await store.grantSession('touch-demo', 'fs.read')
    controlled.failNextPersist('revoke persistence failed')

    await expect(store.revoke('touch-demo', 'fs.read')).rejects.toThrow('revoke persistence failed')

    expect(store.hasSessionPermission('touch-demo', 'fs.read')).toBe(true)
    expect(store.hasPermission('touch-demo', 'fs.read', 251212)).toBe(true)
    expect(store.getAuditLogs({ pluginId: 'touch-demo', action: 'revoked' })).toHaveLength(0)
    expect(getStoreInternals(store).dirty).toBe(false)
    expect(controlled.getPersisted().grants['touch-demo']).toHaveProperty('fs.read')
    expect(
      controlled
        .getPersisted()
        .auditLogs?.some((entry) => entry.action === 'revoked' && entry.permissionId === 'fs.read')
    ).toBe(false)
    await store.shutdown()
  })

  it('rolls all persistent and session grants back when revokeAll persistence fails', async () => {
    const controlled = createPersistFailureBackend()
    const store = new PermissionStore(tempDir, {
      createBackend: () => controlled.backend
    })
    await store.initialize()
    await store.grant('touch-demo', 'fs.read', 'user')
    await store.grantSessionMultiple('touch-demo', ['fs.read', 'clipboard.read'])
    controlled.failNextPersist('revokeAll persistence failed')

    await expect(store.revokeAll('touch-demo')).rejects.toThrow('revokeAll persistence failed')

    expect(store.hasSessionPermission('touch-demo', 'fs.read')).toBe(true)
    expect(store.hasSessionPermission('touch-demo', 'clipboard.read')).toBe(true)
    expect(store.hasPermission('touch-demo', 'fs.read', 251212)).toBe(true)
    expect(store.hasPermission('touch-demo', 'clipboard.read', 251212)).toBe(true)
    expect(store.getAuditLogs({ pluginId: 'touch-demo', action: 'revoked' })).toHaveLength(0)
    expect(getStoreInternals(store).dirty).toBe(false)
    expect(Object.keys(controlled.getPersisted().grants['touch-demo'] || {})).toEqual(['fs.read'])
    expect(controlled.getPersisted().auditLogs?.some((entry) => entry.action === 'revoked')).toBe(
      false
    )
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
    await expect(store.revokeAll('touch-demo')).rejects.toMatchObject({
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
