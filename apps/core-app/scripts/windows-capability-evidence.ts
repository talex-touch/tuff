#!/usr/bin/env tsx
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { resolveWindowsInstallerCommand } from '../src/main/modules/update/services/windows-installer-strategy'
import {
  DEFAULT_WINDOWS_CAPABILITY_TARGETS,
  buildWindowsCapabilityEvidence,
  normalizeRegistryAppRecord,
  normalizeStartAppRecord,
  parsePowerShellJsonArray
} from '../src/main/modules/platform/windows-capability-evidence'
import type {
  WindowsCapabilityCommandResult,
  WindowsCapabilityGateOptions,
  WindowsRegistryAppRecord,
  WindowsStartMenuEntry
} from '../src/main/modules/platform/windows-capability-evidence'

const execFileAsync = promisify(execFile)
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_EVERYTHING_QUERY = '.exe'

interface CliOptions extends WindowsCapabilityGateOptions {
  targets: string[]
  installer?: string
  output?: string
  timeoutMs: number
  requireEverything: boolean
  requireEverythingTargets: boolean
  requireTargets: boolean
  requireApprefMs: boolean
  requireShortcutArguments: boolean
  requireShortcutWorkingDirectory: boolean
  strict: boolean
  pretty: boolean
}

interface CommandCapture extends WindowsCapabilityCommandResult {
  stdout: string
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run windows:capability:evidence -- [options]

Options:
  --target <name>          App target to probe. Can be repeated. Defaults: ChatApp, Codex, Apple Music.
  --installer <path>       Add dry-run evidence for a downloaded Windows installer. Does not execute it.
  --output <path>          Write JSON evidence to a file in addition to stdout.
  --timeoutMs <ms>         Per-command timeout. Default: 15000.
  --requireEverything      Fail the gate when es.exe is unavailable.
  --requireEverythingTargets
                             Fail the gate when Everything cannot find requested targets.
  --requireTargets         Fail the gate when requested targets are not found.
  --requireApprefMs        Fail the gate when Start Menu has no .appref-ms entries.
  --requireShortcutArguments
                           Fail the gate when no .lnk arguments are resolved.
  --requireShortcutWorkingDirectory
                           Fail the gate when no .lnk working directory is resolved.
  --strict                 Fail on any gate failure; also treats non-Windows as failed.
  --compact                Print single-line JSON.
  --help                   Show this help.
`)
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    targets: [],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    requireEverything: false,
    requireEverythingTargets: false,
    requireTargets: false,
    requireApprefMs: false,
    requireShortcutArguments: false,
    requireShortcutWorkingDirectory: false,
    strict: false,
    pretty: true
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue

    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--target' && argv[i + 1]) {
      options.targets.push(argv[++i])
      continue
    }
    if (arg === '--installer' && argv[i + 1]) {
      options.installer = argv[++i]
      continue
    }
    if (arg === '--output' && argv[i + 1]) {
      options.output = argv[++i]
      continue
    }
    if (arg === '--timeoutMs' && argv[i + 1]) {
      options.timeoutMs = parsePositiveNumber(argv[++i]) ?? options.timeoutMs
      continue
    }
    if (arg === '--requireEverything') {
      options.requireEverything = true
      continue
    }
    if (arg === '--requireEverythingTargets') {
      options.requireEverythingTargets = true
      continue
    }
    if (arg === '--requireTargets') {
      options.requireTargets = true
      continue
    }
    if (arg === '--requireApprefMs') {
      options.requireApprefMs = true
      continue
    }
    if (arg === '--requireShortcutArguments') {
      options.requireShortcutArguments = true
      continue
    }
    if (arg === '--requireShortcutWorkingDirectory') {
      options.requireShortcutWorkingDirectory = true
      continue
    }
    if (arg === '--strict') {
      options.strict = true
      continue
    }
    if (arg === '--compact') {
      options.pretty = false
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (options.targets.length === 0) {
    options.targets = [...DEFAULT_WINDOWS_CAPABILITY_TARGETS]
  }

  return options
}

function trimCommandOutput(value: string | Buffer | undefined): string {
  return Buffer.isBuffer(value) ? value.toString('utf8').trim() : String(value || '').trim()
}

async function runCommand(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<CommandCapture> {
  const startedAt = Date.now()
  const printableCommand = [command, ...args].join(' ')

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024
    })
    const normalizedStdout = trimCommandOutput(stdout)
    return {
      command: printableCommand,
      available: true,
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      stdoutLineCount: normalizedStdout ? normalizedStdout.split(/\r?\n/).length : 0,
      stderr: trimCommandOutput(stderr) || undefined,
      stdout: normalizedStdout
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: string | Buffer
      stderr?: string | Buffer
      code?: string | number
      signal?: string
      killed?: boolean
    }
    const normalizedStdout = trimCommandOutput(err.stdout)
    const normalizedStderr = trimCommandOutput(err.stderr)
    const exitCode = typeof err.code === 'number' ? err.code : null
    return {
      command: printableCommand,
      available: err.code !== 'ENOENT',
      exitCode,
      durationMs: Date.now() - startedAt,
      timedOut: err.killed || err.signal === 'SIGTERM',
      stdoutLineCount: normalizedStdout ? normalizedStdout.split(/\r?\n/).length : 0,
      stderr: normalizedStderr || undefined,
      error: err.message,
      stdout: normalizedStdout
    }
  }
}

async function runPowerShell(script: string, timeoutMs: number): Promise<CommandCapture> {
  return runCommand(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    timeoutMs
  )
}

function buildEverythingTargetProbe(target: string, query: CommandCapture | undefined) {
  const lines =
    query?.exitCode === 0 && query.stdout ? query.stdout.split(/\r?\n/).filter(Boolean) : []
  return {
    target,
    found: lines.length > 0,
    matchCount: lines.length,
    samples: lines.slice(0, 5)
  }
}

async function collectEverything(timeoutMs: number, targets: string[]) {
  const where = await runCommand('where', ['es.exe'], timeoutMs)
  const cliPaths = where.exitCode === 0 ? where.stdout.split(/\r?\n/).filter(Boolean) : []
  const version =
    cliPaths.length > 0 ? await runCommand(cliPaths[0], ['-version'], timeoutMs) : undefined
  const query =
    cliPaths.length > 0
      ? await runCommand(cliPaths[0], ['-n', '5', DEFAULT_EVERYTHING_QUERY], timeoutMs)
      : undefined
  const targetQueries =
    cliPaths.length > 0
      ? await Promise.all(
          targets.map(async (target) => ({
            target,
            query: await runCommand(cliPaths[0], ['-n', '5', target], timeoutMs)
          }))
        )
      : targets.map((target) => ({ target, query: undefined }))

  return {
    cliPaths,
    where,
    version,
    query: query
      ? {
          ...query,
          resultCount: query.exitCode === 0 && query.stdout ? query.stdout.split(/\r?\n/).length : 0
        }
      : undefined,
    targets: targetQueries.map(({ target, query }) => buildEverythingTargetProbe(target, query))
  }
}

async function collectStartApps(timeoutMs: number) {
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$apps = Get-StartApps | Sort-Object Name | ForEach-Object {',
    '  if (-not $_.Name -or -not $_.AppId) { return }',
    '  [PSCustomObject]@{ Name = [string]$_.Name; AppID = [string]$_.AppId }',
    '}',
    '$apps | ConvertTo-Json -Compress'
  ].join('\n')
  const result = await runPowerShell(script, timeoutMs)
  return result.exitCode === 0
    ? parsePowerShellJsonArray(result.stdout, normalizeStartAppRecord)
    : []
}

async function collectRegistryApps(timeoutMs: number): Promise<WindowsRegistryAppRecord[]> {
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    "$paths = @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')",
    '$apps = foreach ($path in $paths) {',
    '  Get-ItemProperty -Path $path -ErrorAction SilentlyContinue | ForEach-Object {',
    '    if (-not $_.DisplayName) { return }',
    '    [PSCustomObject]@{',
    '      DisplayName = [string]$_.DisplayName',
    '      DisplayIcon = [string]$_.DisplayIcon',
    '      InstallLocation = [string]$_.InstallLocation',
    '      Publisher = [string]$_.Publisher',
    '      SystemComponent = [int]($_.SystemComponent -as [int])',
    '      ReleaseType = [string]$_.ReleaseType',
    '      ParentKeyName = [string]$_.ParentKeyName',
    '    }',
    '  }',
    '}',
    '$apps | ConvertTo-Json -Compress'
  ].join('\n')
  const result = await runPowerShell(script, timeoutMs)
  return result.exitCode === 0
    ? parsePowerShellJsonArray(result.stdout, normalizeRegistryAppRecord)
    : []
}

function normalizeStartMenuEntry(entry: Record<string, unknown>): WindowsStartMenuEntry | null {
  const entryPath = typeof entry.Path === 'string' ? entry.Path.trim() : ''
  const name = typeof entry.Name === 'string' ? entry.Name.trim() : ''
  const extension = typeof entry.Extension === 'string' ? entry.Extension.trim().toLowerCase() : ''
  if (!entryPath || !name || !extension) return null

  const target = typeof entry.Target === 'string' ? entry.Target.trim() : ''
  const args = typeof entry.Arguments === 'string' ? entry.Arguments.trim() : ''
  const workingDirectory =
    typeof entry.WorkingDirectory === 'string' ? entry.WorkingDirectory.trim() : ''

  return {
    path: entryPath,
    name,
    extension,
    target: target || undefined,
    arguments: args || undefined,
    workingDirectory: workingDirectory || undefined
  }
}

async function collectStartMenuEntries(timeoutMs: number): Promise<WindowsStartMenuEntry[]> {
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$roots = @(\'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\', [System.IO.Path]::Combine($env:APPDATA, "Microsoft\\Windows\\Start Menu\\Programs"))',
    '$shell = New-Object -ComObject WScript.Shell',
    '$entries = foreach ($root in $roots) {',
    '  if (-not (Test-Path $root)) { continue }',
    '  Get-ChildItem -Path $root -Recurse -File -Include *.lnk,*.appref-ms,*.exe -ErrorAction SilentlyContinue | ForEach-Object {',
    '    $target = ""',
    '    $arguments = ""',
    '    $workingDirectory = ""',
    '    if ($_.Extension -ieq ".lnk") {',
    '      try {',
    '        $shortcut = $shell.CreateShortcut($_.FullName)',
    '        $target = [string]$shortcut.TargetPath',
    '        $arguments = [string]$shortcut.Arguments',
    '        $workingDirectory = [string]$shortcut.WorkingDirectory',
    '      } catch {}',
    '    }',
    '    [PSCustomObject]@{',
    '      Path = [string]$_.FullName',
    '      Name = [string]$_.BaseName',
    '      Extension = [string]$_.Extension',
    '      Target = $target',
    '      Arguments = $arguments',
    '      WorkingDirectory = $workingDirectory',
    '    }',
    '  }',
    '}',
    '$entries | ConvertTo-Json -Compress'
  ].join('\n')
  const result = await runPowerShell(script, timeoutMs)
  return result.exitCode === 0
    ? parsePowerShellJsonArray(result.stdout, normalizeStartMenuEntry)
    : []
}

function emptyCommand(command: string): CommandCapture {
  return {
    command,
    available: false,
    exitCode: null,
    durationMs: 0,
    stdout: ''
  }
}

function buildInstallerDryRunEvidence(installerPath: string | undefined) {
  if (!installerPath) return undefined

  const command = resolveWindowsInstallerCommand(installerPath)
  if (!command) {
    return {
      path: installerPath,
      supported: false,
      launchMode: 'manual-installer' as const,
      requestAppQuitAfterLaunch: false,
      unattendedAutoInstallEnabled: false as const,
      reason: 'unsupported-installer' as const
    }
  }

  return {
    path: installerPath,
    supported: true,
    type: command.type,
    command: command.command,
    args: command.args,
    launchMode: 'detached-handoff' as const,
    requestAppQuitAfterLaunch: true,
    unattendedAutoInstallEnabled: false as const
  }
}

async function buildEvidence(options: CliOptions) {
  if (process.platform !== 'win32') {
    return buildWindowsCapabilityEvidence(
      {
        generatedAt: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        targets: options.targets,
        powershell: emptyCommand('powershell'),
        everything: {
          cliPaths: [],
          where: emptyCommand('where es.exe'),
          targets: options.targets.map((target) => buildEverythingTargetProbe(target, undefined))
        },
        startApps: [],
        registryApps: [],
        startMenuEntries: [],
        installer: buildInstallerDryRunEvidence(options.installer)
      },
      {
        strict: options.strict,
        requireEverything: options.requireEverything,
        requireTargets: options.requireTargets,
        requireEverythingTargets: options.requireEverythingTargets,
        requireApprefMs: options.requireApprefMs,
        requireShortcutArguments: options.requireShortcutArguments,
        requireShortcutWorkingDirectory: options.requireShortcutWorkingDirectory
      }
    )
  }

  const powershell = await runPowerShell('$PSVersionTable.PSVersion.ToString()', options.timeoutMs)
  const [everything, startApps, registryApps, startMenuEntries] = await Promise.all([
    collectEverything(options.timeoutMs, options.targets),
    collectStartApps(options.timeoutMs),
    collectRegistryApps(options.timeoutMs),
    collectStartMenuEntries(options.timeoutMs)
  ])

  return buildWindowsCapabilityEvidence(
    {
      generatedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      targets: options.targets,
      powershell,
      everything,
      startApps,
      registryApps,
      startMenuEntries,
      installer: buildInstallerDryRunEvidence(options.installer)
    },
    {
      strict: options.strict,
      requireEverything: options.requireEverything,
      requireTargets: options.requireTargets,
      requireEverythingTargets: options.requireEverythingTargets,
      requireApprefMs: options.requireApprefMs,
      requireShortcutArguments: options.requireShortcutArguments,
      requireShortcutWorkingDirectory: options.requireShortcutWorkingDirectory
    }
  )
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const evidence = await buildEvidence(options)
  const json = JSON.stringify(evidence, null, options.pretty ? 2 : 0)
  console.log(json)

  if (options.output) {
    await fs.mkdir(path.dirname(path.resolve(options.output)), { recursive: true })
    await fs.writeFile(options.output, `${json}\n`, 'utf8')
  }

  if (options.strict && !evidence.gate.passed) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
