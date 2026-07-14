import type { ChildProcess } from 'node:child_process'
import path from 'node:path'
import { shell } from 'electron'
import { getLogger } from '@talex-touch/utils/common/logger'
import { spawnSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { withOSAdapter } from '@talex-touch/utils/electron/env-tool'
import type { AppLaunchKind } from './app-types'

const appLaunchAdapterLog = getLogger('app-launcher')
const EARLY_EXIT_OBSERVATION_MS = 2500
const WINDOWS_DIRECT_EXECUTABLE_EXTENSIONS = new Set(['.exe', '.com'])
const WINDOWS_BATCH_EXTENSIONS = new Set(['.cmd', '.bat'])
const WINDOWS_POWERSHELL_EXTENSIONS = new Set(['.ps1'])

export interface AppLaunchPlan {
  path: string
  launchKind: AppLaunchKind
  launchTarget: string
  launchArgs: string[]
  workingDirectory?: string
}

export interface AppLaunchOutcome {
  status: 'success' | 'failed' | 'handedOff'
  error?: string
}

export interface AppLaunchAdapter {
  launch(plan: AppLaunchPlan): Promise<AppLaunchOutcome>
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getWindowsExtension(target: string): string {
  return path.win32.extname(target).toLowerCase()
}

function isWindowsDirectExecutable(target: string): boolean {
  return WINDOWS_DIRECT_EXECUTABLE_EXTENSIONS.has(getWindowsExtension(target))
}

function isWindowsShortcutFile(target: string): boolean {
  return getWindowsExtension(target) === '.lnk'
}

function isWindowsBatchFile(target: string): boolean {
  return WINDOWS_BATCH_EXTENSIONS.has(getWindowsExtension(target))
}

function isWindowsPowerShellFile(target: string): boolean {
  return WINDOWS_POWERSHELL_EXTENSIONS.has(getWindowsExtension(target))
}

function resolveWindowsShortcutShellPaths(plan: AppLaunchPlan): string[] {
  const candidates = [plan.path, plan.launchTarget].filter(isWindowsShortcutFile)
  return Array.from(new Set(candidates))
}

function getWindowsExecutableDirectory(target: string): string | undefined {
  const directory = path.win32.dirname(target)
  return directory && directory !== '.' && directory !== target ? directory : undefined
}

function resolveWindowsSpawnWorkingDirectory(plan: AppLaunchPlan): string | undefined {
  return (
    plan.workingDirectory ||
    (isWindowsDirectExecutable(plan.launchTarget) ||
    isWindowsBatchFile(plan.launchTarget) ||
    isWindowsPowerShellFile(plan.launchTarget)
      ? getWindowsExecutableDirectory(plan.launchTarget)
      : undefined)
  )
}

function observeEarlySpawnFailure(child: ChildProcess): Promise<AppLaunchOutcome> {
  const eventSource = child as ChildProcess & {
    once?: (event: string, listener: (...args: unknown[]) => void) => ChildProcess
    removeListener?: (event: string, listener: (...args: unknown[]) => void) => ChildProcess
  }

  if (typeof eventSource.once !== 'function') {
    return Promise.resolve({ status: 'handedOff' })
  }

  return new Promise((resolve) => {
    let settled = false
    let timer: NodeJS.Timeout | null = null

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (typeof eventSource.removeListener === 'function') {
        eventSource.removeListener('error', handleError)
        eventSource.removeListener('exit', handleExit)
      }
    }

    const finish = (outcome: AppLaunchOutcome) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(outcome)
    }

    const handleError = (error: unknown) => {
      finish({ status: 'failed', error: toErrorMessage(error) })
    }

    const handleExit = (code: unknown, signal: unknown) => {
      if (code === 0) {
        finish({ status: 'handedOff' })
        return
      }
      if ((code === null || code === undefined) && signal) {
        finish({ status: 'failed', error: `process exited early with signal ${String(signal)}` })
        return
      }
      if (code === null || code === undefined) {
        finish({ status: 'handedOff' })
        return
      }
      const suffix = signal ? `, signal ${String(signal)}` : ''
      finish({ status: 'failed', error: `process exited early with code ${String(code)}${suffix}` })
    }

    eventSource.once('error', handleError)
    eventSource.once('exit', handleExit)
    timer = setTimeout(() => finish({ status: 'handedOff' }), EARLY_EXIT_OBSERVATION_MS)
    timer.unref?.()
  })
}

async function launchShellPath(target: string): Promise<AppLaunchOutcome> {
  const errorMessage = await shell.openPath(target)
  if (errorMessage) {
    return { status: 'failed', error: errorMessage }
  }
  return { status: 'success' }
}

async function launchSpawnCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; observeEarlyExit?: boolean }
): Promise<AppLaunchOutcome> {
  const child = spawnSafe(command, args, {
    cwd: options?.cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })
  const outcome =
    options?.observeEarlyExit === false
      ? Promise.resolve<AppLaunchOutcome>({ status: 'handedOff' })
      : observeEarlySpawnFailure(child)
  child.unref()
  return await outcome
}

