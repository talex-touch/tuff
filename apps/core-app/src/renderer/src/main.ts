import { preloadDebugStep, preloadLog, preloadState } from '@talex-touch/utils/preload'
import { isCoreBox } from '@talex-touch/utils/renderer/hooks/arg-mapper'
import ElementPlus from 'element-plus'

import { createPinia } from 'pinia'
import VWave from 'v-wave'
import { createApp } from 'vue'
import { registerDefaultCustomRenderers } from '~/modules/box/custom-render'
import { baseNodeApi } from '~/modules/channel/main/node'
import { shortconApi } from '~/modules/channel/main/shortcon'
import { storageManager } from '~/modules/channel/storage'
import { setupI18n } from '~/modules/lang'
import '~/modules/plugin/widget-registry'

import {
  createSharedElementDirective,
  SharedElementRouteGuard
} from 'v-shared-element'

import { usePluginStore } from '~/stores/plugin'
import App from './App.vue'

import router from './base/router'
import './assets/main.css'
import '~/styles/element/index.scss'
import '~/styles/index.scss'
import '~/styles/accessibility.scss'

import 'vue-sonner/style.css'
import 'uno.css'
import 'virtual:unocss-devtools'

window.$nodeApi = baseNodeApi
window.$shortconApi = shortconApi
window.$storage = storageManager

preloadState('start')
preloadLog('Bootstrapping Talex Touch renderer...')

registerDefaultCustomRenderers()
router.beforeEach(SharedElementRouteGuard)

/**
 * Orchestrate renderer initialization and mount the Vue root.
 */
async function bootstrap() {
  const initialLanguage = resolveInitialLanguage()
  const i18n = await runBootStep('Loading localization resources...', 0.05, () =>
    setupI18n({ locale: initialLanguage })
  )
  ;(window as any).$i18n = i18n

  const app = await runBootStep('Creating Vue application instance', 0.05, () => createApp(App))

  await runBootStep('Registering plugins and global modules', 0.05, () =>
    registerCorePlugins(app, i18n)
  )

  await runBootStep('Initializing plugin store', 0.05, () => maybeInitializePluginStore())

  await runBootStep('Mounting renderer root container', 0.05, () => {
    app.mount('#app')
  })

  preloadDebugStep('Renderer shell mounted', 0.02)
}

const DEFAULT_LOCALE = 'zh-CN'

/**
 * Resolve the initial locale using persisted settings or sensible defaults.
 */
function resolveInitialLanguage() {
  const storedLanguage = localStorage.getItem('app-language')
  if (storedLanguage) {
    return storedLanguage
  }

  const followSystem = localStorage.getItem('app-follow-system-language') === 'true'
  if (!followSystem) {
    return DEFAULT_LOCALE
  }

  const systemLang = navigator.language || 'en-US'
  if (systemLang.startsWith('zh')) {
    return 'zh-CN'
  }
  if (systemLang.startsWith('en')) {
    return 'en-US'
  }
  return DEFAULT_LOCALE
}

/**
 * Register shared renderer plugins and global modules.
 */
function registerCorePlugins(app: ReturnType<typeof createApp>, i18n: any) {
  app
    .use(router)
    .use(ElementPlus)
    .use(createPinia())
    .use(VWave, {})
    .use(i18n)
    .use(createSharedElementDirective())
}

/**
 * Initialize the plugin store unless CoreBox mode is active.
 */
async function maybeInitializePluginStore() {
  if (isCoreBox()) {
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
  console.error('main.ts: Bootstrap process failed:', error)
})
