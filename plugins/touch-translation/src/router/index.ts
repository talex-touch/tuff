import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'index',
    component: () => import('~/pages/index.vue'),
  },
  {
    path: '/multi-translate',
    name: 'multi-translate',
    component: () => import('~/pages/multi-translate.vue'),
  },
  {
    path: '/:all(.*)*',
    name: 'all',
    component: () => import('~/pages/[...all].vue'),
  },
]

export default routes
