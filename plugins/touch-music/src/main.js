import ElementPlus from 'element-plus'
import { createApp } from 'vue'
import App from './App.vue'

import './style.css'
import './styles/element/index.scss'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'remixicon/fonts/remixicon.css'

import './modules/api/index'

window.app = createApp(App).use(ElementPlus)

app.mount('#app')
