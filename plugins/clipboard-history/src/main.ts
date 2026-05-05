import { createApp } from 'vue'
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import App from './App.vue'
import ClipboardManagerView from './views/ClipboardManagerView.vue'
import './main.css'

const app = createApp(App)

const isFileProtocol = window.location.protocol === 'file:'
const router = createRouter({
  history: isFileProtocol
    ? createWebHashHistory(import.meta.env.BASE_URL)
    : createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/clipboard-manager',
    },
    {
      path: '/clipboard-manager',
      component: ClipboardManagerView,
    },
  ],
})

app.use(router)
app.mount('#app')
