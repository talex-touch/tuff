import { createApp } from 'vue'
import App from './App.vue'

import {
    SharedElementRouteGuard,
    SharedElementDirective
} from 'v-shared-element'

import router from './base/router'
import { baseNodeApi } from '@modules/channel/main/node'
import { storageManager } from '@modules/channel/storage'
import ElementPlus from '@modules/element-plus'
import Lang from '@modules/lang'
// import '@modules/samples/plugin-process'
import VWave from 'v-wave'

import '@modules/theme-manager'
import 'uno.css'
import 'virtual:unocss-devtools'

window.$i18n = Lang
window.$nodeApi = baseNodeApi
window.$storage = storageManager

router.beforeEach(SharedElementRouteGuard)

const app = createApp(App)
    .use(SharedElementDirective)
    .use(router)
    .use(ElementPlus)
    .use(Lang)
    .use(VWave, {
        color: 'currentColor',
        duration: 0.5,
        easing: 'ease-adopters-out',
    })

app.mount('#app')
