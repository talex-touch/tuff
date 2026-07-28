import { lstatSync } from 'node:fs'
import {
  MessageChannelMain,
  utilityProcess,
  type ForkOptions,
  type MessagePortMain,
  type UtilityProcess
} from 'electron'
import { PLUGIN_HOST_CONTROL_PORT_HANDOFF } from './plugin-host-bootstrap'
import type {
  PluginRuntimeChildAdapter,
  PluginRuntimeControlPortAdapter,
  PluginRuntimeHostResourceLimits,
  PluginRuntimeProcessFactory,
  PluginRuntimeSpawnResult
} from './plugin-runtime-host'

export const PLUGIN_RUNTIME_SERVICE_NAME = 'tuff-plugin-host' as const

export function createElectronPluginRuntimeForkOptions(
  limits: Readonly<PluginRuntimeHostResourceLimits>
): Readonly<ForkOptions> {
  const execArgv = [`--max-old-space-size=${limits.maxOldSpaceMb}`]
  const stdio: Array<'ignore' | 'pipe' | 'inherit'> = ['ignore', 'ignore', 'ignore']
  Object.freeze(execArgv)
  Object.freeze(stdio)
  return Object.freeze({
    env: Object.freeze({}),
    execArgv,
    serviceName: PLUGIN_RUNTIME_SERVICE_NAME,
    stdio
  })
}

class ElectronPluginRuntimeControlPort implements PluginRuntimeControlPortAdapter {
  private closed = false
  private readonly listeners = new Set<(event: Electron.MessageEvent) => void>()

  constructor(private readonly port: MessagePortMain) {}

  postMessage(message: unknown): void {
    if (this.closed) throw new Error('PLUGIN_RUNTIME_CONTROL_PORT_CLOSED')
    this.port.postMessage(message)
  }

  onMessage(listener: (message: unknown) => void): () => void {
    if (this.closed) throw new Error('PLUGIN_RUNTIME_CONTROL_PORT_CLOSED')
    const wrapped = (event: Electron.MessageEvent): void => listener(event.data)
    this.listeners.add(wrapped)
    this.port.on('message', wrapped)
    let listening = true
    return () => {
      if (!listening) return
      listening = false
      this.listeners.delete(wrapped)
      this.port.off('message', wrapped)
    }
  }

  start(): void {
    if (this.closed) throw new Error('PLUGIN_RUNTIME_CONTROL_PORT_CLOSED')
    this.port.start()
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const listener of this.listeners) this.port.off('message', listener)
    this.listeners.clear()
    this.port.close()
  }
}

class ElectronPluginRuntimeChild implements PluginRuntimeChildAdapter {
  private spawned: boolean
  private exited = false
  private transferred = false
  private readonly exitListeners = new Set<() => void>()
  private readonly spawnWaiters = new Set<{
    resolve(): void
    reject(): void
  }>()

  private readonly handleSpawn = (): void => {
    if (this.spawned || this.exited) return
    this.spawned = true
    this.child.off('spawn', this.handleSpawn)
    for (const waiter of this.spawnWaiters) waiter.resolve()
    this.spawnWaiters.clear()
  }

  private readonly handleExit = (): void => {
    if (this.exited) return
    this.exited = true
    this.child.off('spawn', this.handleSpawn)
    this.child.off('exit', this.handleExit)
    for (const waiter of this.spawnWaiters) waiter.reject()
    this.spawnWaiters.clear()
    for (const listener of [...this.exitListeners]) listener()
    this.exitListeners.clear()
  }

  constructor(private readonly child: UtilityProcess) {
    this.spawned = child.pid !== undefined
    try {
      child.on('exit', this.handleExit)
      if (!this.spawned) child.on('spawn', this.handleSpawn)
    } catch (error) {
      try {
        child.off('spawn', this.handleSpawn)
      } catch {
        // Factory rollback terminates a child whose listener acquisition failed.
      }
      try {
        child.off('exit', this.handleExit)
      } catch {
        // Factory rollback terminates a child whose listener acquisition failed.
      }
      throw error
    }
  }

  get processId(): number | undefined {
    return this.child.pid
  }

  async transferControlPort(port: unknown): Promise<void> {
    if (this.transferred || !port || typeof port !== 'object') {
      throw new Error('PLUGIN_RUNTIME_CONTROL_PORT_TRANSFER_FAILED')
    }
    const childPort = port as MessagePortMain
    try {
      if (this.exited) throw new Error()
      await this.waitForSpawn()
      if (this.exited) throw new Error()
      this.child.postMessage(PLUGIN_HOST_CONTROL_PORT_HANDOFF, [childPort])
      this.transferred = true
    } catch {
      try {
        childPort.close()
      } catch {
        // The failed transfer still owns no usable child-side port.
      }
      throw new Error('PLUGIN_RUNTIME_CONTROL_PORT_TRANSFER_FAILED')
    }
  }

  onExit(listener: () => void): () => void {
    if (this.exited) {
      queueMicrotask(listener)
      return () => undefined
    }
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  async forceKill(): Promise<void> {
    if (!this.exited) this.child.kill()
  }

  private waitForSpawn(): Promise<void> {
    if (this.spawned) return Promise.resolve()
    if (this.exited) return Promise.reject(new Error('PLUGIN_RUNTIME_CONTROL_PORT_TRANSFER_FAILED'))
    return new Promise<void>((resolve, reject) => {
      this.spawnWaiters.add({
        resolve,
        reject: () => reject(new Error('PLUGIN_RUNTIME_CONTROL_PORT_TRANSFER_FAILED'))
      })
    })
  }
}

export class ElectronPluginRuntimeProcessFactory implements PluginRuntimeProcessFactory {
  artifactExists(artifactPath: string): boolean {
    try {
      return lstatSync(artifactPath).isFile()
    } catch {
      return false
    }
  }

  spawn(options: {
    artifactPath: string
    resourceLimits: Readonly<PluginRuntimeHostResourceLimits>
  }): PluginRuntimeSpawnResult {
    const channel = new MessageChannelMain()
    let child: UtilityProcess
    try {
      child = utilityProcess.fork(
        options.artifactPath,
        [],
        createElectronPluginRuntimeForkOptions(options.resourceLimits)
      )
    } catch (error) {
      channel.port1.close()
      channel.port2.close()
      throw error
    }

    try {
      const childAdapter = new ElectronPluginRuntimeChild(child)
      const controlPort = new ElectronPluginRuntimeControlPort(channel.port1)
      return {
        child: childAdapter,
        controlPort,
        childPort: channel.port2
      }
    } catch (error) {
      try {
        child.kill()
      } catch {
        // The failed factory result cannot expose a termination barrier to its caller.
      }
      channel.port1.close()
      channel.port2.close()
      throw error
    }
  }
}
