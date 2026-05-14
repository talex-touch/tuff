import '~/modules/channel/channel-core'
import { setRuntimeEnv } from '@talex-touch/utils/env'
import { preloadDebugStep, preloadLog, preloadState } from '@talex-touch/utils/preload'
import { initializeRendererStorage } from '@talex-touch/utils/renderer'
import { isAssistantWindow, isCoreBox } from '@talex-touch/utils/renderer/hooks/arg-mapper'
import { appSettings } from '@talex-touch/utils/renderer/storage'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'

import { createPinia } from 'pinia'
import type { Router } from 'vue-router'
import { createApp } from 'vue'
import { registerDefaultCustomRenderers } from '~/modules/box/custom-render'
import { appSetting } from '~/modules/storage/app-storage'
import type { I18nInstance } from '~/modules/lang/i18n'
import { resolveInitialLanguagePreference, setupI18n } from '~/modules/lang'
import { registerNotificationHub } from '~/modules/notification/notification-hub'

import { createRendererLogger } from '~/utils/renderer-log'

import App from './App.vue'

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
const rendererBootstrapStartedAt = performance.now()
const isLightweightWindow = isCoreBox() || isAssistantWindow()

let router: Router | null = null
let routerEventsRegistered = false
let lifecycleEventsRegistered = false

registerNotificationHub(transport)
registerMainWindowSideEffects()
registerLifecycleEvents()

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

  const [routerModule, sharedElementModule] = await Promise.all([
    import('./base/router'),
    import('v-shared-element')
  ])
  router = routerModule.default
  const { SharedElementRouteGuard } = sharedElementModule
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
  initializeRendererStorage(transport)
  await appSettings.whenHydrated()
  const router = isLightweightWindow ? null : await ensureRouter()
  const initialLanguage = resolveInitialLanguage()
  const i18n = await runBootStep('Loading localization resources...', 0.05, () =>
    setupI18n({ locale: initialLanguage })
  )

  const app = await runBootStep('Creating Vue application instance', 0.05, () => createApp(App))

  await runBootStep('Registering plugins and global modules', 0.05, () => {
    return registerCorePlugins(app, i18n, router)
  })

  if (router) {
    await runBootStep('Registering main window modules', 0.05, async () => {
      const { registerPluginInstallListener } =
        await import('~/modules/plugin/plugin-install-listener')
      registerPluginInstallListener(transport, router)
      window.__VUE_ROUTER__ = router
    })
  }

  await runBootStep('Mounting renderer root container', 0.05, () => {
    app.mount('#app')
  })

  const mountBeforeMs = Math.round(performance.now() - rendererBootstrapStartedAt)
  mainLog.info('Renderer shell mounted', { mountBeforeMs })
  schedulePluginStoreInitialization()

  preloadDebugStep('Renderer shell mounted', 0.02)
}

/**
 * Resolve the initial locale using persisted settings or sensible defaults.
 */
function resolveInitialLanguage() {
  return resolveInitialLanguagePreference({
    settingLocale: appSetting?.lang?.locale,
    settingFollowSystem: appSetting?.lang?.followSystem,
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
  router: Router | null
) {
  app.use(createPinia()).use(i18n)
  if (!router) {
    return
  }

  return Promise.all([import('v-wave'), import('v-shared-element')]).then(
    ([vWaveModule, sharedElementModule]) => {
      app
        .use(router)
        .use(vWaveModule.default, {})
        .use(sharedElementModule.createSharedElementDirective())
    }
  )
}

/**
 * Register main-window-only side-effect modules.
 */
function registerMainWindowSideEffects(): void {
  if (isLightweightWindow) {
    return
  }

  void import('~/modules/auth/account-channel').catch((error) => {
    mainLog.error('Failed to register account channel', error)
  })

  void import('~/modules/build-verification/register-build-verification')
    .then(({ registerBuildVerificationListener }) => {
      registerBuildVerificationListener(transport)
    })
    .catch((error) => {
      mainLog.error('Failed to register build verification listener', error)
    })
}

/**
 * Initialize the plugin store unless CoreBox mode is active.
 */
async function maybeInitializePluginStore() {
  if (isLightweightWindow) {
    return
  }
  const { usePluginStore } = await import('~/stores/plugin')
  const pluginStore = usePluginStore()
  await pluginStore.initialize()
}

function schedulePluginStoreInitialization() {
  window.setTimeout(() => {
    const startedAt = performance.now()
    void maybeInitializePluginStore()
      .then(() => {
        mainLog.info('Plugin store initialized in background', {
          durationMs: Math.round(performance.now() - startedAt)
        })
      })
      .catch((error) => {
        mainLog.error('Background plugin store initialization failed', error)
      })
  }, 0)
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
