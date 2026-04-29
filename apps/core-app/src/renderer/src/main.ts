import { setRuntimeEnv } from '@talex-touch/utils/env'
import { preloadDebugStep, preloadLog, preloadState } from '@talex-touch/utils/preload'
import { initStorageChannel, initStorageTransport, useChannel } from '@talex-touch/utils/renderer'
import { isAssistantWindow, isCoreBox } from '@talex-touch/utils/renderer/hooks/arg-mapper'
import type { IStorageChannel } from '@talex-touch/utils/renderer/storage'
import { appSettings } from '@talex-touch/utils/renderer/storage'
import { initStorageSubscription } from '@talex-touch/utils/renderer/storage/storage-subscription'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'

import { createPinia } from 'pinia'
import type { Router } from 'vue-router'
import { createSharedElementDirective, SharedElementRouteGuard } from 'v-shared-element'
import VWave from 'v-wave'
import { createApp } from 'vue'
import { registerDefaultCustomRenderers } from '~/modules/box/custom-render'
import { appSetting } from '~/modules/channel/storage'
import type { I18nInstance } from '~/modules/lang/i18n'
import {
  readLegacyLanguagePreferenceSnapshot,
  resolveInitialLanguagePreference,
  setupI18n
} from '~/modules/lang'
import { registerBuildVerificationListener } from '~/modules/build-verification/register-build-verification'
import { registerBatteryStatusListener } from '~/modules/hooks/useBatteryOptimizer'
import { registerNotificationHub } from '~/modules/notification/notification-hub'
import { registerPluginInstallListener } from '~/modules/plugin/plugin-install-listener'

import { usePluginStore } from '~/stores/plugin'
import { createRendererLogger } from '~/utils/renderer-log'

import App from './App.vue'

import '~/modules/channel/channel-core'
import '~/modules/auth/account-channel'
import '~/modules/plugin/widget-registry'
import './assets/main.css'
import '@talex-touch/tuffex/style.css'
import '~/styles/index.scss'

import '~/styles/accessibility.scss'
import 'vue-sonner/style.css'
import 'uno.css'

import 'virtual:unocss-devtools'

setRuntimeEnv(import.meta.env as Record<string, string | undefined>)

const transport = useTuffTransport()
const mainLog = createRendererLogger('RendererMain')

let router: Router | null = null
let routerEventsRegistered = false
let lifecycleEventsRegistered = false

registerNotificationHub(transport)
registerBuildVerificationListener(transport)
registerBatteryStatusListener()
registerLifecycleEvents()

function initializeRendererStorage(): void {
  const channel = resolveStorageChannel()
  if (!channel) {
    return
  }

  initStorageTransport(transport)
  initStorageChannel(channel)
  initStorageSubscription(channel, transport)
}

function resolveStorageChannel(): IStorageChannel | null {
  try {
    const channel = useChannel()
    if (typeof channel.send === 'function' && typeof channel.unRegChannel === 'function') {
      return channel as IStorageChannel
    }
  } catch {
    // Storage channel can be unavailable during early renderer bootstrap.
  }
  return null
}

function registerRouterEvents(instance: Router): void {
  if (routerEventsRegistered) {
    return
  }
  routerEventsRegistered = true

  transport.on(AppEvents.window.navigate, (payload) => {
    const target = typeof payload?.path === 'string' ? payload.path : ''
    const normalized = target === '/clipboard' ? '/details' : target
    if (normalized) {
      instance.push(normalized).catch(() => {})
    }
  })

  transport.on(AppEvents.window.openDownloadCenter, () => {
    instance.push('/downloads').catch(() => {})
  })
}

function registerLifecycleEvents(): void {
  if (lifecycleEventsRegistered) {
    return
  }
  lifecycleEventsRegistered = true

  transport.on(AppEvents.lifecycle.beforeQuit, async () => {
    try {
      await transport.flush()
    } catch {
      // ignore flush failures during shutdown
    } finally {
      transport.destroy()
    }
  })
}

async function ensureRouter(): Promise<Router> {
  if (router) {
    return router
  }

  const module = await import('./base/router')
  router = module.default
  router.beforeEach(SharedElementRouteGuard)
  registerRouterEvents(router)
  return router
}

preloadState('start')
preloadLog('Bootstrapping Talex Touch renderer...')

registerDefaultCustomRenderers()

/**
 * Orchestrate renderer initialization and mount the Vue root.
 */
async function bootstrap() {
  initializeRendererStorage()
  await appSettings.whenHydrated()
  const router = await ensureRouter()
  const initialLanguage = resolveInitialLanguage()
  const i18n = await runBootStep('Loading localization resources...', 0.05, () =>
    setupI18n({ locale: initialLanguage })
  )

  const app = await runBootStep('Creating Vue application instance', 0.05, () => createApp(App))

  await runBootStep('Registering plugins and global modules', 0.05, () => {
    registerCorePlugins(app, i18n, router)
    registerPluginInstallListener(transport, router)
    // Expose router to window for MetaOverlay access
    window.__VUE_ROUTER__ = router
  })

  await runBootStep('Initializing plugin store', 0.05, () => maybeInitializePluginStore())

  await runBootStep('Mounting renderer root container', 0.05, () => {
    app.mount('#app')
  })

  preloadDebugStep('Renderer shell mounted', 0.02)
}

/**
 * Resolve the initial locale using persisted settings or sensible defaults.
 */
function resolveInitialLanguage() {
  const legacy = readLegacyLanguagePreferenceSnapshot()
  return resolveInitialLanguagePreference({
    settingLocale: appSetting?.lang?.locale,
    settingFollowSystem: appSetting?.lang?.followSystem,
    legacyLocale: legacy.locale,
    legacyFollowSystem: legacy.followSystem,
    browserLanguage: navigator.language,
    intlLocale: Intl.DateTimeFormat().resolvedOptions().locale
  }).locale
}

/**
 * Register shared renderer plugins and global modules.
 */
function registerCorePlugins(
  app: ReturnType<typeof createApp>,
  i18n: I18nInstance,
  router: Router
) {
  app.use(router).use(createPinia()).use(VWave, {}).use(i18n).use(createSharedElementDirective())
}

/**
 * Initialize the plugin store unless CoreBox mode is active.
 */
async function maybeInitializePluginStore() {
  if (isCoreBox() || isAssistantWindow()) {
    return
  }
  const pluginStore = usePluginStore()
  await pluginStore.initialize()
}

/**
 * Wrap a boot task and report its progress to the preload overlay.
 */
async function runBootStep<T>(message: string, progress: number, task: () => T | Promise<T>) {
  preloadDebugStep(message, progress)
  return await task()
}

bootstrap().catch((error) => {
  mainLog.error('Bootstrap process failed', error)
})
