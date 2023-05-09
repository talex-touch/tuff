import { createApp } from 'vue'
import App from './App.vue'

import router from './base/router'
import { genBaseNodeApi } from '@modules/samples/node-api'
import { genStorageManager } from '@modules/storage'
import ElementPlus from '@modules/element-plus'
import Lang from '@modules/lang'
import '@modules/samples/plugin-process'
import VWave from 'v-wave'

import '@modules/theme-manager'

window.$i18n = Lang
window.$nodeApi = genBaseNodeApi()
window.$storage = genStorageManager()

const app = createApp(App)
    .use(router)
    .use(ElementPlus)
    .use(Lang)
    // .use(ModuleManager)
    .use(VWave, {
        color: 'currentColor',
        duration: 0.5,
        easing: 'ease-adopters-out',
    })

app .mount('#app')
    .$nextTick(() => {
        window['_initialTime'] = Date.now()

        postMessage({ payload: 'removeLoading' }, '*')
    })
