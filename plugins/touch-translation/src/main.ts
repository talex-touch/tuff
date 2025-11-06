import { createApp } from 'vue'
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import App from './App.vue'
import routes from './router'

import '@unocss/reset/tailwind.css'
import './styles/main.css'
import 'uno.css'

const app = createApp(App)

// 在本地文件协议（file://）下使用 Hash 模式，否则使用 History 模式
const isFileProtocol = window.location.protocol === 'file:'
const historyMode = isFileProtocol ? 'hash' : 'history'
console.log(`[Plugin Router] Using ${historyMode} mode (protocol: ${window.location.protocol}, url: ${window.location.href})`)

const router = createRouter({
  history: isFileProtocol
    ? createWebHashHistory(import.meta.env.BASE_URL)
    : createWebHistory(import.meta.env.BASE_URL),
  routes,
})

app.use(router)
app.mount('#app')
