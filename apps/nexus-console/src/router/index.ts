import type { RouteRecordRaw, RouterHistory } from 'vue-router'
import { createRouter, createWebHistory } from 'vue-router'
import { useSession } from '@/composables/useSession'
import { resolveSafeRedirectUrl } from '@/utils/redirect'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresAdmin?: boolean
    guestOnly?: boolean
    titleKey?: string
    shell?: 'console' | 'auth'
  }
}

export const consoleRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/dashboard',
  },
  {
    path: '/login',
    redirect: '/sign-in',
  },
  {
    path: '/sign-in',
    name: 'sign-in',
    component: () => import('@/views/auth/SignInView.vue'),
    meta: { guestOnly: true, shell: 'auth', titleKey: 'auth.signInTitle' },
  },
  {
    path: '/verify',
    name: 'verify',
    component: () => import('@/views/auth/VerifyView.vue'),
    meta: { shell: 'auth', titleKey: 'auth.verifyTitle' },
  },
  {
    path: '/verify-waiting',
    name: 'verify-waiting',
    component: () => import('@/views/auth/VerifyWaitingView.vue'),
    meta: { shell: 'auth', titleKey: 'auth.verifyWaitingTitle' },
  },
  {
    path: '/device-auth',
    name: 'device-auth',
    component: () => import('@/views/auth/DeviceAuthView.vue'),
    meta: { requiresAuth: true, shell: 'auth', titleKey: 'auth.deviceAuthTitle' },
  },
  {
    path: '/dashboard',
    name: 'dashboard-overview',
    component: () => import('@/views/dashboard/DashboardOverviewView.vue'),
    meta: { requiresAuth: true, shell: 'console', titleKey: 'nav.overview' },
  },
  {
    path: '/dashboard/account',
    name: 'dashboard-account',
    component: () => import('@/views/dashboard/DashboardAccountView.vue'),
    meta: { requiresAuth: true, shell: 'console', titleKey: 'nav.account' },
  },
  {
    path: '/dashboard/devices',
    name: 'dashboard-devices',
    component: () => import('@/views/dashboard/DashboardDevicesView.vue'),
    meta: { requiresAuth: true, shell: 'console', titleKey: 'nav.devices' },
  },
  {
    path: '/dashboard/plugins',
    name: 'dashboard-plugins',
    component: () => import('@/views/dashboard/DashboardPluginsView.vue'),
    meta: { requiresAuth: true, shell: 'console', titleKey: 'nav.plugins' },
  },
  {
    path: '/admin',
    name: 'admin-usage',
    component: () => import('@/views/admin/AdminUsageView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, shell: 'console', titleKey: 'nav.adminUsage' },
  },
  {
    path: '/admin/users',
    name: 'admin-users',
    component: () => import('@/views/admin/AdminUsersView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, shell: 'console', titleKey: 'nav.adminUsers' },
  },
  {
    path: '/admin/store',
    name: 'admin-store',
    component: () => import('@/views/admin/AdminStoreView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, shell: 'console', titleKey: 'nav.adminStore' },
  },
  {
    path: '/admin/releases',
    name: 'admin-releases',
    component: () => import('@/views/admin/AdminReleasesView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, shell: 'console', titleKey: 'nav.adminReleases' },
  },
  {
    path: '/admin/ai',
    name: 'admin-ai',
    component: () => import('@/views/admin/AdminAiView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true, shell: 'console', titleKey: 'nav.adminAi' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { shell: 'auth', titleKey: 'common.notFoundTitle' },
  },
]

export function createConsoleRouter(history?: RouterHistory) {
  const router = createRouter({
    history: history ?? createWebHistory('/'),
    routes: consoleRoutes,
    scrollBehavior: () => ({ top: 0 }),
  })

  router.beforeEach(async (to) => {
    const session = useSession()

    if (to.meta.requiresAuth || to.meta.requiresAdmin || to.meta.guestOnly)
      await session.ensureLoaded()

    if (to.meta.guestOnly && session.isAuthenticated.value) {
      const target = resolveSafeRedirectUrl(to.query.redirect_url ?? to.query.callbackUrl, '/dashboard')
      return target
    }

    if (to.meta.requiresAuth && !session.isAuthenticated.value) {
      return {
        path: '/sign-in',
        query: { redirect_url: to.fullPath },
      }
    }

    if (to.meta.requiresAdmin && !session.isAdmin.value) {
      return {
        path: '/dashboard',
        query: { denied: 'admin' },
      }
    }

    return true
  })

  return router
}
