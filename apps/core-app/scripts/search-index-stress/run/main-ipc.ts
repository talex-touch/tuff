import { nextOperationId, operationError } from './cdp-driver'
import { DriverError, describeError } from './errors'
import type { PageSession } from './page-bridge'
import { runOperation } from './page-bridge'

export interface FileIndexStatusView {
  isInitializing: boolean
  initializationFailed: boolean
  startupPending: boolean
  stage: string | null
  current: number
  total: number
}

export interface FileIndexStatsView {
  totalFiles: number
  failedFiles: number
  completedFiles: number
}

/** Calls to the main process that the harness makes outside the search stream. */
export interface AppControl {
  call: <T = unknown>(name: string, data?: unknown, timeoutMs?: number) => Promise<T>
  /** Marks the first-run onboarding as done (search is refused until it is) and switches crash reporting off. */
  completeOnboarding: () => Promise<{ sentryDisabled: boolean }>
  fileIndexStatus: () => Promise<FileIndexStatusView>
  fileIndexStats: () => Promise<FileIndexStatsView>
  setContentIndexing: (enabled: boolean) => Promise<void>
  /** Asks the app to quit the way the window's close button does. */
  requestQuit: () => Promise<void>
  /** Opens the CoreBox window; only for `--ui show` runs, it takes the focus. */
  showCoreBox: () => Promise<void>
}

const APP_SETTING_KEY = 'app-setting.ini'
const SENTRY_KEY = 'sentry-config.json'

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function createAppControl(
  session: PageSession,
  options: { sliceMs?: number } = {}
): AppControl {
  const sliceMs = options.sliceMs ?? 1_000

  const call = async <T>(name: string, data?: unknown, timeoutMs = 15_000): Promise<T> => {
    const { final } = await runOperation(
      session,
      'callStart',
      [nextOperationId('c'), name, data ?? null, timeoutMs],
      { sliceMs }
    )
    const failure = operationError(final, name)
    if (failure) throw failure
    const reply = final.reply
    if (!reply) throw new DriverError('protocol', `${name}: no reply`)
    if (reply.code !== 200)
      throw new DriverError(
        'main-error',
        `${name} answered ${reply.code}: ${describeError(reply.data)}`
      )
    return reply.data as T
  }

  const save = async (key: string, value: unknown): Promise<void> => {
    const result = asRecord(
      await call('storage:app:save', { key, value, force: true, persist: true })
    )
    if (result.success !== true)
      throw new DriverError(
        'main-error',
        `saving ${key} was refused: ${String(result.reason ?? 'unknown reason')}`
      )
  }

  return {
    call,

    async completeOnboarding() {
      const current = asRecord(await call('storage:app:get', { key: APP_SETTING_KEY }))
      const beginner = asRecord(current.beginner)
      if (beginner.init !== true) {
        await save(APP_SETTING_KEY, { ...current, beginner: { ...beginner, init: true } })
        const after = asRecord(
          asRecord(await call('storage:app:get', { key: APP_SETTING_KEY })).beginner
        )
        if (after.init !== true)
          throw new DriverError(
            'main-error',
            'onboarding is still marked incomplete after saving the setting'
          )
      }
      try {
        await save(SENTRY_KEY, {
          ...asRecord(await call('storage:app:get', { key: SENTRY_KEY })),
          enabled: false,
          anonymous: true
        })
        return { sentryDisabled: true }
      } catch {
        return { sentryDisabled: false }
      }
    },

    async fileIndexStatus() {
      const status = asRecord(await call('app:file-index:status'))
      const progress = asRecord(status.progress)
      return {
        isInitializing: status.isInitializing === true,
        initializationFailed: status.initializationFailed === true,
        startupPending: status.startupPending === true,
        stage: typeof progress.stage === 'string' ? progress.stage : null,
        current: Number(progress.current ?? 0),
        total: Number(progress.total ?? 0)
      }
    },

    async fileIndexStats() {
      const stats = asRecord(await call('app:file-index:stats'))
      return {
        totalFiles: Number(stats.totalFiles ?? 0),
        failedFiles: Number(stats.failedFiles ?? 0),
        completedFiles: Number(stats.completedFiles ?? 0)
      }
    },

    async setContentIndexing(enabled) {
      await call('app:file-index:settings-update', { contentIndexingEnabled: enabled })
    },

    async showCoreBox() {
      await call('core-box:ui:show', null, 10_000)
    },

    async requestQuit() {
      await call('app:window:close', null, 5_000).catch((error: unknown) => {
        // The app may drop the connection while it quits; that is the answer.
        if (
          !(error instanceof DriverError) ||
          (error.kind !== 'page-missing' && error.kind !== 'timeout')
        )
          throw error
      })
    }
  }
}
