import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import {
  createFixedPluginSnipasteDiscovery,
  createFixedPluginSnipasteExecutor,
  createPluginSnipasteProcess,
  createPluginSnipasteProcessCapability,
  PLUGIN_SNIPASTE_ACTION_IDS,
  PLUGIN_SNIPASTE_MAX_PROCESSES,
  PLUGIN_SNIPASTE_PROCESS_TIMEOUT_MS,
  type PluginSnipasteProcess
} from './plugin-process-capabilities'

const activation: PluginActivationIdentity = Object.freeze({
  name: 'touch-snipaste',
  pluginInstanceId: 'snipaste-instance',
  activationGeneration: 1,
  key: 'snipaste-key'
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, reject, resolve }
}

function controlledProcess() {
  const started = deferred<void>()
  const exit = deferred<{ code: number | null }>()
  const process: PluginSnipasteProcess = Object.freeze({
    started: vi.fn(() => started.promise),
    wait: vi.fn(() => exit.promise),
    kill: vi.fn(async () => {
      exit.resolve({ code: null })
      await exit.promise
    })
  })
  return { exit, process, started }
}

function createHarness(
  options: {
    allowed?: boolean
    discover?: (signal: AbortSignal) => Promise<string | null>
    hostGeneration?: number
    process?: PluginSnipasteProcess
    processFactory?: () => PluginSnipasteProcess
  } = {}
) {
  let current: PluginActivationIdentity | undefined = activation
  const revokeWatchers = new Set<() => void>()
  const controlled = options.process ? null : controlledProcess()
  controlled?.started.resolve()
  const start = vi.fn(() => options.processFactory?.() ?? options.process ?? controlled!.process)
  const executor = createFixedPluginSnipasteExecutor({
    platform: 'darwin',
    environment: {},
    spawn: start
  })
  const expectedExecutable = '/Applications/Snipaste.app/Contents/MacOS/Snipaste'
  let discoveryResult: Promise<string | null> | null = null
  const discovery = createFixedPluginSnipasteDiscovery({
    platform: 'darwin',
    homeDirectory: '/Users/owner',
    fileSystem: Object.freeze({
      kind: async (target: string) => {
        if (target === '/Applications') return 'directory'
        if (target !== expectedExecutable) return 'missing'
        discoveryResult ??= Promise.resolve(
          options.discover ? options.discover(new AbortController().signal) : expectedExecutable
        )
        return (await discoveryResult) === expectedExecutable ? 'file' : 'missing'
      },
      realpath: async (target: string) => target
    })
  })
  const capability = createPluginSnipasteProcessCapability({
    activation,
    platform: 'darwin',
    resolveCurrentActivation: () => current,
    resolveHostGeneration: () => options.hostGeneration ?? 7,
    authorizeShell: () => options.allowed ?? true,
    watchShellPermissionRevoked: (_pluginName, onRevoke) => {
      revokeWatchers.add(onRevoke)
      return () => revokeWatchers.delete(onRevoke)
    },
    discovery,
    executor
  })
  const registry = new PluginHostCapabilityRegistry({
    owner: { protocolVersion: 2, activationHandle: 'snipaste-host', hostGeneration: 7 },
    activation,
    resolveCurrentActivation: () => current,
    authorize: () => options.allowed ?? true,
    watchPermissionRevoked: (_pluginName, _permissionId, onRevoke) => {
      revokeWatchers.add(onRevoke)
      return () => revokeWatchers.delete(onRevoke)
    },
    isActive: () => true,
    onFatalViolation() {}
  })
  registry.register(capability.definitions[0])
  return {
    capability,
    controlled,
    executor,
    registry,
    start,
    revoke() {
      for (const watcher of [...revokeWatchers]) watcher()
    },
    rotate() {
      current = { ...activation, activationGeneration: 2, key: 'rotated-key' }
    }
  }
}

