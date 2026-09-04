import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { issuePluginSecurityContext } from '@talex-touch/utils/transport/security/plugin-identity'
import {
  type FileHandle,
  lstat as fsLstat,
  mkdir,
  mkdtemp,
  open as fsOpen,
  readFile,
  realpath,
  realpath as fsRealpath,
  readdir,
  rename as fsRename,
  rm,
  symlink,
  truncate,
  unlink as fsUnlink,
  writeFile
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import type { PluginHostCapabilityResourceContext } from './plugin-host-resources'
import {
  createFixedPluginHostsService,
  createPluginHostsCapabilities,
  type PluginHostsMutationRequest,
  type PluginHostsReplaceOutcome,
  type TrustedPluginHostsService
} from './plugin-hosts-capabilities'

const activation: PluginActivationIdentity = Object.freeze({
  name: 'touch-hosts',
  pluginInstanceId: 'hosts-instance',
  activationGeneration: 1,
  key: 'hosts-key'
})
const roots: string[] = []
const error = (code: string) => expect.objectContaining({ code })

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

interface HostsFixture {
  root: string
  target: string
  backup: string
}

async function fixture(content: string): Promise<HostsFixture> {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'hosts-capability-')))
  roots.push(root)
  const target = path.join(root, 'System32', 'drivers', 'etc', 'hosts')
  const backup = path.join(root, 'backups')
  await mkdir(path.dirname(target), { recursive: true })
  await mkdir(backup, { recursive: true })
  await writeFile(target, content)
  return { root, target, backup }
}

function harness(service: TrustedPluginHostsService, options: { allowed?: boolean } = {}) {
  let current: PluginActivationIdentity | undefined = activation
  let generation = 7
  let allowed = options.allowed ?? true
  const revoke = new Set<() => void>()
  const capability = createPluginHostsCapabilities({
    activation,
    resolveCurrentActivation: () => current,
    resolveHostGeneration: () => generation,
    authorizeRead: () => allowed,
    authorizeWrite: () => allowed,
    authorizeShell: () => allowed,
    watchReadPermissionRevoked: (_name, onRevoke) => (
      revoke.add(onRevoke),
      () => revoke.delete(onRevoke)
    ),
    watchWritePermissionRevoked: (_name, onRevoke) => (
      revoke.add(onRevoke),
      () => revoke.delete(onRevoke)
    ),
    watchShellPermissionRevoked: (_name, onRevoke) => (
      revoke.add(onRevoke),
      () => revoke.delete(onRevoke)
    ),
    service
  })
  const registry = new PluginHostCapabilityRegistry({
    owner: { protocolVersion: 2, activationHandle: 'hosts-handle', hostGeneration: 7 },
    activation,
    resolveCurrentActivation: () => current,
    authorize: () => allowed,
    watchPermissionRevoked: (_name, _permission, onRevoke) => (
      revoke.add(onRevoke),
      () => revoke.delete(onRevoke)
    ),
    onFatalViolation: () => undefined
  })
  registry.register(capability.definitions[0]!)
  return {
    registry,
    capability,
    revokePermissions() {
      allowed = false
      for (const callback of revoke) callback()
    },
    rotate() {
      current = { ...activation, activationGeneration: 2, key: 'rotated' }
    },
    rotateHost() {
      generation = 8
    }
  }
}

function serviceFor(
  fixtureData: HostsFixture,
  confirmMutation: (request: PluginHostsMutationRequest, signal: AbortSignal) => Promise<boolean>,
  replaceFile?: (stagedPath: string, targetPath: string) => Promise<PluginHostsReplaceOutcome>,
  openFile?: (filePath: string, flags: number, mode?: number) => Promise<FileHandle>,
  unlinkFile?: (filePath: string) => Promise<void>
): TrustedPluginHostsService {
  const windowsTarget = path.win32.join(fixtureData.root, 'System32', 'drivers', 'etc', 'hosts')
  const mapTarget = (value: string): string =>
    value === windowsTarget ? fixtureData.target : value
  return createFixedPluginHostsService({
    platform: 'win32',
    windowsDirectory: fixtureData.root,
    backupDirectory: fixtureData.backup,
    filesystem: {
      lstat: (filePath) => fsLstat(mapTarget(filePath)),
      realpath: async (filePath) => (filePath === windowsTarget ? filePath : fsRealpath(filePath)),
      open: (filePath, flags, mode) =>
        openFile?.(mapTarget(filePath), flags, mode) ?? fsOpen(mapTarget(filePath), flags, mode),
      rename: (oldPath, newPath) => fsRename(mapTarget(oldPath), mapTarget(newPath)),
      unlink: (filePath) => unlinkFile?.(mapTarget(filePath)) ?? fsUnlink(mapTarget(filePath))
    },
    confirmMutation,
    replaceFile: async ({ stagedPath, targetPath }) => {
      if (replaceFile) return replaceFile(stagedPath, mapTarget(targetPath))
      await fsRename(stagedPath, mapTarget(targetPath))
      return 'committed'
    }
  })
}

