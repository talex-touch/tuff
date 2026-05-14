import type { ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { TerminalCreateRequest } from '@talex-touch/utils/transport/events/terminal'
import type { WebContents } from 'electron'
import type { ChildProcess } from 'node:child_process'
import { spawnSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { TerminalEvents } from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { BaseModule } from '../abstract-base-module'
import { withPermission } from '../permission/channel-guard'
import { TalexEvents } from '../../core/eventbus/touch-event'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { createLogger } from '../../utils/logger'

type TerminalEventPayload = { id: string; data: string } | { id: string; exitCode: number | null }
const terminalLog = createLogger('TerminalManager')

class TerminalModule extends BaseModule {
  private processes: Map<string, ChildProcess> = new Map()
  private transport: ReturnType<typeof getTuffTransportMain> | null = null

  static key = Symbol.for('terminal-manager')
  name: ModuleKey = TerminalModule.key

  constructor() {
    super(TerminalModule.key, {
      create: false
    })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): void {
    const runtime = resolveMainRuntime(ctx, 'TerminalModule.onInit')
    const channel = runtime.app.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    this.transport = getTuffTransportMain(channel, keyManager)

    const createHandler = withPermission(
      { permissionId: 'system.shell', errorMessage: 'Permission system.shell required' },
      (payload: TerminalCreateRequest, context) => this.create(payload, context)
    )

    this.transport.on(TerminalEvents.session.create, createHandler)
    this.transport.on(TerminalEvents.legacy.create, createHandler)
    this.transport.on(TerminalEvents.session.write, (payload) => this.write(payload))
    this.transport.on(TerminalEvents.legacy.write, (payload) => this.write(payload))
    this.transport.on(TerminalEvents.session.kill, (payload) => this.kill(payload))
    this.transport.on(TerminalEvents.legacy.kill, (payload) => this.kill(payload))
  }

  private sendToSender(sender: WebContents | undefined, data: TerminalEventPayload): void {
    const transport = this.transport
    if (!sender || sender.isDestroyed() || !transport) {
      return
    }

    if ('data' in data) {
      transport.sendTo(sender, TerminalEvents.session.data, data).catch((error) => {
        terminalLog.debug('Failed to forward terminal event', {
          meta: {
            id: data.id,
            eventName: TerminalEvents.session.data.toEventName()
          },
          error
        })
      })
      transport.sendTo(sender, TerminalEvents.legacy.data, data).catch((error) => {
        terminalLog.debug('Failed to forward terminal event', {
          meta: {
            id: data.id,
            eventName: TerminalEvents.legacy.data.toEventName()
          },
          error
        })
      })
      return
    }

    transport.sendTo(sender, TerminalEvents.session.exit, data).catch((error) => {
      terminalLog.debug('Failed to forward terminal event', {
        meta: {
          id: data.id,
          eventName: TerminalEvents.session.exit.toEventName()
        },
        error
      })
    })
    transport.sendTo(sender, TerminalEvents.legacy.exit, data).catch((error) => {
      terminalLog.debug('Failed to forward terminal event', {
        meta: {
          id: data.id,
          eventName: TerminalEvents.legacy.exit.toEventName()
        },
        error
      })
    })
  }

  /**
   * Creates a new child process to execute a command.
   * Expects data to contain { command: string, args: string[] }.
   * Sends back { id: string } on success.
   */
  private create(
    payload: { command: string; args?: string[] },
    context: HandlerContext
  ): { id: string } {
    const { command, args = [] } = payload
    const sender = context.sender as WebContents | undefined

    if (!command) {
      terminalLog.warn('No command provided for terminal:create')
      throw new Error('No command provided')
    }

    const id = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Use spawn to create a new process. The shell is determined by the OS.
    // The '-c' flag is used for bash/sh to execute a command string.
    // On Windows, cmd.exe will execute the command directly.
    const proc: ChildProcess = spawnSafe(command, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.processes.set(id, proc)

    // Listen for data from stdout and stderr
    proc.stdout?.on('data', (data) => {
      this.sendToSender(sender, { id, data: data.toString() })
    })

    proc.stderr?.on('data', (data) => {
      // Send stderr data as well, perhaps with a flag if needed by the frontend
      this.sendToSender(sender, { id, data: data.toString() })
    })

    // Listen for the process to close
    proc.on('close', (code) => {
      this.sendToSender(sender, { id, exitCode: code ?? null })
      this.processes.delete(id)
    })

    proc.on('error', (err) => {
      terminalLog.error('Failed to start terminal process', {
        meta: {
          id,
          commandLength: command.length
        },
        error: err
      })
      this.sendToSender(sender, { id, data: `Error: ${err.message}\n` })
      this.sendToSender(sender, { id, exitCode: -1 })
      this.processes.delete(id)
    })

    return { id }
  }

  /**
   * Writes data to the process stdin.
   */
  private write(payload: { id: string; data: string }): void {
    const { id, data } = payload
    const proc = this.processes.get(id)
    if (proc && proc.stdin) {
      proc.stdin.write(data)
      // Optionally, end the input stream if it's a one-off command
      // proc.stdin.end();
    } else {
      terminalLog.warn('Attempted to write to non-existent or non-writable process', {
        meta: { id }
      })
    }
  }

  /**
   * Kills a running process.
   */
  private kill(payload: { id: string }): void {
    const { id } = payload
    const proc = this.processes.get(id)
    if (proc) {
      proc.kill()
      this.processes.delete(id)
    }
  }

  onDestroy(): void {
    this.processes.forEach((proc) => proc.kill())
    this.processes.clear()
    terminalLog.info('Destroyed terminal processes')
  }
}

const terminalModule = new TerminalModule()

export { terminalModule }