describe('isolated Snipaste process capability', () => {
  it.each([
    ['launch', []],
    ['snip', ['snip']],
    ['snip-full', ['snip', '--full', '-o', 'clipboard']],
    ['paste', ['paste']],
    ['pick-color', ['pick-color']],
    ['toggle-images', ['toggle-images']],
    ['docs', ['docs']]
  ] as const)('maps %s to fixed args and a minimal non-shell process', (actionId, args) => {
    const process = controlledProcess().process
    const spawn = vi.fn(() => process)
    const executor = createFixedPluginSnipasteExecutor({
      platform: 'darwin',
      environment: { HOME: '/Users/owner', LANG: 'en_US.UTF-8', TOKEN: undefined },
      spawn
    })

    const adapted = executor.start('/Applications/Snipaste.app/Contents/MacOS/Snipaste', actionId)
    expect(Object.isFrozen(adapted)).toBe(true)
    expect(spawn).toHaveBeenCalledExactlyOnceWith(
      '/Applications/Snipaste.app/Contents/MacOS/Snipaste',
      args,
      {
        cwd: '/Applications/Snipaste.app/Contents/MacOS',
        detached: false,
        env: { HOME: '/Users/owner', LANG: 'en_US.UTF-8' },
        shell: false,
        stdio: 'ignore',
        windowsHide: true
      }
    )
  })

  it('discovers only canonical regular files under fixed roots', async () => {
    const kinds = new Map<string, 'directory' | 'file' | 'missing'>([
      ['/Applications', 'directory'],
      ['/Applications/Snipaste.app/Contents/MacOS/Snipaste', 'file']
    ])
    const discovery = createFixedPluginSnipasteDiscovery({
      platform: 'darwin',
      homeDirectory: '/Users/owner',
      fileSystem: Object.freeze({
        kind: vi.fn(async (target: string) => kinds.get(target) ?? 'missing'),
        realpath: vi.fn(async (target: string) => target)
      })
    })

    await expect(discovery.discover(new AbortController().signal)).resolves.toBe(
      '/Applications/Snipaste.app/Contents/MacOS/Snipaste'
    )
  })

  it.each([
    [
      'darwin',
      '/Users/owner',
      ['/Applications', '/Users/owner/Applications'],
      [
        '/Applications/Snipaste.app/Contents/MacOS/Snipaste',
        '/Users/owner/Applications/Snipaste.app/Contents/MacOS/Snipaste'
      ]
    ],
    [
      'win32',
      'C:\\Users\\owner',
      ['C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\Users\\owner\\Applications'],
      [
        'C:\\Program Files\\Snipaste\\Snipaste.exe',
        'C:\\Program Files (x86)\\Snipaste\\Snipaste.exe',
        'C:\\Users\\owner\\Applications\\Snipaste\\Snipaste.exe'
      ]
    ],
    [
      'linux',
      '/home/owner',
      ['/opt/Snipaste', '/usr/bin', '/usr/local/bin', '/home/owner/Applications'],
      [
        '/opt/Snipaste/Snipaste.AppImage',
        '/usr/bin/snipaste',
        '/usr/local/bin/snipaste',
        '/home/owner/Applications/Snipaste.AppImage'
      ]
    ]
  ] as const)(
    'uses only the fixed %s discovery inventory',
    async (platform, home, roots, executables) => {
      const visited: string[] = []
      const rootSet = new Set<string>(roots)
      const discovery = createFixedPluginSnipasteDiscovery({
        platform,
        homeDirectory: home,
        fileSystem: Object.freeze({
          kind: vi.fn(async (target: string) => {
            visited.push(target)
            return rootSet.has(target) ? ('directory' as const) : ('missing' as const)
          }),
          realpath: vi.fn(async (target: string) => target)
        })
      })

      await expect(discovery.discover(new AbortController().signal)).resolves.toBeNull()
      expect(visited).toEqual(roots.flatMap((root, index) => [root, executables[index]]))
      expect(visited).not.toContain('Snipaste')
      expect(visited).not.toContain('snipaste')
    }
  )

  it.each([
    [
      'symlink candidate',
      '/Applications/Snipaste.app/Contents/MacOS/Snipaste',
      '/private/attacker/Snipaste'
    ],
    ['symlink root', '/Applications', '/private/Applications']
  ])('rejects %s discovery without falling back to PATH', async (_label, changed, resolved) => {
    const discovery = createFixedPluginSnipasteDiscovery({
      platform: 'darwin',
      homeDirectory: '/Users/owner',
      fileSystem: Object.freeze({
        kind: vi.fn(async (target: string) =>
          target === '/Applications'
            ? 'directory'
            : target.includes('Snipaste')
              ? 'file'
              : 'missing'
        ),
        realpath: vi.fn(async (target: string) => (target === changed ? resolved : target))
      })
    })

    await expect(discovery.discover(new AbortController().signal)).resolves.toBeNull()
  })

  it.each([
    null,
    {},
    { operation: 'snipaste-action' },
    { operation: 'snipaste-action', actionId: 'custom' },
    { operation: 'snipaste-action', actionId: 'snip', executable: '/tmp/Snipaste' },
    { operation: 'snipaste-action', actionId: 'snip', path: '/tmp/Snipaste' },
    { operation: 'snipaste-action', actionId: 'snip', args: ['--unsafe'] },
    { operation: 'snipaste-action', actionId: 'snip', env: { TOKEN: 'secret' } },
    { operation: 'snipaste-action', actionId: 'snip', cwd: '/tmp' },
    { operation: 'snipaste-action', actionId: 'snip', shell: true },
    { operation: 'snipaste-action', actionId: 'snip', platform: 'darwin' }
  ])('rejects hostile request fields before discovery or spawn: %j', async (request) => {
    const discover = vi.fn(async () => null)
    const harness = createHarness({ discover })

    await expect(harness.registry.dispatch('process.spawn', request)).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'
    })
    expect(discover).not.toHaveBeenCalled()
    expect(harness.start).not.toHaveBeenCalled()
    await harness.capability.close()
  })

  it('returns stable redacted not-installed and spawn-failed results', async () => {
    const missing = createHarness({ discover: async () => null })
    await expect(
      missing.registry.dispatch('process.spawn', {
        operation: 'snipaste-action',
        actionId: 'snip'
      })
    ).resolves.toEqual({ actionId: 'snip', status: 'blocked', reason: 'not-installed' })
    expect(missing.start).not.toHaveBeenCalled()
    await missing.capability.close()

    const failed = createHarness({
      process: Object.freeze({
        started: vi.fn(async () => {
          throw new Error('/private/native spawn detail')
        }),
        wait: vi.fn(async () => {
          throw new Error('/private/native spawn detail')
        }),
        kill: vi.fn(async () => undefined)
      })
    })
    await expect(
      failed.registry.dispatch('process.spawn', {
        operation: 'snipaste-action',
        actionId: 'paste'
      })
    ).resolves.toEqual({ actionId: 'paste', status: 'failed', reason: 'spawn-failed' })
    await failed.capability.close()
  })

  it('fails closed on denied permission, stale activation and wrong host generation', async () => {
    const denied = createHarness({ allowed: false })
    await expect(
      denied.registry.dispatch('process.spawn', {
        operation: 'snipaste-action',
        actionId: 'snip'
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED' })
    expect(denied.start).not.toHaveBeenCalled()
    await denied.capability.close()

    const stale = createHarness()
    stale.rotate()
    await expect(
      stale.registry.dispatch('process.spawn', {
        operation: 'snipaste-action',
        actionId: 'snip'
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION' })
    await stale.capability.close()

    const wrongHost = createHarness({ hostGeneration: 8 })
    await expect(
      wrongHost.registry.dispatch('process.spawn', {
        operation: 'snipaste-action',
        actionId: 'snip'
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
    expect(wrongHost.start).not.toHaveBeenCalled()
    await wrongHost.capability.close()
  })

  it('rechecks authority after discovery and kills a process if rotation wins after spawn', async () => {
    const discoveryStarted = deferred<void>()
    const discoveryResult = deferred<string | null>()
    const duringDiscovery = createHarness({
      discover: async () => {
        discoveryStarted.resolve()
        return await discoveryResult.promise
      }
    })
    const pendingDiscovery = duringDiscovery.registry.dispatch('process.spawn', {
      operation: 'snipaste-action',
      actionId: 'snip'
    })
    await discoveryStarted.promise
    duringDiscovery.rotate()
    discoveryResult.resolve('/Applications/Snipaste.app/Contents/MacOS/Snipaste')
    await expect(pendingDiscovery).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'
    })
    expect(duringDiscovery.start).not.toHaveBeenCalled()
    await duringDiscovery.capability.close()

    const process = controlledProcess()
    let afterSpawn!: ReturnType<typeof createHarness>
    afterSpawn = createHarness({
      processFactory: () => {
        afterSpawn.rotate()
        process.started.resolve()
        return process.process
      }
    })
    await expect(
      afterSpawn.registry.dispatch('process.spawn', {
        operation: 'snipaste-action',
        actionId: 'paste'
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
    expect(process.process.kill).toHaveBeenCalledOnce()
    await afterSpawn.capability.close()
  })

  it.each(['cancel', 'revoke', 'disable'] as const)(
    '%s kills exactly once and waits for the real process exit',
    async (mode) => {
      const process = controlledProcess()
      const harness = createHarness({ process: process.process })
      const controller = new AbortController()
      const pending = harness.registry.dispatch(
        'process.spawn',
        { operation: 'snipaste-action', actionId: 'launch' },
        controller.signal
      )
      await vi.waitFor(() => expect(harness.start).toHaveBeenCalledOnce())

      if (mode === 'cancel') controller.abort()
      else if (mode === 'revoke') harness.revoke()
      else void harness.capability.close()
      process.started.resolve()

      await expect(pending).rejects.toMatchObject({
        code:
          mode === 'revoke'
            ? 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
            : mode === 'disable'
              ? 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'
              : 'PLUGIN_HOST_CAPABILITY_CANCELLED'
      })
      expect(process.process.kill).toHaveBeenCalledOnce()
      await process.exit.promise
      await harness.capability.close()
      expect(process.process.kill).toHaveBeenCalledOnce()
    }
  )

  it('revokes a process that remains activation-owned after the RPC returned', async () => {
    const process = controlledProcess()
    const harness = createHarness({ process: process.process })
    const pending = harness.registry.dispatch('process.spawn', {
      operation: 'snipaste-action',
      actionId: 'launch'
    })
    process.started.resolve()
    await expect(pending).resolves.toEqual({ actionId: 'launch', status: 'started' })

    harness.revoke()

    await vi.waitFor(() => expect(process.process.kill).toHaveBeenCalledOnce())
    await process.exit.promise
    await harness.capability.close()
    expect(process.process.kill).toHaveBeenCalledOnce()
  })

  it('times out discovery through the capability deadline without spawning', async () => {
    vi.useFakeTimers()
    try {
      const harness = createHarness({
        discover: async (signal) =>
          await new Promise<null>((resolve) => {
            signal.addEventListener('abort', () => resolve(null), { once: true })
          })
      })
      const pending = harness.registry.dispatch('process.spawn', {
        operation: 'snipaste-action',
        actionId: 'snip'
      })
      const timedOut = expect(pending).rejects.toMatchObject({
        code: 'PLUGIN_HOST_CAPABILITY_TIMEOUT'
      })

      await vi.advanceTimersByTimeAsync(PLUGIN_SNIPASTE_PROCESS_TIMEOUT_MS)

      await timedOut
      expect(harness.start).not.toHaveBeenCalled()
      await harness.capability.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a successfully started process activation-owned until close', async () => {
    const process = controlledProcess()
    const harness = createHarness({ process: process.process })
    const pending = harness.registry.dispatch('process.spawn', {
      operation: 'snipaste-action',
      actionId: 'launch'
    })
    process.started.resolve()

    await expect(pending).resolves.toEqual({ actionId: 'launch', status: 'started' })
    expect(process.process.kill).not.toHaveBeenCalled()
    const closing = harness.capability.close()
    await expect(closing).resolves.toBeUndefined()
    expect(process.process.kill).toHaveBeenCalledOnce()
    await process.exit.promise
  })

  it('bounds activation-owned processes and refuses a third spawn', async () => {
    const processes = Array.from({ length: PLUGIN_SNIPASTE_MAX_PROCESSES }, () =>
      controlledProcess()
    )
    for (const process of processes) process.started.resolve()
    let processIndex = 0
    const harness = createHarness({
      processFactory: () => processes[processIndex++]!.process
    })

    for (let index = 0; index < PLUGIN_SNIPASTE_MAX_PROCESSES; index += 1) {
      await expect(
        harness.registry.dispatch('process.spawn', {
          operation: 'snipaste-action',
          actionId: index === 0 ? 'launch' : 'snip'
        })
      ).resolves.toMatchObject({ status: 'started' })
    }
    await expect(
      harness.registry.dispatch('process.spawn', {
        operation: 'snipaste-action',
        actionId: 'paste'
      })
    ).resolves.toEqual({ actionId: 'paste', status: 'failed', reason: 'spawn-failed' })
    expect(harness.start).toHaveBeenCalledTimes(PLUGIN_SNIPASTE_MAX_PROCESSES)

    await harness.capability.close()
    expect(processes.every(({ process }) => vi.mocked(process.kill).mock.calls.length === 1)).toBe(
      true
    )
  })

  it('rejects an untrusted discovery adapter before it can select a path', () => {
    const discover = vi.fn(async () => '/tmp/attacker/Snipaste')
    const executor = createFixedPluginSnipasteExecutor({
      platform: 'darwin',
      environment: {},
      spawn: vi.fn(() => controlledProcess().process)
    })

    expect(() =>
      createPluginSnipasteProcessCapability({
        activation,
        platform: 'darwin',
        resolveCurrentActivation: () => activation,
        resolveHostGeneration: () => 7,
        authorizeShell: () => true,
        watchShellPermissionRevoked: () => () => undefined,
        discovery: Object.freeze({ discover }) as never,
        executor
      })
    ).toThrow('PLUGIN_SNIPASTE_PROCESS_INVALID')
    expect(discover).not.toHaveBeenCalled()
  })

  it('does not transfer the private discovery signature to copies or proxies', () => {
    const signed = createFixedPluginSnipasteDiscovery({
      platform: 'darwin',
      fileSystem: Object.freeze({
        kind: vi.fn(async () => 'missing' as const),
        realpath: vi.fn(async (target: string) => target)
      })
    })
    const copied = Object.freeze({ discover: signed.discover })
    const proxied = new Proxy(signed, {})
    const executor = createFixedPluginSnipasteExecutor({
      platform: 'darwin',
      environment: {},
      spawn: vi.fn(() => controlledProcess().process)
    })
    const createWithDiscovery = (discovery: unknown) =>
      createPluginSnipasteProcessCapability({
        activation,
        platform: 'darwin',
        resolveCurrentActivation: () => activation,
        resolveHostGeneration: () => 7,
        authorizeShell: () => true,
        watchShellPermissionRevoked: () => () => undefined,
        discovery: discovery as never,
        executor
      })

    expect(() => createWithDiscovery(copied)).toThrow('PLUGIN_SNIPASTE_PROCESS_INVALID')
    expect(() => createWithDiscovery(proxied)).toThrow('PLUGIN_SNIPASTE_PROCESS_INVALID')
    expect(() => createWithDiscovery(signed)).not.toThrow()
  })

  it('rejects an untrusted process adapter before invoking its lifecycle methods', () => {
    const fake = Object.freeze({
      started: vi.fn(async () => undefined),
      wait: vi.fn(async () => ({ code: 0 })),
      kill: vi.fn(async () => undefined)
    })
    const discovery = createFixedPluginSnipasteDiscovery({
      platform: 'darwin',
      fileSystem: Object.freeze({
        kind: async (target: string) => (target === '/Applications' ? 'directory' : 'missing'),
        realpath: async (target: string) => target
      })
    })

    expect(() =>
      createPluginSnipasteProcessCapability({
        activation,
        platform: 'darwin',
        resolveCurrentActivation: () => activation,
        resolveHostGeneration: () => 7,
        authorizeShell: () => true,
        watchShellPermissionRevoked: () => () => undefined,
        discovery,
        executor: Object.freeze({ start: () => fake })
      })
    ).toThrow('PLUGIN_SNIPASTE_PROCESS_INVALID')
    expect(fake.started).not.toHaveBeenCalled()
    expect(fake.wait).not.toHaveBeenCalled()
    expect(fake.kill).not.toHaveBeenCalled()
  })

  it('adapts child_process spawn, kill and real exit as separate barriers', async () => {
    const child = new EventEmitter() as EventEmitter & {
      kill: ReturnType<typeof vi.fn>
      pid?: number
      unref: ReturnType<typeof vi.fn>
    }
    child.kill = vi.fn(() => true)
    child.unref = vi.fn()
    const process = createPluginSnipasteProcess(child as unknown as ChildProcess)
    child.emit('spawn')

    await expect(process.started()).resolves.toBeUndefined()
    const first = Promise.resolve(process.kill())
    const second = Promise.resolve(process.kill())
    let settled = false
    void first.finally(() => {
      settled = true
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)
    child.emit('exit', null)
    await Promise.all([first, second, process.wait()])
    expect(child.kill).toHaveBeenCalledOnce()
    expect(child.unref).not.toHaveBeenCalled()
  })

  it('rejects pre-spawn errors without treating them as process exit', async () => {
    const child = new EventEmitter() as EventEmitter & {
      kill: ReturnType<typeof vi.fn>
      pid?: number
    }
    child.kill = vi.fn(() => true)
    const process = createPluginSnipasteProcess(child as unknown as ChildProcess)

    child.emit('error', new Error('/private/native spawn detail'))

    await expect(process.started()).rejects.toThrow('PLUGIN_SNIPASTE_PROCESS_SPAWN_FAILED')
    await expect(process.wait()).rejects.toThrow('PLUGIN_SNIPASTE_PROCESS_SPAWN_FAILED')
    await expect(Promise.resolve(process.kill())).rejects.toThrow(
      'PLUGIN_SNIPASTE_PROCESS_SPAWN_FAILED'
    )
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('waits for real exit before surfacing a failed kill request', async () => {
    const child = new EventEmitter() as EventEmitter & {
      kill: ReturnType<typeof vi.fn>
      pid?: number
    }
    child.pid = 42
    child.kill = vi.fn(() => false)
    const process = createPluginSnipasteProcess(child as unknown as ChildProcess)

    await expect(process.started()).resolves.toBeUndefined()
    const terminating = Promise.resolve(process.kill())
    let settled = false
    void terminating
      .finally(() => {
        settled = true
      })
      .catch(() => undefined)
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)

    child.emit('exit', null)
    await expect(terminating).rejects.toThrow('PLUGIN_SNIPASTE_PROCESS_KILL_FAILED')
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('exports exactly the fixed seven-action inventory', () => {
    expect(PLUGIN_SNIPASTE_ACTION_IDS).toEqual([
      'launch',
      'snip',
      'snip-full',
      'paste',
      'pick-color',
      'toggle-images',
      'docs'
    ])
  })
})
