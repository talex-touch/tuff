/**
 * Plugin host bridge — main-process side of the isolated plugin runtime
 * (C1-B experimental core). Flag-gated, off by default.
 *
 * Forks the plugin-host utilityProcess, loads a Prelude into it, exposes a
 * lifecycle proxy (calls forwarded over the control port), and serves the
 * child's invoke-style SDK calls against the real SDK held here in main. Event-
 * style callback registration and AbortSignal proxying are out of scope for the
 * experimental core.
 */
import type { MessagePortMain, UtilityProcess } from 'electron'
import path from 'node:path'
import { MessageChannelMain, utilityProcess } from 'electron'
import { createLogger } from '../../../utils/logger'
import type { HostMessage, HostSdkCall } from './plugin-host-protocol'

const pluginHostLog = createLogger('PluginHost')

const MAX_RESTART_ATTEMPTS = 3
const DEFAULT_PING_TIMEOUT_MS = 2000

type LifecycleProxy = Record<string, (...args: unknown[]) => Promise<unknown>>

interface Pending<T> {
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

/** Strip functions / non-cloneable values so args & results survive postMessage. */
function toCloneable<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as T
  } catch {
    return null as unknown as T
  }
}

function resolveChain(
  root: Record<string, unknown>,
  chain: string[]
): { fn: (...args: unknown[]) => unknown; thisArg: unknown } | null {
  let obj: unknown = root
  for (let i = 0; i < chain.length - 1; i++) {
    obj = (obj as Record<string, unknown> | null | undefined)?.[chain[i]]
    if (obj == null) {
      return null
    }
  }
  const last = chain[chain.length - 1]
  const fn = (obj as Record<string, unknown> | null | undefined)?.[last]
  return typeof fn === 'function'
    ? { fn: fn as (...args: unknown[]) => unknown, thisArg: obj }
    : null
}

class PluginHostBridge {
  private child: UtilityProcess | null = null
  private controlPort: MessagePortMain | null = null
  private ready = false
  private restartAttempts = 0
  private seq = 0
  private readonly pingPending = new Map<number, (ok: boolean) => void>()
  private readonly loadPending = new Map<number, Pending<string[]>>()
  private readonly lifecyclePending = new Map<number, Pending<unknown>>()
  // Real SDK objects kept in main, keyed by plugin, resolved for child SDK calls.
  private readonly contexts = new Map<string, Record<string, unknown>>()

  isReady(): boolean {
    return this.ready
  }

  start(): void {
    if (this.child) {
      return
    }
    const hostPath = path.join(__dirname, 'plugin-host.js')
    const child = utilityProcess.fork(hostPath, [], { serviceName: 'tuff-plugin-host' })
    this.child = child

    const { port1, port2 } = new MessageChannelMain()
    this.controlPort = port1
    port1.on('message', (event) => this.handleMessage(event.data as HostMessage))
    port1.start()

    child.on('spawn', () => {
      pluginHostLog.info('Plugin host process spawned')
      this.restartAttempts = 0
      child.postMessage({ type: 'init' }, [port2])
    })
    child.on('exit', (code) => {
      pluginHostLog.warn(`Plugin host exited (code=${code})`)
      this.handleExit()
    })
  }

  private handleMessage(data: HostMessage): void {
    switch (data?.type) {
      case 'ready':
        this.ready = true
        pluginHostLog.info('Plugin host ready')
        break
      case 'pong':
        this.pingPending.get(data.id)?.(true)
        this.pingPending.delete(data.id)
        break
      case 'load-result': {
        const pending = this.loadPending.get(data.requestId)
        if (pending) {
          this.loadPending.delete(data.requestId)
          data.ok ? pending.resolve(data.methods ?? []) : pending.reject(new Error(data.error))
        }
        break
      }
      case 'lifecycle-result': {
        const pending = this.lifecyclePending.get(data.requestId)
        if (pending) {
          this.lifecyclePending.delete(data.requestId)
          data.ok ? pending.resolve(data.result) : pending.reject(new Error(data.error))
        }
        break
      }
      case 'sdk-call':
        void this.handleSdkCall(data)
        break
      default:
        break
    }
  }

