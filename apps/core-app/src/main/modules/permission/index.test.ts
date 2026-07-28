import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PermissionEvents } from '@talex-touch/utils/transport/main'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn()
  },
  MessageChannelMain: class MessageChannelMain {}
}))

import { PermissionRevokedEvent, TalexEvents, touchEventBus } from '../../core/eventbus/touch-event'
import { registerPluginStorageTeardown } from '../plugin/runtime/plugin-storage-lifecycle'
import { PermissionModule } from './index'

type PermissionHandler = (payload: Record<string, unknown>) => Promise<unknown>

interface PermissionModuleHarness {
  store: {
    revoke: (pluginId: string, permissionId: string) => Promise<string[]>
    revokeAll: (pluginId: string) => Promise<string[]>
    getBackendStatus: () => { mode: 'sqlite'; writable: true }
  }
  transport: {
    on: (event: object, handler: PermissionHandler) => () => void
    broadcast: (event: object, payload: unknown) => void
  }
  registerChannels: () => void
}

function createHarness(options?: {
  revoke?: PermissionModuleHarness['store']['revoke']
  revokeAll?: PermissionModuleHarness['store']['revokeAll']
  onBroadcast?: (event: object, payload: unknown) => void
}) {
  const handlers = new Map<object, PermissionHandler>()
  const store: PermissionModuleHarness['store'] = {
    revoke: options?.revoke ?? vi.fn(async (_pluginId, permissionId) => [permissionId]),
    revokeAll: options?.revokeAll ?? vi.fn(async () => []),
    getBackendStatus: () => ({ mode: 'sqlite', writable: true })
  }
  const transport: PermissionModuleHarness['transport'] = {
    on: vi.fn((event, handler) => {
      handlers.set(event, handler)
      return () => handlers.delete(event)
    }),
    broadcast: vi.fn((event, payload) => options?.onBroadcast?.(event, payload))
  }
  const module = new PermissionModule() as unknown as PermissionModuleHarness
  module.store = store
  module.transport = transport
  module.registerChannels()

  return { handlers, store, transport }
}

describe('PermissionModule revocation events', () => {
  let disposeTeardown: (() => void) | undefined

  beforeEach(() => {
    touchEventBus.offAll(TalexEvents.PERMISSION_REVOKED)
  })

  afterEach(() => {
    disposeTeardown?.()
    disposeTeardown = undefined
  })

  it('awaits SQLite teardown before publishing committed revocation', async () => {
    let release: (() => void) | undefined
    const teardown = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    disposeTeardown = registerPluginStorageTeardown(teardown)
    const onRevoked = vi.fn()
    touchEventBus.on(TalexEvents.PERMISSION_REVOKED, onRevoked)
    const { handlers, transport } = createHarness()

    const revoking = handlers.get(PermissionEvents.api.revoke)?.({
      pluginId: 'touch-demo',
      permissionId: 'storage.sqlite'
    })
    await vi.waitFor(() => expect(teardown).toHaveBeenCalledWith('touch-demo'))
    expect(onRevoked).not.toHaveBeenCalled()
    expect(transport.broadcast).not.toHaveBeenCalled()

    release?.()
    await expect(revoking).resolves.toMatchObject({ success: true })
    expect(onRevoked).toHaveBeenCalledOnce()
    expect(transport.broadcast).toHaveBeenCalledOnce()
  })

  it('emits committed revocation before broadcasting the renderer update', async () => {
    const order: string[] = []
    let denied = false
    const { handlers, transport } = createHarness({
      revoke: vi.fn(async () => {
        denied = true
        return ['fs.read']
      }),
      onBroadcast: (event) => {
        if (event === PermissionEvents.push.updated) order.push('broadcast')
      }
    })
    const onRevoked = vi.fn((event: unknown) => {
      expect(event).toBeInstanceOf(PermissionRevokedEvent)
      if (!(event instanceof PermissionRevokedEvent)) {
        throw new Error('Expected PermissionRevokedEvent')
      }
      expect(denied).toBe(true)
      expect(event).toMatchObject({
        pluginId: 'touch-demo',
        permissionIds: ['fs.read'],
        all: false
      })
      order.push('event')
    })
    touchEventBus.on(TalexEvents.PERMISSION_REVOKED, onRevoked)

    const result = await handlers.get(PermissionEvents.api.revoke)?.({
      pluginId: 'touch-demo',
      permissionId: 'fs.read'
    })

    expect(result).toEqual({
      success: true,
      backendState: { mode: 'sqlite', writable: true }
    })
    expect(onRevoked).toHaveBeenCalledTimes(1)
    expect(transport.broadcast).toHaveBeenCalledWith(PermissionEvents.push.updated, {
      pluginId: 'touch-demo'
    })
    expect(order).toEqual(['event', 'broadcast'])
  })

  it('emits revoke-all with the committed permission set', async () => {
    const { handlers, transport } = createHarness({
      revokeAll: vi.fn(async () => ['clipboard.read', 'fs.read'])
    })
    const onRevoked = vi.fn((event: unknown) => {
      expect(event).toBeInstanceOf(PermissionRevokedEvent)
      if (!(event instanceof PermissionRevokedEvent)) {
        throw new Error('Expected PermissionRevokedEvent')
      }
      expect(event).toMatchObject({
        pluginId: 'touch-demo',
        permissionIds: ['clipboard.read', 'fs.read'],
        all: true
      })
      expect(Object.isFrozen(event.permissionIds)).toBe(true)
    })
    touchEventBus.on(TalexEvents.PERMISSION_REVOKED, onRevoked)

    const result = await handlers.get(PermissionEvents.api.revokeAll)?.({
      pluginId: 'touch-demo'
    })

    expect(result).toEqual({
      success: true,
      backendState: { mode: 'sqlite', writable: true }
    })
    expect(onRevoked).toHaveBeenCalledTimes(1)
    expect(transport.broadcast).toHaveBeenCalledWith(PermissionEvents.push.updated, {
      pluginId: 'touch-demo'
    })
  })

  it('keeps the renderer refresh compatible without emitting a no-op revocation event', async () => {
    const onRevoked = vi.fn()
    touchEventBus.on(TalexEvents.PERMISSION_REVOKED, onRevoked)
    const { handlers, transport } = createHarness({
      revoke: vi.fn(async () => [])
    })

    const result = await handlers.get(PermissionEvents.api.revoke)?.({
      pluginId: 'touch-demo',
      permissionId: 'fs.read'
    })

    expect(result).toEqual({
      success: true,
      backendState: { mode: 'sqlite', writable: true }
    })
    expect(onRevoked).not.toHaveBeenCalled()
    expect(transport.broadcast).toHaveBeenCalledWith(PermissionEvents.push.updated, {
      pluginId: 'touch-demo'
    })
  })

  it('does not emit or broadcast when the store rejects revocation', async () => {
    const onRevoked = vi.fn()
    touchEventBus.on(TalexEvents.PERMISSION_REVOKED, onRevoked)
    const { handlers, transport } = createHarness({
      revoke: vi.fn(async () => {
        throw new Error('permission backend unavailable')
      })
    })

    const result = await handlers.get(PermissionEvents.api.revoke)?.({
      pluginId: 'touch-demo',
      permissionId: 'fs.read'
    })

    expect(result).toMatchObject({ success: false, error: 'permission backend unavailable' })
    expect(onRevoked).not.toHaveBeenCalled()
    expect(transport.broadcast).not.toHaveBeenCalled()
  })
})
