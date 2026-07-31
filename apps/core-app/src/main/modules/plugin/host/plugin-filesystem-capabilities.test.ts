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
    generation?: number
    filesystem?: Partial<PluginBatchRenameFilesystemAdapter>
  } = {}
) {
  const initial = activation(options.generation ?? 1)
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

  it('commits and reverses swaps and rename cycles without clobbering', async () => {
    const swapFixture = await fixtureFiles(['swap-a.txt', 'swap-b.txt'])
    const swapHarness = createHarness()
    await swapHarness.capability.approveLifecycleFileInputs(lifecycleInput(swapFixture.paths))
    const swap = [
      { source: swapFixture.paths[0], targetName: 'swap-b.txt' },
      { source: swapFixture.paths[1], targetName: 'swap-a.txt' }
    ]
    await expect(
      swapHarness.registry.dispatch('filesystem.write', {
        operation: 'rename-batch',
        entries: swap
      })
    ).resolves.toMatchObject({ operation: 'rename-batch' })
    await expect(
      Promise.all(swapFixture.paths.map((filePath) => fsp.readFile(filePath, 'utf8')))
    ).resolves.toEqual(['file-1', 'file-0'])
    await swapHarness.registry.dispatch('filesystem.write', {
      operation: 'rename-batch',
      entries: swap
    })
    await expect(
      Promise.all(swapFixture.paths.map((filePath) => fsp.readFile(filePath, 'utf8')))
    ).resolves.toEqual(['file-0', 'file-1'])

    const cycleFixture = await fixtureFiles(['cycle-a.txt', 'cycle-b.txt', 'cycle-c.txt'])
    const cycleHarness = createHarness()
    await cycleHarness.capability.approveLifecycleFileInputs(lifecycleInput(cycleFixture.paths))
    await cycleHarness.registry.dispatch('filesystem.write', {
      operation: 'rename-batch',
      entries: [
        { source: cycleFixture.paths[0], targetName: 'cycle-b.txt' },
        { source: cycleFixture.paths[1], targetName: 'cycle-c.txt' },
        { source: cycleFixture.paths[2], targetName: 'cycle-a.txt' }
      ]
    })
    await expect(
      Promise.all(cycleFixture.paths.map((filePath) => fsp.readFile(filePath, 'utf8')))
    ).resolves.toEqual(['file-2', 'file-0', 'file-1'])
    await cycleHarness.registry.dispatch('filesystem.write', {
      operation: 'rename-batch',
      entries: [
        { source: cycleFixture.paths[0], targetName: 'cycle-c.txt' },
        { source: cycleFixture.paths[1], targetName: 'cycle-a.txt' },
        { source: cycleFixture.paths[2], targetName: 'cycle-b.txt' }
      ]
    })
    await expect(
      Promise.all(cycleFixture.paths.map((filePath) => fsp.readFile(filePath, 'utf8')))
    ).resolves.toEqual(['file-0', 'file-1', 'file-2'])

    await swapHarness.registry.close()
    await swapHarness.capability.close()
    await cycleHarness.registry.close()
    await cycleHarness.capability.close()
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
      ],
      [
        { source: paths[0], targetName: 'caf\u00e9.txt' },
        { source: paths[1], targetName: 'cafe\u0301.txt' }
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
    const directory = path.join(root, 'directory')
    await fsp.mkdir(directory)
    await expect(
      harness.capability.approveLifecycleFileInputs(lifecycleInput([directory]))
    ).resolves.toBe(0)
    expect(fs.existsSync(paths[0])).toBe(true)
    expect(fs.existsSync(paths[1])).toBe(true)
    await harness.registry.close()
    await harness.capability.close()
  })

  it('binds lifecycle approval to the original file and parent identities', async () => {
    const replacedFixture = await fixtureFiles(['approved.txt'])
    const replacedHarness = createHarness()
    await replacedHarness.capability.approveLifecycleFileInputs(
      lifecycleInput(replacedFixture.paths)
    )
    const originalPath = `${replacedFixture.paths[0]}.original`
    await fsp.rename(replacedFixture.paths[0], originalPath)
    await fsp.writeFile(replacedFixture.paths[0], 'replacement')

    await expect(
      replacedHarness.registry.dispatch('filesystem.write', {
        operation: 'rename-batch',
        entries: [{ source: replacedFixture.paths[0], targetName: 'renamed.txt' }]
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
    await expect(fsp.readFile(replacedFixture.paths[0], 'utf8')).resolves.toBe('replacement')
    await expect(fsp.readFile(originalPath, 'utf8')).resolves.toBe('file-0')

    const hardlinkFixture = await fixtureFiles(['hardlink-source.txt'])
    const hardlinkPath = path.join(hardlinkFixture.root, 'hardlink-alias.txt')
    await fsp.link(hardlinkFixture.paths[0], hardlinkPath)
    const hardlinkHarness = createHarness()
    await expect(
      hardlinkHarness.capability.approveLifecycleFileInputs(lifecycleInput([hardlinkPath]))
    ).resolves.toBe(0)

    const parentFixture = await fixtureFiles(['parent-source.txt'])
    const parentHarness = createHarness()
    await parentHarness.capability.approveLifecycleFileInputs(lifecycleInput(parentFixture.paths))
    const movedParent = `${parentFixture.root}.moved`
    tempRoots.push(movedParent)
    await fsp.rename(parentFixture.root, movedParent)
    await fsp.mkdir(parentFixture.root)
    await fsp.writeFile(parentFixture.paths[0], 'replacement-parent')

    await expect(
      parentHarness.registry.dispatch('filesystem.write', {
        operation: 'rename-batch',
        entries: [{ source: parentFixture.paths[0], targetName: 'parent-renamed.txt' }]
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
    await expect(fsp.readFile(parentFixture.paths[0], 'utf8')).resolves.toBe('replacement-parent')
    await expect(fsp.readFile(path.join(movedParent, 'parent-source.txt'), 'utf8')).resolves.toBe(
      'file-0'
    )

    await Promise.all([
      replacedHarness.registry.close(),
      replacedHarness.capability.close(),
      hardlinkHarness.registry.close(),
      hardlinkHarness.capability.close(),
      parentHarness.registry.close(),
      parentHarness.capability.close()
    ])
  })

  it('revokes stale lifecycle path approval when a new file input is admitted', async () => {
    const { paths } = await fixtureFiles(['first.txt', 'second.txt'])
    const harness = createHarness()
    await harness.capability.approveLifecycleFileInputs(lifecycleInput([paths[0]]))
    await harness.capability.approveLifecycleFileInputs(lifecycleInput([paths[1]]))

    await expect(
      harness.registry.dispatch('filesystem.write', {
        operation: 'rename-batch',
        entries: [{ source: paths[0], targetName: 'stale.txt' }]
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
    await expect(fsp.readFile(paths[0], 'utf8')).resolves.toBe('file-0')
    await harness.registry.close()
    await harness.capability.close()
  })

  it('does not let a new generation use the previous generation undo path', async () => {
    const { root, paths } = await fixtureFiles(['generation-one.txt'])
    const first = createHarness({ generation: 1 })
    await first.capability.approveLifecycleFileInputs(lifecycleInput(paths))
    await first.registry.dispatch('filesystem.write', {
      operation: 'rename-batch',
      entries: [{ source: paths[0], targetName: 'generation-one-renamed.txt' }]
    })
    await first.registry.close()
    await first.capability.close()

    const renamedPath = path.join(root, 'generation-one-renamed.txt')
    const second = createHarness({ generation: 2 })
    await expect(
      second.registry.dispatch('filesystem.write', {
        operation: 'rename-batch',
        entries: [{ source: renamedPath, targetName: 'generation-one.txt' }]
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
    await expect(fsp.readFile(renamedPath, 'utf8')).resolves.toBe('file-0')
    await second.registry.close()
    await second.capability.close()
  })

  it('never overwrites a target created after preparation', async () => {
    const { root, paths } = await fixtureFiles(['source.txt'])
    const target = path.join(root, 'raced.txt')
    let injected = false
    const harness = createHarness({
      filesystem: {
        async link(source, destination) {
          if (!injected && path.basename(destination) === 'raced.txt') {
            injected = true
            await fsp.writeFile(target, 'racing-writer')
          }
          await fsp.link(source, destination)
        }
      }
    })
    await harness.capability.approveLifecycleFileInputs(lifecycleInput(paths))

    await expect(
      harness.registry.dispatch('filesystem.write', {
        operation: 'rename-batch',
        entries: [{ source: paths[0], targetName: 'raced.txt' }]
      })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
    await expect(fsp.readFile(paths[0], 'utf8')).resolves.toBe('file-0')
    await expect(fsp.readFile(target, 'utf8')).resolves.toBe('racing-writer')
    await harness.registry.close()
    await harness.capability.close()
  })

  it('rolls back a link that succeeds before post-link verification fails', async () => {
    const { root, paths } = await fixtureFiles(['verify-source.txt'])
    let rejectLinkedTemp = true
    const harness = createHarness({
      filesystem: {
        async open(filePath, flags) {
          if (rejectLinkedTemp && path.basename(filePath).includes('.tuff-rename-')) {
            rejectLinkedTemp = false
            throw new Error(`/private/post-link-verification:${filePath}`)
          }
          return await fsp.open(filePath, flags)
        }
      }
    })
    await harness.capability.approveLifecycleFileInputs(lifecycleInput(paths))

    const failure = await harness.registry
      .dispatch('filesystem.write', {
        operation: 'rename-batch',
        entries: [{ source: paths[0], targetName: 'verify-target.txt' }]
      })
      .catch((error) => error)
    expect(failure).toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
    expect(JSON.stringify(failure)).not.toContain(root)
    await expect(fsp.readFile(paths[0], 'utf8')).resolves.toBe('file-0')
    expect((await fsp.readdir(root)).some((name) => name.includes('.tuff-rename-'))).toBe(false)
    await harness.registry.close()
    await harness.capability.close()
  })

  it('rejects hostile exact schemas before filesystem work', () => {
    const harness = createHarness()
    const definition = harness.capability.definitions[0]
    const absoluteSource = path.resolve('hostile-source.txt')
    const sparse: unknown[] = []
    sparse.length = 1
    const getter = vi.fn(() => 'secret')
    const accessor = { source: absoluteSource, targetName: 'b' }
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
        entries: [new Proxy({ source: absoluteSource, targetName: 'b' }, { ownKeys: proxyTrap })]
      },
      { operation: 'rename-batch', entries: [{ source: 'relative.txt', targetName: 'b' }] },
      {
        operation: 'rename-batch',
        entries: [{ source: absoluteSource, targetName: '../b' }]
      },
      {
        operation: 'rename-batch',
        entries: [{ source: absoluteSource, targetName: 'alternate:stream' }]
      },
      {
        operation: 'rename-batch',
        entries: [{ source: absoluteSource, targetName: `control${String.fromCharCode(1)}` }]
      },
      {
        operation: 'rename-batch',
        entries: [{ source: absoluteSource, targetName: 'CON.txt' }]
      },
      {
        operation: 'rename-batch',
        entries: [{ source: absoluteSource, targetName: 'COM¹.log' }]
      },
      {
        operation: 'rename-batch',
        entries: [{ source: absoluteSource, targetName: 'CONOUT$.txt' }]
      },
      {
        operation: 'rename-batch',
        entries: Array.from({ length: 65 }, (_, index) => ({
          source: path.resolve(`source-${index}.txt`),
          targetName: `target-${index}.txt`
        }))
      },
      {
        operation: 'rename-batch',
        entries: Array.from({ length: 64 }, (_, index) => ({
          source: `/${String(index).padStart(2, '0')}${'a'.repeat(4_092)}`,
          targetName: `target-${index}.txt`
        }))
      }
    ]) {
      expect(() => definition.validateRequest(request)).toThrow('PLUGIN_FILESYSTEM_REQUEST_INVALID')
    }
    const windowsDefinition = createHarness({ platform: 'win32' }).capability.definitions[0]
    expect(() =>
      windowsDefinition.validateRequest({
        operation: 'rename-batch',
        entries: [{ source: 'C:\\safe\\file.txt', targetName: 'renamed.txt' }]
      })
    ).not.toThrow()
    for (const source of [
      'C:\\safe\\file.txt:stream',
      'C:\\safe\\CON.txt',
      'C:\\safe\\LPT².log',
      'C:\\safe\\CONIN$.txt',
      '\\\\server\\share\\file.txt',
      '\\\\?\\C:\\safe\\file.txt'
    ]) {
      expect(() =>
        windowsDefinition.validateRequest({
          operation: 'rename-batch',
          entries: [{ source, targetName: 'renamed.txt' }]
        })
      ).toThrow('PLUGIN_FILESYSTEM_REQUEST_INVALID')
    }
    expect(getter).not.toHaveBeenCalled()
    expect(proxyTrap).not.toHaveBeenCalled()
  })

  it('rolls back when cancellation, permission revoke or generation rotation wins', async () => {
    for (const mode of ['cancel', 'revoke', 'rotate'] as const) {
      for (const triggerAt of Array.from({ length: 8 }, (_, index) => index + 1)) {
        const { paths } = await fixtureFiles([
          `${mode}-${triggerAt}-alpha.txt`,
          `${mode}-${triggerAt}-beta.txt`
        ])
        const controller = new AbortController()
        let harness: ReturnType<typeof createHarness>
        let renameCount = 0
        const onMutation = (): void => {
          renameCount += 1
          if (renameCount === triggerAt) {
            if (mode === 'cancel') controller.abort()
            else if (mode === 'revoke') harness.revoke('fs.write')
            else harness.rotate()
          }
        }
        harness = createHarness({
          filesystem: {
            async link(source, target) {
              await fsp.link(source, target)
              onMutation()
            },
            async unlink(filePath) {
              await fsp.unlink(filePath)
              onMutation()
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
                targetName: `${mode}-${triggerAt}-${index}.txt`
              }))
            },
            mode === 'cancel' ? controller.signal : undefined
          )
        ).rejects.toEqual(
          new PluginHostCapabilityError(
            mode === 'cancel'
              ? 'PLUGIN_HOST_CAPABILITY_CANCELLED'
              : mode === 'revoke'
                ? 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
                : 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'
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
    }
  })

  it('retries a failed rollback in the close barrier without leaking native detail', async () => {
    const { root, paths } = await fixtureFiles(['rollback-source.txt'])
    let unlinkCalls = 0
    const harness = createHarness({
      filesystem: {
        async unlink(filePath) {
          unlinkCalls += 1
          if (unlinkCalls <= 2) {
            throw new Error(`/private/native-rollback:${filePath}`)
          }
          await fsp.unlink(filePath)
        }
      }
    })
    await harness.capability.approveLifecycleFileInputs(lifecycleInput(paths))

    const failure = await harness.registry
      .dispatch('filesystem.write', {
        operation: 'rename-batch',
        entries: [{ source: paths[0], targetName: 'rollback-target.txt' }]
      })
      .catch((error) => error)
    expect(failure).toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'))
    expect(JSON.stringify(failure)).not.toContain(root)
    await expect(harness.capability.close()).resolves.toBeUndefined()
    await expect(fsp.readFile(paths[0], 'utf8')).resolves.toBe('file-0')
    expect((await fsp.readdir(root)).some((name) => name.includes('.tuff-rename-'))).toBe(false)
    await harness.registry.close()
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
        async link(source, target) {
          await renameBarrier
          await fsp.link(source, target)
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
