import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { describe, expect, it, vi } from 'vitest'
import {
  PluginHostChildResourceClient,
  PluginHostResourceError,
  PluginHostResourceRegistry,
  type PluginHostCapabilityResourceContext
} from './plugin-host-resources'
import { PluginHostSession } from './plugin-host-session'
import { hostWireResourceHandle, type HostWireResourceKind } from './plugin-host-wire-codec'
import {
  HOST_PROTOCOL_VERSION,
  type HostMessageOwner,
  type HostWireMessage,
  type PluginHostCapability
} from './plugin-host-wire'

const owner: HostMessageOwner = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'resource-owner',
  hostGeneration: 4
}

const activation: PluginActivationIdentity = {
  name: 'plugin.resources',
  pluginInstanceId: 'plugin-resources-instance',
  activationGeneration: 2,
  key: 'plugin-resources-key'
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })
  return { promise, resolve }
}

function activeChildSession(
  codec: ConstructorParameters<typeof PluginHostSession>[0]['codec'] = {}
) {
  const session = new PluginHostSession({ owner, endpoint: 'child', codec })
  session.accept('main-to-child', {
    ...owner,
    type: 'host-init',
    requestId: 1,
    handshakeNonce: 'nonce'
  })
  session.accept('child-to-main', {
    ...owner,
    type: 'host-ready',
    requestId: 1,
    handshakeNonce: 'nonce'
  })
  session.accept('main-to-child', {
    ...owner,
    type: 'host-load',
    requestId: 2,
    payload: null
  })
  session.accept('child-to-main', {
    ...owner,
    type: 'load-result',
    requestId: 2,
    ok: true,
    result: null
  })
  return session
}

function registry(overrides: Record<string, unknown> = {}): PluginHostResourceRegistry {
  return new PluginHostResourceRegistry({
    owner,
    activation,
    resolveCurrentActivation: () => activation,
    isActive: () => true,
    maxResources: 64,
    maxSubscriptions: 32,
    maxStreams: 8,
    maxDisposers: 32,
    maxProcesses: 2,
    ...overrides
  } as never)
}

function begin(
  target: PluginHostResourceRegistry,
  capabilityId: PluginHostCapability = 'channel.subscribe',
  permissionId: string | undefined = 'channel.private'
) {
  return target.beginInvocation({ capabilityId, permissionId })
}

async function registerCommitted(
  target: PluginHostResourceRegistry,
  kind: HostWireResourceKind,
  dispose: () => void | Promise<void> = vi.fn()
) {
  const invocation = begin(target)
  const handle = invocation.resources.register(kind, dispose)
  await invocation.commit(handle)
  return handle
}

