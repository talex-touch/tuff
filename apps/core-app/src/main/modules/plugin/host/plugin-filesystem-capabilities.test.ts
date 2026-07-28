import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityError, PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import {
  createPluginBatchRenameFilesystemCapability,
  type PluginBatchRenameFilesystemAdapter
} from './plugin-filesystem-capabilities'
import { HOST_PROTOCOL_VERSION } from './plugin-host-wire'

const OWNER = Object.freeze({
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'batch-rename-filesystem-owner',
  hostGeneration: 17
})
const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true }))
  )
})

function activation(generation = 1): PluginActivationIdentity {
  return Object.freeze({
    name: 'touch-batch-rename',
    pluginInstanceId: 'batch-rename-instance',
    activationGeneration: generation,
    key: `batch-rename-key-${generation}`
  })
}

async function fixtureFiles(names: readonly string[]): Promise<{ root: string; paths: string[] }> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'tuff-batch-rename-capability-'))
  tempRoots.push(root)
  const paths = names.map((name) => path.join(root, name))
  await Promise.all(paths.map((filePath, index) => fsp.writeFile(filePath, `file-${index}`)))
  return { root, paths }
}

function lifecycleInput(paths: readonly string[]): unknown {
  return {
    text: 'prefix:renamed-',
    inputs: [{ type: 'files', content: JSON.stringify(paths) }]
  }
}

function createHarness(
  options: {
    platform?: NodeJS.Platform
    filesystem?: Partial<PluginBatchRenameFilesystemAdapter>
  } = {}
) {
  const initial = activation()
  let current = initial
  const permissions = new Set(['fs.read', 'fs.write'])
  const revokeWatchers = new Map<string, Set<() => void>>()
  const capability = createPluginBatchRenameFilesystemCapability({
    activation: initial,
    platform: options.platform ?? process.platform,
    resolveCurrentActivation: () => current,
    hasPermission: (_pluginName, permissionId) => permissions.has(permissionId),
    ...(options.filesystem ? { filesystem: options.filesystem } : {})
  })
  const registry = new PluginHostCapabilityRegistry({
    owner: OWNER,
    activation: initial,
    resolveCurrentActivation: () => current,
    authorize: (_pluginName, permissionId) => permissions.has(permissionId),
    watchPermissionRevoked: (_pluginName, permissionId, callback) => {
      const watchers = revokeWatchers.get(permissionId) ?? new Set()
      watchers.add(callback)
      revokeWatchers.set(permissionId, watchers)
      return () => watchers.delete(callback)
    },
    onFatalViolation: vi.fn()
  })
  for (const definition of capability.definitions) registry.register(definition)
  return {
    capability,
    registry,
    rotate: () => {
      current = activation(current.activationGeneration + 1)
    },
    revoke(permissionId: string) {
      permissions.delete(permissionId)
      for (const callback of revokeWatchers.get(permissionId) ?? []) callback()
    }
  }
}

