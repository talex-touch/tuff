import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { init, initBridge } from '@talex-touch/utils/plugin/preload'
// import 'virtual:uno.css'
import 'uno.css'
import 'virtual:unocss-devtools'

const { ipcRenderer } = require('electron')

ipcRenderer.on('@loaded', (event: any, name: string) => {
  console.log('[Touch] Preload', event, name)

  init(window)

  initBridge(window)

  createApp(App).mount('#app')
})
