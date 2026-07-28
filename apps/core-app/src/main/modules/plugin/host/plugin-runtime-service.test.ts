import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { describe, expect, it, vi } from 'vitest'
import type {
  PluginRuntimeChildAdapter,
  PluginRuntimeControlPortAdapter,
  PluginRuntimeProcessFactory
} from './plugin-runtime-host'
import { PluginRuntimeHostError } from './plugin-runtime-host'
import {
  PluginRuntimeService,
  type PluginRuntimeActivationOptions
} from './plugin-runtime-service'
import type { PluginHostCapabilityDefinition } from './plugin-host-capabilities'
import type { HostWireMessage } from './plugin-host-wire'

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
    authorizeCapability: () => false,
    watchPermissionRevoked: () => () => undefined,
    closeResources,
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
        capabilityDefinitions: [
          hostileDefinition as unknown as PluginHostCapabilityDefinition
        ]
      })
    )
    expect(getterCalled).toBe(false)

    expectInvalidServiceOptions(
      constructorOptions({
        capabilityDefinitions: [stringCapabilityDefinition(), stringCapabilityDefinition()]
      })
    )

    const definition = stringCapabilityDefinition()
    const harness = createHarness({ capabilityDefinitions: [definition] })
    definition.id = 'storage.file.write'
    definition.invoke = async () => 'mutated'
    await harness.start(activation())

    expect(harness.ports[0].loadPayloads).toEqual([
      expect.objectContaining({ capabilityManifest: ['storage.file.read'] })
    ])
    await harness.service.dispose()
  })

  it('rejects hostile activation options without evaluating accessors', async () => {
    const harness = createHarness()
    let getterCalled = false
    const options = {
      scriptContent: 'module.exports = {}',
      snapshot: { platform: 'darwin', arch: 'arm64', manifest: {} }
    }
    Object.defineProperty(options, 'activation', {
      enumerable: true,
      get() {
        getterCalled = true
        throw new Error('activation-key-secret')
      }
    })

    await expect(
      harness.service.startActivation(options as unknown as PluginRuntimeActivationOptions)
    ).rejects.toEqual(new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_INVALID_OPTIONS'))
    expect(getterCalled).toBe(false)
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

    await expect(harness.start(identity)).rejects.toEqual(
      new PluginRuntimeHostError('PLUGIN_RUNTIME_HOST_ARTIFACT_UNAVAILABLE')
    )

    expect(harness.spawn).not.toHaveBeenCalled()
    expect(harness.revokeKey).toHaveBeenCalledWith(identity.key)
    expect(harness.closeResources).toHaveBeenCalledWith(identity)
    expect(harness.service.resolve(identity)).toBeUndefined()
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
          manifest: { name: 'plugin.alpha' }
        },
        capabilityManifest: []
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

  it('reports a stable crash and rotates process, handle, generation and key on re-enable', async () => {
    const harness = createHarness()
    const firstIdentity = activation('plugin.alpha', 1, 'first-key')
    const onCrash = vi.fn()
    const first = await harness.start(firstIdentity, { onCrash })

    harness.children[0].emitExit()
    await vi.waitFor(() => expect(onCrash).toHaveBeenCalledTimes(1))
    expect(onCrash).toHaveBeenCalledWith({
      code: 'PLUGIN_RUNTIME_HOST_CRASHED',
      pluginName: 'plugin.alpha',
      activationGeneration: 1
    })
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

  it('rejects stale activation identities before spawning or disturbing current authority', async () => {
    const harness = createHarness()
    const stale = activation('plugin.alpha', 1, 'stale-key')
    const current = activation('plugin.alpha', 2, 'current-key')
    harness.setCurrent(current)

    await expect(
      harness.service.startActivation({
        activation: stale,
        scriptContent: 'module.exports = {}',
        snapshot: { platform: 'darwin', arch: 'arm64', manifest: {} }
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
    await expect(harness.service.startActivation({
      activation: identity,
      scriptContent: 'module.exports = {}',
      snapshot: { platform: 'darwin', arch: 'arm64', manifest: {} }
    })).rejects.toEqual(new PluginRuntimeServiceError('PLUGIN_RUNTIME_SERVICE_CLOSED'))
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
    await harness.start(identity)

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
