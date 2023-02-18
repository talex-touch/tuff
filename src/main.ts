import { createApp } from 'vue'
import App from './App.vue'
// import './samples/node-api'

import router from './base/router'
import { genBaseNodeApi } from '@modules/samples/node-api'
import { genStorageManager } from '@modules/storage'
import ElementPlus from '@modules/element-plus'
import Lang from '@modules/lang'

import VWave from 'v-wave'

import '@modules/theme-manager'

window.$nodeApi = genBaseNodeApi()
window.$storage = genStorageManager()

const app = createApp(App)
    .use(router)
    .use(ElementPlus)
    .use(Lang)
    // .use(ModuleManager)
    .use(VWave)

app .mount('#app')
    .$nextTick(() => {

        postMessage({ payload: 'removeLoading' }, '*')
    })
