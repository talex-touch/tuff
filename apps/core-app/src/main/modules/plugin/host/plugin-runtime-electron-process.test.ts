import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => {
  class MockPort {
    started = false
    closed = false
    readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>()
    readonly posted: Array<{ message: unknown; transfer?: unknown[] }> = []

    on(event: string, listener: (...args: unknown[]) => void) {
      const listeners = this.listeners.get(event) ?? new Set()
      listeners.add(listener)
      this.listeners.set(event, listeners)
      return this
    }

    off(event: string, listener: (...args: unknown[]) => void) {
      this.listeners.get(event)?.delete(listener)
      return this
    }

    emit(event: string, ...args: unknown[]) {
      for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args)
    }

    postMessage(message: unknown, transfer?: unknown[]) {
      this.posted.push({ message, transfer })
    }

    start() {
      this.started = true
    }

    close() {
      this.closed = true
    }
  }

  class MockUtilityProcess {
    pid: number | undefined
    killCalls = 0
    readonly posted: Array<{ message: unknown; transfer?: unknown[] }> = []
    readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>()

    on(event: string, listener: (...args: unknown[]) => void) {
      const listeners = this.listeners.get(event) ?? new Set()
      listeners.add(listener)
      this.listeners.set(event, listeners)
      return this
    }

    off(event: string, listener: (...args: unknown[]) => void) {
      this.listeners.get(event)?.delete(listener)
      return this
    }

    emit(event: string, ...args: unknown[]) {
      for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args)
    }

    postMessage(message: unknown, transfer?: unknown[]) {
      this.posted.push({ message, transfer })
    }

    kill() {
      this.killCalls += 1
      return true
    }
  }

  const channels: Array<{ port1: MockPort; port2: MockPort }> = []
  const MessageChannelMain = vi.fn(function MessageChannelMain() {
    const channel = { port1: new MockPort(), port2: new MockPort() }
    channels.push(channel)
    return channel
  })
  const fork = vi.fn()
  return { MockPort, MockUtilityProcess, MessageChannelMain, channels, fork }
})

vi.mock('electron', () => ({
  MessageChannelMain: electron.MessageChannelMain,
  utilityProcess: { fork: electron.fork }
}))

import { PLUGIN_HOST_CONTROL_PORT_HANDOFF } from './plugin-host-bootstrap'
import {
  createElectronPluginRuntimeForkOptions,
  ElectronPluginRuntimeProcessFactory,
  PLUGIN_RUNTIME_SERVICE_NAME
} from './plugin-runtime-electron-process'
import { DEFAULT_PLUGIN_RUNTIME_HOST_LIMITS } from './plugin-runtime-host'

const temporaryRoots: string[] = []