describe('system.hosts capability and fixed service', () => {
  it('parses aliases and skips prohibited Hosts rows without writing during preview', async () => {
    const data = await fixture(
      '127.0.0.1 api.example.test api.example.test\n::1 API.EXAMPLE.TEST\n127.0.0.1 localhost\n127.0.0.1 LOCALHOST\n0.0.0.0 blocked.example.test\n:: unspecified.example.test\n'
    )
    const service = serviceFor(data, async () => {
      throw new Error('must not confirm')
    })
    const result = await service.read(new AbortController().signal)
    expect(result).toEqual({
      status: 'ready',
      revision: expect.any(String),
      entries: [{ hostname: 'api.example.test', addresses: ['127.0.0.1', '::1'] }]
    })
    expect(await readFile(data.target, 'utf8')).toContain('localhost')
  })

  it('constructs on unsupported platforms and returns stable visible reasons', async () => {
    const data = await fixture('127.0.0.1 api.example.test\n')
    const service = createFixedPluginHostsService({
      platform: 'aix',
      backupDirectory: data.backup,
      confirmMutation: vi.fn(async () => true),
      replaceFile: vi.fn(async () => 'committed' as const)
    })
    await expect(service.read(new AbortController().signal)).resolves.toEqual({
      status: 'unsupported',
      reason: 'path-unsupported',
      entries: []
    })
    await expect(
      service.apply(
        { operation: 'upsert', hostname: 'new.example.test', addresses: ['192.0.2.1'] },
        new AbortController().signal
      )
    ).resolves.toEqual({ status: 'failed', reason: 'path-unsupported' })
  })

  it('fails closed for oversized, symlinked, and unreadable Hosts targets', async () => {
    const oversized = await fixture('127.0.0.1 api.example.test\n')
    await truncate(oversized.target, 1024 * 1024 + 1)
    await expect(
      serviceFor(oversized, async () => true).read(new AbortController().signal)
    ).resolves.toMatchObject({ status: 'degraded', reason: 'file-too-large' })

    const linked = await fixture('127.0.0.1 api.example.test\n')
    const external = path.join(linked.root, 'outside-hosts')
    await writeFile(external, '192.0.2.1 outside.example.test\n')
    await rm(linked.target)
    await symlink(external, linked.target)
    await expect(
      serviceFor(linked, async () => true).read(new AbortController().signal)
    ).resolves.toMatchObject({ status: 'degraded', reason: 'file-invalid' })

    const unreadable = await fixture('127.0.0.1 api.example.test\n')
    const service = createFixedPluginHostsService({
      platform: 'win32',
      windowsDirectory: unreadable.root,
      backupDirectory: unreadable.backup,
      filesystem: {
        lstat: async () => {
          throw Object.assign(new Error('denied'), { code: 'EACCES' })
        }
      },
      confirmMutation: vi.fn(async () => true),
      replaceFile: vi.fn(async () => 'committed' as const)
    })
    await expect(service.read(new AbortController().signal)).resolves.toMatchObject({
      status: 'degraded',
      reason: 'read-failed'
    })
  })

  it('requires confirmation, creates a recoverable backup, and reports no-op without backup', async () => {
    const data = await fixture('127.0.0.1 api.example.test\n')
    let confirm = false
    const service = serviceFor(data, async () => confirm)
    const signal = new AbortController().signal
    const before = await service.read(signal)
    const request = {
      operation: 'upsert',
      hostname: 'new.example.test',
      addresses: ['192.0.2.1']
    } as const
    await expect(service.apply(request, signal)).resolves.toMatchObject({
      status: 'blocked',
      reason: 'confirmation-denied'
    })
    expect(await readFile(data.target, 'utf8')).toBe('127.0.0.1 api.example.test\n')
    confirm = true
    const applied = await service.apply(
      { ...request, expectedRevision: before.status === 'ready' ? before.revision : undefined },
      signal
    )
    expect(applied).toMatchObject({ status: 'started', backupCreated: true })
    expect(await readFile(data.target, 'utf8')).toContain('192.0.2.1 new.example.test')
    expect(await readdir(data.backup)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^hosts-.*\.bak$/)])
    )
    await expect(
      service.apply({ operation: 'remove', hostname: 'missing.example.test' }, signal)
    ).resolves.toMatchObject({ status: 'started', backupCreated: false })
  })

  it('removes partial backup files but preserves pre-existing backup or stage sentinels', async () => {
    for (const failure of ['open-backup', 'open-stage', 'write', 'sync', 'chmod'] as const) {
      const data = await fixture('127.0.0.1 api.example.test\n')
      let interceptedBackup = false
      let sentinelPath: string | undefined
      const service = serviceFor(
        data,
        async () => true,
        undefined,
        async (filePath, flags, mode) => {
          if (path.dirname(filePath) !== data.backup) return fsOpen(filePath, flags, mode)
          interceptedBackup = true
          const isStagePath = path.basename(filePath).startsWith('.hosts-stage-')
          const existingFile =
            (failure === 'open-backup' && !isStagePath) || (failure === 'open-stage' && isStagePath)
          if (existingFile) {
            sentinelPath = filePath
            await writeFile(filePath, `existing ${failure} sentinel\n`)
            throw Object.assign(new Error(`synthetic ${failure} collision`), { code: 'EEXIST' })
          }
          const handle = await fsOpen(filePath, flags, mode)
          const fail = async (): Promise<void> => {
            throw new Error(`synthetic backup ${failure} failure`)
          }
          return {
            writeFile: failure === 'write' ? fail : handle.writeFile.bind(handle),
            sync: failure === 'sync' ? fail : handle.sync.bind(handle),
            chmod: failure === 'chmod' ? fail : handle.chmod.bind(handle),
            close: handle.close.bind(handle)
          } as FileHandle
        }
      )

      await expect(
        service.apply(
          { operation: 'upsert', hostname: 'new.example.test', addresses: ['192.0.2.1'] },
          new AbortController().signal
        )
      ).resolves.toEqual({ status: 'failed', reason: 'backup-failed' })
      expect(interceptedBackup).toBe(true)
      await expect(readFile(data.target, 'utf8')).resolves.toBe('127.0.0.1 api.example.test\n')
      if (failure.startsWith('open-')) {
        expect(sentinelPath).toEqual(expect.any(String))
        await expect(readFile(sentinelPath!, 'utf8')).resolves.toBe(
          `existing ${failure} sentinel\n`
        )
      } else {
        await expect(readdir(data.backup)).resolves.toEqual([])
      }
    }
  })

  it('keeps an atomically committed Hosts replacement truthful when cancellation arrives immediately after commit', async () => {
    for (const cancellation of ['caller abort', 'permission revocation'] as const) {
      const data = await fixture('127.0.0.1 api.example.test\n')
      const controller = new AbortController()
      let triggerLateCancellation: (() => void) | undefined
      const service = serviceFor(
        data,
        async () => true,
        async (stagedPath, targetPath) => {
          await fsRename(stagedPath, targetPath)
          triggerLateCancellation!()
          return 'committed'
        }
      )
      const h = harness(service)
      triggerLateCancellation =
        cancellation === 'caller abort' ? () => controller.abort() : () => h.revokePermissions()

      const result = await h.registry.dispatch(
        'system.hosts',
        { operation: 'upsert', hostname: 'new.example.test', addresses: ['192.0.2.1'] },
        controller.signal
      )
      const after = await service.read(new AbortController().signal)

      expect(after.status).toBe('ready')
      if (after.status !== 'ready') throw new Error('committed Hosts file was not readable')
      expect(result).toEqual({
        status: 'started',
        revision: after.revision,
        backupCreated: true
      })
      await expect(readFile(data.target, 'utf8')).resolves.toBe(
        '127.0.0.1 api.example.test\n192.0.2.1 new.example.test\n'
      )
      await expect(readdir(data.backup)).resolves.toEqual(
        expect.arrayContaining([expect.stringMatching(/^hosts-.*\.bak$/)])
      )
      await h.capability.close()
      h.registry.close()
    }
  })

  it('returns a committed Hosts mutation before delayed staged-file cleanup settles', async () => {
    const data = await fixture('127.0.0.1 api.example.test\n')
    let releaseCleanup!: () => void
    let finishCleanup!: () => void
    const cleanupBarrier = new Promise<void>((resolve) => {
      releaseCleanup = resolve
    })
    const cleanupFinished = new Promise<void>((resolve) => {
      finishCleanup = resolve
    })
    let notifyCleanupStarted!: () => void
    const cleanupObserved = new Promise<void>((resolve) => {
      notifyCleanupStarted = resolve
    })
    const service = serviceFor(
      data,
      async () => true,
      undefined,
      undefined,
      async (filePath) => {
        if (!path.basename(filePath).startsWith('.hosts-stage-')) return fsUnlink(filePath)
        notifyCleanupStarted()
        await cleanupBarrier
        try {
          await fsUnlink(filePath)
        } finally {
          finishCleanup()
        }
      }
    )
    const h = harness(service)
    const dispatch = h.registry.dispatch('system.hosts', {
      operation: 'upsert',
      hostname: 'new.example.test',
      addresses: ['192.0.2.1']
    })
    let settled = false
    let settledResult: unknown
    let settledError: unknown
    void dispatch.then(
      (result) => {
        settled = true
        settledResult = result
      },
      (error) => {
        settled = true
        settledError = error
      }
    )

    try {
      await cleanupObserved
      await vi.waitFor(() => {
        expect(settled).toBe(true)
        expect(settledError).toBeUndefined()
        expect(settledResult).toMatchObject({ status: 'started', backupCreated: true })
      })
    } finally {
      releaseCleanup()
      await cleanupFinished
    }
    await expect(readFile(data.target, 'utf8')).resolves.toBe(
      '127.0.0.1 api.example.test\n192.0.2.1 new.example.test\n'
    )
    await h.capability.close()
    h.registry.close()
  })

  it('reports a privileged commit-point revision conflict without replacing the file', async () => {
    const data = await fixture('127.0.0.1 api.example.test\n')
    const service = serviceFor(
      data,
      async () => true,
      async () => {
        throw new Error('revision-conflict')
      }
    )
    await expect(
      service.apply(
        { operation: 'upsert', hostname: 'new.example.test', addresses: ['192.0.2.1'] },
        new AbortController().signal
      )
    ).resolves.toEqual({ status: 'blocked', reason: 'revision-conflict' })
    await expect(readFile(data.target, 'utf8')).resolves.toBe('127.0.0.1 api.example.test\n')
  })
  it('authorizes the holder, rejects forged/stale authority and malformed request/result', async () => {
    const data = await fixture('127.0.0.1 api.example.test\n')
    const h = harness(serviceFor(data, async () => true))
    await expect(h.registry.dispatch('system.hosts', { operation: 'read' })).resolves.toMatchObject(
      { status: 'ready' }
    )
    expect(() =>
      createPluginHostsCapabilities({
        activation: { ...activation, name: 'not-hosts' },
        resolveCurrentActivation: () => activation,
        resolveHostGeneration: () => 7,
        authorizeRead: () => true,
        authorizeWrite: () => true,
        authorizeShell: () => true,
        watchReadPermissionRevoked: () => () => undefined,
        watchWritePermissionRevoked: () => () => undefined,
        watchShellPermissionRevoked: () => () => undefined,
        service: serviceFor(data, async () => true)
      })
    ).toThrow(error('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
    const forged = issuePluginSecurityContext(activation, 'plugin-host', { hostGeneration: 7 })
    const definition = h.capability.definitions[0]!
    await expect(
      definition.invoke(
        { ...forged, identity: { ...forged.identity } } as PluginSecurityContext,
        { operation: 'read' },
        new AbortController().signal,
        {} as PluginHostCapabilityResourceContext
      )
    ).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
    h.rotate()
    await expect(h.registry.dispatch('system.hosts', { operation: 'read' })).rejects.toMatchObject(
      error('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    )
    expect(() =>
      definition.validateRequest({
        operation: 'upsert',
        hostname: 'bad',
        addresses: ['not-an-ip'],
        extra: true
      })
    ).toThrow()
    expect(() =>
      definition.validateResult({ status: 'ready', revision: 'bad', entries: [] })
    ).toThrow()
  })

  it('denies and revokes permissions, propagates cancellation, and closes authority', async () => {
    const data = await fixture('127.0.0.1 api.example.test\n')
    const h = harness(
      serviceFor(
        data,
        async (_request, signal) =>
          new Promise<boolean>((resolve) =>
            signal.addEventListener('abort', () => resolve(false), { once: true })
          )
      ),
      { allowed: false }
    )
    await expect(h.registry.dispatch('system.hosts', { operation: 'read' })).rejects.toMatchObject(
      error('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    )
    h.revokePermissions()
    await expect(h.registry.dispatch('system.hosts', { operation: 'read' })).rejects.toMatchObject(
      error('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    )
    const allowed = harness(
      serviceFor(
        data,
        async (_request, signal) =>
          new Promise<boolean>((resolve) =>
            signal.addEventListener('abort', () => resolve(false), { once: true })
          )
      )
    )
    const controller = new AbortController()
    const call = allowed.registry.dispatch(
      'system.hosts',
      { operation: 'upsert', hostname: 'new.example.test', addresses: ['192.0.2.1'] },
      controller.signal
    )
    await vi.waitFor(() => expect(allowed.registry.activeCount).toBe(1))
    controller.abort()
    await expect(call).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_CANCELLED'))
    await expect(readFile(data.target, 'utf8')).resolves.toBe('127.0.0.1 api.example.test\n')
    await vi.waitFor(() => expect(allowed.registry.activeCount).toBe(0))
    await allowed.capability.close()
    allowed.registry.close()
    await expect(
      allowed.registry.dispatch('system.hosts', { operation: 'read' })
    ).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_CLOSED'))
  })
})