async function launchWindowsShortcut(plan: AppLaunchPlan): Promise<AppLaunchOutcome> {
  const shortcutShellPaths = resolveWindowsShortcutShellPaths(plan)
  if (shortcutShellPaths.length > 0) {
    let lastShellOutcome: AppLaunchOutcome | null = null
    for (const shortcutShellPath of shortcutShellPaths) {
      appLaunchAdapterLog.info(`Opening Windows shortcut via shell: ${shortcutShellPath}`)
      lastShellOutcome = await launchShellPath(shortcutShellPath)
      if (lastShellOutcome.status !== 'failed') {
        return lastShellOutcome
      }
    }
    if (isWindowsShortcutFile(plan.launchTarget)) {
      return (
        lastShellOutcome || {
          status: 'failed',
          error: 'shell shortcut launch failed'
        }
      )
    }
    appLaunchAdapterLog.warn(
      `Shell shortcut launch failed, falling back to target: ${plan.launchTarget}`
    )
  }

  const cwd = resolveWindowsSpawnWorkingDirectory(plan)
  if (isWindowsBatchFile(plan.launchTarget)) {
    appLaunchAdapterLog.info(`Launching Windows command script: ${plan.launchTarget}`)
    return await launchSpawnCommand(
      'cmd.exe',
      ['/d', '/s', '/c', plan.launchTarget, ...plan.launchArgs],
      { cwd }
    )
  }

  if (isWindowsPowerShellFile(plan.launchTarget)) {
    appLaunchAdapterLog.info(`Launching Windows PowerShell script: ${plan.launchTarget}`)
    return await launchSpawnCommand(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', plan.launchTarget, ...plan.launchArgs],
      { cwd }
    )
  }

  appLaunchAdapterLog.info(`Launching shortcut app: ${plan.launchTarget}`)
  return await launchSpawnCommand(plan.launchTarget, plan.launchArgs, { cwd })
}

const windowsAppLaunchAdapter: AppLaunchAdapter = {
  async launch(plan) {
    switch (plan.launchKind) {
      case 'shortcut':
        return await launchWindowsShortcut(plan)
      case 'uwp': {
        const explorerTarget = `shell:AppsFolder\\${plan.launchTarget}`
        appLaunchAdapterLog.info(`Launching Windows Store app: ${explorerTarget}`)
        return await launchSpawnCommand('explorer.exe', [explorerTarget], {
          observeEarlyExit: false
        })
      }
      case 'protocol':
        appLaunchAdapterLog.info(`Launching protocol app: ${plan.launchTarget}`)
        await shell.openExternal(plan.launchTarget)
        return { status: 'success' }
      case 'path':
        if (isWindowsDirectExecutable(plan.launchTarget)) {
          appLaunchAdapterLog.info(`Launching Windows executable app: ${plan.launchTarget}`)
          return await launchSpawnCommand(plan.launchTarget, plan.launchArgs, {
            cwd: resolveWindowsSpawnWorkingDirectory(plan)
          })
        }
        appLaunchAdapterLog.info(`Opening app: ${plan.launchTarget}`)
        return await launchShellPath(plan.launchTarget)
    }
  }
}

async function launchNonWindowsApp(plan: AppLaunchPlan): Promise<AppLaunchOutcome> {
  switch (plan.launchKind) {
    case 'shortcut':
      appLaunchAdapterLog.info(`Launching shortcut app: ${plan.launchTarget}`)
      return await launchSpawnCommand(plan.launchTarget, plan.launchArgs, {
        cwd: plan.workingDirectory
      })
    case 'uwp':
      return {
        status: 'failed',
        error: 'UWP app launch is only supported on Windows'
      }
    case 'protocol':
      appLaunchAdapterLog.info(`Launching protocol app: ${plan.launchTarget}`)
      await shell.openExternal(plan.launchTarget)
      return { status: 'success' }
    case 'path':
      appLaunchAdapterLog.info(`Opening app: ${plan.launchTarget}`)
      return await launchShellPath(plan.launchTarget)
  }
}

const darwinAppLaunchAdapter: AppLaunchAdapter = {
  launch: launchNonWindowsApp
}

const linuxAppLaunchAdapter: AppLaunchAdapter = {
  launch: launchNonWindowsApp
}

const unsupportedAppLaunchAdapter: AppLaunchAdapter = {
  async launch() {
    return {
      status: 'failed',
      error: 'App launch is not supported on this platform'
    }
  }
}

export async function launchWithAppLaunchAdapter(plan: AppLaunchPlan): Promise<AppLaunchOutcome> {
  const adapter =
    withOSAdapter({
      win32: () => windowsAppLaunchAdapter,
      darwin: () => darwinAppLaunchAdapter,
      linux: () => linuxAppLaunchAdapter
    }) || unsupportedAppLaunchAdapter

  return await adapter.launch(plan)
}
