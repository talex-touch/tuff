import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { init, initBridge } from '@talex-touch/utils/plugin/preload'
import { createI18n } from 'vue-i18n'
import 'uno.css'
import 'virtual:unocss-devtools'

const { ipcRenderer } = require('electron')

ipcRenderer.on('@loaded', (event: any, name: string) => {
  init(window)

  const i18n = createI18n({
    legacy: false,
    locale: 'zh-CN',
    messages: {
      'zh-CN': {}
    }
  })

  const app = createApp(App)
  app.use(i18n)
  app.use({
    install: () => {
      initBridge(window)
    }
  })
  app.mount('#app')
})
