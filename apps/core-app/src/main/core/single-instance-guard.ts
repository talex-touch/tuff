import type { Event } from 'electron'
import type { AppSecondaryLaunch, TalexEvents } from './eventbus/touch-event'

type SecondInstanceHandler = (
  event: Event,
  argv: string[],
  workingDirectory: string,
  additionalData: unknown
) => void

export interface SingleInstanceAppLike {
  requestSingleInstanceLock: () => boolean
  on: (event: 'second-instance', handler: SecondInstanceHandler) => void
  quit: () => void
}

export interface SingleInstanceGuardLogger {
  info?: (message: unknown, options?: unknown) => void
  warn?: (message: unknown, options?: unknown) => void
}

export interface SetupSingleInstanceGuardOptions {
  app: SingleInstanceAppLike
  startupBenchmarkMode: boolean
  emitSecondaryLaunch: (eventName: TalexEvents, payload: AppSecondaryLaunch) => void
  createSecondaryLaunchEvent: (
    event: Event,
    argv: string[],
    workingDirectory: string,
    additionalData: Record<string, unknown>
  ) => AppSecondaryLaunch
  secondaryLaunchEventName: TalexEvents
  logger?: SingleInstanceGuardLogger
}

export function setupSingleInstanceGuard({
  app,
  startupBenchmarkMode,
  emitSecondaryLaunch,
  createSecondaryLaunchEvent,
  secondaryLaunchEventName,
  logger
}: SetupSingleInstanceGuardOptions): boolean {
  if (startupBenchmarkMode) {
    logger?.info?.('Startup benchmark mode enabled, skip single-instance lock')
    return true
  }

  const hasSingleInstanceLock = app.requestSingleInstanceLock()
  if (!hasSingleInstanceLock) {
    logger?.warn?.('Secondary launch detected in duplicate process, quitting duplicate instance')
    app.quit()
    return false
  }

  app.on('second-instance', (event, argv, workingDirectory, additionalData) => {
    const launchData =
      typeof additionalData === 'object' && additionalData !== null
        ? (additionalData as Record<string, unknown>)
        : {}

    emitSecondaryLaunch(
      secondaryLaunchEventName,
      createSecondaryLaunchEvent(event, argv, workingDirectory, launchData)
    )
  })

  return true
}
