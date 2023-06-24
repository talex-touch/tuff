import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { init, initBridge } from '@talex-touch/utils/plugin/preload'

setTimeout(() => {
  init(window)

  initBridge(window)
}, 2000)

createApp(App).mount('#app')
