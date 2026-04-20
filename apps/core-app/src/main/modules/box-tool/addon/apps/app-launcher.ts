import type { ChildProcess } from 'node:child_process'
import type { AppLaunchKind } from './app-types'
import { spawnSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { shell } from 'electron'
import { notificationModule } from '../../../notification'
import { t } from '../../../../utils/i18n-helper'
import { getLogger } from '@talex-touch/utils/common/logger'

const appLauncherLog = getLogger('app-launcher')
const EARLY_EXIT_OBSERVATION_MS = 2500

export interface AppLaunchRequest {
  name?: string
  path: string
  launchKind: AppLaunchKind
  launchTarget: string
  launchArgs?: string
  workingDirectory?: string
  sourceItemId?: string
}

export interface AppLaunchOutcome {
  status: 'success' | 'failed' | 'handedOff'
  error?: string
}

export function splitLaunchArgs(rawArgs?: string): string[] {
  if (!rawArgs) return []

  const args: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < rawArgs.length; i += 1) {
    const char = rawArgs[i]
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && /\s/.test(char)) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (current) {
    args.push(current)
  }

  return args
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getAppDisplayName(request: AppLaunchRequest): string {
  return request.name || request.launchTarget || request.path
}

function notifyLaunchFailure(request: AppLaunchRequest, error: string): void {
  const name = getAppDisplayName(request)
  notificationModule.showInternalSystemNotification({
    title: t('notifications.appLaunchFailedTitle'),
    message: t('notifications.appLaunchFailedBody', { name, error }),
    level: 'error',
    system: { silent: false }
  })
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
  })
}

async function launchSpawnCommand(
  command: string,
  args: string[],
  options?: { cwd?: string }
): Promise<AppLaunchOutcome> {
  const child = spawnSafe(command, args, {
    cwd: options?.cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })
  const outcome = observeEarlySpawnFailure(child)
  child.unref()
  return await outcome
}

export async function launchApp(request: AppLaunchRequest): Promise<AppLaunchOutcome> {
  try {
    if (request.launchKind === 'shortcut') {
      appLauncherLog.info(`Launching shortcut app: ${request.launchTarget}`)
      const outcome = await launchSpawnCommand(
        request.launchTarget,
        splitLaunchArgs(request.launchArgs),
        { cwd: request.workingDirectory }
      )
      if (outcome.status === 'failed' && outcome.error) {
        notifyLaunchFailure(request, outcome.error)
      }
      return outcome
    }

    if (request.launchKind === 'uwp') {
      const explorerTarget = `shell:AppsFolder\\${request.launchTarget}`
      appLauncherLog.info(`Launching Windows Store app: ${explorerTarget}`)
      const outcome = await launchSpawnCommand('explorer.exe', [explorerTarget])
      if (outcome.status === 'failed' && outcome.error) {
        notifyLaunchFailure(request, outcome.error)
      }
      return outcome
    }

    appLauncherLog.info(`Opening app: ${request.launchTarget}`)
    const errorMessage = await shell.openPath(request.launchTarget)
    if (errorMessage) {
      notifyLaunchFailure(request, errorMessage)
      return { status: 'failed', error: errorMessage }
    }

    return { status: 'success' }
  } catch (error) {
    const message = toErrorMessage(error)
    notifyLaunchFailure(request, message)
    return { status: 'failed', error: message }
  }
}

export function scheduleAppLaunch(request: AppLaunchRequest): void {
  setImmediate(() => {
    void launchApp(request).catch((error) => {
      const message = toErrorMessage(error)
      appLauncherLog.error(`Unhandled app launch failure: ${message}`)
      notifyLaunchFailure(request, message)
    })
  })
}
