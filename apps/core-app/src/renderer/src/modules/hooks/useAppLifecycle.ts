import { initStorageChannel, isCoreBox, useTouchSDK } from '@talex-touch/utils/renderer'
import { touchChannel } from '~/modules/channel/channel-core'
import {
  preloadDebugStep,
  preloadLog,
  preloadRemoveOverlay,
  preloadState
} from '@talex-touch/utils/preload'
import { appSetting } from '~/modules/channel/storage/index'
import { useApplicationUpgrade } from './useUpdate'
import { useCoreBox } from './core-box'
import { nextTick } from 'vue'

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
    console.log('[useAppLifecycle] executeMainTask - appSetting.data:', JSON.parse(JSON.stringify(appSetting.data)))
    console.log('[useAppLifecycle] executeMainTask - beginner.init:', appSetting.data?.beginner?.init)

    const { checkApplicationUpgrade, setupUpdateListener } = useApplicationUpgrade()

    setupUpdateListener()

    if (!appSetting.data?.beginner?.init) {
      console.log('[useAppLifecycle] Skipping update check - beginner.init is false')
      return
    }

    console.log('[useAppLifecycle] Checking for application upgrade')
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
      preloadDebugStep('Requesting startup handshake...', 0.05)
      const res: IStartupInfo = touchChannel.sendSync('app-ready', {
        rendererStartTime: performance.timeOrigin
      })
      preloadDebugStep('Startup handshake acknowledged', 0.05)

      window.$startupInfo = res

      preloadDebugStep('Initializing Touch SDK and storage channels', 0.05)
      useTouchSDK({ channel: touchChannel })
      console.log('[useAppLifecycle] Before initStorageChannel')
      initStorageChannel(touchChannel)
      console.log('[useAppLifecycle] After initStorageChannel')

      // Wait for Vue's reactivity system to process storage updates
      await nextTick()
      console.log('[useAppLifecycle] After nextTick - appSetting.data:', JSON.parse(JSON.stringify(appSetting.data)))

      preloadDebugStep('Initializing Sentry...', 0.01)
      void (async () => {
        try {
          const { initSentryRenderer } = await import('~/modules/sentry/sentry-renderer')
          await initSentryRenderer()
        } catch (error) {
          console.warn('[useAppLifecycle] Failed to initialize Sentry', error)
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
