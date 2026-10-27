import {
  preloadDebugStep,
  preloadLog,
  preloadRemoveOverlay,
  preloadState
} from '@talex-touch/utils/preload'
import { initializeRendererStorage, isCoreBox } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { useI18nText } from '~/modules/lang'
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
  const { t } = useI18nText()

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

    checkApplicationUpgrade()
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
        preloadDebugStep(t('startup.overlay.handshake'), 0.05)
        await ensureStartupContext()
        preloadDebugStep(t('startup.overlay.handshakeDone'), 0.05)
      } else {
        preloadDebugStep(t('startup.overlay.cachedMetadata'), 0.02)
      }

      preloadDebugStep(t('startup.overlay.sdk'), 0.05)
      const transport = useTuffTransport()
      initializeRendererStorage(transport)

      preloadDebugStep(t('startup.overlay.sentry'), 0.01)
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

      preloadDebugStep(t('startup.overlay.warmup'), 0.05)
      await onReady()

      preloadDebugStep(t('startup.overlay.warmupDone'), 0.06)
      preloadState('finish')
      preloadLog(t('startup.overlay.ready'))
      preloadRemoveOverlay()

      await start()
    } catch (error) {
      lifecycleLog.error('Initialization failed', error)
      preloadLog(t('startup.overlay.failed'))
    }
  }

  return {
    entry,
    start,
    executeMainTask,
    executeCoreboxTask
  }
}
