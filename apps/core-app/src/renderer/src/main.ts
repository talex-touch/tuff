import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

import router from './base/router'
import { baseNodeApi } from '~/modules/channel/main/node'
import { shortconApi } from '~/modules/channel/main/shortcon'
import { storageManager } from '~/modules/channel/storage'
import { setupPluginChannel } from '~/modules/adapter/plugin-adapter'
import { setupI18n } from '~/modules/lang'
import ElementPlus from 'element-plus'
import VWave from 'v-wave'

import { preloadDebugStep, preloadLog, preloadState } from '@talex-touch/utils/preload'

import './assets/main.css'
import '~/styles/element/index.scss'
import '~/styles/index.scss'

import 'uno.css'
import 'virtual:unocss-devtools'

window.$nodeApi = baseNodeApi
window.$shortconApi = shortconApi
window.$storage = storageManager

preloadState('start')
preloadLog('Bootstrapping Talex Touch renderer...')

async function bootstrap() {
  preloadDebugStep('Loading localization resources...', 0.05)
  const i18n = await setupI18n({ locale: 'zh-CN' })

  preloadDebugStep('Creating Vue application instance', 0.05)
  const app = createApp(App)

  preloadDebugStep('Registering plugins and global modules', 0.05)
  app.use(router).use(ElementPlus).use(createPinia()).use(VWave, {}).use(i18n)

  preloadDebugStep('Binding plugin communication channel', 0.05)
  setupPluginChannel()

  preloadDebugStep('Mounting renderer root container', 0.05)
  app.mount('#app')

  preloadDebugStep('Renderer shell mounted', 0.04)
}

bootstrap().catch((error) => {
  console.error('main.ts: Bootstrap process failed:', error)
})
