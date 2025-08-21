import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'index',
    component: () => import('~/pages/index.vue'),
  },
  {
    path: '/hi/:name',
    name: 'hi-name',
    component: () => import('~/pages/hi/[name].vue'),
    props: true,
  },
  {
    path: '/:all(.*)*',
    name: 'all',
    component: () => import('~/pages/[...all].vue'),
  },
]

export default routes