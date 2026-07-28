import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { describe, expect, it, vi } from 'vitest'
import {
  PluginHostCallbackError,
  PluginHostCallbackRegistry,
  PluginHostChildCallbackRegistry
} from './plugin-host-callbacks'
import { decodeHostWireValue } from './plugin-host-wire-codec'
import { HOST_PROTOCOL_VERSION, type HostMessageOwner } from './plugin-host-wire'

const owner: HostMessageOwner = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'callback-owner',
  hostGeneration: 7
}

const activation: PluginActivationIdentity = {
  name: 'plugin.callbacks',
  pluginInstanceId: 'plugin-callbacks-instance',
  activationGeneration: 3,
  key: 'plugin-callbacks-key'
}

function mainRegistry(overrides: Record<string, unknown> = {}): PluginHostCallbackRegistry {
  return new PluginHostCallbackRegistry({
    owner,
    activation,
    resolveCurrentActivation: () => activation,
    isActive: () => true,
    maxCallbacks: 64,
    maxConcurrent: 16,
    invokeRemote: vi.fn(async () => null),
    ...overrides
  } as never)
}

function childRegistry(overrides: Record<string, unknown> = {}): PluginHostChildCallbackRegistry {
  return new PluginHostChildCallbackRegistry({
    owner,
    maxCallbacks: 64,
    maxConcurrent: 16,
    ...overrides
  } as never)
}

