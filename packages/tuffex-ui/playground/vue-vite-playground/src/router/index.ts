import { createRouter, createWebHashHistory } from 'vue-router'
import { mapRoutes } from './mapRoutes'
import { routes } from './routes'

mapRoutes(routes)

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export {
  routes
}

export default router

