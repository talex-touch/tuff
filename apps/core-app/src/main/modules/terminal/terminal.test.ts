import type { HandlerContext, PluginActivationIdentity } from '@talex-touch/utils/transport/main'
import type { WebContents } from 'electron'
import type { IPty } from 'node-pty'
import type { Mock } from 'vitest'
import { EventEmitter } from 'node:events'
import { TerminalEvents } from '@talex-touch/utils/transport/events/terminal'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalModule } from './index'
import { PtySessionCore } from './pty-session-core'

const boundary = vi.hoisted(() => ({
  handlers: new Map<unknown, (payload: unknown, context: HandlerContext) => unknown>(),
  allowed: true,
  permissionAvailable: true,
  activations: new Map<string, PluginActivationIdentity>(),
  invalidations: new Set<(identity: PluginActivationIdentity) => void>(),
  notifyTo: vi.fn(() => true)
}))
vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: () => ({
    on: (event: unknown, handler: (payload: unknown, context: HandlerContext) => unknown) => {
      boundary.handlers.set(event, handler)
      return () => boundary.handlers.delete(event)
    },
    notifyTo: boundary.notifyTo,
    keyManager: {
      resolveIdentity: (key: string) => boundary.activations.get(key),
      resolveCurrentIdentity: (name: string) =>
        [...boundary.activations.values()].find((identity) => identity.name === name),
      watchIdentityInvalidated: (listener: (identity: PluginActivationIdentity) => void) => {
        boundary.invalidations.add(listener)
        return () => boundary.invalidations.delete(listener)
      }
    }
  })
}))
vi.mock('../permission/permission-module-ref', () => ({
  getPermissionModule: () =>
    boundary.permissionAvailable
      ? {
          checkPermission: (_plugin: string, permission: string) => ({
            allowed: boundary.allowed && permission === 'system.shell',
            reason: 'Shell denied',
            code: 'PERMISSION_DENIED'
          })
        }
      : null
}))
vi.mock('../plugin/plugin-module', () => ({
  pluginModule: { pluginManager: { getPluginByName: () => ({ sdkapi: 260228 }) } }
}))
vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: (sender: { id: number }) => ({ id: sender.id, isDestroyed: () => false })
  }
}))
vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: () => ({ app: { channel: { keyManager: {} } } })
}))
vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: () => undefined,
    debug: () => undefined,
    warn: () => undefined,
    error: () => undefined
  })
}))

function caller(id = 7, plugin?: HandlerContext['plugin']): HandlerContext {
  const sender = new EventEmitter() as EventEmitter & { id: number; isDestroyed: () => boolean }
  sender.id = id
  sender.isDestroyed = () => false
  if (plugin?.identity) {
    boundary.activations.set(plugin.uniqueKey, {
      name: plugin.name,
      key: plugin.uniqueKey,
      pluginInstanceId: plugin.identity.pluginInstanceId,
      activationGeneration: plugin.identity.activationGeneration
    })
  }
  return { sender: sender as unknown as WebContents, eventName: 'test', plugin } as HandlerContext
}
async function invoke(event: unknown, payload: unknown, context: HandlerContext): Promise<unknown> {
  const handler = boundary.handlers.get(event)
  if (!handler) throw new Error('Terminal handler missing')
  return await handler(payload, context)
}
let module: TerminalModule
let spawn: Mock<() => IPty>
let writes: string[]
let resolveExecutable: Mock<(command: string, cwd: string) => Promise<string>>
let resizes: Array<[number, number]>
let kills: number
let emitOutput: (data: string) => void
beforeEach(() => {
  boundary.handlers.clear()
  boundary.allowed = true
  boundary.permissionAvailable = true
  boundary.notifyTo.mockClear()
  boundary.activations.clear()
  boundary.invalidations.clear()
  writes = []
  resizes = []
  kills = 0
  spawn = vi.fn(() => {
    let exit: ((value: { exitCode: number; signal?: number }) => void) | undefined
    return {
      write: (data: string) => writes.push(data),
      resize: (cols: number, rows: number) => resizes.push([cols, rows]),
      kill: () => {
        kills += 1
        exit?.({ exitCode: 0, signal: 9 })
      },
      onData: (listener: (data: string) => void) => {
        emitOutput = listener
        return { dispose: () => undefined }
      },
      onExit: (listener: (value: { exitCode: number; signal?: number }) => void) => {
        exit = listener
        return {
          dispose: () => {
            exit = undefined
          }
        }
      }
    } as unknown as IPty
  })
  resolveExecutable = vi.fn(async () => '/test/node')
  module = new TerminalModule(
    new PtySessionCore({ loadPty: async () => ({ spawn }), resolveExecutable })
  )
  module.onInit({} as never)
})
afterEach(async () => {
  await module.onDestroy()
})

