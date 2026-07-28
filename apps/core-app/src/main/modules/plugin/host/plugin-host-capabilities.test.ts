import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { describe, expect, it, vi } from 'vitest'
import {
  PluginHostResourceRegistry,
  type PluginHostCapabilityResourceContext,
  type PluginHostResourceDispatcher
} from './plugin-host-resources'
import { HOST_PROTOCOL_VERSION, type HostMessageOwner } from './plugin-host-wire'
import {
  PluginHostCapabilityError,
  PluginHostCapabilityRegistry,
  type PluginHostCapabilityDefinition,
  type PluginHostCapabilityRegistryOptions
} from './plugin-host-capabilities'

const owner: HostMessageOwner = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'opaque-activation-handle',
  hostGeneration: 7
}
const activation: PluginActivationIdentity = {
  name: 'plugin-a',
  pluginInstanceId: 'instance-a',
  activationGeneration: 3,
  key: 'activation-key-a'
}

function stringEchoDefinition(
  overrides: Partial<PluginHostCapabilityDefinition<string, string>> = {}
): PluginHostCapabilityDefinition<string, string> {
  return {
    id: 'storage.file.read',
    permission: 'storage.files',
    timeoutMs: 1000,
    maxConcurrency: 2,
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

function createRegistry(
  options: {
    current?: PluginActivationIdentity
    resolveCurrentActivation?: (pluginName: string) => PluginActivationIdentity | undefined
    authorize?: (pluginId: string, permissionId: string) => boolean
    watchPermissionRevoked?: (
      pluginId: string,
      permissionId: string,
      onRevoke: () => void
    ) => () => void
    onFatalViolation?: (code: string) => void
    isActive?: () => boolean
    abortGraceMs?: number
    definition?: PluginHostCapabilityDefinition<unknown, unknown>
    resources?: PluginHostResourceDispatcher & PluginHostCapabilityResourceContext
    maxConcurrent?: number
  } = {}
) {
  const current = options.current === undefined ? activation : options.current
  const registry = new PluginHostCapabilityRegistry({
    owner,
    activation,
    resolveCurrentActivation: options.resolveCurrentActivation ?? (() => current),
    authorize: options.authorize ?? (() => true),
    watchPermissionRevoked: options.watchPermissionRevoked ?? (() => () => undefined),
    onFatalViolation: options.onFatalViolation ?? (() => undefined),
    resources: options.resources,
    isActive: options.isActive,
    abortGraceMs: options.abortGraceMs,
    maxConcurrent: options.maxConcurrent ?? 4
  })
  registry.register(
    (options.definition ?? stringEchoDefinition()) as PluginHostCapabilityDefinition
  )
  return registry
}

function expectCapabilityError(code: string) {
  return expect.objectContaining({ code })
}

describe('PluginHostCapabilityRegistry', () => {
  it.each([
    ['owner protocol', { ...owner, protocolVersion: 1 }, activation],
    ['owner handle', { ...owner, activationHandle: 7 }, activation],
    ['activation generation', owner, { ...activation, activationGeneration: 0 }],
    [
      'activation key accessor',
      owner,
      Object.defineProperty({ ...activation }, 'key', {
        enumerable: true,
        get: () => 'accessor-key'
      })
    ]
  ])(
    'rejects malformed %s before registering capabilities',
    (_label, malformedOwner, malformedActivation) => {
      expect(
        () =>
          new PluginHostCapabilityRegistry({
            owner: malformedOwner as HostMessageOwner,
            activation: malformedActivation as PluginActivationIdentity,
            resolveCurrentActivation: () => activation,
            authorize: () => true,
            watchPermissionRevoked: () => () => undefined,
            onFatalViolation: () => undefined
          })
      ).toThrowError(expectCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
    }
  )

  it('issues an authoritative plugin-host context from the current activation', async () => {
    const invoke = vi.fn(async (context, request: string) => {
      expect(isAuthoritativePluginContext(context)).toBe(true)
      expect(context).toMatchObject({
        name: activation.name,
        uniqueKey: activation.key,
        identity: {
          pluginName: activation.name,
          pluginInstanceId: activation.pluginInstanceId,
          activationGeneration: activation.activationGeneration,
          authority: 'plugin-host',
          hostGeneration: owner.hostGeneration
        }
      })
      return request.toUpperCase()
    })
    const registry = createRegistry({ definition: stringEchoDefinition({ invoke }) })

    await expect(registry.dispatch('storage.file.read', 'hello')).resolves.toBe('HELLO')
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'cross-plugin',
      { ...activation, name: 'plugin-b' },
      'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION'
    ],
    [
      'stale instance',
      { ...activation, pluginInstanceId: 'instance-old' },
      'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION'
    ],
    [
      'stale generation',
      { ...activation, activationGeneration: 2 },
      'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION'
    ],
    [
      'rotated key',
      { ...activation, key: 'rotated-key' },
      'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION'
    ]
  ])('rejects %s before invoking a capability', async (_label, current, code) => {
    const invoke = vi.fn()
    const registry = createRegistry({ current, definition: stringEchoDefinition({ invoke }) })

    await expect(registry.dispatch('storage.file.read', 'value')).rejects.toMatchObject({ code })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('checks permission on every call and observes runtime revoke', async () => {
    let allowed = true
    const authorize = vi.fn(() => allowed)
    const registry = createRegistry({ authorize })

    await expect(registry.dispatch('storage.file.read', 'first')).resolves.toBe('first')
    allowed = false
    await expect(registry.dispatch('storage.file.read', 'second')).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    )
    expect(authorize).toHaveBeenNthCalledWith(1, 'plugin-a', 'storage.files')
    expect(authorize).toHaveBeenNthCalledWith(2, 'plugin-a', 'storage.files')
  })

  it('rejects denied calls before running request schema code', async () => {
    const validateRequest = vi.fn(() => {
      throw new Error('must not run')
    })
    const invoke = vi.fn()
    const registry = createRegistry({
      authorize: () => false,
      definition: stringEchoDefinition({ validateRequest, invoke })
    })

    await expect(registry.dispatch('storage.file.read', 'value')).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    )
    expect(validateRequest).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('aborts an in-flight call when its permission is revoked', async () => {
    let revoke!: () => void
    const invoke = vi.fn(
      async (_context, _request: string, signal: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
    )
    const registry = createRegistry({
      watchPermissionRevoked: (_pluginId, _permissionId, onRevoke) => {
        revoke = onRevoke
        return () => undefined
      },
      definition: stringEchoDefinition({ invoke })
    })

    const call = registry.dispatch('storage.file.read', 'value')
    const expectation = expect(call).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    )
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))
    revoke()
    await expectation
    await vi.waitFor(() => expect(registry.activeCount).toBe(0))
  })

  it('stops before invoke when authorization synchronously closes the registry', async () => {
    const invoke = vi.fn()
    let registry!: PluginHostCapabilityRegistry
    registry = createRegistry({
      authorize: () => {
        registry.close()
        return true
      },
      definition: stringEchoDefinition({ invoke })
    })

    await expect(registry.dispatch('storage.file.read', 'value')).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_CLOSED')
    )
    expect(invoke).not.toHaveBeenCalled()
    expect(registry.activeCount).toBe(0)
  })

  it('rechecks activation after authorization before invoke', async () => {
    let current = activation
    const invoke = vi.fn()
    const registry = createRegistry({
      resolveCurrentActivation: () => current,
      authorize: () => {
        current = { ...activation, activationGeneration: activation.activationGeneration + 1 }
        return true
      },
      definition: stringEchoDefinition({ invoke })
    })

    await expect(registry.dispatch('storage.file.read', 'value')).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    )
    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects a result when activation rotates while the handler is in flight', async () => {
    let current = activation
    let resolveHandler!: (value: string) => void
    const pending = new Promise<string>((resolve) => {
      resolveHandler = resolve
    })
    const registry = createRegistry({
      resolveCurrentActivation: () => current,
      definition: stringEchoDefinition({ invoke: () => pending })
    })

    const call = registry.dispatch('storage.file.read', 'value')
    await vi.waitFor(() => expect(registry.activeCount).toBe(1))
    current = { ...activation, activationGeneration: activation.activationGeneration + 1 }
    resolveHandler('late-result')

    await expect(call).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    )
    expect(registry.activeCount).toBe(0)
  })

  it('rejects a result when activation rotates during result validation', async () => {
    let current = activation
    const registry = createRegistry({
      resolveCurrentActivation: () => current,
      definition: stringEchoDefinition({
        validateResult: (value) => {
          current = { ...activation, activationGeneration: activation.activationGeneration + 1 }
          if (typeof value !== 'string') throw new Error('invalid result')
          return value
        }
      })
    })

    await expect(registry.dispatch('storage.file.read', 'value')).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    )
  })

  it('fails closed when permission authorization is unavailable', async () => {
    const registry = createRegistry({
      authorize: () => {
        throw new Error('offline')
      }
    })
    await expect(registry.dispatch('storage.file.read', 'value')).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    )
  })

  it('rejects asynchronous permission decisions instead of treating promises as grants', async () => {
    const invoke = vi.fn()
    const registry = createRegistry({
      authorize: (() => Promise.resolve(false)) as unknown as () => boolean,
      definition: stringEchoDefinition({ invoke })
    })

    await expect(registry.dispatch('storage.file.read', 'value')).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    )
    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects asynchronous lifecycle decisions instead of treating promises as active', async () => {
    const invoke = vi.fn()
    const registry = createRegistry({
      isActive: (() => Promise.resolve(false)) as unknown as () => boolean,
      definition: stringEchoDefinition({ invoke })
    })

    await expect(registry.dispatch('storage.file.read', 'value')).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
    )
    expect(invoke).not.toHaveBeenCalled()
  })

  it('requires permission revoke watchers to return a synchronous disposer', async () => {
    const invoke = vi.fn()
    const registry = createRegistry({
      watchPermissionRevoked: (() =>
        Promise.resolve(
          () => undefined
        )) as unknown as PluginHostCapabilityRegistryOptions['watchPermissionRevoked'],
      definition: stringEchoDefinition({ invoke })
    })

    await expect(registry.dispatch('storage.file.read', 'value')).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    )
    expect(invoke).not.toHaveBeenCalled()
  })

  it('snapshots definitions so post-registration mutation cannot remove permission or replace invoke', async () => {
    const originalInvoke = vi.fn(async (_context, request: string) => request)
    const replacementInvoke = vi.fn(async () => 'replaced')
    const definition = stringEchoDefinition({ invoke: originalInvoke })
    const authorize = vi.fn(() => true)
    const registry = createRegistry({ authorize, definition })

    definition.permission = undefined
    definition.invoke = replacementInvoke
    definition.maxConcurrency = 32

    await expect(registry.dispatch('storage.file.read', 'value')).resolves.toBe('value')
    expect(authorize).toHaveBeenCalledWith('plugin-a', 'storage.files')
    expect(originalInvoke).toHaveBeenCalledTimes(1)
    expect(replacementInvoke).not.toHaveBeenCalled()
  })

  it('rejects non-enumerable or accessor definition fields', () => {
    const hiddenPermission = stringEchoDefinition()
    Object.defineProperty(hiddenPermission, 'permission', {
      configurable: true,
      enumerable: false,
      value: 'storage.files'
    })
    expect(() => createRegistry({ definition: hiddenPermission })).toThrowError(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    )

    const accessorPermission = stringEchoDefinition()
    Object.defineProperty(accessorPermission, 'permission', {
      configurable: true,
      enumerable: true,
      get: () => 'storage.files'
    })
    expect(() => createRegistry({ definition: accessorPermission })).toThrowError(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    )

    const thenableCallback = stringEchoDefinition({ callbackFields: ['then'] })
    expect(() => createRegistry({ definition: thenableCallback })).toThrowError(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    )
  })

  it('rechecks caller cancellation after request validation', async () => {
    const controller = new AbortController()
    const invoke = vi.fn()
    const registry = createRegistry({
      definition: stringEchoDefinition({
        validateRequest: (value) => {
          controller.abort()
          if (typeof value !== 'string') throw new Error('invalid')
          return value
        },
        invoke
      })
    })

    await expect(
      registry.dispatch('storage.file.read', 'value', controller.signal)
    ).rejects.toMatchObject(expectCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED'))
    expect(invoke).not.toHaveBeenCalled()
  })

  it('does not trust capability errors thrown by authorization or handlers', async () => {
    const injected = Object.assign(
      new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'),
      { path: '/private/path' }
    )
    const authorizationRegistry = createRegistry({
      authorize: () => {
        throw injected
      }
    })
    const authorizationError = await authorizationRegistry
      .dispatch('storage.file.read', 'value')
      .catch((error: unknown) => error)
    expect(authorizationError).toEqual(
      new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    )
    expect(authorizationError).not.toHaveProperty('path')

    const handlerRegistry = createRegistry({
      definition: stringEchoDefinition({
        invoke: () => {
          throw injected
        }
      })
    })
    const handlerError = await handlerRegistry
      .dispatch('storage.file.read', 'value')
      .catch((error: unknown) => error)
    expect(handlerError).toEqual(
      new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_HANDLER_FAILED')
    )
    expect(handlerError).not.toHaveProperty('path')
  })

  it('redacts runtime dependency failures', async () => {
    const registry = createRegistry({
      resolveCurrentActivation: () => {
        throw new Error('/sensitive/internal/path')
      }
    })
    await expect(registry.dispatch('storage.file.read', 'value')).rejects.toEqual(
      new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
    )
  })

  it('rejects unknown capabilities and duplicate definitions', async () => {
    const registry = createRegistry()
    await expect(registry.dispatch('system.invoke', null)).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_UNKNOWN')
    )
    expect(() => registry.register(stringEchoDefinition())).toThrowError(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_DUPLICATE')
    )
  })

  it('maps request and result schema failures to stable redacted errors', async () => {
    const requestRegistry = createRegistry()
    await expect(requestRegistry.dispatch('storage.file.read', 42)).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    )

    const resultRegistry = createRegistry({
      definition: stringEchoDefinition({ invoke: async () => 42 as unknown as string })
    })
    await expect(resultRegistry.dispatch('storage.file.read', 'value')).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_RESULT')
    )
  })

  it('rejects asynchronous request and result validators', async () => {
    const invoke = vi.fn()
    const requestRegistry = createRegistry({
      definition: stringEchoDefinition({
        validateRequest: (async (value: unknown) => String(value)) as unknown as (
          value: unknown
        ) => string,
        invoke
      })
    })
    await expect(requestRegistry.dispatch('storage.file.read', 'value')).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    )
    expect(invoke).not.toHaveBeenCalled()

    const resultRegistry = createRegistry({
      definition: stringEchoDefinition({
        validateResult: (async (value: unknown) => String(value)) as unknown as (
          value: unknown
        ) => string
      })
    })
    await expect(resultRegistry.dispatch('storage.file.read', 'value')).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_RESULT')
    )
  })

  it('enforces global and per-capability concurrency without queueing', async () => {
    let release!: () => void
    const pending = new Promise<string>((resolve) => {
      release = () => resolve('done')
    })
    const registry = createRegistry({
      maxConcurrent: 1,
      definition: stringEchoDefinition({ invoke: () => pending, maxConcurrency: 1 })
    })

    const first = registry.dispatch('storage.file.read', 'first')
    await vi.waitFor(() => expect(registry.activeCount).toBe(1))
    await expect(registry.dispatch('storage.file.read', 'second')).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_CONCURRENCY_LIMIT')
    )
    release()
    await expect(first).resolves.toBe('done')
    expect(registry.activeCount).toBe(0)
  })

  it('times out and signals abort but retains the concurrency slot until work settles', async () => {
    vi.useFakeTimers()
    try {
      let release!: () => void
      const observedAbort = vi.fn()
      const invokeStarted = vi.fn()
      const pending = new Promise<string>((resolve) => {
        release = () => resolve('late')
      })
      const registry = createRegistry({
        maxConcurrent: 1,
        definition: stringEchoDefinition({
          timeoutMs: 25,
          maxConcurrency: 1,
          invoke: async (_context, _request, signal) => {
            invokeStarted()
            signal.addEventListener('abort', observedAbort, { once: true })
            return pending
          }
        })
      })

      const call = registry.dispatch('storage.file.read', 'value')
      const timeoutExpectation = expect(call).rejects.toMatchObject(
        expectCapabilityError('PLUGIN_HOST_CAPABILITY_TIMEOUT')
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(invokeStarted).toHaveBeenCalledTimes(1)
      expect(registry.activeCount).toBe(1)
      await vi.advanceTimersByTimeAsync(25)
      await timeoutExpectation
      expect(observedAbort).toHaveBeenCalledTimes(1)
      expect(registry.activeCount).toBe(1)
      await expect(registry.dispatch('storage.file.read', 'blocked')).rejects.toMatchObject(
        expectCapabilityError('PLUGIN_HOST_CAPABILITY_CONCURRENCY_LIMIT')
      )
      release()
      await vi.advanceTimersByTimeAsync(0)
      expect(registry.activeCount).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails the whole registry closed when an invoked handler ignores abort grace', async () => {
    vi.useFakeTimers()
    try {
      const fatal = vi.fn()
      const invokeStarted = vi.fn()
      const never = new Promise<string>(() => undefined)
      const registry = createRegistry({
        abortGraceMs: 20,
        onFatalViolation: fatal,
        definition: stringEchoDefinition({
          timeoutMs: 10,
          invoke: () => {
            invokeStarted()
            return never
          }
        })
      })

      const call = registry.dispatch('storage.file.read', 'value')
      const expectation = expect(call).rejects.toMatchObject(
        expectCapabilityError('PLUGIN_HOST_CAPABILITY_TIMEOUT')
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(invokeStarted).toHaveBeenCalledTimes(1)
      expect(registry.activeCount).toBe(1)
      await vi.advanceTimersByTimeAsync(10)
      await expectation
      expect(registry.activeCount).toBe(1)
      await vi.advanceTimersByTimeAsync(20)
      expect(fatal).toHaveBeenCalledWith('PLUGIN_HOST_CAPABILITY_TIMEOUT')
      expect(registry.isClosed).toBe(true)
      expect(registry.activeCount).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['owner', { ...owner, hostGeneration: owner.hostGeneration + 1 }, activation],
    [
      'activation',
      owner,
      { ...activation, activationGeneration: activation.activationGeneration + 1, key: 'rotated' }
    ]
  ])(
    'rejects a resource dispatcher bound to another %s',
    (_label, resourceOwner, resourceActivation) => {
      const resources = new PluginHostResourceRegistry({
        owner: resourceOwner,
        activation: resourceActivation,
        resolveCurrentActivation: () => resourceActivation,
        isActive: () => true
      })

      expect(() => createRegistry({ resources })).toThrowError(
        expectCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
      )
    }
  )

  it('rejects registry option accessors without evaluating them', () => {
    const getter = vi.fn(() => true)
    const options = {
      owner,
      activation,
      resolveCurrentActivation: () => activation,
      authorize: () => true,
      watchPermissionRevoked: () => () => undefined,
      onFatalViolation: vi.fn()
    }
    Object.defineProperty(options, 'authorize', {
      configurable: true,
      enumerable: true,
      get: getter
    })

    expect(() => new PluginHostCapabilityRegistry(options)).toThrowError(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    )
    expect(getter).not.toHaveBeenCalled()
  })

  it('rejects symbol fields on capability definitions', () => {
    const registry = createRegistry()
    const definition = stringEchoDefinition() as PluginHostCapabilityDefinition & {
      [key: symbol]: string
    }
    definition[Symbol('hidden')] = 'unexpected'

    expect(() => registry.register(definition)).toThrowError(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    )
  })

  it('retains only an explicitly returned resource for resource-lifetime callbacks', async () => {
    const dispose = vi.fn()
    let resourceSequence = 0
    const resources = new PluginHostResourceRegistry({
      owner,
      activation,
      resolveCurrentActivation: () => activation,
      isActive: () => true,
      createResourceId: () => `resource-${++resourceSequence}`
    })
    const definition: PluginHostCapabilityDefinition<null, unknown> = {
      id: 'channel.subscribe',
      timeoutMs: 100,
      maxConcurrency: 1,
      callbackLifetime: 'resource',
      validateRequest: (value) => {
        if (value !== null) throw new Error()
        return null
      },
      validateResult: (value) => value,
      invoke: async (_context, _request, _signal, scopedResources) =>
        scopedResources.register('subscription', dispose)
    }
    const registry = createRegistry({ definition, resources })

    const handle = await registry.dispatch('channel.subscribe', null)
    expect(resources.inspect(handle)).toEqual({ id: 'resource-1', kind: 'subscription' })
    expect(registry.getCallbackLifetime('channel.subscribe')).toBe('resource')
    expect(dispose).not.toHaveBeenCalled()
    await resources.close()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('rolls back every resource registration when a handler or result validator fails', async () => {
    const dispose = vi.fn()
    let resourceSequence = 0
    const resources = new PluginHostResourceRegistry({
      owner,
      activation,
      resolveCurrentActivation: () => activation,
      isActive: () => true,
      createResourceId: () => `rollback-${++resourceSequence}`
    })
    const definition: PluginHostCapabilityDefinition<null, unknown> = {
      id: 'channel.subscribe',
      timeoutMs: 100,
      maxConcurrency: 1,
      validateRequest: () => null,
      validateResult: () => {
        throw new Error('/private/result-detail')
      },
      invoke: async (_context, _request, _signal, scopedResources) => {
        scopedResources.register('subscription', dispose)
        return { invalid: true }
      }
    }
    const registry = createRegistry({ definition, resources })

    await expect(registry.dispatch('channel.subscribe', null)).rejects.toEqual(
      new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_RESULT')
    )
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(resources.size).toBe(0)
  })

  it('propagates caller cancellation and close without exposing handler errors', async () => {
    const controller = new AbortController()
    const registry = createRegistry({
      definition: stringEchoDefinition({
        invoke: async (_context, _request, signal) =>
          new Promise<string>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('sensitive native error')), {
              once: true
            })
          })
      })
    })

    const cancelled = registry.dispatch('storage.file.read', 'value', controller.signal)
    const cancelledExpectation = expect(cancelled).rejects.toEqual(
      new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
    )
    controller.abort()
    await cancelledExpectation

    registry.close()
    await expect(registry.dispatch('storage.file.read', 'after-close')).rejects.toMatchObject(
      expectCapabilityError('PLUGIN_HOST_CAPABILITY_CLOSED')
    )
  })

  it('admits callbacks only at top-level fields declared by the capability definition', async () => {
    const callback = vi.fn(async () => 'callback-result')
    const validateRequest = vi.fn((value: unknown) => {
      const request = value as { callback?: unknown }
      if (typeof request.callback !== 'function') throw new Error()
      return request as { callback: () => Promise<unknown> }
    })
    const definition: PluginHostCapabilityDefinition<{ callback: () => Promise<unknown> }, string> =
      {
        id: 'channel.subscribe',
        timeoutMs: 100,
        maxConcurrency: 1,
        callbackFields: ['callback'],
        validateRequest,
        validateResult: (value) => String(value),
        invoke: async (_context, request) => String(await request.callback())
      }
    const registry = createRegistry({ definition })

    await expect(registry.dispatch('channel.subscribe', { callback })).resolves.toBe(
      'callback-result'
    )
    expect(callback).toHaveBeenCalledTimes(1)
    await expect(registry.dispatch('channel.subscribe', { other: callback })).rejects.toEqual(
      new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    )
    await expect(
      registry.dispatch('channel.subscribe', { callback: { nested: callback } })
    ).rejects.toEqual(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
    expect(validateRequest).toHaveBeenCalledTimes(1)
  })

  it('bounds callback-shape scanning before request validation', async () => {
    const validateRequest = vi.fn(() => 'validated')
    const invoke = vi.fn(async () => 'result')
    const registry = createRegistry({
      definition: stringEchoDefinition({ validateRequest, invoke })
    })
    const payload: Record<string, unknown> = {}
    let cursor = payload
    for (let depth = 0; depth < 80; depth += 1) {
      const next: Record<string, unknown> = {}
      cursor.next = next
      cursor = next
    }

    await expect(registry.dispatch('storage.file.read', payload)).rejects.toEqual(
      new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST')
    )
    expect(validateRequest).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })
})
