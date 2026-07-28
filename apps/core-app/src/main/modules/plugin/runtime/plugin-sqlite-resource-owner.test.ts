import { access, mkdir, mkdtemp, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PluginSqliteResourceOwnerRegistry,
  resolvePluginSqliteDatabasePath
} from './plugin-sqlite-resource-owner'

const roots: string[] = []

async function createPluginDataPath(name: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'tuff-plugin-sqlite-owner-'))
  roots.push(root)
  const dataPath = path.join(root, 'modules', 'plugins', name, 'data')
  await mkdir(dataPath, { recursive: true })
  return dataPath
}

function identity(name: string, instance = 'instance-1', generation = 1) {
  return { pluginName: name, pluginInstanceId: instance, activationGeneration: generation }
}

describe('pluginSqliteResourceOwnerRegistry', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reuses only the same plugin activation owner', async () => {
    const clients: Array<{ close: ReturnType<typeof vi.fn> }> = []
    const registry = new PluginSqliteResourceOwnerRegistry({
      createClient: () => {
        const client = {
          execute: vi.fn(),
          query: vi.fn(),
          transaction: vi.fn(),
          close: vi.fn()
        }
        clients.push(client)
        return client
      }
    })
    const dataPath = await createPluginDataPath('alpha')

    const first = await registry.acquire(identity('alpha'), dataPath)
    const same = await registry.acquire(identity('alpha'), dataPath)
    const rotated = await registry.acquire(identity('alpha', 'instance-1', 2), dataPath)

    expect(same).toBe(first)
    expect(rotated).not.toBe(first)
    expect(clients).toHaveLength(2)
    expect(clients[0].close).toHaveBeenCalledOnce()
  })

  it('closes plugin resources deterministically', async () => {
    const close = vi.fn()
    const registry = new PluginSqliteResourceOwnerRegistry({
      createClient: () => ({
        execute: vi.fn(),
        query: vi.fn(),
        transaction: vi.fn(),
        close
      })
    })
    const dataPath = await createPluginDataPath('alpha')
    await registry.acquire(identity('alpha'), dataPath)

    await expect(registry.closePlugin('alpha')).resolves.toBe(true)
    await expect(registry.closePlugin('alpha')).resolves.toBe(false)
    expect(close).toHaveBeenCalledOnce()
  })

  it('single-flights concurrent acquire and lazily replaces a poisoned owner', async () => {
    const clients: Array<{
      isClosed: boolean
      close: ReturnType<typeof vi.fn>
      execute: ReturnType<typeof vi.fn>
      query: ReturnType<typeof vi.fn>
      transaction: ReturnType<typeof vi.fn>
    }> = []
    const registry = new PluginSqliteResourceOwnerRegistry({
      createClient: () => {
        const client = {
          isClosed: false,
          execute: vi.fn(),
          query: vi.fn(),
          transaction: vi.fn(),
          close: vi.fn()
        }
        clients.push(client)
        return client
      }
    })
    const dataPath = await createPluginDataPath('alpha')

    const [first, second] = await Promise.all([
      registry.acquire(identity('alpha'), dataPath),
      registry.acquire(identity('alpha'), dataPath)
    ])
    expect(first).toBe(second)
    expect(clients).toHaveLength(1)

    clients[0].isClosed = true
    const recovered = await registry.acquire(identity('alpha'), dataPath)
    expect(recovered).not.toBe(first)
    expect(clients).toHaveLength(2)
    expect(clients[0].close).toHaveBeenCalledOnce()
  })

  it('waits for worker termination before completing teardown', async () => {
    let releaseClose: (() => void) | undefined
    const close = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseClose = resolve
        })
    )
    const registry = new PluginSqliteResourceOwnerRegistry({
      createClient: () => ({
        execute: vi.fn(),
        query: vi.fn(),
        transaction: vi.fn(),
        close
      })
    })
    await registry.acquire(identity('alpha'), await createPluginDataPath('alpha'))

    let settled = false
    const closing = registry.closePlugin('alpha').then((result) => {
      settled = true
      return result
    })
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(settled).toBe(false)
    releaseClose?.()
    await expect(closing).resolves.toBe(true)
  })

  it('caps active operations across all plugin workers', async () => {
    const executeMocks: Array<ReturnType<typeof vi.fn>> = []
    const releases: Array<() => void> = []
    const registry = new PluginSqliteResourceOwnerRegistry({
      maxActiveOperations: 4,
      createClient: () => {
        const execute = vi.fn(
          () =>
            new Promise<{ rowsAffected: number; lastInsertRowId: null }>((resolve) => {
              releases.push(() => resolve({ rowsAffected: 1, lastInsertRowId: null }))
            })
        )
        executeMocks.push(execute)
        return {
          execute,
          query: vi.fn(),
          transaction: vi.fn(),
          close: vi.fn()
        }
      }
    })
    const clients = await Promise.all(
      Array.from({ length: 5 }, async (_, index) => {
        const name = `plugin-${index}`
        return registry.acquire(identity(name), await createPluginDataPath(name))
      })
    )

    const operations = clients.map((client) => client.execute('DELETE FROM notes', []))
    expect(executeMocks.reduce((sum, mock) => sum + mock.mock.calls.length, 0)).toBe(4)
    expect(executeMocks.filter((mock) => mock.mock.calls.length === 0)).toHaveLength(1)

    releases[0]()
    await vi.waitFor(() => {
      expect(executeMocks.reduce((sum, mock) => sum + mock.mock.calls.length, 0)).toBe(5)
    })
    for (const release of releases.slice(1)) release()
    await Promise.all(operations)
    await registry.closeAll()
  })

  it('bounds each owner queue before global scheduling', async () => {
    const releases: Array<() => void> = []
    const registry = new PluginSqliteResourceOwnerRegistry({
      maxActiveOperations: 1,
      createClient: () => ({
        execute: vi.fn(
          () =>
            new Promise<{ rowsAffected: number; lastInsertRowId: null }>((resolve) => {
              releases.push(() => resolve({ rowsAffected: 1, lastInsertRowId: null }))
            })
        ),
        query: vi.fn(),
        transaction: vi.fn(),
        close: vi.fn()
      })
    })
    const client = await registry.acquire(identity('alpha'), await createPluginDataPath('alpha'))
    const accepted = Array.from({ length: 8 }, () => client.execute('DELETE FROM notes', []))
    await expect(client.execute('DELETE FROM notes', [])).rejects.toMatchObject({
      code: 'PLUGIN_SQLITE_CONCURRENCY_LIMIT'
    })

    for (let index = 0; index < accepted.length; index += 1) {
      await vi.waitFor(() => expect(releases[index]).toBeTypeOf('function'))
      releases[index]()
    }
    await Promise.all(accepted)
  })

  it('evicts the least-recent idle owner at the worker cap', async () => {
    const close = vi.fn()
    const registry = new PluginSqliteResourceOwnerRegistry({
      maxWorkers: 1,
      createClient: () => ({
        execute: vi.fn(),
        query: vi.fn(),
        transaction: vi.fn(),
        close
      })
    })
    await registry.acquire(identity('alpha'), await createPluginDataPath('alpha'))

    await expect(
      registry.acquire(identity('beta'), await createPluginDataPath('beta'))
    ).resolves.toBeTruthy()
    expect(close).toHaveBeenCalledOnce()
  })

  it('rejects a new owner when all worker slots are active', async () => {
    let release: (() => void) | undefined
    const registry = new PluginSqliteResourceOwnerRegistry({
      maxWorkers: 1,
      createClient: () => ({
        execute: vi.fn(
          () =>
            new Promise<{ rowsAffected: number; lastInsertRowId: null }>((resolve) => {
              release = () => resolve({ rowsAffected: 1, lastInsertRowId: null })
            })
        ),
        query: vi.fn(),
        transaction: vi.fn(),
        close: vi.fn()
      })
    })
    const alpha = await registry.acquire(identity('alpha'), await createPluginDataPath('alpha'))
    const active = alpha.execute('DELETE FROM notes', [])

    await expect(
      registry.acquire(identity('beta'), await createPluginDataPath('beta'))
    ).rejects.toMatchObject({ code: 'PLUGIN_SQLITE_CONCURRENCY_LIMIT' })
    release?.()
    await active
  })

  it('rejects a symlinked plugin owner even when it targets another plugin', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tuff-plugin-owner-symlink-'))
    roots.push(root)
    const pluginsRoot = path.join(root, 'modules', 'plugins')
    const betaOwner = path.join(pluginsRoot, 'beta')
    const betaData = path.join(betaOwner, 'data')
    await mkdir(betaOwner, { recursive: true })
    await symlink(betaOwner, path.join(pluginsRoot, 'alpha'))

    await expect(
      resolvePluginSqliteDatabasePath(path.join(pluginsRoot, 'alpha', 'data'))
    ).rejects.toMatchObject({ code: 'PLUGIN_SQLITE_SYMLINK_DENIED' })
    await expect(access(betaData)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects symlinked data directories outside the plugin root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tuff-plugin-sqlite-symlink-'))
    roots.push(root)
    const pluginDirectory = path.join(root, 'modules', 'plugins', 'alpha')
    const outside = path.join(root, 'outside')
    await mkdir(pluginDirectory, { recursive: true })
    await mkdir(outside)
    const dataPath = path.join(pluginDirectory, 'data')
    await symlink(outside, dataPath)

    await expect(resolvePluginSqliteDatabasePath(dataPath)).rejects.toMatchObject({
      code: 'PLUGIN_SQLITE_SYMLINK_DENIED'
    })
  })
})
