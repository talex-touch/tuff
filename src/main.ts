import { createApp } from 'vue'
import App from './App.vue'
// import './samples/node-api'

import ModuleManager from '@modules/module-manager'
import 'remixicon/fonts/remixicon.css'

import router from './base/router'

const app = createApp(App)
    .use(router)
    .use(ModuleManager)
    .mount('#app')
    .$nextTick(() => {
        postMessage({ payload: 'removeLoading' }, '*')
    })


// router.isReady().then(() => {
//     app.mount('#app')
//         .$nextTick(() => {
//             postMessage({ payload: 'removeLoading' }, '*')
//         })
// })