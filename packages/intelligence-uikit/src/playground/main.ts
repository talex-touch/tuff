import { createApp } from 'vue'
import App from './App.vue'
import OpenUIPlayground from './OpenUIPlayground.vue'

createApp(location.pathname === '/openui' ? OpenUIPlayground : App).mount('#app')
