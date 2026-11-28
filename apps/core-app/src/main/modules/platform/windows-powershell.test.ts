import { describe, expect, it } from 'vitest'
import {
  buildWindowsPowerShellArgs,
  classifyWindowsPowerShellError,
  parseRegQueryAppPathRecords,
  parseRegQueryPathValues,
  parseRegQueryUninstallRecords
} from './windows-powershell'

describe('windows-powershell diagnostics and reg.exe fallbacks (#350)', () => {
  it('classifies ENOENT, execution policy blocks, timeouts, and generic errors with recovery guidance', () => {
    const notFound = classifyWindowsPowerShellError(
      Object.assign(new Error('spawn powershell ENOENT'), { code: 'ENOENT' })
    )
    expect(notFound.code).toBe('powershell-not-found')
    expect(notFound.recovery).toContain('reg.exe')

    const policyBlocked = classifyWindowsPowerShellError(
      Object.assign(new Error('Command failed'), {
        stderr:
          'File C:\\Temp\\script.ps1 cannot be loaded because running scripts is disabled on this system. PSSecurityException'
      })
    )
    expect(policyBlocked.code).toBe('powershell-execution-policy')
    expect(policyBlocked.recovery).toContain('ExecutionPolicy')

    const timedOut = classifyWindowsPowerShellError(
      Object.assign(new Error('Command timed out'), { killed: true, signal: 'SIGTERM' })
    )
    expect(timedOut.code).toBe('powershell-timeout')
    expect(timedOut.recovery).toContain('timed out')

    const generic = classifyWindowsPowerShellError(new Error('exit code 1'))
    expect(generic.code).toBe('powershell-command-failed')
    expect(generic.recovery).toContain('Start Menu')

    const parseFailed = classifyWindowsPowerShellError(
      new SyntaxError('Unexpected token < in JSON')
    )
    expect(parseFailed.code).toBe('powershell-parse-failed')
    expect(parseFailed.recovery).toContain('JSON')
  })

  it('builds hardened PowerShell arguments with NoProfile, NonInteractive, and optional ExecutionPolicy', () => {
    expect(buildWindowsPowerShellArgs('Get-StartApps')).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      'Get-StartApps'
    ])
    expect(buildWindowsPowerShellArgs('Get-StartApps', { bypassExecutionPolicy: false })).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-StartApps'
    ])
  })

  it('parses reg.exe Uninstall query output into RegistryAppRecord entries', () => {
    const stdout = [
      '',
      'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AcmeApp',
      '    DisplayName    REG_SZ    Acme Studio',
      '    DisplayIcon    REG_SZ    "C:\\Program Files\\Acme\\Acme.exe",0',
      '    InstallLocation    REG_EXPAND_SZ    %ProgramFiles%\\Acme',
      '    Publisher    REG_SZ    Acme Corp',
      '    SystemComponent    REG_DWORD    0x0',
      '',
      'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SystemDriver',
      '    DisplayName    REG_SZ    System Driver',
      '    SystemComponent    REG_DWORD    0x1',
      '    ReleaseType    REG_SZ    Update',
      '    ParentKeyName    REG_SZ    OperatingSystem',
      '',
      'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\NoDisplayName',
      '    InstallLocation    REG_SZ    C:\\Hidden'
    ].join('\r\n')

    expect(parseRegQueryUninstallRecords(stdout)).toEqual([
      {
        displayName: 'Acme Studio',
        displayIcon: '"C:\\Program Files\\Acme\\Acme.exe",0',
        installLocation: '%ProgramFiles%\\Acme',
        publisher: 'Acme Corp',
        systemComponent: 0,
        releaseType: undefined,
        parentKeyName: undefined
      },
      {
        displayName: 'System Driver',
        displayIcon: undefined,
        installLocation: undefined,
        publisher: undefined,
        systemComponent: 1,
        releaseType: 'Update',
        parentKeyName: 'OperatingSystem'
      }
    ])
  })

  it('parses reg.exe App Paths query output including default executable and Path values', () => {
    const stdout = [
      'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',
      '    (Default)    REG_SZ    ignored-root',
      '',
      'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\code.exe',
      '    (Default)    REG_SZ    C:\\Program Files\\Microsoft VS Code\\Code.exe',
      '    Path    REG_EXPAND_SZ    C:\\Program Files\\Microsoft VS Code'
    ].join('\r\n')

    expect(parseRegQueryAppPathRecords(stdout)).toEqual([
      {
        name: 'code.exe',
        executablePath: 'C:\\Program Files\\Microsoft VS Code\\Code.exe',
        pathValue: 'C:\\Program Files\\Microsoft VS Code'
      }
    ])

    const localizedStdout = [
      'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\demo.exe',
      '    (默认)    REG_SZ    C:\\Tools\\Demo\\demo.exe'
    ].join('\r\n')
    expect(parseRegQueryAppPathRecords(localizedStdout)).toEqual([
      {
        name: 'demo.exe',
        executablePath: 'C:\\Tools\\Demo\\demo.exe',
        pathValue: undefined
      }
    ])
  })

  it('parses reg.exe Environment Path values for Everything fallback discovery', () => {
    const stdout = [
      'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
      '    Path    REG_EXPAND_SZ    C:\\Windows\\System32;C:\\Tools\\Everything',
      '',
      'HKEY_CURRENT_USER\\Environment',
      '    PATH    REG_SZ    C:\\Users\\demo\\bin'
    ].join('\r\n')

    expect(parseRegQueryPathValues(stdout)).toEqual([
      'C:\\Windows\\System32;C:\\Tools\\Everything',
      'C:\\Users\\demo\\bin'
    ])
  })
})
