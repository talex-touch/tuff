import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

import { createRouter, createWebHashHistory } from 'vue-router'

// import 'element-plus/dist/index.css'
import ElementPlus from 'element-plus'
import 'element-plus/theme-chalk/dark/css-vars.css'

const app = createApp(App)
  
const router = createRouter({
  history: createWebHashHistory(),
  routes: []
})

app.use(router).use(ElementPlus)

app.mount('#app').$nextTick(() => postMessage({ payload: 'removeLoading' }, '*'))
