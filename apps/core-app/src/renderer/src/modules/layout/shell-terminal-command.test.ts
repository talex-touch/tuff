import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildTerminalInput,
  formatCdCommand,
  normalizeShellCommand
} from './shell-terminal-command'
import { useShellTerminal } from './useShellTerminal'

describe('shell-terminal-command', () => {
  it('normalizes whitespace, CRLF, and prompt-prefixed commands safely', () => {
    expect(normalizeShellCommand('\n  \nopen login.html\r\n  \n')).toBe('open login.html')
    expect(normalizeShellCommand('$ open login.html')).toBe('open login.html')
    expect(normalizeShellCommand('$ cd app\n$ pnpm dev')).toBe('cd app\npnpm dev')
    // Must not strip shell variables like $HOME or subshells $(...)
    expect(normalizeShellCommand('$HOME/bin/run')).toBe('$HOME/bin/run')
    expect(normalizeShellCommand('  \n\t  ')).toBeNull()
  })

  it('quotes POSIX and Windows paths safely and rejects control characters', () => {
    expect(formatCdCommand('/private/tmp/tuff-spaces/abc', 'posix')).toBe(
      "cd -- '/private/tmp/tuff-spaces/abc'"
    )
    expect(formatCdCommand("/tmp/bob's dir", 'posix')).toBe("cd -- '/tmp/bob'\\''s dir'")
    expect(formatCdCommand('C:\\Users\\demo\\project', 'win32')).toBe(
      'cd /d "C:\\Users\\demo\\project"'
    )
    expect(formatCdCommand('/tmp/bad\nrm -rf /', 'posix')).toBeNull()
    expect(formatCdCommand('C:\\bad"dir', 'win32')).toBeNull()
  })

  it('builds PTY input with guarded cd for single-line and multi-line commands', () => {
    expect(
      buildTerminalInput({
        command: 'open login.html',
        cwd: '/private/tmp/tuff-spaces/abc',
        currentCwd: '/private/tmp/tuff-spaces/abc'
      })
    ).toEqual({
      input: 'open login.html\r',
      nextCwd: undefined
    })

    expect(
      buildTerminalInput({
        command: 'open login.html',
        cwd: '/private/tmp/tuff-spaces/abc',
        currentCwd: undefined
      })
    ).toEqual({
      input: "cd -- '/private/tmp/tuff-spaces/abc' && open login.html\r",
      nextCwd: undefined
    })

    expect(
      buildTerminalInput({
        command: 'echo one\necho two',
        cwd: '/private/tmp/tuff-spaces/abc',
        currentCwd: '/other'
      })
    ).toEqual({
      input: "cd -- '/private/tmp/tuff-spaces/abc' && {\recho one\recho two\r}\r",
      nextCwd: undefined
    })

    expect(
      buildTerminalInput({
        command: 'set "REVIEW_VALUE=new"\necho %REVIEW_VALUE%',
        cwd: 'C:\\Users\\demo\\project',
        currentCwd: undefined,
        platform: 'win32'
      })
    ).toEqual({
      input:
        'cd /d "C:\\Users\\demo\\project"\rif not errorlevel 1 set "REVIEW_VALUE=new"\rif not errorlevel 1 echo %REVIEW_VALUE%\r',
      nextCwd: undefined
    })
  })
})

describe('useShellTerminal runCommand', () => {
  beforeEach(() => {
    const terminal = useShellTerminal()
    terminal.closeTerminal()
    terminal.clearPendingCommands()
  })

  it('ignores blank commands without opening the terminal', () => {
    const terminal = useShellTerminal()
    expect(terminal.runCommand('   \n  ', { cwd: '/tmp' })).toBe(false)
    expect(terminal.terminalOpen.value).toBe(false)
    expect(terminal.pendingCommands.value).toHaveLength(0)
  })

  it('opens the bottom terminal and enqueues commands in FIFO order', () => {
    const terminal = useShellTerminal()
    expect(
      terminal.runCommand('open login.html', {
        cwd: '/private/tmp/tuff-spaces/abc',
        lang: 'bash'
      })
    ).toBe(true)

    expect(terminal.terminalMounted.value).toBe(true)
    expect(terminal.terminalOpen.value).toBe(true)

    const first = terminal.peekPendingCommand()
    expect(first).toMatchObject({
      command: 'open login.html',
      cwd: '/private/tmp/tuff-spaces/abc',
      lang: 'bash'
    })

    terminal.consumePendingCommand(first!.id)
    expect(terminal.pendingCommands.value).toHaveLength(0)
  })
})