describe('PluginHostResourceRegistry', () => {
  it('snapshots options, owner, activation, and nested limits without invoking accessors', () => {
    const getter = vi.fn(() => owner)
    const options = {
      owner,
      activation,
      resolveCurrentActivation: () => activation,
      isActive: () => true,
      maxResources: 64,
      maxSubscriptions: 32,
      maxStreams: 8,
      maxDisposers: 32,
      maxProcesses: 2
    }
    Object.defineProperty(options, 'owner', { enumerable: true, get: getter })

    expect(() => new PluginHostResourceRegistry(options as never)).toThrow(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_INVALID_OPTIONS')
    )
    expect(getter).not.toHaveBeenCalled()

    const invocationOptions = {
      capabilityId: 'channel.subscribe',
      permissionId: 'channel.private'
    }
    Object.defineProperty(invocationOptions, 'permissionId', {
      enumerable: true,
      get: getter
    })
    const target = registry()
    expect(() => target.beginInvocation(invocationOptions as never)).toThrow(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_INVALID_OPTIONS')
    )
    expect(getter).not.toHaveBeenCalled()
  })

  it('creates opaque IDs and accepts only the exact registry-owned handle', async () => {
    const target = registry()
    const handle = await registerCommitted(target, 'disposer')
    const descriptor = target.inspect(handle)

    expect(descriptor?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i)
    expect(descriptor?.id).not.toContain(activation.name)
    expect(descriptor).toMatchObject({ kind: 'disposer' })
    expect(target.inspect(hostWireResourceHandle(descriptor!.id, 'disposer'))).toBeNull()
    expect(target.inspect({ id: descriptor!.id, kind: 'disposer' })).toBeNull()
  })

  it('registers only inside an active invocation and freezes full owner metadata', async () => {
    const target = registry()
    expect(target.owner).toEqual(owner)
    expect(target.activation).toEqual(activation)
    expect(Object.isFrozen(target.owner)).toBe(true)
    expect(Object.isFrozen(target.activation)).toBe(true)
    expect(() =>
      (target as unknown as PluginHostCapabilityResourceContext).register('stream', vi.fn())
    ).toThrow(new PluginHostResourceError('PLUGIN_HOST_RESOURCE_CLOSED'))

    const invocation = begin(target, 'intelligence.stream', 'intelligence.basic')
    const handle = invocation.resources.register('stream', vi.fn())
    await invocation.commit(handle)
    expect(() => invocation.resources.register('stream', vi.fn())).toThrow(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_CLOSED')
    )
  })

  it('commits only a handle created by that invocation and rolls all others back', async () => {
    const firstDispose = vi.fn()
    const secondDispose = vi.fn()
    const target = registry({
      createResourceId: (() => {
        let sequence = 0
        return () => `resource-${++sequence}`
      })()
    })
    const firstInvocation = begin(target)
    const first = firstInvocation.resources.register('subscription', firstDispose)
    const second = firstInvocation.resources.register('disposer', secondDispose)
    await firstInvocation.commit(first)

    expect(target.inspect(first)).toEqual({ id: 'resource-1', kind: 'subscription' })
    expect(target.inspect(second)).toBeNull()
    expect(secondDispose).toHaveBeenCalledTimes(1)

    const otherInvocation = begin(target)
    const other = otherInvocation.resources.register('stream', vi.fn())
    await expect(otherInvocation.commit(first)).rejects.toEqual(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_UNKNOWN')
    )
    expect(target.inspect(other)).toBeNull()
  })

  it('enforces total 64 and per-kind 32/8/32/2 limits', async () => {
    const total = registry({
      createResourceId: (() => {
        let sequence = 0
        return () => `total-${++sequence}`
      })()
    })
    for (const [kind, count] of [
      ['subscription', 32],
      ['stream', 8],
      ['disposer', 22],
      ['process', 2]
    ] as const) {
      for (let index = 0; index < count; index++) await registerCommitted(total, kind)
    }
    expect(total.size).toBe(64)
    expect(() => begin(total).resources.register('disposer', vi.fn())).toThrow(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_LIMIT')
    )

    for (const [kind, limit] of [
      ['subscription', 32],
      ['stream', 8],
      ['disposer', 32],
      ['process', 2]
    ] as const) {
      let sequence = 0
      const perKind = registry({ createResourceId: () => `${kind}-${++sequence}` })
      for (let index = 0; index < limit; index++) await registerCommitted(perKind, kind)
      expect(() => begin(perKind).resources.register(kind, vi.fn())).toThrow(
        new PluginHostResourceError('PLUGIN_HOST_RESOURCE_KIND_LIMIT')
      )
    }
  })

  it('rejects duplicate IDs, wrong kinds, forged handles, and stale generations', async () => {
    let current: PluginActivationIdentity | undefined = activation
    const duplicate = registry({
      resolveCurrentActivation: () => current,
      createResourceId: () => 'resource-duplicate'
    })
    const handle = await registerCommitted(duplicate, 'stream')
    expect(() => begin(duplicate).resources.register('stream', vi.fn())).toThrow(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_DUPLICATE')
    )
    await expect(duplicate.dispose('resource-duplicate', 'process')).rejects.toEqual(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_KIND_MISMATCH')
    )
    expect(duplicate.inspect(hostWireResourceHandle('resource-duplicate', 'stream'))).toBeNull()

    current = { ...activation, activationGeneration: 3, key: 'rotated' }
    expect(() => begin(duplicate)).toThrow(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_STALE_ACTIVATION')
    )
    await expect(duplicate.dispose('resource-duplicate', 'stream')).rejects.toEqual(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_STALE_ACTIVATION')
    )
    expect(duplicate.inspect(handle)).toBeNull()
  })

  it('deletes before awaiting disposal and returns only a stable failure code', async () => {
    let release!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const target = registry({ createResourceId: () => 'resource-dispose' })
    const handle = await registerCommitted(target, 'disposer', async () => barrier)
    const disposing = target.dispose('resource-dispose', 'disposer')

    expect(target.size).toBe(0)
    expect(target.inspect(handle)).toBeNull()
    expect(() => begin(target).resources.register('disposer', vi.fn())).toThrow(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_DUPLICATE')
    )
    release()
    await disposing

    const failed = registry({ createResourceId: () => 'resource-failed' })
    await registerCommitted(failed, 'disposer', () => {
      throw new Error('/private/native/dispose')
    })
    await expect(failed.dispose('resource-failed', 'disposer')).rejects.toEqual(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_DISPOSE_FAILED')
    )
  })

  it('retains callback IDs on the resource and releases them before native disposal', async () => {
    const order: string[] = []
    const target = registry({ createResourceId: () => 'resource-callbacks' })
    const handle = await registerCommitted(target, 'subscription', () => {
      order.push('native-dispose')
    })
    target.retainCallbacks(handle, ['callback-1', 'callback-2'])

    await target.dispose('resource-callbacks', 'subscription', (_resourceId, callbackIds) => {
      order.push(`callbacks:${callbackIds.join(',')}`)
    })
    expect(order).toEqual(['callbacks:callback-1,callback-2', 'native-dispose'])
  })

  it('fails the activation closed when a retained permission dependency is revoked', async () => {
    let revoke!: () => void
    const fatal = vi.fn()
    const dispose = vi.fn()
    const target = registry({
      createResourceId: () => 'resource-permission',
      watchPermissionRevoked: (
        _pluginName: string,
        _permissionId: string,
        onRevoke: () => void
      ) => {
        revoke = onRevoke
        return vi.fn()
      },
      onFatalViolation: fatal
    })
    await registerCommitted(target, 'subscription', dispose)

    revoke()
    revoke()
    expect(fatal).toHaveBeenCalledTimes(1)
    expect(fatal).toHaveBeenCalledWith('PLUGIN_HOST_RESOURCE_PERMISSION_REVOKED')
    await target.close()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('ignores a permission revoke callback flushed by normal close', async () => {
    let revoke!: () => void
    const fatal = vi.fn()
    const target = registry({
      createResourceId: () => 'resource-close-revoke-race',
      watchPermissionRevoked: vi.fn(
        (_pluginName: string, _permissionId: string, onRevoke: () => void) => {
          revoke = onRevoke
          return () => revoke()
        }
      ),
      onFatalViolation: fatal
    })
    await registerCommitted(target, 'subscription')

    await target.close()

    expect(fatal).not.toHaveBeenCalled()
  })

  it('closes all resources exactly once despite failures and callback release errors', async () => {
    const first = vi.fn(async () => {
      throw new Error('/private/dispose-detail')
    })
    const second = vi.fn()
    let sequence = 0
    const target = registry({ createResourceId: () => `resource-${++sequence}` })
    const firstHandle = await registerCommitted(target, 'subscription', first)
    const secondHandle = await registerCommitted(target, 'process', second)
    target.retainCallbacks(firstHandle, ['callback-first'])
    target.retainCallbacks(secondHandle, ['callback-second'])
    const releaseCallbacks = vi.fn(() => {
      throw new Error('/private/callback-release')
    })

    await target.close(releaseCallbacks)
    await target.close(releaseCallbacks)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(releaseCallbacks).toHaveBeenCalledTimes(2)
    expect(target.size).toBe(0)
  })

  it('shares the teardown barrier across concurrent close calls', async () => {
    const disposal = deferred<void>()
    const dispose = vi.fn(() => disposal.promise)
    const target = registry({ createResourceId: () => 'resource-close-barrier' })
    await registerCommitted(target, 'disposer', dispose)

    const firstClose = target.close()
    const secondClose = target.close()
    let secondSettled = false
    void secondClose.then(() => {
      secondSettled = true
    })
    await Promise.resolve()

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(secondSettled).toBe(false)
    disposal.resolve()
    await Promise.all([firstClose, secondClose])
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('registers a reentrant close before invoking the native disposer', async () => {
    const disposal = deferred<void>()
    let reentrantClose: Promise<void> | undefined
    const target = registry({ createResourceId: () => 'resource-reentrant-close' })
    await registerCommitted(target, 'disposer', () => {
      reentrantClose = target.close()
      return disposal.promise
    })

    const disposing = target.dispose('resource-reentrant-close', 'disposer')
    await vi.waitFor(() => expect(reentrantClose).toBeDefined())
    let closeSettled = false
    void reentrantClose!.then(() => {
      closeSettled = true
    })
    await Promise.resolve()

    expect(closeSettled).toBe(false)
    disposal.resolve()
    await Promise.all([disposing, reentrantClose!])
  })

  it('does not let commit outlive close or install a watcher on a disposed record', async () => {
    const extraDisposal = deferred<void>()
    const watchPermissionRevoked = vi.fn(() => vi.fn())
    let sequence = 0
    const target = registry({
      createResourceId: () => `resource-commit-close-${++sequence}`,
      watchPermissionRevoked
    })
    const invocation = begin(target)
    const retained = invocation.resources.register('subscription', vi.fn())
    invocation.resources.register('disposer', () => extraDisposal.promise)

    const committing = invocation.commit(retained)
    await vi.waitFor(() => expect(target.size).toBe(0))
    const closing = target.close()
    let closeSettled = false
    void closing.then(() => {
      closeSettled = true
    })
    await Promise.resolve()

    expect(closeSettled).toBe(false)
    extraDisposal.resolve()
    await expect(committing).rejects.toEqual(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_CLOSED')
    )
    await closing
    expect(watchPermissionRevoked).not.toHaveBeenCalled()
    expect(target.inspect(retained)).toBeNull()
  })

  it('rolls back a resource when permission watcher registration closes the registry', async () => {
    const permissionDisposer = vi.fn()
    const nativeDispose = vi.fn()
    let reentrantClose: Promise<void> | undefined
    let target!: PluginHostResourceRegistry
    target = registry({
      createResourceId: () => 'resource-watcher-reentrant-close',
      watchPermissionRevoked: vi.fn(() => {
        reentrantClose = target.close()
        return permissionDisposer
      })
    })
    const invocation = begin(target)
    const retained = invocation.resources.register('subscription', nativeDispose)

    await expect(invocation.commit(retained)).rejects.toEqual(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_CLOSED')
    )
    await reentrantClose
    expect(permissionDisposer).toHaveBeenCalledTimes(1)
    expect(nativeDispose).toHaveBeenCalledTimes(1)
    expect(target.inspect(retained)).toBeNull()
  })
})

describe('PluginHostChildResourceClient', () => {
  it('snapshots hostile options without evaluating accessors', () => {
    const getter = vi.fn(() => owner)
    const options = {
      owner,
      session: activeChildSession(),
      allocateRequestId: () => 10,
      postMessage: vi.fn(),
      onFatalViolation: vi.fn()
    }
    Object.defineProperty(options, 'owner', { enumerable: true, get: getter })

    expect(() => new PluginHostChildResourceClient(options as never)).toThrow(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_INVALID_OPTIONS')
    )
    expect(getter).not.toHaveBeenCalled()
  })

  it('creates exact owner-local tokens and sends one idempotent dispose', async () => {
    const sent: HostWireMessage[] = []
    const disposed = vi.fn()
    let requestId = 10
    let client!: PluginHostChildResourceClient
    const session = activeChildSession({
      resolveResource: (_owner, id, kind) => client.resolve(id, kind)
    })
    client = new PluginHostChildResourceClient({
      owner,
      session,
      allocateRequestId: () => ++requestId,
      postMessage: (message) => sent.push(message),
      onFatalViolation: vi.fn(),
      onDisposed: disposed,
      maxResources: 64,
      maxSubscriptions: 32,
      maxStreams: 8,
      maxDisposers: 32,
      maxProcesses: 2
    } as never)

    const token = client.resolve('resource-child-1', 'disposer')
    expect(client.inspect(token)).toEqual({ id: 'resource-child-1', kind: 'disposer' })
    await client.dispose('resource-child-1', 'disposer')
    await expect(client.dispose('resource-child-1', 'disposer')).resolves.toBeUndefined()
    expect(client.inspect(token)).toBeNull()
    expect(sent).toEqual([
      {
        ...owner,
        type: 'resource-dispose',
        requestId: 11,
        resourceId: 'resource-child-1',
        resourceKind: 'disposer'
      }
    ])
    expect(disposed).toHaveBeenCalledTimes(1)
  })

  it('accepts host-origin release without echo and keeps it idempotent', () => {
    const postMessage = vi.fn()
    const disposed = vi.fn()
    const client = new PluginHostChildResourceClient({
      owner,
      session: activeChildSession(),
      allocateRequestId: () => 20,
      postMessage,
      onFatalViolation: vi.fn(),
      onDisposed: disposed
    })
    const token = client.resolve('resource-host-release', 'stream')

    client.releaseFromHost('resource-host-release', 'stream')
    client.releaseFromHost('resource-host-release', 'stream')
    expect(client.inspect(token)).toBeNull()
    expect(postMessage).not.toHaveBeenCalled()
    expect(disposed).toHaveBeenCalledTimes(1)
  })

  it('fails closed for duplicate, wrong-kind, forged, and cross-owner identifiers', () => {
    const onFatalViolation = vi.fn()
    const session = activeChildSession()
    const client = new PluginHostChildResourceClient({
      owner,
      session,
      allocateRequestId: () => 20,
      postMessage: vi.fn(),
      onFatalViolation
    })
    client.resolve('resource-child-2', 'stream')
    expect(() => client.resolve('resource-child-2', 'stream')).toThrow(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_DUPLICATE')
    )
    expect(() => client.releaseFromHost('resource-child-2', 'process')).toThrow(
      new PluginHostResourceError('PLUGIN_HOST_RESOURCE_KIND_MISMATCH')
    )
    expect(onFatalViolation).toHaveBeenCalledWith('PLUGIN_HOST_VIOLATION_PROTOCOL')
  })
})
