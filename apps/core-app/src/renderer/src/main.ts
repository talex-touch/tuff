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

import './assets/main.css'
import '~/styles/element/index.scss'
import '~/styles/index.scss'

import 'uno.css'
import 'virtual:unocss-devtools'

window.$nodeApi = baseNodeApi
window.$shortconApi = shortconApi
window.$storage = storageManager

async function bootstrap() {
  const i18n = await setupI18n({ locale: 'zh-CN' })
  const app = createApp(App)
  app.use(router).use(ElementPlus).use(createPinia()).use(VWave, {}).use(i18n)
  app.mount('#app')
}

bootstrap().catch((error) => {
  console.error('main.ts: Bootstrap process failed:', error)
})