  private async handleSdkCall(data: HostSdkCall): Promise<void> {
    const context = this.contexts.get(data.pluginName)
    const resolved = context ? resolveChain(context, data.chain) : null
    if (!resolved) {
      this.controlPort?.postMessage({
        type: 'sdk-result',
        requestId: data.requestId,
        ok: false,
        error: `SDK path not found: ${data.chain.join('.')}`
      })
      return
    }
    try {
      let result: unknown = resolved.fn.apply(resolved.thisArg, data.args)
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        result = await result
      }
      this.controlPort?.postMessage({
        type: 'sdk-result',
        requestId: data.requestId,
        ok: true,
        result: toCloneable(result)
      })
    } catch (err) {
      this.controlPort?.postMessage({
        type: 'sdk-result',
        requestId: data.requestId,
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  /** Load a Prelude into the isolated host; returns a lifecycle proxy. */
  async loadPlugin(
    pluginName: string,
    pluginPath: string,
    scriptContent: string,
    context: Record<string, unknown>
  ): Promise<LifecycleProxy> {
    if (!this.controlPort) {
      throw new Error('Plugin host is not started')
    }
    this.contexts.set(pluginName, context)
    const requestId = ++this.seq
    const methods = await new Promise<string[]>((resolve, reject) => {
      this.loadPending.set(requestId, { resolve, reject })
      this.controlPort!.postMessage({
        type: 'load',
        requestId,
        pluginName,
        pluginPath,
        scriptContent,
        contextKeys: Object.keys(context)
      })
    })

    const proxy: LifecycleProxy = {}
    for (const method of methods) {
      proxy[method] = (...args: unknown[]) => this.callLifecycle(pluginName, method, args)
    }
    return proxy
  }

  private callLifecycle(pluginName: string, method: string, args: unknown[]): Promise<unknown> {
    if (!this.controlPort) {
      return Promise.reject(new Error('Plugin host is not started'))
    }
    const requestId = ++this.seq
    return new Promise<unknown>((resolve, reject) => {
      this.lifecyclePending.set(requestId, { resolve, reject })
      this.controlPort!.postMessage({
        type: 'lifecycle',
        requestId,
        pluginName,
        method,
        args: toCloneable(args)
      })
    })
  }

  async ping(timeoutMs = DEFAULT_PING_TIMEOUT_MS): Promise<boolean> {
    if (!this.controlPort) {
      return false
    }
    const id = ++this.seq
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pingPending.delete(id)
        resolve(false)
      }, timeoutMs)
      this.pingPending.set(id, (ok) => {
        clearTimeout(timer)
        resolve(ok)
      })
      this.controlPort!.postMessage({ type: 'ping', id })
    })
  }

  private rejectAllPending(): void {
    this.pingPending.forEach((resolve) => resolve(false))
    this.pingPending.clear()
    this.loadPending.forEach((p) => p.reject(new Error('Plugin host exited')))
    this.loadPending.clear()
    this.lifecyclePending.forEach((p) => p.reject(new Error('Plugin host exited')))
    this.lifecyclePending.clear()
  }

  private handleExit(): void {
    this.child = null
    this.controlPort = null
    this.ready = false
    this.contexts.clear()
    this.rejectAllPending()
    if (this.restartAttempts < MAX_RESTART_ATTEMPTS) {
      this.restartAttempts++
      pluginHostLog.info(`Restarting plugin host (attempt ${this.restartAttempts})`)
      this.start()
    } else {
      pluginHostLog.error('Plugin host restart limit reached; isolation disabled until next launch')
    }
  }

  stop(): void {
    this.rejectAllPending()
    this.contexts.clear()
    this.child?.kill()
    this.child = null
    this.controlPort = null
    this.ready = false
  }
}

export const pluginHostBridge = new PluginHostBridge()
