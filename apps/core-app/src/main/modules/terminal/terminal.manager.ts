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

interface TerminalSession {
  proc: ChildProcess
  /** Who may write to and kill this session. See ownerKeyOf. */
  owner: string
}

/**
 * A stable identity for the caller of a terminal request.
 *
 * Sessions used to be keyed by id alone in one global map, so any caller could write to a
 * session another caller had started — including a plugin that had been denied system.shell,
 * which is precisely the capability the permission gate exists to withhold (#911). The id
 * format is `proc_${Date.now()}_${9 base36 chars}`, guessable enough that this mattered.
 *
 * A plugin is identified by its uniqueKey rather than its webContents, so two plugins sharing
 * a surface cannot reach each other's sessions. Returns null when neither identity is
 * available, and callers treat that as "owns nothing" rather than "owns everything".
 */
function ownerKeyOf(context: HandlerContext | undefined): string | null {
  const pluginKey = context?.plugin?.uniqueKey
  if (typeof pluginKey === 'string' && pluginKey.length > 0) {
    return `plugin:${pluginKey}`
  }

  const senderId = (context?.sender as WebContents | undefined)?.id
  return typeof senderId === 'number' ? `webcontents:${senderId}` : null
}

class TerminalModule extends BaseModule {
  private processes: Map<string, TerminalSession> = new Map()
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

    // write and kill are gated on the same permission as create. Without it a caller denied
    // system.shell could still reach a session someone else had been granted.
    const writeHandler = withPermission(
      { permissionId: 'system.shell', errorMessage: 'Permission system.shell required' },
      (payload: Parameters<TerminalModule['write']>[0], context) => this.write(payload, context)
    )
    const killHandler = withPermission(
      { permissionId: 'system.shell', errorMessage: 'Permission system.shell required' },
      (payload: Parameters<TerminalModule['kill']>[0], context) => this.kill(payload, context)
    )

    this.transport.on(TerminalEvents.session.create, createHandler)
    this.transport.on(TerminalEvents.session.write, writeHandler)
    this.transport.on(TerminalEvents.session.kill, killHandler)
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
      terminalLog.warn('No command provided for terminal:session:create')
      throw new Error('No command provided')
    }

    const id = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // spawnSafe runs `command` directly as an executable with `args` (shell: false —
    // no shell interpretation, no `-c`, no cmd.exe). This is a piped-stdio command
    // runner, NOT a PTY: there is no TTY, so interactive programs, ANSI colors and
    // resize/job-control are unsupported. Caller must pre-split command + args.
    const proc: ChildProcess = spawnSafe(command, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const owner = ownerKeyOf(context)
    if (!owner) {
      // No resolvable identity means no one could ever be verified as the owner, so the
      // session would be writable by nobody — better to refuse than to spawn an orphan.
      proc.kill()
      throw new Error('Terminal session requires an identifiable caller')
    }

    this.processes.set(id, { proc, owner })

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
  private write(payload: { id: string; data: string }, context: HandlerContext): void {
    const { id, data } = payload
    const session = this.resolveOwnedSession(id, context, 'write')
    if (!session) {
      return
    }

    if (session.proc.stdin) {
      session.proc.stdin.write(data)
      // Optionally, end the input stream if it's a one-off command
      // proc.stdin.end();
    } else {
      terminalLog.warn('Attempted to write to non-writable process', { meta: { id } })
    }
  }

  /**
   * Looks up a session and confirms the caller owns it.
   *
   * Returns null on both "no such session" and "not yours", and logs the same way for each:
   * a caller probing ids should not be able to tell which sessions exist.
   */
  private resolveOwnedSession(
    id: string,
    context: HandlerContext,
    action: 'write' | 'kill'
  ): TerminalSession | null {
    const session = this.processes.get(id)
    const owner = ownerKeyOf(context)
    if (!session || !owner || session.owner !== owner) {
      terminalLog.warn('Rejected terminal request for a session the caller does not own', {
        meta: { id, action }
      })
      return null
    }
    return session
  }

  /**
   * Kills a running process.
   */
  private kill(payload: { id: string }, context: HandlerContext): void {
    const { id } = payload
    const session = this.resolveOwnedSession(id, context, 'kill')
    if (!session) {
      return
    }

    session.proc.kill()
    this.processes.delete(id)
  }

  onDestroy(): void {
    this.processes.forEach((session) => session.proc.kill())
    this.processes.clear()
    terminalLog.info('Destroyed terminal processes')
  }
}

const terminalModule = new TerminalModule()

export { terminalModule }