afterEach(() => {
  vi.clearAllMocks()
  electron.channels.length = 0
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('ElectronPluginRuntimeProcessFactory', () => {
  it('requires the host artifact to be a regular file', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tuff-plugin-host-factory-'))
    temporaryRoots.push(root)
    const file = path.join(root, 'plugin-host.js')
    const directory = path.join(root, 'directory')
    writeFileSync(file, 'module.exports = {}')
    mkdirSync(directory)
    const factory = new ElectronPluginRuntimeProcessFactory()

    expect(factory.artifactExists(file)).toBe(true)
    expect(factory.artifactExists(directory)).toBe(false)
    expect(factory.artifactExists(path.join(root, 'missing.js'))).toBe(false)
  })

  it('rejects a symlink even when it targets a regular host artifact', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tuff-plugin-host-factory-'))
    temporaryRoots.push(root)
    const file = path.join(root, 'plugin-host.js')
    const symlink = path.join(root, 'plugin-host-link.js')
    writeFileSync(file, 'module.exports = {}')
    symlinkSync(file, symlink)

    expect(new ElectronPluginRuntimeProcessFactory().artifactExists(symlink)).toBe(false)
  })

  it('maps bounded heap, fixed service name, empty env, and ignored stdio', () => {
    const options = createElectronPluginRuntimeForkOptions({
      ...DEFAULT_PLUGIN_RUNTIME_HOST_LIMITS,
      maxOldSpaceMb: 96
    })

    expect(options).toEqual({
      env: {},
      execArgv: ['--max-old-space-size=96'],
      serviceName: PLUGIN_RUNTIME_SERVICE_NAME,
      stdio: ['ignore', 'ignore', 'ignore']
    })
    expect(Object.isFrozen(options)).toBe(true)
    expect(Object.isFrozen(options.env)).toBe(true)
    expect(Object.isFrozen(options.execArgv)).toBe(true)
    expect(Object.isFrozen(options.stdio)).toBe(true)
  })

  it('waits for spawn, transfers exactly one port, and keeps kill separate from exit', async () => {
    const rawChild = new electron.MockUtilityProcess()
    electron.fork.mockReturnValue(rawChild)
    const factory = new ElectronPluginRuntimeProcessFactory()
    const spawned = factory.spawn({
      artifactPath: '/built/plugin-host.js',
      resourceLimits: DEFAULT_PLUGIN_RUNTIME_HOST_LIMITS
    })
    const channel = electron.channels[0]

    expect(electron.fork).toHaveBeenCalledWith('/built/plugin-host.js', [], {
      env: {},
      execArgv: ['--max-old-space-size=128'],
      serviceName: PLUGIN_RUNTIME_SERVICE_NAME,
      stdio: ['ignore', 'ignore', 'ignore']
    })

    let transferred = false
    const transfer = Promise.resolve(spawned.child.transferControlPort(spawned.childPort)).then(
      () => {
        transferred = true
      }
    )
    await Promise.resolve()
    expect(transferred).toBe(false)
    expect(rawChild.posted).toEqual([])

    rawChild.pid = 4321
    rawChild.emit('spawn')
    await transfer
    expect(spawned.child.processId).toBe(4321)
    expect(rawChild.posted).toEqual([
      { message: PLUGIN_HOST_CONTROL_PORT_HANDOFF, transfer: [channel.port2] }
    ])

    const onExit = vi.fn()
    spawned.child.onExit(onExit)
    await spawned.child.forceKill()
    expect(rawChild.killCalls).toBe(1)
    expect(onExit).not.toHaveBeenCalled()

    rawChild.pid = undefined
    rawChild.emit('exit', 0)
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(spawned.child.processId).toBeUndefined()
  })

  it('closes an untransferred child port when postMessage fails', async () => {
    const rawChild = new electron.MockUtilityProcess()
    rawChild.pid = 123
    rawChild.postMessage = vi.fn(() => {
      throw new Error('transfer failed')
    })
    electron.fork.mockReturnValue(rawChild)
    const spawned = new ElectronPluginRuntimeProcessFactory().spawn({
      artifactPath: '/built/plugin-host.js',
      resourceLimits: DEFAULT_PLUGIN_RUNTIME_HOST_LIMITS
    })
    const channel = electron.channels[0]

    await expect(spawned.child.transferControlPort(spawned.childPort)).rejects.toThrow(
      'PLUGIN_RUNTIME_CONTROL_PORT_TRANSFER_FAILED'
    )
    expect(channel.port2.closed).toBe(true)
  })

  it('owns removable MessagePort and child exit listeners', () => {
    const rawChild = new electron.MockUtilityProcess()
    rawChild.pid = 123
    electron.fork.mockReturnValue(rawChild)
    const spawned = new ElectronPluginRuntimeProcessFactory().spawn({
      artifactPath: '/built/plugin-host.js',
      resourceLimits: DEFAULT_PLUGIN_RUNTIME_HOST_LIMITS
    })
    const channel = electron.channels[0]
    const onMessage = vi.fn()
    const disposeMessage = spawned.controlPort.onMessage(onMessage)

    channel.port1.emit('message', { data: { type: 'test' } })
    expect(onMessage).toHaveBeenCalledWith({ type: 'test' })
    disposeMessage()
    channel.port1.emit('message', { data: { type: 'late' } })
    expect(onMessage).toHaveBeenCalledTimes(1)

    const onExit = vi.fn()
    const disposeExit = spawned.child.onExit(onExit)
    disposeExit()
    rawChild.emit('exit', 0)
    expect(onExit).not.toHaveBeenCalled()

    spawned.controlPort.close()
    expect(channel.port1.closed).toBe(true)
    expect(channel.port1.listeners.get('message')?.size ?? 0).toBe(0)
  })

  it('removes every native wrapper when the same MessagePort listener is registered twice', () => {
    const rawChild = new electron.MockUtilityProcess()
    rawChild.pid = 123
    electron.fork.mockReturnValue(rawChild)
    const spawned = new ElectronPluginRuntimeProcessFactory().spawn({
      artifactPath: '/built/plugin-host.js',
      resourceLimits: DEFAULT_PLUGIN_RUNTIME_HOST_LIMITS
    })
    const channel = electron.channels[0]
    const onMessage = vi.fn()

    spawned.controlPort.onMessage(onMessage)
    spawned.controlPort.onMessage(onMessage)
    spawned.controlPort.close()
    channel.port1.emit('message', { data: { type: 'late' } })

    expect(onMessage).not.toHaveBeenCalled()
    expect(channel.port1.listeners.get('message')?.size ?? 0).toBe(0)
  })

  it('kills the forked child and closes both ports when adapter construction fails', () => {
    const rawChild = new electron.MockUtilityProcess()
    rawChild.pid = 123
    rawChild.on = vi.fn(() => {
      throw new Error('listener acquisition failed')
    })
    electron.fork.mockReturnValue(rawChild)

    expect(() =>
      new ElectronPluginRuntimeProcessFactory().spawn({
        artifactPath: '/built/plugin-host.js',
        resourceLimits: DEFAULT_PLUGIN_RUNTIME_HOST_LIMITS
      })
    ).toThrow()

    expect(rawChild.killCalls).toBe(1)
    expect(electron.channels[0].port1.closed).toBe(true)
    expect(electron.channels[0].port2.closed).toBe(true)
  })

  it('closes both ports when Electron fork fails', () => {
    electron.fork.mockImplementation(() => {
      throw new Error('native fork failure')
    })
    const factory = new ElectronPluginRuntimeProcessFactory()

    expect(() =>
      factory.spawn({
        artifactPath: '/built/plugin-host.js',
        resourceLimits: DEFAULT_PLUGIN_RUNTIME_HOST_LIMITS
      })
    ).toThrow()
    expect(electron.channels[0].port1.closed).toBe(true)
    expect(electron.channels[0].port2.closed).toBe(true)
  })
})
