import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  PluginRuntimeChildAdapter,
  PluginRuntimeControlPortAdapter,
  PluginRuntimeProcessFactory
} from './plugin-runtime-host'
import { PluginRuntimeHostError } from './plugin-runtime-host'
import {
  PluginRuntimeService,
  PluginRuntimeServiceError,
  type PluginRuntimeActivationOptions,
  type PluginRuntimeServiceOptions
} from './plugin-runtime-service'
import type { PluginHostCapabilityDefinition } from './plugin-host-capabilities'
import { PLUGIN_HOST_CAPABILITIES, type HostWireMessage } from './plugin-host-wire'

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

function activation(
  name = 'plugin.alpha',
  generation = 1,
  key = `key-${name}-${generation}`
): PluginActivationIdentity {
  return {
    name,
    pluginInstanceId: `instance-${name}`,
    activationGeneration: generation,
    key
  }
}

class FakeChild implements PluginRuntimeChildAdapter {
  private readonly exitListeners = new Set<() => void>()
  readonly transferredPorts: unknown[] = []
  forceKillCalls = 0
  exited = false

  constructor(readonly processId: number) {}

  transferControlPort(port: unknown): void {
    this.transferredPorts.push(port)
  }

  onExit(listener: () => void): () => void {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  async forceKill(): Promise<void> {
    this.forceKillCalls += 1
    this.emitExit()
  }

  emitExit(): void {
    if (this.exited) return
    this.exited = true
    for (const listener of [...this.exitListeners]) listener()
  }
}

class FakePort implements PluginRuntimeControlPortAdapter {
  readonly sent: HostWireMessage[] = []
  readonly loadPayloads: unknown[] = []
  started = false
  closed = false
  initBarrier: ReturnType<typeof deferred<void>> | null = null
  destroyBarrier: ReturnType<typeof deferred<void>> | null = null
  private readonly listeners = new Set<(message: unknown) => void>()

  constructor(readonly child: FakeChild) {}

