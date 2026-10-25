import {
  preloadDebugStep,
  preloadLog,
  preloadRemoveOverlay,
  preloadState
} from '@talex-touch/utils/preload'
import { initializeRendererStorage, isCoreBox } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { appSetting } from '~/modules/storage/app-storage'
import { devLog } from '~/utils/dev-log'
import { createRendererLogger } from '~/utils/renderer-log'
import { useCoreBox } from './core-box'
import { useStartupInfo } from './useStartupInfo'
import { useUpdateRuntime } from './useUpdateRuntime'
import { useReleaseNotesRuntime } from './useReleaseNotesRuntime'
import { useUrlProcessor } from './useUrlProcessor'

const lifecycleLog = createRendererLogger('useAppLifecycle')

/**
 * Application lifecycle management hook.
 * Handles complete application initialization and post-initialization tasks.
 */
export function useAppLifecycle() {
  /**
   * Execute main window tasks.
   * Skips update check on first launch before onboarding is complete.
   */
  async function executeMainTask(): Promise<void> {
    useUrlProcessor()
    const { checkApplicationUpgrade, setupUpdateListener } = useUpdateRuntime()
    const { evaluateStartup } = useReleaseNotesRuntime()

    setupUpdateListener()
    await evaluateStartup(Boolean(appSetting?.beginner?.init))

    if (!appSetting?.beginner?.init) {
      devLog('[useAppLifecycle] Skipping update check - beginner.init is false')
      return
    }

    void (async () => {
      const result = await checkApplicationUpgrade()
      // UpdateService is a foreground module, but the renderer can finish its warmup before
      // that module has registered its transport handlers. One bounded retry turns the old
      // startup `No handler registered for update:service:check` into a normal check without
      // delaying first paint or retrying a real network failure indefinitely.
      if (result !== undefined) return
      const { promise, resolve } = Promise.withResolvers<void>()
      setTimeout(resolve, 1_000)
      await promise
      await checkApplicationUpgrade()
    })()
  }

  /**
   * Execute CoreBox window tasks.
   */
  async function executeCoreboxTask(): Promise<void> {
    useCoreBox()
  }

  /**
   * Start application lifecycle after initialization.
   */
  async function start(): Promise<void> {
    if (isCoreBox()) {
      await executeCoreboxTask()
    } else {
      await executeMainTask()
    }
  }

  /**
   * Main application entry point.
   * Handles complete initialization sequence including SDK setup, storage initialization, and Sentry.
   */
  async function entry(onReady: () => Promise<void>): Promise<void> {
    try {
      const { startupInfo, ensureStartupContext } = useStartupInfo()
      if (!startupInfo.value) {
        preloadDebugStep('Requesting startup handshake...', 0.05)
        await ensureStartupContext()
        preloadDebugStep('Startup handshake acknowledged', 0.05)
      } else {
        preloadDebugStep('Using cached startup metadata', 0.02)
      }

      preloadDebugStep('Initializing Touch SDK and storage transport', 0.05)
      const transport = useTuffTransport()
      initializeRendererStorage(transport)

      preloadDebugStep('Initializing Sentry...', 0.01)
      void (async () => {
        try {
          const { initSentryRenderer } = await import('~/modules/sentry/sentry-renderer')
          await initSentryRenderer()
        } catch (error) {
          lifecycleLog.warn('Failed to initialize Sentry', error)
        }
      })()

      void (async () => {
        try {
          const { startRendererPerformanceTelemetry } =
            await import('~/modules/telemetry/performance')
          await startRendererPerformanceTelemetry()
        } catch (error) {
          lifecycleLog.warn('Failed to start performance telemetry', error)
        }
      })()

      preloadDebugStep('Running renderer warmup tasks', 0.05)
      await onReady()

      preloadDebugStep('Renderer warmup completed', 0.06)
      preloadState('finish')
      preloadLog('Tuff is ready.')
      preloadRemoveOverlay()

      await start()
    } catch (error) {
      lifecycleLog.error('Initialization failed', error)
      preloadLog('Renderer initialization failed. Check console output.')
    }
  }

  return {
    entry,
    start,
    executeMainTask,
    executeCoreboxTask
  }
}
