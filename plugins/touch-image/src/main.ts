import { initTuff } from '@talex-touch/utils/plugin/preload'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'
import App from './App.vue'

import './style.css'
import 'uno.css'
import 'virtual:unocss-devtools'
const { ipcRenderer } = require('electron')

ipcRenderer.on('@loaded', (_event: any, _name: string) => {
  initTuff(window)

  const i18n = createI18n({
    legacy: false,
    locale: 'zh-CN',
    messages: {
      'zh-CN': {},
    },
  })

  const app = createApp(App)
  app.use(i18n)
  app.mount('#app')
})
