import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityError } from './plugin-host-capabilities'
import {
  PluginRuntimeHost,
  PluginRuntimeHostError,
  PluginRuntimeHostManager,
  type PluginRuntimeCapabilityDispatcher,
  type PluginRuntimeChildAdapter,
  type PluginRuntimeControlPortAdapter,
  type PluginRuntimeHostOptions,
  type PluginRuntimeProcessFactory,
  type PluginRuntimeSpawnResult
} from './plugin-runtime-host'
import type { HostWireMessage } from './plugin-host-wire'

const ownerFields = {
  protocolVersion: 2 as const,
  activationHandle: 'host-handle-1',
  hostGeneration: 7
}

const limits = {
  handshakeTimeoutMs: 10,
  loadTimeoutMs: 10,
  lifecycleTimeoutMs: 10,
  shutdownTimeoutMs: 10,
  cancelGraceMs: 5
}

function activation(overrides: Partial<PluginActivationIdentity> = {}): PluginActivationIdentity {
  return {
    name: 'plugin.alpha',
    pluginInstanceId: 'instance-alpha',
    activationGeneration: 3,
    key: 'activation-key-alpha',
    ...overrides
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

class FakeControlPort implements PluginRuntimeControlPortAdapter {
  readonly sent: HostWireMessage[] = []
  started = false
  closed = false
  responder: ((message: HostWireMessage) => void) | undefined
  private readonly listeners = new Set<(message: unknown) => void>()

  postMessage(message: unknown): void {
    const wireMessage = message as HostWireMessage
    this.sent.push(wireMessage)
    this.responder?.(wireMessage)
  }

  onMessage(listener: (message: unknown) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    this.started = true
  }

  close(): void {
    this.closed = true
  }

  emit(message: unknown): void {
    for (const listener of [...this.listeners]) listener(message)
  }
}

class FakeChild implements PluginRuntimeChildAdapter {
  readonly transferredPorts: unknown[] = []
  forceKillCalls = 0
  autoExitOnForceKill = true
  exitOnListenerRegistration = false
  exited = false
  private readonly listeners = new Set<() => void>()

  constructor(private readonly events: string[]) {}

  transferControlPort(port: unknown): void {
    this.transferredPorts.push(port)
  }

  onExit(listener: () => void): () => void {
    this.listeners.add(listener)
    if (this.exitOnListenerRegistration) this.emitExit()
    return () => this.listeners.delete(listener)
  }

  async forceKill(): Promise<void> {
    this.forceKillCalls += 1
    this.events.push('force-kill')
    if (this.autoExitOnForceKill) this.emitExit()
  }

  emitExit(): void {
    if (this.exited) return
    this.exited = true
    this.events.push('exit')
    for (const listener of [...this.listeners]) listener()
  }
}

interface Harness {
  host: PluginRuntimeHost
  child: FakeChild
  port: FakeControlPort
  factory: PluginRuntimeProcessFactory
  events: string[]
  invalidateAuthority: ReturnType<typeof vi.fn>
  closeResources: ReturnType<typeof vi.fn>
  onCrash: ReturnType<typeof vi.fn>
}

function createHarness(
  overrides: Partial<PluginRuntimeHostOptions> = {},
  options: { autoRespond?: boolean; activation?: PluginActivationIdentity } = {}
): Harness {
  const events: string[] = []
  const child = new FakeChild(events)
  const port = new FakeControlPort()
  const childPort = Object.freeze({ id: 'child-port' })
  const factory: PluginRuntimeProcessFactory = {
    artifactExists: vi.fn(() => true),
    spawn: vi.fn(() => ({ child, controlPort: port, childPort }))
  }
  const invalidateAuthority = vi.fn(() => {
    events.push('invalidate')
  })
  const closeResources = vi.fn(() => {
    events.push('close-resources')
  })
  const onCrash = vi.fn()
  const host = new PluginRuntimeHost({
    activation: options.activation ?? activation(),
    ...ownerFields,
    artifactPath: '/private/plugin-host.js',
    factory,
    resourceLimits: limits,
    invalidateAuthority,
    closeResources,
    onCrash,
    createNonce: () => 'main-issued-nonce',
    ...overrides
  })

  if (options.autoRespond !== false) {
    port.responder = (message) => {
      switch (message.type) {
        case 'host-init':
          port.emit({
            ...host.owner,
            type: 'host-ready',
            requestId: message.requestId,
            handshakeNonce: message.handshakeNonce
          })
          break
        case 'host-load':
          port.emit({
            ...host.owner,
            type: 'load-result',
            requestId: message.requestId,
            ok: true,
            result: { loaded: true }
          })
          break
        case 'lifecycle-call':
          port.emit({
            ...host.owner,
            type: 'lifecycle-result',
            requestId: message.requestId,
            ok: true,
            result: { method: message.method }
          })
          break
        case 'shutdown':
          child.emitExit()
          break
      }
    }
  }

  return {
    host,
    child,
    port,
    factory,
    events,
    invalidateAuthority,
    closeResources,
    onCrash
  }
}

async function start(harness: Harness, initialize = true): Promise<void> {
  await harness.host.start({
    loadPayload: { script: 'compiled-prelude' },
    initialize,
    initPayload: { reason: 'enable' }
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('PluginRuntimeHost activation transaction', () => {
  it.each([
    [
      'missing artifact',
      { artifactExists: vi.fn(() => false), spawn: vi.fn() },
      'PLUGIN_RUNTIME_HOST_ARTIFACT_UNAVAILABLE'
    ],
    [
      'artifact probe failure',
      {
        artifactExists: vi.fn(() => Promise.reject(new Error('/native/private/path'))),
        spawn: vi.fn()
      },
      'PLUGIN_RUNTIME_HOST_ARTIFACT_UNAVAILABLE'
    ],
    [
      'spawn failure',
      {
        artifactExists: vi.fn(() => true),
        spawn: vi.fn(() => Promise.reject(new Error('native spawn detail')))
      },
      'PLUGIN_RUNTIME_HOST_SPAWN_FAILED'
    ]
  ])('fails closed for %s before load', async (_label, factory, code) => {
    const harness = createHarness({ factory: factory as PluginRuntimeProcessFactory })

    const startPromise = harness.host.start({
      loadPayload: { script: 'secret script body' }
    })

    await expect(startPromise).rejects.toEqual(new PluginRuntimeHostError(code as never))
    expect(harness.host.state).toBe('failed')
    expect(factory.spawn).toHaveBeenCalledTimes(code === 'PLUGIN_RUNTIME_HOST_SPAWN_FAILED' ? 1 : 0)
    expect(harness.port.sent).toEqual([])
    expect(harness.events).toEqual(['invalidate', 'close-resources'])
    await expect(startPromise).rejects.not.toThrow(
      /private|secret script|activation-key|host-handle|native spawn detail/
    )
  })

  it('owns one child and port, snapshots identity, and forwards immutable limits', async () => {
    const mutableActivation = activation()
    const first = createHarness({}, { activation: mutableActivation })
    const second = createHarness(
      {
        activationHandle: 'host-handle-2',
        hostGeneration: 8
      },
      {
        activation: activation({
          pluginInstanceId: 'instance-beta',
          activationGeneration: 4,
          key: 'activation-key-beta'
        })
      }
    )
    mutableActivation.name = 'mutated'
    mutableActivation.key = 'mutated-key'

    await Promise.all([start(first, false), start(second, false)])

    expect(first.host.activation).toEqual(activation())
    expect(Object.isFrozen(first.host.activation)).toBe(true)
    expect(Object.isFrozen(first.host.owner)).toBe(true)
    expect(Object.isFrozen(first.host.resourceLimits)).toBe(true)
    expect(first.factory.spawn).toHaveBeenCalledTimes(1)
    expect(second.factory.spawn).toHaveBeenCalledTimes(1)
    expect(first.child.transferredPorts).toEqual([{ id: 'child-port' }])
    expect(second.child.transferredPorts).toEqual([{ id: 'child-port' }])
    expect(first.port).not.toBe(second.port)
    expect(first.child).not.toBe(second.child)
    expect(first.factory.spawn).toHaveBeenCalledWith({
      artifactPath: '/private/plugin-host.js',
      resourceLimits: first.host.resourceLimits
    })

    await Promise.all([first.host.stop(), second.host.stop()])
  })

  it('installs pending state before synchronous replies and runs init -> ready -> load -> onInit', async () => {
    const harness = createHarness()

    await start(harness)

    expect(harness.host.state).toBe('active')
    expect(harness.host.pendingCount).toBe(0)
    expect(harness.port.started).toBe(true)
    expect(harness.port.sent.map((message) => message.type)).toEqual([
      'host-init',
      'host-load',
      'lifecycle-call'
    ])
    expect(harness.port.sent.map((message) => message.requestId)).toEqual([1, 2, 3])
    expect(harness.port.sent[0]).toMatchObject({
      ...ownerFields,
      handshakeNonce: 'main-issued-nonce'
    })
    expect(harness.port.sent[1]).toMatchObject({
      ...ownerFields,
      payload: { script: 'compiled-prelude' }
    })
    expect(harness.port.sent[2]).toMatchObject({
      ...ownerFields,
      method: 'onInit',
      payload: { reason: 'enable' }
    })

    await harness.host.stop()
  })

  it.each([
    ['pending request limit', { maxPendingRequests: 33 }],
    ['request history limit', { maxTrackedRequestIds: 65_537 }],
    ['non-positive heap limit', { maxOldSpaceMb: 0 }],
    ['non-finite deadline', { shutdownTimeoutMs: Number.NaN }]
  ])('rejects an invalid %s snapshot before probing the artifact', (_label, resourceLimits) => {
    const factory: PluginRuntimeProcessFactory = {
      artifactExists: vi.fn(() => true),
      spawn: vi.fn()
    }

    expect(() => createHarness({ factory, resourceLimits })).toThrow(
      new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    )
    expect(factory.artifactExists).not.toHaveBeenCalled()
    expect(factory.spawn).not.toHaveBeenCalled()
  })

  it('fails closed when the bounded request history cannot admit the load request', async () => {
    const harness = createHarness(
      { resourceLimits: { ...limits, maxTrackedRequestIds: 1 } },
      { autoRespond: false }
    )
    harness.port.responder = (message) => {
      if (message.type !== 'host-init') return
      harness.port.emit({
        ...harness.host.owner,
        type: 'host-ready',
        requestId: message.requestId,
        handshakeNonce: message.handshakeNonce
      })
    }

    await expect(harness.host.start({ loadPayload: null })).rejects.toMatchObject({
      code: 'PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION'
    })

    expect(harness.port.sent.map((message) => message.type)).toEqual(['host-init'])
    expect(harness.events).toEqual(['invalidate', 'close-resources', 'force-kill', 'exit'])
    expect(harness.host.state).toBe('failed')
  })

  it('rejects a throwing process-factory accessor with a stable options error', () => {
    const factory = Object.create(null) as PluginRuntimeProcessFactory
    Object.defineProperty(factory, 'artifactExists', {
      get() {
        throw new Error('/private/factory-accessor-detail')
      }
    })
    Object.defineProperty(factory, 'spawn', {
      value: vi.fn(),
      enumerable: true
    })

    expect(() => createHarness({ factory })).toThrow(
      new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_INVALID_OPTIONS')
    )
  })

  it('snapshots process-factory getters once and preserves their receiver', async () => {
    let artifactGetterCalls = 0
    let spawnGetterCalls = 0
    let artifactCalls = 0
    let spawnCalls = 0
    const factory = Object.create(null) as PluginRuntimeProcessFactory
    Object.defineProperty(factory, 'artifactExists', {
      enumerable: true,
      get() {
        artifactGetterCalls += 1
        return function (this: unknown): boolean {
          expect(this).toBe(factory)
          artifactCalls += 1
          return true
        }
      }
    })
    Object.defineProperty(factory, 'spawn', {
      enumerable: true,
      get() {
        spawnGetterCalls += 1
        return function (this: unknown): never {
          expect(this).toBe(factory)
          spawnCalls += 1
          throw new Error('/private/spawn-detail')
        }
      }
    })
    const harness = createHarness({ factory }, { autoRespond: false })

    await expect(harness.host.start({ loadPayload: null })).rejects.toEqual(
      new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED')
    )

    expect({ artifactGetterCalls, spawnGetterCalls, artifactCalls, spawnCalls }).toEqual({
      artifactGetterCalls: 1,
      spawnGetterCalls: 1,
      artifactCalls: 1,
      spawnCalls: 1
    })
  })

  it('requires an exact boolean artifact probe result before spawning', async () => {
    const factory: PluginRuntimeProcessFactory = {
      artifactExists: vi.fn(() => 'truthy-but-invalid' as never),
      spawn: vi.fn()
    }
    const harness = createHarness({ factory }, { autoRespond: false })

    await expect(harness.host.start({ loadPayload: null })).rejects.toEqual(
      new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_ARTIFACT_UNAVAILABLE')
    )

    expect(factory.spawn).not.toHaveBeenCalled()
    expect(harness.events).toEqual(['invalidate', 'close-resources'])
  })

  it('rejects a missing child port instead of entering the handshake', async () => {
    const harness = createHarness({}, { autoRespond: false })
    vi.mocked(harness.factory.spawn).mockReturnValue({
      child: harness.child,
      controlPort: harness.port,
      childPort: undefined
    })

    await expect(harness.host.start({ loadPayload: null })).rejects.toEqual(
      new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED')
    )

    expect(harness.port.sent).toEqual([])
    expect(harness.events).toEqual(['invalidate', 'close-resources', 'force-kill', 'exit'])
  })

  it.each([
    ['load', 'PLUGIN_RUNTIME_HOST_LOAD_FAILED'],
    ['onInit', 'PLUGIN_RUNTIME_HOST_LIFECYCLE_FAILED']
  ])('rolls back a %s failure in authority/resource/process order', async (stage, code) => {
    const harness = createHarness({}, { autoRespond: false })
    harness.port.responder = (message) => {
      if (message.type === 'host-init') {
        harness.port.emit({
          ...ownerFields,
          type: 'host-ready',
          requestId: message.requestId,
          handshakeNonce: message.handshakeNonce
        })
      } else if (message.type === 'host-load') {
        harness.port.emit({
          ...ownerFields,
          type: 'load-result',
          requestId: message.requestId,
          ...(stage === 'load'
            ? { ok: false, error: { code: 'CHILD_LOAD_FAILED' } }
            : { ok: true, result: null })
        })
      } else if (message.type === 'lifecycle-call') {
        harness.port.emit({
          ...ownerFields,
          type: 'lifecycle-result',
          requestId: message.requestId,
          ok: false,
          error: { code: 'CHILD_INIT_FAILED' }
        })
      }
    }

    await expect(start(harness)).rejects.toEqual(new PluginRuntimeHostError(code as never))

    expect(harness.events).toEqual(['invalidate', 'close-resources', 'force-kill', 'exit'])
    expect(harness.host.state).toBe('failed')
    expect(harness.port.closed).toBe(true)
  })

  it('rolls back when the spawned child cannot accept its control port', async () => {
    const harness = createHarness({}, { autoRespond: false })
    vi.spyOn(harness.child, 'transferControlPort').mockRejectedValue(
      new Error('/native/control-port-detail')
    )

    await expect(start(harness)).rejects.toEqual(
      new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED')
    )

    expect(harness.port.sent).toEqual([])
    expect(harness.events).toEqual(['invalidate', 'close-resources', 'force-kill', 'exit'])
    expect(harness.host.state).toBe('failed')
  })

  it('maps a throwing control-port start to spawn failure and awaits child exit', async () => {
    const harness = createHarness({}, { autoRespond: false })
    vi.spyOn(harness.port, 'start').mockImplementation(() => {
      throw new Error('/private/control-port-start-detail')
    })

    await expect(start(harness)).rejects.toEqual(
      new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED')
    )

    expect(harness.events).toEqual(['invalidate', 'close-resources', 'force-kill', 'exit'])
    expect(harness.port.closed).toBe(true)
    expect(harness.host.state).toBe('failed')
  })

  it('rolls back every acquired adapter when the spawn result is malformed', async () => {
    const childEvents: string[] = []
    const child = new FakeChild(childEvents)
    const closeMalformedPort = vi.fn()
    const malformedPort = { close: closeMalformedPort }
    const factory: PluginRuntimeProcessFactory = {
      artifactExists: vi.fn(() => true),
      spawn: vi.fn(
        () =>
          ({
            child,
            controlPort: malformedPort,
            childPort: { id: 'unusable-child-port' }
          }) as unknown as PluginRuntimeSpawnResult
      )
    }
    const malformed = createHarness({ factory }, { autoRespond: false })

    await expect(malformed.host.start({ loadPayload: null })).rejects.toMatchObject({
      code: 'PLUGIN_RUNTIME_HOST_SPAWN_FAILED'
    })

    expect(closeMalformedPort).toHaveBeenCalledTimes(1)
    expect(child.forceKillCalls).toBe(1)
    expect(child.exited).toBe(true)
    expect(malformed.events).toEqual(['invalidate', 'close-resources'])
    expect(childEvents).toEqual(['force-kill', 'exit'])
  })

  it('defers malformed adapter cleanup until authority and host resources are closed', async () => {
    const events: string[] = []
    const killRequest = deferred<void>()
    const killStarted = deferred<void>()
    const malformedChild = {
      forceKill: vi.fn(async () => {
        events.push('force-kill')
        killStarted.resolve()
        await killRequest.promise
      })
    }
    const malformedPort = {
      close: vi.fn(() => events.push('port-close'))
    }
    const factory: PluginRuntimeProcessFactory = {
      artifactExists: vi.fn(() => true),
      spawn: vi.fn(
        () =>
          ({
            child: malformedChild,
            controlPort: malformedPort,
            childPort: { id: 'unusable-child-port' }
          }) as unknown as PluginRuntimeSpawnResult
      )
    }
    const harness = createHarness(
      {
        factory,
        invalidateAuthority: vi.fn(() => {
          events.push('invalidate')
        }),
        closeResources: vi.fn(() => {
          events.push('close-resources')
        })
      },
      { autoRespond: false }
    )
    let settled = false
    let rejected: unknown
    const observed = harness.host.start({ loadPayload: null }).then(
      () => {
        settled = true
      },
      (error: unknown) => {
        settled = true
        rejected = error
      }
    )

    await killStarted.promise
    expect(events).toEqual(['invalidate', 'close-resources', 'port-close', 'force-kill'])
    expect(settled).toBe(false)

    killRequest.resolve()
    await observed
    expect(rejected).toEqual(new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED'))
  })

  it('rejects an invalid child exit disposer and still reaches the exit barrier', async () => {
    const harness = createHarness({}, { autoRespond: false })
    const registerExit = harness.child.onExit.bind(harness.child)
    vi.spyOn(harness.child, 'onExit').mockImplementation((listener) => {
      registerExit(listener)
      return undefined as unknown as () => void
    })
    let rejected: unknown
    try {
      await start(harness)
    } catch (error) {
      rejected = error
    }
    if (harness.host.state === 'active') await harness.host.stop()

    expect(rejected).toEqual(new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_SPAWN_FAILED'))
    expect(harness.events).toEqual(['invalidate', 'close-resources', 'force-kill', 'exit'])
  })

  it('handles an exit replayed synchronously during listener registration', async () => {
    const harness = createHarness({}, { autoRespond: false })
    harness.child.exitOnListenerRegistration = true

    await expect(start(harness)).rejects.toEqual(
      new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_CRASHED')
    )

    expect(harness.child.forceKillCalls).toBe(0)
    expect(harness.host.state).toBe('crashed')
    expect(harness.events).toEqual(['exit', 'invalidate', 'close-resources'])
    expect(harness.onCrash).toHaveBeenCalledTimes(1)
  })

  it('does not let a delayed spawn escape a concurrent stop', async () => {
    const spawned = deferred<PluginRuntimeSpawnResult>()
    const harness = createHarness(
      {
        factory: {
          artifactExists: vi.fn(() => true),
          spawn: vi.fn(() => spawned.promise)
        }
      },
      { autoRespond: false }
    )
    const startPromise = harness.host.start({ loadPayload: null })
    await flush()

    let stopSettled = false
    const stopPromise = harness.host.stop().then(() => {
      stopSettled = true
    })
    await flush()
    expect(stopSettled).toBe(false)

    spawned.resolve({
      child: harness.child,
      controlPort: harness.port,
      childPort: { id: 'late-child-port' }
    })

    await expect(startPromise).rejects.toMatchObject({ code: 'PLUGIN_RUNTIME_HOST_CLOSED' })
    await stopPromise
    expect(harness.child.forceKillCalls).toBe(1)
    expect(harness.child.exited).toBe(true)
    expect(harness.port.sent).toEqual([])
    expect(harness.host.state).toBe('closed')
  })
})

describe('PluginRuntimeHost capability dispatch', () => {
  it.each([
    ['owner handle', { owner: { ...ownerFields, activationHandle: 'other-host' } }],
    ['host generation', { owner: { ...ownerFields, hostGeneration: 99 } }],
    ['plugin instance', { activation: activation({ pluginInstanceId: 'other-instance' }) }],
    ['activation generation', { activation: activation({ activationGeneration: 99 }) }],
    ['activation key', { activation: activation({ key: 'other-key' }) }]
  ])('rejects a dispatcher bound to a different %s', (_label, mismatch) => {
    const dispatch = vi.fn(async () => null)

    expect(() =>
      createHarness({
        capabilityDispatcher: {
          owner: ownerFields,
          activation: activation(),
          dispatch,
          ...mismatch
        }
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_RUNTIME_HOST_INVALID_OPTIONS' }))
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('dispatches an owner-bound fixed capability and returns a bounded V2 result', async () => {
    const dispatch = vi.fn(async (_capability, payload, signal: AbortSignal) => {
      expect(signal.aborted).toBe(false)
      return { echoed: payload }
    })
    const dispatcher: PluginRuntimeCapabilityDispatcher = {
      owner: ownerFields,
      activation: activation(),
      dispatch
    }
    const harness = createHarness({ capabilityDispatcher: dispatcher })
    await start(harness)

    harness.port.emit({
      ...harness.host.owner,
      type: 'capability-call',
      requestId: 91,
      capability: 'plugin.info.get',
      payload: { requestedBy: 'child-metadata-is-not-authority' }
    })
    await flush()
    await flush()

    expect(dispatch).toHaveBeenCalledWith(
      'plugin.info.get',
      { requestedBy: 'child-metadata-is-not-authority' },
      expect.any(AbortSignal)
    )
    expect(harness.port.sent.at(-1)).toEqual({
      ...harness.host.owner,
      type: 'capability-result',
      requestId: 91,
      ok: true,
      result: { echoed: { requestedBy: 'child-metadata-is-not-authority' } }
    })
    expect(harness.host.state).toBe('active')
    await harness.host.stop()
  })

  it.each([
    ['missing dispatcher', undefined, 'PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE'],
    [
      'unknown registered handler',
      {
        owner: ownerFields,
        activation: activation(),
        dispatch: vi.fn(async () => {
          throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_UNKNOWN')
        })
      },
      'PLUGIN_HOST_CAPABILITY_UNKNOWN'
    ],
    [
      'permission revoke',
      {
        owner: ownerFields,
        activation: activation(),
        dispatch: vi.fn(async () => {
          throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
        })
      },
      'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
    ],
    [
      'native handler failure',
      {
        owner: ownerFields,
        activation: activation(),
        dispatch: vi.fn(async () => {
          throw new Error('/private/handler detail')
        })
      },
      'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'
    ]
  ])('returns a redacted stable error for %s', async (_label, dispatcher, code) => {
    const harness = createHarness({
      capabilityDispatcher: dispatcher as PluginRuntimeCapabilityDispatcher | undefined
    })
    await start(harness)

    harness.port.emit({
      ...harness.host.owner,
      type: 'capability-call',
      requestId: 92,
      capability: 'plugin.info.get',
      payload: null
    })
    await flush()
    await flush()

    expect(harness.port.sent.at(-1)).toEqual({
      ...harness.host.owner,
      type: 'capability-result',
      requestId: 92,
      ok: false,
      error: { code }
    })
    expect(JSON.stringify(harness.port.sent.at(-1))).not.toContain('/private/handler detail')
    await harness.host.stop()
  })

  it('converts a malformed dispatcher result to a stable invalid-result error', async () => {
    const harness = createHarness({
      capabilityDispatcher: {
        owner: ownerFields,
        activation: activation(),
        dispatch: vi.fn(async () => ({ callback: () => undefined }))
      }
    })
    await start(harness)

    harness.port.emit({
      ...harness.host.owner,
      type: 'capability-call',
      requestId: 93,
      capability: 'plugin.info.get',
      payload: null
    })
    await flush()
    await flush()

    expect(harness.port.sent.at(-1)).toMatchObject({
      type: 'capability-result',
      requestId: 93,
      ok: false,
      error: { code: 'PLUGIN_HOST_CAPABILITY_INVALID_RESULT' }
    })
    expect(harness.host.state).toBe('active')
    await harness.host.stop()
  })

  it('aborts pending capability work on stop and closes only an owned dispatcher once', async () => {
    const started = deferred<AbortSignal>()
    const close = vi.fn()
    const dispatcher: PluginRuntimeCapabilityDispatcher = {
      owner: ownerFields,
      activation: activation(),
      dispatch: vi.fn((_capability, _payload, signal) => {
        started.resolve(signal)
        return new Promise(() => undefined)
      }),
      close
    }
    const harness = createHarness({
      capabilityDispatcher: dispatcher,
      ownsCapabilityDispatcher: true
    })
    await start(harness)
    harness.port.emit({
      ...harness.host.owner,
      type: 'capability-call',
      requestId: 94,
      capability: 'plugin.info.get',
      payload: null
    })
    const signal = await started.promise

    await harness.host.stop()
    await harness.host.stop()

    expect(signal.aborted).toBe(true)
    expect(close).toHaveBeenCalledTimes(1)
    expect(harness.port.sent.some((message) => message.type === 'capability-result')).toBe(false)
  })

  it('does not close an externally owned dispatcher', async () => {
    const close = vi.fn()
    const harness = createHarness({
      capabilityDispatcher: {
        owner: ownerFields,
        activation: activation(),
        dispatch: vi.fn(async () => null),
        close
      },
      ownsCapabilityDispatcher: false
    })
    await start(harness)

    await harness.host.stop()

    expect(close).not.toHaveBeenCalled()
  })
})

describe('PluginRuntimeHost cancellation and protocol failure', () => {
  it('keeps messages and pending requests scoped to their activation ports', async () => {
    const first = createHarness()
    const second = createHarness(
      { activationHandle: 'host-handle-isolated', hostGeneration: 8 },
      {
        activation: activation({
          name: 'plugin.isolated',
          pluginInstanceId: 'instance-isolated',
          activationGeneration: 1,
          key: 'activation-key-isolated'
        })
      }
    )
    await Promise.all([start(first), start(second)])
    first.port.responder = undefined
    second.port.responder = undefined

    const firstCall = first.host.callLifecycle('onLaunch')
    const secondCall = second.host.callLifecycle('onLaunch')
    const firstRequest = first.port.sent.at(-1)!
    const secondRequest = second.port.sent.at(-1)!

    first.port.emit({
      ...first.host.owner,
      type: 'lifecycle-result',
      requestId: firstRequest.requestId,
      ok: true,
      result: 'first'
    })

    await expect(firstCall).resolves.toBe('first')
    expect(first.host.pendingCount).toBe(0)
    expect(second.host.pendingCount).toBe(1)
    expect(second.host.state).toBe('active')

    second.port.emit({
      ...second.host.owner,
      type: 'lifecycle-result',
      requestId: secondRequest.requestId,
      ok: true,
      result: 'second'
    })
    await expect(secondCall).resolves.toBe('second')

    await Promise.all([first.host.stop(), second.host.stop()])
  })

  it('contains a duplicate response violation to the owning host', async () => {
    const first = createHarness()
    const second = createHarness(
      { activationHandle: 'host-handle-healthy', hostGeneration: 9 },
      {
        activation: activation({
          name: 'plugin.healthy',
          pluginInstanceId: 'instance-healthy',
          activationGeneration: 1,
          key: 'activation-key-healthy'
        })
      }
    )
    await Promise.all([start(first), start(second)])
    first.port.responder = undefined

    const call = first.host.callLifecycle('onLaunch')
    const request = first.port.sent.at(-1)!
    const response = {
      ...first.host.owner,
      type: 'lifecycle-result' as const,
      requestId: request.requestId,
      ok: true as const,
      result: null
    }
    first.port.emit(response)
    await call
    first.port.emit(response)
    await flush()
    await first.host.close()

    expect(first.host.state).toBe('failed')
    expect(second.host.state).toBe('active')
    expect(second.invalidateAuthority).not.toHaveBeenCalled()
    expect(second.closeResources).not.toHaveBeenCalled()

    await second.host.stop()
  })

  it.each([
    ['handshake', []],
    ['load', ['host-init']],
    ['onInit', ['host-init', 'host-load']]
  ])('times out %s, sends V2 cancel, and tears down', async (_stage, responses) => {
    vi.useFakeTimers()
    const harness = createHarness({}, { autoRespond: false })
    harness.port.responder = (message) => {
      if (message.type === 'host-init' && responses.includes('host-init')) {
        harness.port.emit({
          ...ownerFields,
          type: 'host-ready',
          requestId: message.requestId,
          handshakeNonce: message.handshakeNonce
        })
      }
      if (message.type === 'host-load' && responses.includes('host-load')) {
        harness.port.emit({
          ...ownerFields,
          type: 'load-result',
          requestId: message.requestId,
          ok: true,
          result: null
        })
      }
    }
    const startPromise = harness.host.start({ loadPayload: null })
    const expectedRejection = expect(startPromise).rejects.toMatchObject({
      code: 'PLUGIN_RUNTIME_HOST_TIMEOUT'
    })
    await flush()

    await vi.advanceTimersByTimeAsync(10)
    await flush()
    await vi.runAllTimersAsync()
    await expectedRejection
    const cancel = harness.port.sent.find((message) => message.type === 'cancel')
    expect(cancel).toMatchObject({ type: 'cancel' })
    const targetRequestId =
      cancel && 'targetRequestId' in cancel ? cancel.targetRequestId : undefined
    const target = harness.port.sent.find((message) => message.requestId === targetRequestId)
    expect(target?.type).toBe(
      _stage === 'handshake' ? 'host-init' : _stage === 'load' ? 'host-load' : 'lifecycle-call'
    )
    expect(harness.child.forceKillCalls).toBe(1)
    expect(harness.events).toEqual(['invalidate', 'close-resources', 'force-kill', 'exit'])
    expect(harness.host.state).toBe('failed')
  })

  it('rejects external cancellation immediately, posts the request before cancel, and rejects late replies', async () => {
    const harness = createHarness()
    await start(harness)
    const controller = new AbortController()
    harness.port.responder = (message) => {
      if (message.type === 'lifecycle-call') controller.abort()
    }

    const call = harness.host.callLifecycle('onFeatureTriggered', [], {
      signal: controller.signal
    })
    await expect(call).rejects.toMatchObject({ code: 'PLUGIN_RUNTIME_HOST_CANCELLED' })
    const lifecycle = harness.port.sent.at(-2)
    const cancel = harness.port.sent.at(-1)
    expect(lifecycle?.type).toBe('lifecycle-call')
    expect(cancel).toMatchObject({
      type: 'cancel',
      targetRequestId: lifecycle?.requestId
    })

    harness.port.emit({
      ...ownerFields,
      type: 'lifecycle-result',
      requestId: lifecycle!.requestId,
      ok: true,
      result: 'late'
    })
    await flush()
    await harness.host.close()
    expect(harness.host.state).toBe('failed')
  })

  it('fails the activation closed after external cancellation grace without a child acknowledgement', async () => {
    vi.useFakeTimers()
    const harness = createHarness()
    await start(harness)
    const controller = new AbortController()
    harness.port.responder = (message) => {
      if (message.type === 'lifecycle-call') controller.abort()
      if (message.type === 'shutdown') harness.child.emitExit()
    }

    const call = harness.host.callLifecycle('onFeatureTriggered', [], {
      signal: controller.signal
    })
    await expect(call).rejects.toMatchObject({ code: 'PLUGIN_RUNTIME_HOST_CANCELLED' })
    expect(harness.host.state).toBe('stopping')
    expect(harness.host.pendingCount).toBe(0)

    await vi.advanceTimersByTimeAsync(limits.cancelGraceMs)
    await flush()
    await harness.host.close()
    expect(harness.host.state).toBe('failed')
    expect(harness.events).toEqual(['invalidate', 'close-resources', 'exit'])
  })

  it('rejects an active lifecycle timeout before cleanup and fails closed on its late result', async () => {
    vi.useFakeTimers()
    const harness = createHarness()
    await start(harness)
    harness.port.responder = undefined

    const call = harness.host.callLifecycle('onFeatureTriggered', [], { timeoutMs: 10 })
    const rejection = expect(call).rejects.toMatchObject({
      code: 'PLUGIN_RUNTIME_HOST_TIMEOUT'
    })
    await vi.advanceTimersByTimeAsync(10)
    await rejection

    const lifecycle = harness.port.sent.findLast((message) => message.type === 'lifecycle-call')
    expect(harness.port.sent.at(-1)).toMatchObject({
      type: 'cancel',
      targetRequestId: lifecycle?.requestId
    })
    expect(harness.host.pendingCount).toBe(0)
    expect(harness.host.state).toBe('stopping')
    expect(harness.events).toEqual([])

    harness.port.emit({
      ...ownerFields,
      type: 'lifecycle-result',
      requestId: lifecycle!.requestId,
      ok: true,
      result: 'late'
    })
    await harness.host.close()
    expect(harness.host.state).toBe('failed')
  })

  it.each([
    [
      'wrong owner',
      (requestId: number) => ({
        ...ownerFields,
        activationHandle: 'child-selected-handle',
        type: 'lifecycle-result',
        requestId,
        ok: true,
        result: null
      })
    ],
    [
      'wrong response type',
      (requestId: number) => ({
        ...ownerFields,
        type: 'callback-result',
        requestId,
        ok: true,
        result: null
      })
    ]
  ])('fails pending work with a stable protocol error for %s', async (_label, response) => {
    const harness = createHarness()
    await start(harness)
    harness.port.responder = (message) => {
      if (message.type === 'lifecycle-call') harness.port.emit(response(message.requestId))
    }

    await expect(harness.host.callLifecycle('onLaunch')).rejects.toMatchObject({
      code: 'PLUGIN_RUNTIME_HOST_PROTOCOL_VIOLATION'
    })
    await flush()
    expect(harness.host.state).toBe('failed')
  })

  it('fails closed on an unexpected child message type without trusting child metadata', async () => {
    const harness = createHarness()
    await start(harness)

    harness.port.emit({
      ...ownerFields,
      type: 'capability-call',
      requestId: 91,
      capability: 'plugin.info.get',
      payload: null,
      pluginName: 'child-selected-admin'
    })
    await flush()
    await harness.host.close()

    expect(harness.host.state).toBe('failed')
    expect(harness.events.slice(0, 2)).toEqual(['invalidate', 'close-resources'])
  })

  it('settles a crash during handshake exactly once with stable diagnostics', async () => {
    const harness = createHarness({}, { autoRespond: false })
    const startPromise = harness.host.start({ loadPayload: { script: 'do-not-report' } })
    const rejection = expect(startPromise).rejects.toMatchObject({
      code: 'PLUGIN_RUNTIME_HOST_CRASHED'
    })
    await flush()

    harness.child.emitExit()
    await rejection
    await harness.host.stop()

    expect(harness.host.state).toBe('crashed')
    expect(harness.invalidateAuthority).toHaveBeenCalledTimes(1)
    expect(harness.closeResources).toHaveBeenCalledTimes(1)
    expect(harness.onCrash).toHaveBeenCalledTimes(1)
    expect(harness.onCrash).toHaveBeenCalledWith({
      code: 'PLUGIN_RUNTIME_HOST_CRASHED',
      pluginName: 'plugin.alpha',
      activationGeneration: 3
    })
    expect(JSON.stringify(harness.onCrash.mock.calls)).not.toMatch(
      /do-not-report|private|activation-key|host-handle/
    )
  })

  it('rejects pending work and reports only stable crash identity on unexpected exit', async () => {
    const harness = createHarness()
    await start(harness)
    harness.port.responder = undefined
    const pending = harness.host.callLifecycle('onMessage', { secret: 'do-not-log' })
    await flush()

    harness.child.emitExit()

    await expect(pending).rejects.toMatchObject({ code: 'PLUGIN_RUNTIME_HOST_CRASHED' })
    await flush()
    expect(harness.host.state).toBe('crashed')
    expect(harness.onCrash).toHaveBeenCalledWith({
      code: 'PLUGIN_RUNTIME_HOST_CRASHED',
      pluginName: 'plugin.alpha',
      activationGeneration: 3
    })
    expect(JSON.stringify(harness.onCrash.mock.calls)).not.toMatch(
      /do-not-log|private|activation-key|host-handle/
    )
  })
})

describe('PluginRuntimeHost termination barrier', () => {
  it('waits for graceful exit and does not force kill', async () => {
    const harness = createHarness()
    await start(harness)

    await harness.host.stop()

    expect(harness.port.sent.at(-1)?.type).toBe('shutdown')
    expect(harness.child.forceKillCalls).toBe(0)
    expect(harness.events).toEqual(['invalidate', 'close-resources', 'exit'])
    expect(harness.host.state).toBe('closed')
  })

  it('waits for the real exit event after the graceful deadline and forceKill promise', async () => {
    vi.useFakeTimers()
    const harness = createHarness()
    await start(harness)
    harness.child.autoExitOnForceKill = false
    harness.port.responder = undefined

    let settled = false
    const stopPromise = harness.host.stop().then(() => {
      settled = true
    })
    await flush()
    expect(settled).toBe(false)
    expect(harness.child.forceKillCalls).toBe(0)

    await vi.advanceTimersByTimeAsync(10)
    await flush()
    expect(harness.child.forceKillCalls).toBe(1)
    expect(settled).toBe(false)

    harness.child.emitExit()
    await stopPromise
    expect(settled).toBe(true)
    expect(harness.host.state).toBe('closed')
  })

  it('uses the exit event as the barrier even when forceKill never settles', async () => {
    vi.useFakeTimers()
    const harness = createHarness()
    await start(harness)
    harness.child.autoExitOnForceKill = false
    harness.port.responder = undefined
    const killRequest = deferred<void>()
    vi.spyOn(harness.child, 'forceKill').mockImplementation(async () => {
      harness.child.forceKillCalls += 1
      harness.events.push('force-kill')
      await killRequest.promise
    })

    let settled = false
    const stopPromise = harness.host.stop().then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(10)
    await flush()
    expect(harness.child.forceKillCalls).toBe(1)
    expect(settled).toBe(false)

    harness.child.emitExit()
    await stopPromise
    expect(settled).toBe(true)
    expect(harness.host.state).toBe('closed')
  })

  it('rejects pending work before waiting for the shutdown exit barrier', async () => {
    const harness = createHarness()
    await start(harness)
    harness.port.responder = (message) => {
      if (message.type === 'shutdown') return
    }
    const pending = harness.host.callLifecycle('onMessage')

    let stopSettled = false
    const stopping = harness.host.stop().then(() => {
      stopSettled = true
    })

    await expect(pending).rejects.toMatchObject({ code: 'PLUGIN_RUNTIME_HOST_CLOSED' })
    expect(harness.host.pendingCount).toBe(0)
    expect(stopSettled).toBe(false)
    expect(harness.events).toEqual(['invalidate', 'close-resources'])

    harness.child.emitExit()
    await stopping
    expect(stopSettled).toBe(true)
  })

  it('stops accepting child responses before asynchronous authority invalidation settles', async () => {
    const invalidated = deferred<void>()
    const events: string[] = []
    const harness = createHarness({
      invalidateAuthority: vi.fn(async () => {
        events.push('invalidate')
        await invalidated.promise
      }),
      closeResources: vi.fn(() => {
        events.push('close-resources')
      })
    })
    await start(harness)
    harness.port.responder = undefined

    const pending = harness.host.callLifecycle('onMessage')
    const lifecycle = harness.port.sent.at(-1)!
    let outcome = 'pending'
    const observedPending = pending.then(
      () => {
        outcome = 'resolved'
      },
      (error: unknown) => {
        outcome = error instanceof PluginRuntimeHostError ? error.code : 'unexpected-error'
      }
    )
    const stopping = harness.host.stop()
    await flush()

    harness.port.emit({
      ...ownerFields,
      type: 'lifecycle-result',
      requestId: lifecycle.requestId,
      ok: true,
      result: 'late-during-invalidation'
    })
    await flush()
    const outcomeDuringInvalidation = outcome
    const pendingCountDuringInvalidation = harness.host.pendingCount
    const eventsDuringInvalidation = [...events]

    invalidated.resolve()
    await flush()
    harness.child.emitExit()
    await Promise.all([observedPending, stopping])

    expect(outcomeDuringInvalidation).toBe('PLUGIN_RUNTIME_HOST_CLOSED')
    expect(pendingCountDuringInvalidation).toBe(0)
    expect(eventsDuringInvalidation).toEqual(['invalidate'])
    expect(events).toEqual(['invalidate', 'close-resources'])
    expect(harness.host.state).toBe('closed')
  })

  it('is idempotent and rejects new work as soon as stop starts', async () => {
    const harness = createHarness()
    await start(harness)
    harness.port.responder = (message) => {
      if (message.type !== 'shutdown') return
    }

    const first = harness.host.stop()
    const second = harness.host.stop()
    expect(second).toBe(first)
    expect(harness.host.state).toBe('stopping')
    await expect(harness.host.callLifecycle('onLaunch')).rejects.toMatchObject({
      code: 'PLUGIN_RUNTIME_HOST_INACTIVE'
    })

    harness.child.emitExit()
    await Promise.all([first, second])
    await harness.host.stop()
    expect(harness.invalidateAuthority).toHaveBeenCalledTimes(1)
    expect(harness.closeResources).toHaveBeenCalledTimes(1)
  })

  it('publishes the cleanup barrier before authority invalidation can reenter stop', async () => {
    const harness = createHarness()
    await start(harness)
    let reentered = false
    harness.invalidateAuthority.mockImplementation(() => {
      harness.events.push('invalidate')
      if (reentered) return
      reentered = true
      void harness.host.stop()
    })

    await harness.host.stop()

    expect(harness.invalidateAuthority).toHaveBeenCalledTimes(1)
    expect(harness.closeResources).toHaveBeenCalledTimes(1)
    expect(harness.events).toEqual(['invalidate', 'close-resources', 'exit'])
    expect(harness.host.state).toBe('closed')
  })
})

describe('PluginRuntimeHostManager', () => {
  it('invalidates the current mapping and waits for old termination before rotation', async () => {
    const manager = new PluginRuntimeHostManager()
    const oldHost = createHarness()
    const nextHost = createHarness(
      {
        activationHandle: 'host-handle-next',
        hostGeneration: 8
      },
      {
        activation: activation({
          activationGeneration: 4,
          key: 'activation-key-next'
        })
      }
    )
    await Promise.all([start(oldHost), start(nextHost)])
    await manager.replace(oldHost.host)
    oldHost.port.responder = undefined

    let rotated = false
    const replacement = manager.replace(nextHost.host).then(() => {
      rotated = true
    })
    await flush()
    expect(rotated).toBe(false)
    expect(manager.resolve(oldHost.host.activation)).toBeUndefined()
    expect(manager.resolve(nextHost.host.activation)).toBeUndefined()

    oldHost.child.emitExit()
    await replacement
    expect(manager.resolve(nextHost.host.activation)).toBe(nextHost.host)
    await nextHost.host.stop()
  })

  it('does not install a replacement that crashes while the old host is terminating', async () => {
    const manager = new PluginRuntimeHostManager()
    const oldHost = createHarness()
    const nextHost = createHarness(
      {
        activationHandle: 'host-handle-crashed-next',
        hostGeneration: 10
      },
      {
        activation: activation({
          activationGeneration: 4,
          key: 'activation-key-crashed-next'
        })
      }
    )
    await Promise.all([start(oldHost), start(nextHost)])
    await manager.replace(oldHost.host)
    oldHost.port.responder = undefined

    const replacement = manager.replace(nextHost.host)
    await flush()
    nextHost.child.emitExit()
    oldHost.child.emitExit()
    await replacement

    expect(nextHost.host.state).toBe('crashed')
    expect(manager.resolve(nextHost.host.activation)).toBeUndefined()
    await manager.stopAll()
  })

  it('rejects cross-plugin and stale-generation resolution', async () => {
    const manager = new PluginRuntimeHostManager()
    const harness = createHarness()
    await start(harness)
    await manager.replace(harness.host)

    expect(manager.resolve(harness.host.activation)).toBe(harness.host)
    expect(manager.resolve({ ...harness.host.activation, name: 'plugin.other' })).toBeUndefined()
    expect(manager.resolve({ ...harness.host.activation, activationGeneration: 2 })).toBeUndefined()
    expect(manager.resolve({ ...harness.host.activation, key: 'stale-key' })).toBeUndefined()

    await manager.stopAll()
  })

  it('does not resolve a host after it crashes outside manager operations', async () => {
    const manager = new PluginRuntimeHostManager()
    const harness = createHarness()
    await start(harness)
    await manager.replace(harness.host)

    harness.child.emitExit()
    await flush()

    expect(manager.resolve(harness.host.activation)).toBeUndefined()
    expect(harness.host.state).toBe('crashed')
    await manager.stopAll()
  })

  it('awaits terminal cleanup when the current host is replaced with itself', async () => {
    const invalidated = deferred<void>()
    const manager = new PluginRuntimeHostManager()
    const harness = createHarness({
      invalidateAuthority: vi.fn(() => invalidated.promise)
    })
    await start(harness)
    await manager.replace(harness.host)

    harness.child.emitExit()
    await flush()
    expect(harness.host.state).toBe('crashed')

    let replacementSettled = false
    const replacing = manager.replace(harness.host).then(() => {
      replacementSettled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const settledDuringCleanup = replacementSettled

    invalidated.resolve()
    await Promise.all([replacing, harness.host.stop()])

    expect(settledDuringCleanup).toBe(false)
    expect(manager.resolve(harness.host.activation)).toBeUndefined()
    expect(harness.closeResources).toHaveBeenCalledTimes(1)
  })

  it('stops replacements submitted while stopAll owns the manager barrier', async () => {
    const manager = new PluginRuntimeHostManager()
    const alpha = createHarness()
    const beta = createHarness(
      {
        activationHandle: 'host-handle-beta-stop-all',
        hostGeneration: 9
      },
      {
        activation: activation({
          name: 'plugin.beta.stop-all',
          pluginInstanceId: 'instance-beta-stop-all',
          activationGeneration: 1,
          key: 'activation-key-beta-stop-all'
        })
      }
    )
    await Promise.all([start(alpha), start(beta)])
    await manager.replace(alpha.host)
    beta.port.responder = undefined

    let stopAllSettled = false
    const stopping = manager.stopAll().then(() => {
      stopAllSettled = true
    })
    const replacing = manager.replace(beta.host)
    await flush()
    expect(stopAllSettled).toBe(false)
    expect(manager.resolve(beta.host.activation)).toBeUndefined()

    beta.child.emitExit()
    await Promise.all([stopping, replacing])

    expect(stopAllSettled).toBe(true)
    expect(alpha.host.state).toBe('closed')
    expect(beta.host.state).toBe('closed')
    expect(manager.resolve(alpha.host.activation)).toBeUndefined()
    expect(manager.resolve(beta.host.activation)).toBeUndefined()
  })

  it('stops every plugin and clears manager ownership', async () => {
    const manager = new PluginRuntimeHostManager()
    const alpha = createHarness()
    const beta = createHarness(
      {
        activationHandle: 'host-handle-beta',
        hostGeneration: 2
      },
      {
        activation: activation({
          name: 'plugin.beta',
          pluginInstanceId: 'instance-beta',
          activationGeneration: 1,
          key: 'activation-key-beta'
        })
      }
    )
    await Promise.all([start(alpha), start(beta)])
    await Promise.all([manager.replace(alpha.host), manager.replace(beta.host)])

    await manager.stopAll()

    expect(manager.resolve(alpha.host.activation)).toBeUndefined()
    expect(manager.resolve(beta.host.activation)).toBeUndefined()
    expect(alpha.host.state).toBe('closed')
    expect(beta.host.state).toBe('closed')
  })
})
