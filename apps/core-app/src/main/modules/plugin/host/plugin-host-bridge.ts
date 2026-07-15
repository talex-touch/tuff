/**
 * Plugin host bridge — main-process side of the isolated plugin runtime
 * (C1-B stage 1 skeleton).
 *
 * Forks the plugin-host utilityProcess and holds a control MessagePort to it.
 * Stage 1 only proves the process spawns, the channel is bidirectional, and a
 * crashed host restarts (bounded). The lifecycle bridge (MP1) and SDK bridge
 * (MP2) build on this in stages 2-3.
 */
import type { MessagePortMain, UtilityProcess } from 'electron'
import path from 'node:path'
import { MessageChannelMain, utilityProcess } from 'electron'
import { createLogger } from '../../../utils/logger'

const pluginHostLog = createLogger('PluginHost')

const MAX_RESTART_ATTEMPTS = 3
const DEFAULT_PING_TIMEOUT_MS = 2000

interface ControlMessage {
  type?: string
  id?: number
  payload?: unknown
}

class PluginHostBridge {
  private child: UtilityProcess | null = null
  private controlPort: MessagePortMain | null = null
  private pingId = 0
  private readonly pending = new Map<number, (ok: boolean) => void>()
  private restartAttempts = 0
  private ready = false

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
    port1.on('message', (event) => this.handleControlMessage(event.data as ControlMessage))
    port1.start()

    child.on('spawn', () => {
      pluginHostLog.info('Plugin host process spawned')
      this.restartAttempts = 0
      // Hand the child its end of the control channel.
      child.postMessage({ type: 'init' }, [port2])
    })

    child.on('exit', (code) => {
      pluginHostLog.warn(`Plugin host exited (code=${code})`)
      this.handleExit()
    })
  }

  private handleControlMessage(data: ControlMessage): void {
    if (data?.type === 'ready') {
      this.ready = true
      pluginHostLog.info('Plugin host ready')
      return
    }
    if (data?.type === 'pong' && typeof data.id === 'number') {
      this.pending.get(data.id)?.(true)
      this.pending.delete(data.id)
    }
  }

  /** Round-trip a ping to confirm the host is alive and the channel works. */
  async ping(timeoutMs = DEFAULT_PING_TIMEOUT_MS): Promise<boolean> {
    if (!this.controlPort) {
      return false
    }
    const id = ++this.pingId
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve(false)
      }, timeoutMs)
      this.pending.set(id, (ok) => {
        clearTimeout(timer)
        resolve(ok)
      })
      this.controlPort!.postMessage({ type: 'ping', id })
    })
  }

  private handleExit(): void {
    this.child = null
    this.controlPort = null
    this.ready = false
    this.pending.forEach((resolve) => resolve(false))
    this.pending.clear()

    if (this.restartAttempts < MAX_RESTART_ATTEMPTS) {
      this.restartAttempts++
      pluginHostLog.info(`Restarting plugin host (attempt ${this.restartAttempts})`)
      this.start()
    } else {
      pluginHostLog.error('Plugin host restart limit reached; isolation disabled until next launch')
    }
  }

  stop(): void {
    this.pending.forEach((resolve) => resolve(false))
    this.pending.clear()
    this.child?.kill()
    this.child = null
    this.controlPort = null
    this.ready = false
  }
}

export const pluginHostBridge = new PluginHostBridge()
