import type { AppLaunchKind } from './app-types'
import { launchWithAppLaunchAdapter, type AppLaunchOutcome } from './app-launch-adapter'
import { notificationModule } from '../../../notification'
import { t } from '../../../../utils/i18n-helper'
import { getLogger } from '@talex-touch/utils/common/logger'

const appLauncherLog = getLogger('app-launcher')

export interface AppLaunchRequest {
  name?: string
  path: string
  launchKind: AppLaunchKind
  launchTarget: string
  launchArgs?: string
  workingDirectory?: string
  sourceItemId?: string
}

export type { AppLaunchOutcome }

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

function isAllowedProtocolLaunch(target: string): boolean {
  return /^steam:\/\/rungameid\/\d+$/i.test(target.trim())
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

export async function launchApp(request: AppLaunchRequest): Promise<AppLaunchOutcome> {
  try {
    if (request.launchKind === 'protocol' && !isAllowedProtocolLaunch(request.launchTarget)) {
      const error = `Protocol launch is not allowed: ${request.launchTarget}`
      appLauncherLog.warn(error)
      notifyLaunchFailure(request, error)
      return { status: 'failed', error }
    }

    const outcome = await launchWithAppLaunchAdapter({
      path: request.path,
      launchKind: request.launchKind,
      launchTarget: request.launchTarget,
      launchArgs: splitLaunchArgs(request.launchArgs),
      workingDirectory: request.workingDirectory
    })
    if (outcome.status === 'failed' && outcome.error) {
      notifyLaunchFailure(request, outcome.error)
    }
    return outcome
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
