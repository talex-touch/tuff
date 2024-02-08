import { createApp } from 'vue'
import App from './App.vue'

import {
    SharedElementRouteGuard,
    SharedElementDirective
} from 'v-shared-element'

import router from './base/router'
import { baseNodeApi } from '~/modules/channel/main/node'
import { storageManager } from '~/modules/channel/storage'
import ElementPlus from 'element-plus'
import VWave from 'v-wave'

import '~/styles/index.scss'
import 'element-plus/theme-chalk/dark/css-vars.css'

import '~/styles/element/index.scss'
import 'element-plus/dist/index.css'
import 'uno.css'
import 'virtual:unocss-devtools'

window.$nodeApi = baseNodeApi
window.$storage = storageManager

router.beforeEach(SharedElementRouteGuard)

const app = createApp(App)
    .use(SharedElementDirective)
    .use(router)
    .use(ElementPlus)
    .use(VWave, {})

app.mount('#app').$nextTick(() => postMessage({ payload: 'removeLoading' }, '*'))