  postMessage(value: unknown): void {
    const message = value as HostWireMessage
    this.sent.push(message)
    if (message.type === 'host-init') {
      this.emit({
        ...message,
        type: 'host-ready',
        handshakeNonce: message.handshakeNonce
      })
      return
    }
    if (message.type === 'host-load') {
      this.loadPayloads.push(message.payload)
      this.emit({
        protocolVersion: message.protocolVersion,
        activationHandle: message.activationHandle,
        hostGeneration: message.hostGeneration,
        type: 'load-result',
        requestId: message.requestId,
        ok: true,
        result: { methods: [] }
      })
      return
    }
    if (message.type === 'lifecycle-call') {
      const barrier = message.method === 'onInit' ? this.initBarrier : this.destroyBarrier
      void (barrier?.promise ?? Promise.resolve()).then(() => {
        this.emit({
          protocolVersion: message.protocolVersion,
          activationHandle: message.activationHandle,
          hostGeneration: message.hostGeneration,
          type: 'lifecycle-result',
          requestId: message.requestId,
          ok: true,
          result: message.method
        })
      })
      return
    }
    if (message.type === 'shutdown') this.child.emitExit()
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

function createHarness(
  options: {
    artifactExists?: boolean
    capabilityDefinitions?: readonly PluginHostCapabilityDefinition[]
    authorizeCapability?: PluginRuntimeServiceOptions['authorizeCapability']
    watchPermissionRevoked?: PluginRuntimeServiceOptions['watchPermissionRevoked']
    resourceLimits?: {
      lifecycleTimeoutMs?: number
      heartbeatIntervalMs?: number
      heartbeatTimeoutMs?: number
      cancelGraceMs?: number
      shutdownTimeoutMs?: number
    }
  } = {}
) {
  const children: FakeChild[] = []
  const ports: FakePort[] = []
  let nextInitBarrier: ReturnType<typeof deferred<void>> | null = null
  const spawn = vi.fn(() => {
    const child = new FakeChild(7000 + children.length)
    const port = new FakePort(child)
    port.initBarrier = nextInitBarrier
    nextInitBarrier = null
    children.push(child)
    ports.push(port)
    return { child, controlPort: port, childPort: { child: children.length } }
  })
  const factory: PluginRuntimeProcessFactory = {
    artifactExists: vi.fn(() => options.artifactExists ?? true),
    spawn
  }
  const currentByPlugin = new Map<string, PluginActivationIdentity>()
  const revokeKey = vi.fn((key: string) => {
    for (const [pluginName, current] of currentByPlugin) {
      if (current.key !== key) continue
      currentByPlugin.delete(pluginName)
      return true
    }
    return false
  })
  const closeResources = vi.fn()
  let handleId = 0
  let hostGeneration = 0
  const service = new PluginRuntimeService({
    artifactPath: '/built/plugin-host.js',
    factory,
    keyManager: {
      requestKey: vi.fn(),
      revokeKey,
      resolveKey: vi.fn(),
      isValidKey: vi.fn(),
      resolveCurrentIdentity: (pluginName) => currentByPlugin.get(pluginName)
    },
    capabilityDefinitions: options.capabilityDefinitions ?? [],
    authorizeCapability: options.authorizeCapability ?? (() => false),
    watchPermissionRevoked: options.watchPermissionRevoked ?? (() => () => undefined),
    closeResources,
    resourceLimits: options.resourceLimits,
    createActivationHandle: () => `opaque-handle-${++handleId}`,
    createHostGeneration: () => ++hostGeneration
  })

  const start = async (
    identity: PluginActivationIdentity,
    overrides: Partial<PluginRuntimeActivationOptions> = {}
  ) => {
    currentByPlugin.set(identity.name, identity)
    return service.startActivation({
      activation: identity,
      scriptContent: 'module.exports = {}',
      snapshot: {
        platform: 'darwin',
        arch: 'arm64',
        locale: 'zh-CN',
        manifest: { name: identity.name }
      },
      ...overrides
    })
  }

  return {
    service,
    factory,
    spawn,
    children,
    ports,
    revokeKey,
    closeResources,
    setCurrent(value: PluginActivationIdentity | undefined) {
      if (value) currentByPlugin.set(value.name, value)
      else currentByPlugin.clear()
    },
    setNextInitBarrier(value: ReturnType<typeof deferred<void>>) {
      nextInitBarrier = value
    },
    start
  }
}

function stringCapabilityDefinition(
  overrides: Partial<PluginHostCapabilityDefinition<string, string>> = {}
): PluginHostCapabilityDefinition<string, string> {
  return {
    id: 'storage.file.read',
    timeoutMs: 1_000,
    maxConcurrency: 1,
    validateRequest: (value) => {
      if (typeof value !== 'string') throw new Error('invalid request')
      return value
    },
    validateResult: (value) => {
      if (typeof value !== 'string') throw new Error('invalid result')
      return value
    },
    invoke: async (_context, request) => request,
    ...overrides
  }
}

function constructorOptions(
  overrides: Partial<PluginRuntimeServiceOptions> = {}
): PluginRuntimeServiceOptions {
  return {
    artifactPath: '/built/plugin-host.js',
    factory: {
      artifactExists: () => true,
      spawn: () => {
        throw new Error('not used')
      }
    },
    keyManager: {
      requestKey: vi.fn(),
      revokeKey: vi.fn(() => true),
      resolveKey: vi.fn(),
      isValidKey: vi.fn(),
      resolveCurrentIdentity: vi.fn()
    },
    capabilityDefinitions: [],
    authorizeCapability: () => false,
    watchPermissionRevoked: () => () => undefined,
    closeResources: vi.fn(),
    ...overrides
  }
}

function expectInvalidServiceOptions(options: unknown): void {
  expect(() => new PluginRuntimeService(options as PluginRuntimeServiceOptions)).toThrowError(
    new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_INVALID_OPTIONS')
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('PluginRuntimeService', () => {
  it('rejects malformed constructor options without invoking accessors or leaking native errors', () => {
    expectInvalidServiceOptions(undefined)
    expectInvalidServiceOptions(constructorOptions({ teardownTimeoutMs: 0 }))
    expectInvalidServiceOptions(
      constructorOptions({
        keyManager: {
          requestKey: vi.fn(),
          revokeKey: vi.fn(() => true),
          resolveKey: vi.fn(),
          isValidKey: vi.fn()
        }
      })
    )

    const hostile = constructorOptions() as PluginRuntimeServiceOptions & Record<string, unknown>
    let getterCalled = false
    Object.defineProperty(hostile, 'factory', {
      enumerable: true,
      get() {
        getterCalled = true
        throw new Error('/private/native/factory-error')
      }
    })

    expectInvalidServiceOptions(hostile)
    expect(getterCalled).toBe(false)
  })

  it('snapshots definitions and rejects accessors or duplicate capability ids', async () => {
    let getterCalled = false
    const hostileDefinition = {
      timeoutMs: 1_000,
      maxConcurrency: 1,
      validateRequest: (value: unknown) => value,
      validateResult: (value: unknown) => value,
      invoke: async () => null
    }
    Object.defineProperty(hostileDefinition, 'id', {
      enumerable: true,
      get() {
        getterCalled = true
        throw new Error('secret-definition-error')
      }
    })

    expectInvalidServiceOptions(
      constructorOptions({
        capabilityDefinitions: [hostileDefinition as unknown as PluginHostCapabilityDefinition]
      })
    )
    expect(getterCalled).toBe(false)

    expectInvalidServiceOptions(
      constructorOptions({
        capabilityDefinitions: [stringCapabilityDefinition(), stringCapabilityDefinition()]
      })
    )

    expectInvalidServiceOptions(
      constructorOptions({
        capabilityDefinitions: new Array(PLUGIN_HOST_CAPABILITIES.length + 1) as never
      })
    )

    const hostileDefinitions = new Proxy([stringCapabilityDefinition()], {
      getOwnPropertyDescriptor() {
        throw new Error('/private/definition-list')
      }
    })
    expectInvalidServiceOptions(
      constructorOptions({
        capabilityDefinitions: hostileDefinitions
      })
    )

    const definition = stringCapabilityDefinition()
    const harness = createHarness({ capabilityDefinitions: [definition] })
    definition.id = 'storage.file.write'
    definition.invoke = async () => 'mutated'
    await harness.start(activation())

    expect(harness.ports[0].loadPayloads).toEqual([
      expect.objectContaining({
        capabilityManifest: [
          {
            id: 'storage.file.read',
            callbackLifetime: 'transient',
            callbackFields: []
          }
        ]
      })
    ])
    await harness.service.dispose()
  })

  it('rejects hostile activation options without evaluating accessors', async () => {
    const harness = createHarness()
    let getterCalled = false
    const options = {
      scriptContent: 'module.exports = {}',
      snapshot: { platform: 'darwin', arch: 'arm64', locale: 'zh-CN', manifest: {} }
    }
    Object.defineProperty(options, 'activation', {
      enumerable: true,
      get() {
        getterCalled = true
        throw new Error('activation-key-secret')
      }
    })

    const hostileStart = harness.service.startActivation(
      options as unknown as PluginRuntimeActivationOptions
    )
    await expect(hostileStart).rejects.toEqual(
      new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_INVALID_OPTIONS')
    )
    expect(getterCalled).toBe(false)
    expect(harness.spawn).not.toHaveBeenCalled()

    const manifest = { name: 'plugin.alpha' }
    Object.defineProperty(manifest, Symbol('hidden'), {
      enumerable: true,
      value: 'forged'
    })
    await expect(
      harness.service.startActivation({
        activation: activation(),
        scriptContent: 'module.exports = {}',
        snapshot: { platform: 'darwin', arch: 'arm64', locale: 'zh-CN', manifest }
      })
    ).rejects.toEqual(new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_INVALID_OPTIONS'))
    expect(harness.spawn).not.toHaveBeenCalled()
    await harness.service.dispose()
  })

  it('creates one dedicated host per activation with rotated owner identity', async () => {
    const harness = createHarness()
    const alpha = activation('plugin.alpha', 1)
    const beta = activation('plugin.beta', 1)

    const [alphaRuntime, betaRuntime] = await Promise.all([
      harness.start(alpha),
      harness.start(beta)
    ])

    expect(harness.spawn).toHaveBeenCalledTimes(2)
    expect(harness.children[0]).not.toBe(harness.children[1])
    expect(harness.ports[0]).not.toBe(harness.ports[1])
    expect(alphaRuntime.host.owner).toEqual({
      protocolVersion: 2,
      activationHandle: 'opaque-handle-1',
      hostGeneration: 1
    })
    expect(betaRuntime.host.owner).toEqual({
      protocolVersion: 2,
      activationHandle: 'opaque-handle-2',
      hostGeneration: 2
    })
    expect(harness.service.resolve(alpha)).toBe(alphaRuntime.host)
    expect(harness.service.resolve({ ...alpha, activationGeneration: 2 })).toBeUndefined()

    await harness.service.dispose()
  })

  it('fails before constructing a child when the fixed artifact is missing', async () => {
    const harness = createHarness({ artifactExists: false })
    const identity = activation()
    const onCrash = vi.fn()

    await expect(harness.start(identity, { onCrash })).rejects.toEqual(
      new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_ARTIFACT_UNAVAILABLE')
    )

    expect(harness.spawn).not.toHaveBeenCalled()
    expect(harness.revokeKey).toHaveBeenCalledWith(identity.key)
    expect(harness.closeResources).toHaveBeenCalledWith(identity)
    expect(harness.service.resolve(identity)).toBeUndefined()
    expect(onCrash).not.toHaveBeenCalled()
  })

  it('loads an immutable empty capability manifest and awaits child onInit', async () => {
    const harness = createHarness()
    const identity = activation()
    const initBarrier = deferred<void>()
    harness.setNextInitBarrier(initBarrier)
    const starting = harness.start(identity)
    await vi.waitFor(() => expect(harness.ports).toHaveLength(1))

    let settled = false
    void starting.finally(() => {
      settled = true
    })
    await flush()
    expect(settled).toBe(false)
    expect(harness.ports[0].loadPayloads).toEqual([
      {
        scriptContent: 'module.exports = {}',
        snapshot: {
          platform: 'darwin',
          arch: 'arm64',
          locale: 'zh-CN',
          manifest: { name: 'plugin.alpha' }
        },
        capabilityManifest: [],
        callbackLimits: {
          maxCallbacks: 64,
          maxConcurrentCallbacks: 16,
          maxResources: 64
        }
      }
    ])

    initBarrier.resolve()
    await expect(starting).resolves.toMatchObject({ host: { state: 'active' } })
    await harness.service.dispose()
  })

  it('blocks new lifecycle work and awaits onDestroy before authority and exit teardown', async () => {
    const harness = createHarness()
    const identity = activation()
    const runtime = await harness.start(identity)
    const destroyBarrier = deferred<void>()
    harness.ports[0].destroyBarrier = destroyBarrier

    let stopped = false
    const stopping = harness.service.stopActivation(identity, { runDestroy: true }).then(() => {
      stopped = true
    })
    await flush()

    await expect(runtime.lifecycle.onMessage?.('late', null)).rejects.toMatchObject({
      code: 'PLUGIN_RUNTIME_HOST_INACTIVE'
    })
    expect(stopped).toBe(false)
    expect(harness.revokeKey).not.toHaveBeenCalled()
    expect(harness.ports[0].sent.at(-1)).toMatchObject({
      type: 'lifecycle-call',
      method: 'onDestroy'
    })

    destroyBarrier.resolve()
    await stopping
    expect(harness.revokeKey).toHaveBeenCalledWith(identity.key)
    expect(harness.closeResources).toHaveBeenCalledWith(identity)
    expect(harness.children[0].exited).toBe(true)
    expect(stopped).toBe(true)
  })

  it('fails stop after process exit when activation resource cleanup does not complete', async () => {
    const harness = createHarness()
    const identity = activation()
    await harness.start(identity)
    harness.closeResources.mockRejectedValue(new Error('/private/plugin/resource-detail'))

    const stopping = harness.service.stopActivation(identity, { runDestroy: true })

    await expect(stopping).rejects.toEqual(
      new PluginRuntimeServiceError('PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED')
    )
    expect(harness.children[0].exited).toBe(true)
    expect(harness.service.resolve(identity)).toBeUndefined()
    expect(JSON.stringify(await stopping.catch((error: unknown) => error))).not.toContain(
      '/private/plugin/resource-detail'
    )

    const replacement = activation('plugin.alpha', 2, 'replacement-key')
    harness.setCurrent(replacement)
    await expect(harness.start(replacement)).rejects.toEqual(
      new PluginRuntimeServiceError('PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED')
    )
    expect(harness.spawn).toHaveBeenCalledTimes(1)
    await expect(harness.service.stopAll()).rejects.toEqual(
      new PluginRuntimeServiceError('PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED')
    )
  })

  it('reports a stable crash and rotates process, handle, generation and key on re-enable', async () => {
    const harness = createHarness()
    const firstIdentity = activation('plugin.alpha', 1, 'first-key')
    const order: string[] = []
    const onCrash = vi.fn(() => {
      order.push('crash')
    })
    const first = await harness.start(firstIdentity, {
      closeResources: () => {
        order.push('resources')
      },
      onCrash
    })

    harness.children[0].emitExit()
    await vi.waitFor(() => expect(onCrash).toHaveBeenCalledTimes(1))
    expect(onCrash).toHaveBeenCalledWith({
      code: 'PLUGIN_RUNTIME_HOST_CRASHED',
      pluginName: 'plugin.alpha',
      activationGeneration: 1
    })
    expect(order).toEqual(['resources', 'crash'])
    expect(harness.children[0].exited).toBe(true)
    expect(harness.service.resolve(firstIdentity)).toBeUndefined()

    const secondIdentity = activation('plugin.alpha', 2, 'second-key')
    const second = await harness.start(secondIdentity)
    expect(second.host).not.toBe(first.host)
    expect(second.host.processId).not.toBe(first.host.processId)
    expect(second.host.owner.activationHandle).not.toBe(first.host.owner.activationHandle)
    expect(second.host.owner.hostGeneration).not.toBe(first.host.owner.hostGeneration)
    expect(harness.service.resolve(firstIdentity)).toBeUndefined()
    expect(harness.service.resolve(secondIdentity)).toBe(second.host)

    await harness.service.dispose()
  })

  it('retains an unexpected-crash cleanup failure and blocks generation replacement', async () => {
    const harness = createHarness()
    const crashedIdentity = activation('plugin.alpha', 1, 'crashed-key')
    const onCrash = vi.fn()
    await harness.start(crashedIdentity, { onCrash })
    harness.closeResources.mockRejectedValue(new Error('/private/plugin/resource-detail'))

    harness.children[0].emitExit()
    await vi.waitFor(() => expect(onCrash).toHaveBeenCalledOnce())

    await expect(harness.service.stopActivation(crashedIdentity)).rejects.toEqual(
      new PluginRuntimeServiceError('PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED')
    )
    await expect(harness.start(activation('plugin.alpha', 2, 'replacement-key'))).rejects.toEqual(
      new PluginRuntimeServiceError('PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED')
    )
    expect(harness.spawn).toHaveBeenCalledTimes(1)
    await expect(harness.service.stopAll()).rejects.toEqual(
      new PluginRuntimeServiceError('PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED')
    )
    expect(
      JSON.stringify(await harness.service.stopAll().catch((error: unknown) => error))
    ).not.toContain('/private/plugin/resource-detail')
  })

  it('retains a startup-crash cleanup failure for later teardown barriers', async () => {
    const harness = createHarness()
    const identity = activation()
    const initBarrier = deferred<void>()
    harness.setNextInitBarrier(initBarrier)
    harness.closeResources.mockRejectedValue(new Error('/private/plugin/startup-cleanup-detail'))

    const starting = harness.start(identity)
    await vi.waitFor(() => expect(harness.ports).toHaveLength(1))
    harness.children[0].emitExit()

    await expect(starting).rejects.toEqual(
      new PluginRuntimeServiceError('PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED')
    )
    await expect(harness.service.stopActivation(identity)).rejects.toEqual(
      new PluginRuntimeServiceError('PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED')
    )
    await expect(harness.service.stopAll()).rejects.toEqual(
      new PluginRuntimeServiceError('PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED')
    )
  })

  it('blocks the fourth explicit restart after three crashes in 30 seconds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const harness = createHarness({
      resourceLimits: {
        heartbeatIntervalMs: 60_000,
        heartbeatTimeoutMs: 60_000
      }
    })

    for (let generation = 1; generation <= 3; generation += 1) {
      const crashed = deferred<void>()
      await harness.start(activation('plugin.alpha', generation), {
        onCrash: () => crashed.resolve()
      })
      harness.children[generation - 1].emitExit()
      await crashed.promise
      vi.setSystemTime(1_000 + generation * 1_000)
    }

    await expect(harness.start(activation('plugin.alpha', 4))).rejects.toEqual(
      new PluginRuntimeServiceError('PLUGIN_RUNTIME_RESTART_BUDGET_EXHAUSTED')
    )
    expect(harness.spawn).toHaveBeenCalledTimes(3)

    vi.setSystemTime(34_001)
    const recovered = await harness.start(activation('plugin.alpha', 5))
    expect(recovered.host.state).toBe('active')
    expect(harness.spawn).toHaveBeenCalledTimes(4)

    await harness.service.dispose()
  })

  it('rejects stale activation identities before spawning or disturbing current authority', async () => {
    const harness = createHarness()
    const stale = activation('plugin.alpha', 1, 'stale-key')
    const current = activation('plugin.alpha', 2, 'current-key')
    harness.setCurrent(current)

    await expect(
      harness.service.startActivation({
        activation: stale,
        scriptContent: 'module.exports = {}',
        snapshot: { platform: 'darwin', arch: 'arm64', locale: 'zh-CN', manifest: {} }
      })
    ).rejects.toEqual(new PluginRuntimeServiceError('PLUGIN_RUNTIME_ACTIVATION_STALE'))

    expect(harness.spawn).not.toHaveBeenCalled()
    expect(harness.revokeKey).not.toHaveBeenCalled()
    expect(harness.closeResources).not.toHaveBeenCalled()
    await harness.service.dispose()
  })

  it('serializes a same-plugin stop behind startup and closes resources exactly once', async () => {
    const harness = createHarness()
    const identity = activation()
    const initBarrier = deferred<void>()
    harness.setNextInitBarrier(initBarrier)
    const starting = harness.start(identity)
    await vi.waitFor(() => expect(harness.ports).toHaveLength(1))

    let stopped = false
    const stopping = harness.service.stopActivation(identity).then(() => {
      stopped = true
    })
    await flush()
    expect(stopped).toBe(false)

    initBarrier.resolve()
    await starting
    await stopping

    expect(harness.service.resolve(identity)).toBeUndefined()
    expect(harness.revokeKey).toHaveBeenCalledTimes(1)
    expect(harness.closeResources).toHaveBeenCalledTimes(1)
    expect(harness.children[0].exited).toBe(true)
    await harness.service.dispose()
  })

  it('makes stopAll a terminal barrier for an activation still starting', async () => {
    const harness = createHarness()
    const identity = activation()
    const initBarrier = deferred<void>()
    harness.setNextInitBarrier(initBarrier)
    const starting = harness.start(identity)
    await vi.waitFor(() => expect(harness.ports).toHaveLength(1))

    const startResult = expect(starting).rejects.toEqual(
      new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_CLOSED')
    )
    const stopping = harness.service.stopAll()
    initBarrier.resolve()

    await startResult
    await stopping
    expect(harness.service.resolve(identity)).toBeUndefined()
    expect(harness.revokeKey).toHaveBeenCalledTimes(1)
    expect(harness.closeResources).toHaveBeenCalledTimes(1)
    expect(harness.children[0].exited).toBe(true)
    await expect(
      harness.service.startActivation({
        activation: identity,
        scriptContent: 'module.exports = {}',
        snapshot: { platform: 'darwin', arch: 'arm64', locale: 'zh-CN', manifest: {} }
      })
    ).rejects.toEqual(new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_CLOSED'))
  })

  it('preserves an operation cleanup failure while stopAll closes another record', async () => {
    const harness = createHarness()
    const failingIdentity = activation('plugin.alpha')
    const liveIdentity = activation('plugin.beta')
    const cleanupBarrier = deferred<void>()
    harness.closeResources.mockImplementation((identity: PluginActivationIdentity) =>
      identity.name === failingIdentity.name ? cleanupBarrier.promise : Promise.resolve()
    )
    await harness.start(failingIdentity)
    await harness.start(liveIdentity)

    const failedStop = harness.service.stopActivation(failingIdentity, { runDestroy: false })
    await vi.waitFor(() => expect(harness.closeResources).toHaveBeenCalledWith(failingIdentity))

    const stoppingAll = harness.service.stopAll()
    const failedStopResult = expect(failedStop).rejects.toEqual(
      new PluginRuntimeServiceError('PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED')
    )
    const stopAllResult = expect(stoppingAll).rejects.toEqual(
      new PluginRuntimeServiceError('PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED')
    )
    cleanupBarrier.reject(new Error('/private/plugin/resource-detail'))

    await failedStopResult
    await stopAllResult
    expect(harness.children.every((child) => child.exited)).toBe(true)
    expect(harness.service.resolve(liveIdentity)).toBeUndefined()
  })

  it('reports asynchronous protocol termination only after cleanup completes', async () => {
    const harness = createHarness()
    const identity = activation()
    const order: string[] = []
    const onCrash = vi.fn(() => {
      order.push('crash')
    })
    const runtime = await harness.start(identity, {
      closeResources: () => {
        order.push('resources')
      },
      onCrash
    })

    harness.ports[0].emit({
      ...runtime.host.owner,
      type: 'violation',
      requestId: 900,
      error: { code: 'PLUGIN_HOST_VIOLATION_PROTOCOL' }
    })
    await vi.waitFor(() => expect(onCrash).toHaveBeenCalledTimes(1))

    expect(order).toEqual(['resources', 'crash'])
    expect(onCrash).toHaveBeenCalledWith({
      code: 'PLUGIN_RUNTIME_HOST_CRASHED',
      pluginName: identity.name,
      activationGeneration: identity.activationGeneration
    })
    expect(harness.service.resolve(identity)).toBeUndefined()
    expect(harness.revokeKey).toHaveBeenCalledTimes(1)
    expect(harness.closeResources).toHaveBeenCalledTimes(1)
    expect(harness.children[0].exited).toBe(true)
    await harness.service.dispose()
    expect(onCrash).toHaveBeenCalledTimes(1)
  })

  it('tears down a retained resource before reporting a permission-revoke crash', async () => {
    const watchers = new Set<() => void>()
    const order: string[] = []
    const nativeDispose = vi.fn(() => {
      order.push('native-resource')
    })
    const definition: PluginHostCapabilityDefinition<null, object> = {
      id: 'channel.subscribe',
      permission: 'channel.private',
      timeoutMs: 1_000,
      maxConcurrency: 1,
      callbackLifetime: 'resource',
      callbackFields: [],
      validateRequest(value) {
        if (value !== null) throw new Error('invalid request')
        return null
      },
      validateResult(value) {
        if (!value || typeof value !== 'object') throw new Error('invalid result')
        return value
      },
      invoke(_context, _request, _signal, resources) {
        return resources.register('subscription', nativeDispose)
      }
    }
    const harness = createHarness({
      capabilityDefinitions: [definition],
      authorizeCapability: () => true,
      watchPermissionRevoked: (_pluginName, _permissionId, onRevoke) => {
        watchers.add(onRevoke)
        return () => watchers.delete(onRevoke)
      }
    })
    const identity = activation()
    const onCrash = vi.fn(() => {
      order.push(harness.children[0].exited ? 'crash' : 'crash-before-exit')
    })
    const runtime = await harness.start(identity, {
      closeResources: () => {
        order.push('external-resources')
      },
      onCrash
    })

    harness.ports[0].emit({
      ...runtime.host.owner,
      type: 'capability-call',
      requestId: 901,
      capability: 'channel.subscribe',
      payload: null
    })
    await vi.waitFor(() =>
      expect(harness.ports[0].sent).toContainEqual(
        expect.objectContaining({
          type: 'capability-result',
          requestId: 901,
          ok: true,
          result: expect.objectContaining({
            __tuffHostWire: 'resource',
            kind: 'subscription'
          })
        })
      )
    )
    expect(watchers.size).toBe(1)

    const revoke = [...watchers][0]
    revoke()
    revoke()
    await vi.waitFor(() => expect(onCrash).toHaveBeenCalledTimes(1))

    expect(harness.revokeKey).toHaveBeenCalledWith(identity.key)
    expect(nativeDispose).toHaveBeenCalledTimes(1)
    expect(watchers.size).toBe(0)
    expect(order).toEqual(['native-resource', 'external-resources', 'crash'])
    expect(harness.service.resolve(identity)).toBeUndefined()
    expect(harness.children[0].exited).toBe(true)
    await harness.service.dispose()
    expect(nativeDispose).toHaveBeenCalledTimes(1)
    expect(onCrash).toHaveBeenCalledTimes(1)
  })

  it('reports an active timeout once after resource and child cleanup', async () => {
    vi.useFakeTimers()
    const harness = createHarness({
      resourceLimits: {
        lifecycleTimeoutMs: 10,
        cancelGraceMs: 5,
        shutdownTimeoutMs: 5
      }
    })
    const identity = activation()
    const order: string[] = []
    const onCrash = vi.fn(() => {
      order.push('crash')
    })
    const runtime = await harness.start(identity, {
      closeResources: () => {
        order.push('resources')
      },
      onCrash
    })
    harness.ports[0].destroyBarrier = deferred<void>()

    const call = runtime.lifecycle.onMessage('timeout', null)
    const rejection = expect(call).rejects.toEqual(
      new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_TIMEOUT')
    )
    await vi.advanceTimersByTimeAsync(10)
    await rejection
    expect(onCrash).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5)
    await runtime.host.stop()
    await flush()

    expect(order).toEqual(['resources', 'crash'])
    expect(onCrash).toHaveBeenCalledTimes(1)
    expect(onCrash).toHaveBeenCalledWith({
      code: 'PLUGIN_RUNTIME_HOST_CRASHED',
      pluginName: identity.name,
      activationGeneration: identity.activationGeneration
    })
    expect(harness.children[0].exited).toBe(true)
    expect(harness.service.resolve(identity)).toBeUndefined()
    await harness.service.dispose()
    expect(onCrash).toHaveBeenCalledTimes(1)
  })

  it('completes crash cleanup even when the observer throws', async () => {
    const harness = createHarness()
    const identity = activation()
    const onCrash = vi.fn(() => {
      throw new Error('/private/native/crash-detail')
    })
    await harness.start(identity, { onCrash })

    harness.children[0].emitExit()
    await vi.waitFor(() => expect(harness.closeResources).toHaveBeenCalledTimes(1))

    expect(onCrash).toHaveBeenCalledWith({
      code: 'PLUGIN_RUNTIME_HOST_CRASHED',
      pluginName: identity.name,
      activationGeneration: identity.activationGeneration
    })
    expect(harness.revokeKey).toHaveBeenCalledTimes(1)
    expect(harness.service.resolve(identity)).toBeUndefined()
    await harness.service.dispose()
    expect(harness.closeResources).toHaveBeenCalledTimes(1)
  })

  it('keeps repeated stop and dispose idempotent', async () => {
    const harness = createHarness()
    const identity = activation()
    const onCrash = vi.fn()
    await harness.start(identity, { onCrash })

    await Promise.all([
      harness.service.stopActivation(identity),
      harness.service.stopActivation(identity),
      harness.service.stopPlugin(identity.name)
    ])
    await Promise.all([harness.service.dispose(), harness.service.dispose()])

    expect(harness.revokeKey).toHaveBeenCalledTimes(1)
    expect(harness.closeResources).toHaveBeenCalledTimes(1)
    expect(harness.children[0].exited).toBe(true)
    expect(harness.service.resolve(identity)).toBeUndefined()
    expect(onCrash).not.toHaveBeenCalled()
  })

  it('merges trusted activation-local definitions into only that activation manifest', async () => {
    const harness = createHarness()
    const localDefinition = stringCapabilityDefinition({ id: 'plugin.info.get' })
    const alpha = activation('plugin.alpha', 1, 'alpha-key')
    const beta = activation('plugin.beta', 1, 'beta-key')

    await harness.start(alpha, { capabilityDefinitions: [localDefinition] })
    await harness.start(beta)

    const alphaLoad = harness.ports[0].sent.find(
      (message) => (message as { type?: string }).type === 'host-load'
    ) as { payload: { capabilityManifest: Array<{ id: string }> } }
    const betaLoad = harness.ports[1].sent.find(
      (message) => (message as { type?: string }).type === 'host-load'
    ) as { payload: { capabilityManifest: Array<{ id: string }> } }
    expect(alphaLoad.payload.capabilityManifest.map((entry) => entry.id)).toEqual([
      'plugin.info.get'
    ])
    expect(betaLoad.payload.capabilityManifest).toEqual([])

    await harness.service.dispose()
  })

  it('filters the merged manifest through an exact activation capability allowlist', async () => {
    const base = stringCapabilityDefinition({ id: 'storage.file.read' })
    const local = stringCapabilityDefinition({ id: 'intelligence.invoke' })
    const harness = createHarness({ capabilityDefinitions: [base] })

    await harness.start(activation(), {
      capabilityDefinitions: [local],
      capabilityAllowlist: ['intelligence.invoke']
    })

    const load = harness.ports[0].sent.find(
      (message) => (message as { type?: string }).type === 'host-load'
    ) as { payload: { capabilityManifest: Array<{ id: string }> } }
    expect(load.payload.capabilityManifest.map((entry) => entry.id)).toEqual([
      'intelligence.invoke'
    ])

    await harness.service.dispose()
  })

  it('rejects an allowlist capability that is absent from the merged manifest', async () => {
    const harness = createHarness()

    await expect(
      harness.start(activation(), { capabilityAllowlist: ['intelligence.invoke'] })
    ).rejects.toEqual(new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_INVALID_OPTIONS'))
    expect(harness.spawn).not.toHaveBeenCalled()
  })

  it('rejects duplicate base and activation definitions before spawning a process', async () => {
    const base = stringCapabilityDefinition()
    const harness = createHarness({ capabilityDefinitions: [base] })
    const closeResources = vi.fn()

    await expect(
      harness.start(activation(), {
        capabilityDefinitions: [stringCapabilityDefinition()],
        closeResources
      })
    ).rejects.toEqual(new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_INVALID_OPTIONS'))
    expect(harness.spawn).not.toHaveBeenCalled()
    expect(harness.revokeKey).toHaveBeenCalledWith(activation().key)
    expect(harness.closeResources).toHaveBeenCalledWith(activation())
    expect(closeResources).toHaveBeenCalledTimes(1)
  })

  it('never routes an old lifecycle proxy into a replacement generation', async () => {
    const harness = createHarness()
    const staleIdentity = activation('plugin.alpha', 1, 'stale-key')
    const stale = await harness.start(staleIdentity)
    await harness.service.stopActivation(staleIdentity, { runDestroy: false })
    const currentIdentity = activation('plugin.alpha', 2, 'current-key')
    await harness.start(currentIdentity)
    const currentMessageCount = harness.ports[1].sent.length

    await expect(stale.lifecycle.onMessage?.('stale', null)).rejects.toMatchObject({
      code: 'PLUGIN_RUNTIME_HOST_INACTIVE'
    })
    expect(harness.ports[1].sent).toHaveLength(currentMessageCount)

    await harness.service.dispose()
  })
})
