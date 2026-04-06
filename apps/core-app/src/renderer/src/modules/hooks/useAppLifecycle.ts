import type { IStorageChannel } from '@talex-touch/utils/renderer/storage'
import {
  preloadDebugStep,
  preloadLog,
  preloadRemoveOverlay,
  preloadState
} from '@talex-touch/utils/preload'
import {
  initStorageChannel,
  initStorageTransport,
  isCoreBox,
  useChannel
} from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { appSetting } from '~/modules/channel/storage/index'
import { devLog } from '~/utils/dev-log'
import { useCoreBox } from './core-box'
import { useStartupInfo } from './useStartupInfo'
import { useUpdateRuntime } from './useUpdateRuntime'
import { useUrlProcessor } from './useUrlProcessor'

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

    setupUpdateListener()

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
      const { startupInfo, ensureStartupInfo } = useStartupInfo()
      if (!startupInfo.value) {
        preloadDebugStep('Requesting startup handshake...', 0.05)
        await ensureStartupInfo()
        preloadDebugStep('Startup handshake acknowledged', 0.05)
      } else {
        preloadDebugStep('Using cached startup metadata', 0.02)
      }

      preloadDebugStep('Initializing Touch SDK and storage channels', 0.05)
      const transport = useTuffTransport()
      const channel = resolveStorageChannel()
      if (channel) {
        initStorageTransport(transport)
        initStorageChannel(channel)
      }

      preloadDebugStep('Initializing Sentry...', 0.01)
      void (async () => {
        try {
          const { initSentryRenderer } = await import('~/modules/sentry/sentry-renderer')
          await initSentryRenderer()
        } catch (error) {
          console.warn('[useAppLifecycle] Failed to initialize Sentry', error)
        }
      })()

      void (async () => {
        try {
          const { startRendererPerformanceTelemetry } =
            await import('~/modules/telemetry/performance')
          await startRendererPerformanceTelemetry()
        } catch (error) {
          console.warn('[useAppLifecycle] Failed to start performance telemetry', error)
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
      console.error('[useAppLifecycle] Initialization failed', error)
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

function resolveStorageChannel(): IStorageChannel | null {
  try {
    const channel = useChannel()
    if (typeof channel.send === 'function' && typeof channel.unRegChannel === 'function') {
      return channel as IStorageChannel
    }
  } catch {
    // Channel may not be ready during early lifecycle warmup.
  }
  return null
}
