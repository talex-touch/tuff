import type { ModuleKey } from '@talex-touch/utils'
import type { HandlerContext } from '@talex-touch/utils/transport'
import type { WebContents } from 'electron'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import os from 'node:os'
import process from 'node:process'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { BaseModule } from '../abstract-base-module'

// Determine the default shell based on the operating system
function getDefaultShell(): string {
  if (os.platform() === 'win32') {
    return 'cmd.exe'
  } else {
    // For macOS and Linux, use the SHELL environment variable or default to 'bash'
    return process.env.SHELL || '/bin/bash'
  }
}

const terminalCreateEvent = defineRawEvent<{ command: string; args?: string[] }, { id: string }>(
  'terminal:create'
)
const terminalWriteEvent = defineRawEvent<{ id: string; data: string }, void>('terminal:write')
const terminalKillEvent = defineRawEvent<{ id: string }, void>('terminal:kill')
const terminalDataEvent = defineRawEvent<{ id: string; data: string }, void>('terminal:data')
const terminalExitEvent = defineRawEvent<{ id: string; exitCode: number | null }, void>(
  'terminal:exit'
)

type TerminalEventPayload = { id: string; data: string } | { id: string; exitCode: number | null }

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

  onInit(): void {
    const channel = $app.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    this.transport = getTuffTransportMain(channel, keyManager)

    // For child_process, 'create' will be used to start a new command process.
    this.transport.on(terminalCreateEvent, (payload, context) => this.create(payload, context))
    // 'write' is not applicable for non-interactive child_process, but we can keep it for API consistency
    // or repurpose it if needed in the future. For now, it will be a no-op or log a warning.
    this.transport.on(terminalWriteEvent, (payload) => this.write(payload))
    this.transport.on(terminalKillEvent, (payload) => this.kill(payload))
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
    const transport = this.transport

    if (!command) {
      console.error('[TerminalManager] No command provided for terminal:create')
      throw new Error('No command provided')
    }

    const id = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Use spawn to create a new process. The shell is determined by the OS.
    // The '-c' flag is used for bash/sh to execute a command string.
    // On Windows, cmd.exe will execute the command directly.
    let proc: ChildProcess
    if (os.platform() === 'win32') {
      proc = spawn(command, args, { shell: true })
    } else {
      proc = spawn(getDefaultShell(), ['-c', `${command} ${args.join(' ')}`], {
        stdio: ['pipe', 'pipe', 'pipe']
      })
    }

    this.processes.set(id, proc)

    const sendToSender = (
      event: typeof terminalDataEvent | typeof terminalExitEvent,
      data: TerminalEventPayload
    ) => {
      if (!sender || sender.isDestroyed() || !transport) {
        return
      }
      transport.sendTo(sender, event, data).catch(() => {})
    }

    // Listen for data from stdout and stderr
    proc.stdout?.on('data', (data) => {
      sendToSender(terminalDataEvent, { id, data: data.toString() })
    })

    proc.stderr?.on('data', (data) => {
      // Send stderr data as well, perhaps with a flag if needed by the frontend
      sendToSender(terminalDataEvent, { id, data: data.toString() })
    })

    // Listen for the process to close
    proc.on('close', (code) => {
      sendToSender(terminalExitEvent, { id, exitCode: code ?? null })
      this.processes.delete(id)
    })

    proc.on('error', (err) => {
      console.error(`[TerminalManager] Failed to start process ${command}:`, err)
      sendToSender(terminalDataEvent, { id, data: `Error: ${err.message}\n` })
      sendToSender(terminalExitEvent, { id, exitCode: -1 })
      this.processes.delete(id)
    })

    return { id }
  }

  /**
   * Writes data to the process stdin.
   * For child_process, this is less common but can be used for some interactive scripts.
   * If not needed, this can be a no-op.
   */
  private write(payload: { id: string; data: string }): void {
    const { id, data } = payload
    const proc = this.processes.get(id)
    if (proc && proc.stdin) {
      proc.stdin.write(data)
      // Optionally, end the input stream if it's a one-off command
      // proc.stdin.end();
    } else {
      console.warn(
        `[TerminalManager] Attempted to write to non-existent or non-writable process ${id}`
      )
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
    console.log('[TerminalManager] Destroying all processes.')
  }
}

const terminalModule = new TerminalModule()

export { terminalModule }