describe('terminal privileged transport', () => {
  it.each(['denied', 'unavailable'] as const)(
    'rejects %s shell permission on create and all controls without touching the PTY',
    async (mode) => {
      const owner = caller(7, createTrustedTestPluginContext({ name: 'owner' }))
      const { id } = (await invoke(TerminalEvents.session.create, { command: 'node' }, owner)) as {
        id: string
      }
      if (mode === 'denied') boundary.allowed = false
      else boundary.permissionAvailable = false
      for (const [event, payload] of [
        [TerminalEvents.session.create, { command: 'node' }],
        [TerminalEvents.session.write, { id, data: 'attack' }],
        [TerminalEvents.session.resize, { id, cols: 120, rows: 40 }],
        [TerminalEvents.session.close, { id }]
      ] as const) {
        await expect(invoke(event, payload, owner)).rejects.toMatchObject({
          code: mode === 'denied' ? 'PERMISSION_DENIED' : 'PERMISSION_UNAVAILABLE'
        })
      }
      expect(spawn).toHaveBeenCalledTimes(1)
      expect(writes).toEqual([])
      expect(resizes).toEqual([])
      expect(kills).toBe(0)
    }
  )

  it('rejects untrusted plugin identity and missing sender before spawning, ignoring payload claims', async () => {
    const forged = caller(7, { name: 'owner', uniqueKey: 'forged' } as HandlerContext['plugin'])
    for (const context of [forged, { eventName: 'test' } as HandlerContext]) {
      await expect(
        invoke(
          TerminalEvents.session.create,
          {
            command: 'node',
            plugin: 'owner',
            owner: 7,
            key: 'forged'
          },
          context
        )
      ).rejects.toThrow('TERMINAL_CALLER_INVALID')
    }
    expect(spawn).not.toHaveBeenCalled()
  })

  it('isolates plugins sharing a sender and windows sharing a numeric id', async () => {
    const owner = caller(7, createTrustedTestPluginContext({ name: 'owner' }))
    const { id } = (await invoke(TerminalEvents.session.create, { command: 'node' }, owner)) as {
      id: string
    }
    const foreignPlugin = {
      ...caller(7, createTrustedTestPluginContext({ name: 'other' })),
      sender: owner.sender
    }
    const foreignWindow = caller(7)
    for (const context of [foreignPlugin, foreignWindow]) {
      for (const target of [id, 'unknown']) {
        for (const [event, payload] of [
          [TerminalEvents.session.write, { id: target, data: 'attack' }],
          [TerminalEvents.session.resize, { id: target, cols: 120, rows: 40 }],
          [TerminalEvents.session.close, { id: target }]
        ] as const) {
          await expect(invoke(event, payload, context)).rejects.toThrow(
            'TERMINAL_SESSION_NOT_FOUND'
          )
        }
      }
    }
    await invoke(TerminalEvents.session.write, { id, data: 'owner\u0003' }, owner)
    expect(writes).toEqual(['owner\u0003'])
    expect(resizes).toEqual([])
    expect(kills).toBe(0)
  })
})

describe('terminal owner delivery', () => {
  it.each(['window', 'plugin'] as const)(
    'routes process output only to the creating %s',
    async (kind) => {
      const owner = caller(
        81,
        kind === 'plugin' ? createTrustedTestPluginContext({ name: 'consumer' }) : undefined
      )
      const { id } = (await invoke(TerminalEvents.session.create, { command: 'node' }, owner)) as {
        id: string
      }
      emitOutput('private output')
      expect(boundary.notifyTo.mock.calls).toEqual([
        [owner.sender, TerminalEvents.session.data, { id, data: 'private output' }, owner.plugin]
      ])
    }
  )
})

describe('terminal plugin activation lifetime', () => {
  it('closes only revoked plugin sessions and does not release them twice', async () => {
    const first = caller(7, createTrustedTestPluginContext({ name: 'first' }))
    const second = caller(8, createTrustedTestPluginContext({ name: 'second' }))
    await invoke(TerminalEvents.session.create, { command: 'node' }, first)
    const active = (await invoke(TerminalEvents.session.create, { command: 'node' }, second)) as {
      id: string
    }
    const revoked = boundary.activations.get(first.plugin!.uniqueKey)!
    boundary.activations.delete(revoked.key)
    boundary.invalidations.forEach((listener) => listener(revoked))
    boundary.invalidations.forEach((listener) => listener(revoked))
    expect(kills).toBe(1)
    await invoke(TerminalEvents.session.write, { id: active.id, data: 'still active' }, second)
    expect(writes).toEqual(['still active'])
  })

  it('revalidates an activation after executable lookup and refuses to spawn a revoked owner', async () => {
    let entered!: () => void
    const lookupStarted = new Promise<void>((resolve) => {
      entered = resolve
    })
    let complete!: (path: string) => void
    resolveExecutable.mockImplementationOnce(() => {
      entered()
      return new Promise<string>((resolve) => {
        complete = resolve
      })
    })
    const owner = caller(7, createTrustedTestPluginContext({ name: 'owner' }))
    const creating = invoke(TerminalEvents.session.create, { command: 'node' }, owner)
    const rejection = expect(creating).rejects.toThrow('TERMINAL_CALLER_INVALID')
    await lookupStarted
    boundary.activations.delete(owner.plugin!.uniqueKey)
    complete('/test/node')
    await rejection
    expect(spawn).not.toHaveBeenCalled()
    expect((owner.sender as unknown as EventEmitter).listenerCount('destroyed')).toBe(0)
    expect((owner.sender as unknown as EventEmitter).listenerCount('did-start-navigation')).toBe(0)
  })
})

describe('terminal creation token controls', () => {
  it('reclaims a session whose create ID was never consumed and rejects another sender guessing its token', async () => {
    const owner = caller(7)
    const foreign = caller(7)
    const creationToken = 'unacknowledged-terminal'
    await invoke(TerminalEvents.session.create, { command: 'node', creationToken }, owner)
    for (const token of [creationToken, 'unknown-token']) {
      await expect(
        invoke(TerminalEvents.session.close, { creationToken: token }, foreign)
      ).rejects.toThrow('TERMINAL_SESSION_NOT_FOUND')
    }
    expect(kills).toBe(0)
    await invoke(TerminalEvents.session.close, { creationToken }, owner)
    expect(kills).toBe(1)
    await expect(invoke(TerminalEvents.session.close, { creationToken }, owner)).rejects.toThrow(
      'TERMINAL_SESSION_NOT_FOUND'
    )
    expect(kills).toBe(1)
  })
})
