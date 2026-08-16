import type { UserModule } from './types'

import { setupLayouts } from 'virtual:generated-layouts'
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import App from './App.vue'

import '@unocss/reset/tailwind.css'
import './styles/main.css'
import 'uno.css'

// A CoreBox Surface is always a client-side SPA embedded in a WebContents view, so it is
// mounted directly instead of going through ViteSSG: there is no crawler to pre-render for,
// and the SSG path pulled in a server build the plugin never ships.
const appBase = import.meta.env.BASE_URL || '/'
const routerBase = appBase.startsWith('.') ? '/' : appBase

const router = createRouter({
  routes: setupLayouts([...routes]),
  history: createWebHashHistory(routerBase),
})

const app = createApp(App)
app.use(router)

Object.values(import.meta.glob<{ install: UserModule }>('./modules/*.ts', { eager: true }))
  .forEach(i => i.install?.({ app, router, routes, isClient: true }))

app.mount('#app')