describe('PluginHostCallbackRegistry', () => {
  it('correlates concurrent proxy calls and releases transient callbacks', async () => {
    const gates = new Map<string, (value: unknown) => void>()
    const registry = mainRegistry({
      maxCallbacks: 4,
      maxConcurrent: 2,
      invokeRemote: (id: string, args: unknown[]) =>
        new Promise((resolve) => {
          gates.set(`${id}:${String(args[0])}`, resolve)
        })
    })
    const first = registry.resolve('callback-1', 10, owner)
    const second = registry.resolve('callback-2', 10, owner)

    const firstCall = first('first')
    const secondCall = second('second')
    gates.get('callback-2:second')?.('second-result')
    gates.get('callback-1:first')?.('first-result')

    await expect(firstCall).resolves.toBe('first-result')
    await expect(secondCall).resolves.toBe('second-result')
    registry.releaseRequest(10)
    await expect(first('late')).rejects.toEqual(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_DISPOSED')
    )
    expect(registry.size).toBe(0)
  })

  it('enforces duplicate/limit rules and keeps retained callbacks until resource disposal', async () => {
    const invokeRemote = vi.fn(async () => 'ok')
    const registry = mainRegistry({ maxCallbacks: 1, maxConcurrent: 1, invokeRemote })
    const retained = registry.resolve('callback-retained', 11, owner)
    expect(() => registry.resolve('callback-retained', 11, owner)).toThrow(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_DUPLICATE')
    )
    expect(registry.retainRequest(11, 'resource-1')).toEqual(['callback-retained'])
    registry.releaseRequest(11)
    await expect(retained()).resolves.toBe('ok')

    registry.releaseResource('resource-1')
    await expect(retained()).rejects.toEqual(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_DISPOSED')
    )
    expect(() => registry.resolve('callback-retained', 12, owner)).toThrow(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_DUPLICATE')
    )
  })

  it('rolls back only the callback created by the failed decode transaction', () => {
    const registry = mainRegistry({ maxCallbacks: 2, maxConcurrent: 1 })
    const proxy = registry.resolve('callback-rollback', 12, owner)
    registry.rollback('callback-rollback', proxy, 12)
    registry.rollback('callback-rollback', proxy, 12)
    expect(registry.size).toBe(0)
  })

  it('snapshots options, owner, and activation without evaluating accessors', () => {
    const getter = vi.fn(() => 64)
    const options = {
      owner,
      activation,
      resolveCurrentActivation: () => activation,
      isActive: () => true,
      maxCallbacks: 64,
      maxConcurrent: 16,
      invokeRemote: vi.fn(async () => null)
    }
    Object.defineProperty(options, 'maxCallbacks', { enumerable: true, get: getter })

    expect(() => new PluginHostCallbackRegistry(options as never)).toThrow(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_INVALID_OPTIONS')
    )
    expect(getter).not.toHaveBeenCalled()

    const childOptions = { owner, maxCallbacks: 64, maxConcurrent: 16 }
    Object.defineProperty(childOptions, 'owner', { enumerable: true, get: getter })
    expect(() => new PluginHostChildCallbackRegistry(childOptions as never)).toThrow(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_INVALID_OPTIONS')
    )
    expect(getter).not.toHaveBeenCalled()
  })

  it('binds callback handles to exact owner, activation generation, and request', async () => {
    let current: PluginActivationIdentity | undefined = activation
    const registry = mainRegistry({ resolveCurrentActivation: () => current })
    const proxy = registry.resolve('callback-bound', 40, owner)

    expect(registry.owner).toEqual(owner)
    expect(registry.activation).toEqual(activation)
    expect(Object.isFrozen(registry.owner)).toBe(true)
    expect(Object.isFrozen(registry.activation)).toBe(true)
    expect(() =>
      registry.resolve('callback-wrong-owner', 40, {
        ...owner,
        hostGeneration: owner.hostGeneration + 1
      })
    ).toThrow(new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_OWNER_MISMATCH'))

    registry.rollback('callback-bound', proxy, 41)
    expect(registry.size).toBe(1)
    current = { ...activation, activationGeneration: 4, key: 'rotated' }
    await expect(proxy()).rejects.toEqual(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_STALE_ACTIVATION')
    )
    expect(() => registry.resolve('callback-stale', 42, owner)).toThrow(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_STALE_ACTIVATION')
    )
  })

  it('roundtrips child registration through a main proxy and redacts callback throws', async () => {
    const child = childRegistry({ createCallbackId: () => 'callback-roundtrip' })
    const childCallback = vi.fn(async (value: unknown) => {
      if (value === 'throw') throw new Error('/private/callback/path')
      return `child:${String(value)}`
    })
    const id = child.register(childCallback, 50, owner)
    const main = mainRegistry({
      invokeRemote: (callbackId: string, args: unknown[]) => child.invoke(callbackId, args, owner)
    })
    const proxy = main.resolve(id, 50, owner)

    await expect(proxy('value')).resolves.toBe('child:value')
    await expect(proxy('throw')).rejects.toEqual(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_FAILED')
    )
    expect(JSON.stringify(await proxy('safe'))).not.toContain('/private')
  })

  it('enforces 64 live handles and 16 active invocations without queueing', async () => {
    const gates: Array<() => void> = []
    const registry = mainRegistry({
      invokeRemote: () =>
        new Promise<void>((resolve) => {
          gates.push(resolve)
        })
    })
    const callbacks = Array.from({ length: 64 }, (_value, index) =>
      registry.resolve(`callback-${index}`, 60, owner)
    )
    expect(() => registry.resolve('callback-65', 60, owner)).toThrow(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_LIMIT')
    )

    const active = callbacks.slice(0, 16).map((callback) => callback())
    await expect(callbacks[16]()).rejects.toEqual(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_CONCURRENCY_LIMIT')
    )
    for (const release of gates) release()
    await Promise.all(active)
  })

  it('rolls back every resolved callback when a later codec handle fails', () => {
    const registry = mainRegistry()
    expect(() =>
      decodeHostWireValue(
        [
          { __tuffHostWire: 'callback', id: 'callback-first' },
          { __tuffHostWire: 'callback', id: 'callback-unknown' }
        ],
        {
          resolveCallback: (id) =>
            id === 'callback-first' ? registry.resolve(id, 70, owner) : undefined,
          releaseCallback: (id, proxy) => registry.rollback(id, proxy, 70)
        }
      )
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_UNKNOWN_HANDLE' }))
    expect(registry.size).toBe(0)
  })

  it('closes exactly once and permanently rejects retained or transient proxies', async () => {
    const registry = mainRegistry()
    const transient = registry.resolve('callback-transient', 80, owner)
    const retained = registry.resolve('callback-resource', 81, owner)
    registry.retainRequest(81, 'resource-81')

    registry.close()
    registry.close()
    expect(registry.size).toBe(0)
    await expect(transient()).rejects.toEqual(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_CLOSED')
    )
    await expect(retained()).rejects.toEqual(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_CLOSED')
    )
  })
})

describe('PluginHostChildCallbackRegistry', () => {
  it('invokes the exact registered sync/async callback and redacts callback throws', async () => {
    let sequence = 0
    const registry = childRegistry({
      maxCallbacks: 3,
      maxConcurrent: 2,
      createCallbackId: () => `callback-${++sequence}`
    })
    const sync = vi.fn((value: unknown) => `sync:${String(value)}`)
    const asyncCallback = vi.fn(async (value: unknown) => `async:${String(value)}`)
    const throwing = vi.fn(() => {
      throw new Error('/private/callback-detail')
    })
    const syncId = registry.register(sync, 20, owner)
    const asyncId = registry.register(asyncCallback, 20, owner)
    const throwId = registry.register(throwing, 21, owner)

    await expect(registry.invoke(syncId, ['value'], owner)).resolves.toBe('sync:value')
    await expect(registry.invoke(asyncId, ['value'], owner)).resolves.toBe('async:value')
    await expect(registry.invoke(throwId, [], owner)).rejects.toEqual(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_FAILED')
    )
    expect(JSON.stringify(await registry.invoke(syncId, ['safe'], owner))).not.toContain('/private')
  })

  it('enforces limits and never re-enters after request/resource disposal or shutdown', async () => {
    let sequence = 0
    const callback = vi.fn()
    const registry = childRegistry({
      maxCallbacks: 1,
      maxConcurrent: 1,
      createCallbackId: () => `callback-${++sequence}`
    })
    const id = registry.register(callback, 30, owner)
    expect(() => registry.register(vi.fn(), 30, owner)).toThrow(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_LIMIT')
    )
    registry.retainRequest(30, 'resource-30')
    registry.releaseResource('resource-30')
    await expect(registry.invoke(id, [], owner)).rejects.toEqual(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_UNKNOWN')
    )
    expect(callback).not.toHaveBeenCalled()

    const next = registry.register(callback, 31, owner)
    registry.unregister(next, 31, owner)
    const reused = childRegistry({ createCallbackId: () => 'callback-reused' })
    const reusedId = reused.register(callback, 32, owner)
    reused.unregister(reusedId, 32, owner)
    expect(() => reused.register(callback, 33, owner)).toThrow(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_DUPLICATE')
    )
    registry.close()
    await expect(registry.invoke(next, [], owner)).rejects.toEqual(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_CLOSED')
    )
    expect(callback).not.toHaveBeenCalled()
  })

  it('rejects duplicate ids, unknown ids, and wrong-owner invocations with stable codes', async () => {
    const duplicate = childRegistry({ createCallbackId: () => 'callback-duplicate' })
    duplicate.register(vi.fn(), 90, owner)
    expect(() => duplicate.register(vi.fn(), 91, owner)).toThrow(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_DUPLICATE')
    )
    await expect(duplicate.invoke('callback-unknown', [], owner)).rejects.toEqual(
      new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_UNKNOWN')
    )
    await expect(
      duplicate.invoke('callback-duplicate', [], {
        ...owner,
        activationHandle: 'cross-owner'
      })
    ).rejects.toEqual(new PluginHostCallbackError('PLUGIN_HOST_CALLBACK_OWNER_MISMATCH'))
  })
})
