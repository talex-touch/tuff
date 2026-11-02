import { createApp } from 'vue'

const page = location.pathname === '/openui' ? import('./OpenUIPlayground.vue') : location.pathname === '/turn' ? import('./TurnPlayground.vue') : import('./App.vue')
void page.then(({ default: Component }) => createApp(Component).mount('#app'))
