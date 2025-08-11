import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

import { SharedElementRouteGuard, SharedElementDirective } from 'v-shared-element'

import router from './base/router'
import { baseNodeApi } from '~/modules/channel/main/node'
import { shortconApi } from '~/modules/channel/main/shortcon'
import { storageManager } from '~/modules/channel/storage'
import { setupPluginChannel } from '~/modules/adapter/plugin-adapter'
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

router.beforeEach(SharedElementRouteGuard)

const app = createApp(App)
  .use(SharedElementDirective)
  .use(router)
  .use(ElementPlus)
  .use(createPinia())
  .use(VWave, {})

setupPluginChannel()

app.mount('#app').$nextTick(() => postMessage({ payload: 'removeLoading' }, '*'))
