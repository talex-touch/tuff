import {
  preloadDebugStep,
  preloadLog,
  preloadRemoveOverlay,
  preloadState,
} from '@talex-touch/utils/preload'
import { initStorageChannel, isCoreBox, useTouchSDK } from '@talex-touch/utils/renderer'
import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage/index'
import {
  shouldShowPlatformWarning,
  showPlatformCompatibilityWarning,
} from '~/modules/mention/platform-warning'
import { useCoreBox } from './core-box'
import { useApplicationUpgrade } from './useUpdate'
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
    const { checkApplicationUpgrade, setupUpdateListener } = useApplicationUpgrade()

    setupUpdateListener()

    if (!appSetting?.beginner?.init) {
      console.log('[useAppLifecycle] Skipping update check - beginner.init is false')
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
    }
    else {
      await executeMainTask()
    }
  }

  /**
   * Main application entry point.
   * Handles complete initialization sequence including SDK setup, storage initialization, and Sentry.
   */
  async function entry(onReady: () => Promise<void>): Promise<void> {
    try {
      if (!window.$startupInfo) {
        preloadDebugStep('Requesting startup handshake...', 0.05)
        const res: IStartupInfo = touchChannel.sendSync('app-ready', {
          rendererStartTime: performance.timeOrigin,
        })
        preloadDebugStep('Startup handshake acknowledged', 0.05)
        window.$startupInfo = res
      }
      else {
        preloadDebugStep('Using cached startup metadata', 0.02)
      }

      preloadDebugStep('Initializing Touch SDK and storage channels', 0.05)
      useTouchSDK({ channel: touchChannel })
      initStorageChannel(touchChannel)

      preloadDebugStep('Initializing Sentry...', 0.01)
      void (async () => {
        try {
          const { initSentryRenderer } = await import('~/modules/sentry/sentry-renderer')
          await initSentryRenderer()
        }
        catch (error) {
          console.warn('[useAppLifecycle] Failed to initialize Sentry', error)
        }
      })()

      preloadDebugStep('Running renderer warmup tasks', 0.05)
      await onReady()

      preloadDebugStep('Renderer warmup completed', 0.06)
      preloadState('finish')
      preloadLog('Tuff is ready.')
      preloadRemoveOverlay()

      await maybeShowPlatformWarning()

      await start()
    }
    catch (error) {
      console.error('[useAppLifecycle] Initialization failed', error)
      preloadLog('Renderer initialization failed. Check console output.')
    }
  }

  return {
    entry,
    start,
    executeMainTask,
    executeCoreboxTask,
  }
}

/**
 * 如果启动信息需要，则显示平台警告对话框
 */
async function maybeShowPlatformWarning(): Promise<void> {
  if (isCoreBox()) {
    return
  }

  if (!shouldShowPlatformWarning()) {
    return
  }

  const warningMessage = window.$startupInfo?.platformWarning
  if (!warningMessage) {
    return
  }

  try {
    await showPlatformCompatibilityWarning(warningMessage)
  }
  catch (error) {
    console.warn('[useAppLifecycle] 显示平台警告失败', error)
  }
}