describe('batch rename filesystem capability', () => {
  it('renames and undoes only lifecycle-approved regular files', async () => {
    const { paths } = await fixtureFiles(['alpha.txt', 'beta.txt'])
    const harness = createHarness()
    await expect(
      harness.capability.approveLifecycleFileInputs(lifecycleInput(paths))
    ).resolves.toBe(2)

    await expect(
      harness.registry.dispatch('filesystem.write', {
        operation: 'rename-batch',
        entries: [
          { source: paths[0], targetName: 'renamed-alpha.txt' },
          { source: paths[1], targetName: 'renamed-beta.txt' }
        ]
      })
    ).resolves.toEqual({
      operation: 'rename-batch',
      entries: [
        { index: 0, status: 'renamed' },
        { index: 1, status: 'renamed' }
      ]
    })

    const renamed = [
      path.join(path.dirname(paths[0]), 'renamed-alpha.txt'),
      path.join(path.dirname(paths[1]), 'renamed-beta.txt')
    ]
    expect(await Promise.all(renamed.map((filePath) => fsp.readFile(filePath, 'utf8')))).toEqual([
      'file-0',
      'file-1'
    ])
    await expect(
      harness.registry.dispatch('filesystem.write', {
        operation: 'rename-batch',
        entries: [
          { source: renamed[0], targetName: 'alpha.txt' },
          { source: renamed[1], targetName: 'beta.txt' }
        ]
      })
    ).resolves.toMatchObject({ operation: 'rename-batch' })
    expect(await Promise.all(paths.map((filePath) => fsp.readFile(filePath, 'utf8')))).toEqual([
      'file-0',
      'file-1'
    ])
    await harness.registry.close()
    await harness.capability.close()
  })

  it('rejects unapproved paths, symlinks, existing targets and case-fold collisions', async () => {
    const { root, paths } = await fixtureFiles(['alpha.txt', 'beta.txt', 'occupied.txt'])
    const harness = createHarness({ platform: 'darwin' })
    await harness.capability.approveLifecycleFileInputs(lifecycleInput(paths.slice(0, 2)))

    for (const entries of [
      [{ source: path.join(root, 'occupied.txt'), targetName: 'outside.txt' }],
      [{ source: paths[0], targetName: 'occupied.txt' }],
      [
        { source: paths[0], targetName: 'same.txt' },
        { source: paths[1], targetName: 'SAME.txt' }
      ]
    ]) {
      await expect(
        harness.registry.dispatch('filesystem.write', { operation: 'rename-batch', entries })
      ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
    }

    const symlink = path.join(root, 'link.txt')
    await fsp.symlink(paths[0], symlink)
    await expect(
      harness.capability.approveLifecycleFileInputs(lifecycleInput([symlink]))
    ).resolves.toBe(0)
    expect(fs.existsSync(paths[0])).toBe(true)
    expect(fs.existsSync(paths[1])).toBe(true)
    await harness.registry.close()
    await harness.capability.close()
  })

  it('rejects hostile exact schemas before filesystem work', () => {
    const harness = createHarness()
    const definition = harness.capability.definitions[0]
    const sparse: unknown[] = []
    sparse.length = 1
    const getter = vi.fn(() => 'secret')
    const accessor = { source: '/tmp/a', targetName: 'b' }
    Object.defineProperty(accessor, 'source', { enumerable: true, get: getter })
    const proxyTrap = vi.fn(() => {
      throw new Error('proxy trap must not run')
    })

    for (const request of [
      { operation: 'rename', entries: [] },
      { operation: 'rename-batch', entries: [], pluginName: 'forged' },
      { operation: 'rename-batch', entries: sparse },
      { operation: 'rename-batch', entries: [accessor] },
      {
        operation: 'rename-batch',
        entries: [new Proxy({ source: '/tmp/a', targetName: 'b' }, { ownKeys: proxyTrap })]
      },
      { operation: 'rename-batch', entries: [{ source: '/tmp/a', targetName: '../b' }] },
      { operation: 'rename-batch', entries: [{ source: '/tmp/a', targetName: 'CON.txt' }] }
    ]) {
      expect(() => definition.validateRequest(request)).toThrow('PLUGIN_FILESYSTEM_REQUEST_INVALID')
    }
    expect(getter).not.toHaveBeenCalled()
    expect(proxyTrap).not.toHaveBeenCalled()
  })

  it('rolls back completed renames when cancellation or permission revoke wins', async () => {
    for (const mode of ['cancel', 'revoke'] as const) {
      const { paths } = await fixtureFiles([`${mode}-alpha.txt`, `${mode}-beta.txt`])
      const controller = new AbortController()
      let harness: ReturnType<typeof createHarness>
      let renameCount = 0
      harness = createHarness({
        filesystem: {
          async rename(source, target) {
            await fsp.rename(source, target)
            renameCount += 1
            if (renameCount === 1) {
              if (mode === 'cancel') controller.abort()
              else harness.revoke('fs.write')
            }
          }
        }
      })
      await harness.capability.approveLifecycleFileInputs(lifecycleInput(paths))
      await expect(
        harness.registry.dispatch(
          'filesystem.write',
          {
            operation: 'rename-batch',
            entries: paths.map((source, index) => ({
              source,
              targetName: `${mode}-${index}.txt`
            }))
          },
          mode === 'cancel' ? controller.signal : undefined
        )
      ).rejects.toEqual(
        new PluginHostCapabilityError(
          mode === 'cancel'
            ? 'PLUGIN_HOST_CAPABILITY_CANCELLED'
            : 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
        )
      )
      await vi.waitFor(() => expect(harness.capability.activeOperationCount).toBe(0))
      expect(await Promise.all(paths.map((filePath) => fsp.readFile(filePath, 'utf8')))).toEqual([
        'file-0',
        'file-1'
      ])
      expect(
        (await fsp.readdir(path.dirname(paths[0]))).some((name) => name.includes('.tuff-rename-'))
      ).toBe(false)
      await harness.registry.close()
      await harness.capability.close()
    }
  })

  it('fails stale generations and waits for the active transaction during close', async () => {
    const staleFixture = await fixtureFiles(['stale.txt'])
    const stale = createHarness()
    await stale.capability.approveLifecycleFileInputs(lifecycleInput(staleFixture.paths))
    stale.rotate()
    await expect(
      stale.registry.dispatch('filesystem.write', {
        operation: 'rename-batch',
        entries: [{ source: staleFixture.paths[0], targetName: 'rotated.txt' }]
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION'))
    expect(fs.existsSync(staleFixture.paths[0])).toBe(true)

    const barrierFixture = await fixtureFiles(['barrier.txt'])
    let releaseRename!: () => void
    const renameBarrier = new Promise<void>((resolve) => {
      releaseRename = resolve
    })
    const barrier = createHarness({
      filesystem: {
        async rename(source, target) {
          await renameBarrier
          await fsp.rename(source, target)
        }
      }
    })
    await barrier.capability.approveLifecycleFileInputs(lifecycleInput(barrierFixture.paths))
    const operation = barrier.registry.dispatch('filesystem.write', {
      operation: 'rename-batch',
      entries: [{ source: barrierFixture.paths[0], targetName: 'closed.txt' }]
    })
    await vi.waitFor(() => expect(barrier.capability.activeOperationCount).toBe(1))
    let closed = false
    const closing = barrier.capability.close().then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    releaseRename()
    await expect(operation).resolves.toMatchObject({ operation: 'rename-batch' })
    await closing
    expect(closed).toBe(true)
    await barrier.registry.close()
  })
})
