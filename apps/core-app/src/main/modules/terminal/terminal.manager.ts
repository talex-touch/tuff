import type { ModuleKey } from '@talex-touch/utils'
import type { StandardChannelData } from '@talex-touch/utils/channel'
import type { WebContents } from 'electron'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import os from 'node:os'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { BaseModule } from '../abstract-base-module'

// Determine the default shell based on the operating system
function getDefaultShell(): string {
  if (os.platform() === 'win32') {
    return 'cmd.exe'
  }
  else {
    // For macOS and Linux, use the SHELL environment variable or default to 'bash'
    return process.env.SHELL || '/bin/bash'
  }
}

class TerminalModule extends BaseModule {
  private processes: Map<string, ChildProcess> = new Map()

  static key = Symbol.for('terminal-manager')
  name: ModuleKey = TerminalModule.key

  constructor() {
    super(TerminalModule.key, {
      create: false,
    })
  }

  onInit(): void {
    const channel = $app.channel

    // For child_process, 'create' will be used to start a new command process.
    channel.regChannel(ChannelType.MAIN, 'terminal:create', data => this.create(data))
    // 'write' is not applicable for non-interactive child_process, but we can keep it for API consistency
    // or repurpose it if needed in the future. For now, it will be a no-op or log a warning.
    channel.regChannel(ChannelType.MAIN, 'terminal:write', data => this.write(data))
    channel.regChannel(ChannelType.MAIN, 'terminal:kill', data => this.kill(data))
  }

  /**
   * Creates a new child process to execute a command.
   * Expects data to contain { command: string, args: string[] }.
   * Sends back { id: string } on success.
   */
  private create(channelData: StandardChannelData): void {
    const { command, args = [] } = channelData.data
    const sender = channelData.header.event?.sender as WebContents

    if (!command) {
      console.error('[TerminalManager] No command provided for terminal:create')
      channelData.reply(DataCode.ERROR, { error: 'No command provided' })
      return
    }

    const id = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Use spawn to create a new process. The shell is determined by the OS.
    // The '-c' flag is used for bash/sh to execute a command string.
    // On Windows, cmd.exe will execute the command directly.
    let proc: ChildProcess
    if (os.platform() === 'win32') {
      proc = spawn(command, args, { shell: true })
    }
    else {
      proc = spawn(getDefaultShell(), ['-c', `${command} ${args.join(' ')}`], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    }

    this.processes.set(id, proc)

    // Listen for data from stdout and stderr
    proc.stdout?.on('data', (data) => {
      if (sender && !sender.isDestroyed()) {
        sender.send('@main-process-message', {
          name: 'terminal:data',
          header: { status: 'request', type: ChannelType.MAIN },
          data: { id, data: data.toString() },
        })
      }
    })

    proc.stderr?.on('data', (data) => {
      // Send stderr data as well, perhaps with a flag if needed by the frontend
      if (sender && !sender.isDestroyed()) {
        sender.send('@main-process-message', {
          name: 'terminal:data',
          header: { status: 'request', type: ChannelType.MAIN },
          data: { id, data: data.toString() },
        })
      }
    })

    // Listen for the process to close
    proc.on('close', (code) => {
      if (sender && !sender.isDestroyed()) {
        sender.send('@main-process-message', {
          name: 'terminal:exit',
          header: { status: 'request', type: ChannelType.MAIN },
          data: { id, exitCode: code },
        })
      }
      this.processes.delete(id)
    })

    proc.on('error', (err) => {
      console.error(`[TerminalManager] Failed to start process ${command}:`, err)
      if (sender && !sender.isDestroyed()) {
        sender.send('@main-process-message', {
          name: 'terminal:data',
          header: { status: 'request', type: ChannelType.MAIN },
          data: { id, data: `Error: ${err.message}\n` },
        })
        sender.send('@main-process-message', {
          name: 'terminal:exit',
          header: { status: 'request', type: ChannelType.MAIN },
          data: { id, exitCode: -1 },
        })
      }
      this.processes.delete(id)
    })

    // Reply with the process ID
    channelData.reply(DataCode.SUCCESS, { id })
  }

  /**
   * Writes data to the process stdin.
   * For child_process, this is less common but can be used for some interactive scripts.
   * If not needed, this can be a no-op.
   */
  private write(channelData: StandardChannelData): void {
    const { id, data } = channelData.data
    const proc = this.processes.get(id)
    if (proc && proc.stdin) {
      proc.stdin.write(data)
      // Optionally, end the input stream if it's a one-off command
      // proc.stdin.end();
    }
    else {
      console.warn(
        `[TerminalManager] Attempted to write to non-existent or non-writable process ${id}`,
      )
    }
  }

  /**
   * Kills a running process.
   */
  private kill(channelData: StandardChannelData): void {
    const { id } = channelData.data
    const proc = this.processes.get(id)
    if (proc) {
      proc.kill()
      this.processes.delete(id)
    }
  }

  onDestroy(): void {
    this.processes.forEach(proc => proc.kill())
    this.processes.clear()
    console.log('[TerminalManager] Destroying all processes.')
  }
}

const terminalModule = new TerminalModule()

export { terminalModule }
