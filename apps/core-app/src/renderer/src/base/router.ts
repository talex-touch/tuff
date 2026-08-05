/*
 * Copyright (c) 2022. TalexDreamSoul
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except adopters compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to adopters writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { RouteLocationNormalizedLoaded, RouteRecordRaw } from 'vue-router'
import { isDevEnv } from '@talex-touch/utils/env'
import { nextTick } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { reportPerfToMain } from '~/modules/perf/perf-report'
import {
  DEFAULT_SETTING_PATH,
  LEGACY_SECTION_REDIRECTS,
  SETTING_CATEGORIES
} from '~/modules/settings/categories'
import { appSetting } from '~/modules/storage/app-storage'
import { createStylesRouteRecord } from './style-routes'

const ROUTE_NAVIGATE_WARN_MS = 200
const ROUTE_RENDER_WARN_MS = 350
const isDev = isDevEnv()
const ROUTE_COMPONENT_LOAD_WARN_MS = 150
const STORE_ROUTE_CACHE_KEY = 'store-shell'

function resolveRoutePattern(route: RouteLocationNormalizedLoaded): string {
  const last = Array.isArray(route?.matched) ? route.matched[route.matched.length - 1] : null
  const pattern = typeof last?.path === 'string' ? last.path : null
  return pattern || route?.path || route?.fullPath || 'unknown'
}

function withRouteComponentPerf<T>(label: string, loader: () => Promise<T>): () => Promise<T> {
  if (isDev) {
    return loader
  }

  return async () => {
    const startedAt = performance.now()
    const stack = new Error().stack
    try {
      return await loader()
    } finally {
      const durationMs = performance.now() - startedAt
      if (durationMs >= ROUTE_COMPONENT_LOAD_WARN_MS) {
        reportPerfToMain({
          kind: 'ui.component.load',
          eventName: label,
          durationMs,
          at: Date.now(),
          stack,
          meta: { category: 'route-component' }
        })
      }
    }
  }
}

/**
 * One route per settings category, driven by the same table the sidebar renders from, so a
 * category can never appear in the nav without a route behind it.
 */
function createSettingCategoryRoutes(withPerf: typeof withRouteComponentPerf): RouteRecordRaw[] {
  const loaders: Record<string, () => Promise<unknown>> = {
    overview: () => import('../views/base/settings/categories/SettingOverviewPage.vue'),
    general: () => import('../views/base/settings/categories/SettingGeneralPage.vue'),
    appearance: () => import('../views/base/settings/categories/SettingAppearancePage.vue'),
    intelligence: () => import('../views/base/settings/categories/SettingIntelligencePage.vue'),
    plugins: () => import('../views/base/settings/categories/SettingPluginsPage.vue'),
    'file-index': () => import('../views/base/settings/categories/SettingFileIndexPage.vue'),
    update: () => import('../views/base/settings/categories/SettingUpdatePage.vue'),
    network: () => import('../views/base/settings/categories/SettingNetworkPage.vue'),
    download: () => import('../views/base/settings/categories/SettingDownloadPage.vue'),
    // Renders the storage report directly. The former `SettingStoragePage` was a transit page
    // whose entire content was two rows linking to this same view.
    'storage-usage': () => import('../views/storage/Storagable.vue'),
    about: () => import('../views/base/settings/categories/SettingAboutPage.vue')
  }

  return SETTING_CATEGORIES.map((category) => ({
    path: category.path,
    name: `$I18n:router.appSettings.${category.key}`,
    component: withPerf(
      category.path,
      loaders[category.key] as () => Promise<{ default: unknown }>
    ),
    meta: {
      index: 1,
      keepAlive: true,
      // Per-category cache keys keep each page's scroll position across category switches.
      keepAliveKey: `setting-${category.key}`
    }
  })) as RouteRecordRaw[]
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/home'
  },
  {
    path: '/home',
    name: '$I18n:router.home',
    component: withRouteComponentPerf('/home', () => import('../views/base/home/HomePage.vue')),
    meta: {
      index: 0,
      keepAlive: true
    }
  },
  {
    path: '/store',
    name: '$I18n:router.pluginStore',
    component: withRouteComponentPerf('/store', () => import('../views/base/Store.vue')),
    meta: {
      index: 2,
      keepAlive: true,
      keepAliveKey: STORE_ROUTE_CACHE_KEY
    }
  },
  {
    path: '/store/installed',
    name: '$I18n:router.installedPlugins',
    component: withRouteComponentPerf('/store/installed', () => import('../views/base/Store.vue')),
    meta: {
      index: 2,
      keepAlive: true,
      keepAliveKey: STORE_ROUTE_CACHE_KEY
    }
  },
  {
    path: '/store/publisher',
    name: '$I18n:router.storePublisher',
    component: withRouteComponentPerf('/store/publisher', () => import('../views/base/Store.vue')),
    meta: {
      index: 2,
      keepAlive: true,
      keepAliveKey: STORE_ROUTE_CACHE_KEY
    }
  },
  {
    path: '/store/docs',
    name: '$I18n:router.storeDocs',
    component: withRouteComponentPerf('/store/docs', () => import('../views/base/Store.vue')),
    meta: {
      index: 2,
      keepAlive: true,
      keepAliveKey: STORE_ROUTE_CACHE_KEY
    }
  },
  {
    path: '/store/cli',
    name: '$I18n:router.storeCli',
    component: withRouteComponentPerf('/store/cli', () => import('../views/base/Store.vue')),
    meta: {
      index: 2,
      keepAlive: true,
      keepAliveKey: STORE_ROUTE_CACHE_KEY
    }
  },
  {
    path: '/store/:id',
    name: '$I18n:router.storeDetail',
    component: withRouteComponentPerf('/store/:id', () => import('../views/base/Store.vue')),
    meta: {
      index: 2,
      parentRoute: '/store',
      keepAlive: true,
      keepAliveKey: STORE_ROUTE_CACHE_KEY
    }
  },
  {
    path: '/plugin/:name?',
    name: '$I18n:router.plugin',
    component: withRouteComponentPerf(
      '/plugin/:name?',
      () => import('../views/base/PluginDetail.vue')
    ),
    meta: {
      index: 3
    }
  },
  {
    path: '/downloads',
    name: '$I18n:router.downloads',
    component: withRouteComponentPerf(
      '/downloads',
      () => import('../components/download/DownloadCenterView.vue')
    ),
    meta: {
      index: 7,
      keepAlive: true
    }
  },
  {
    path: '/details',
    name: '$I18n:router.details',
    component: withRouteComponentPerf('/details', () => import('../views/base/LingPan.vue')),
    meta: {
      index: 4,
      requiresDashboard: true
    }
  },
  createStylesRouteRecord(withRouteComponentPerf),
  {
    path: '/application',
    name: '$I18n:router.application',
    component: withRouteComponentPerf(
      '/application',
      () => import('../views/base/application/ApplicationIndex.vue')
    ),
    meta: {
      index: 6,
      keepAlive: true
    }
  },
  {
    path: '/setting',
    redirect: DEFAULT_SETTING_PATH
  },
  ...createSettingCategoryRoutes(withRouteComponentPerf),
  {
    // The `advanced` category was dissolved: its proxy settings moved to `network`, the
    // assistant block to `intelligence` and the tools block to `plugins`. Kept as a redirect
    // so existing deep links (and `?section=` fallbacks) do not 404.
    path: '/setting/advanced',
    redirect: '/setting/network'
  },
  {
    // Storage now lives on the `storage-usage` category route so the sidebar item lands straight
    // on the report. Kept as a redirect for deep links that still use the old path.
    path: '/setting/storage',
    redirect: '/setting/storage-usage'
  },
  {
    path: '/intelligence',
    name: '$I18n:router.intelligence',
    component: withRouteComponentPerf(
      '/intelligence',
      () => import('../views/base/intelligence/IntelligencePage.vue')
    ),
    meta: {
      index: 8,
      keepAlive: true
    }
  },
  {
    path: '/intelligence/channels',
    name: '$I18n:router.intelligenceChannels',
    component: withRouteComponentPerf(
      '/intelligence/channels',
      () => import('../views/base/intelligence/IntelligenceChannelsPage.vue')
    ),
    meta: {
      index: 8,
      keepAlive: true
    }
  },
  {
    path: '/intelligence/capabilities',
    name: '$I18n:router.intelligenceCapabilities',
    component: withRouteComponentPerf(
      '/intelligence/capabilities',
      () => import('../views/base/intelligence/IntelligenceCapabilitiesPage.vue')
    ),
    meta: {
      index: 8,
      keepAlive: true
    }
  },
  {
    path: '/intelligence/prompts',
    name: '$I18n:router.intelligencePrompts',
    component: withRouteComponentPerf(
      '/intelligence/prompts',
      () => import('../views/base/intelligence/IntelligencePromptsPage.vue')
    ),
    meta: {
      index: 8,
      keepAlive: true
    }
  },
  {
    path: '/intelligence/audit',
    name: '$I18n:router.intelligenceAudit',
    component: withRouteComponentPerf(
      '/intelligence/audit',
      () => import('../views/base/intelligence/IntelligenceAuditPage.vue')
    ),
    meta: {
      index: 8,
      keepAlive: true
    }
  },
  {
    path: '/intelligence/agents',
    name: '$I18n:router.intelligenceAgents',
    component: withRouteComponentPerf(
      '/intelligence/agents',
      () => import('../views/base/intelligence/IntelligenceAgentsPage.vue')
    ),
    meta: {
      index: 8,
      keepAlive: true
    }
  },
  {
    path: '/intelligence/workflows',
    name: '$I18n:router.intelligenceWorkflows',
    component: withRouteComponentPerf(
      '/intelligence/workflows',
      () => import('../views/base/intelligence/IntelligenceWorkflowPage.vue')
    ),
    meta: {
      index: 8,
      keepAlive: true
    }
  },
  {
    path: '/meta-overlay',
    name: '$I18n:router.metaOverlay',
    component: withRouteComponentPerf(
      '/meta-overlay',
      () => import('../views/meta/MetaOverlay.vue')
    ),
    meta: {
      index: 0
    }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

/**
 * Keeps `/setting?section=<id>` deep links working after settings moved from one long page to
 * per-category routes. Those links are still emitted by notifications and other modules.
 */
router.beforeEach((to, _from, next) => {
  const section = typeof to.query.section === 'string' ? to.query.section : ''
  if (!section || !to.path.startsWith('/setting')) {
    next()
    return
  }

  const target = LEGACY_SECTION_REDIRECTS[section]
  if (!target || to.path === target) {
    next()
    return
  }

  const { section: _dropped, ...rest } = to.query
  next({ path: target, query: rest, replace: true })
})

router.beforeEach((to, _from, next) => {
  if (to.meta?.requiresDashboard && !appSetting.dashboard.enable) {
    next('/home')
  } else {
    next()
  }
})

const routeNavigationStarts = new Map<
  string,
  { startedAt: number; fromPattern: string; toPattern: string }
>()

router.beforeEach((to, from, next) => {
  if (isDev) {
    next()
    return
  }

  const toPattern = resolveRoutePattern(to)
  const fromPattern = resolveRoutePattern(from)
  routeNavigationStarts.set(to.fullPath, {
    startedAt: performance.now(),
    fromPattern,
    toPattern
  })
  next()
})

router.afterEach((to, from) => {
  if (isDev) {
    return
  }

  const record = routeNavigationStarts.get(to.fullPath)
  if (!record) {
    return
  }
  routeNavigationStarts.delete(to.fullPath)

  const navigateDurationMs = performance.now() - record.startedAt
  if (navigateDurationMs >= ROUTE_NAVIGATE_WARN_MS) {
    reportPerfToMain({
      kind: 'ui.route.navigate',
      eventName: record.toPattern,
      durationMs: navigateDurationMs,
      at: Date.now(),
      meta: {
        from: record.fromPattern,
        toFullPath: to.fullPath,
        fromFullPath: from.fullPath,
        toName: typeof to.name === 'string' ? to.name : null
      }
    })
  }

  void (async () => {
    await nextTick()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const renderDurationMs = performance.now() - record.startedAt
    if (renderDurationMs < ROUTE_RENDER_WARN_MS) {
      return
    }
    reportPerfToMain({
      kind: 'ui.route.render',
      eventName: record.toPattern,
      durationMs: renderDurationMs,
      at: Date.now(),
      meta: {
        from: record.fromPattern,
        toFullPath: to.fullPath,
        fromFullPath: from.fullPath,
        toName: typeof to.name === 'string' ? to.name : null
      }
    })
  })()
})

// router.beforeEach(async (to, from, next) => {
//
//     // if( to.name )
//     //     document.title = `${GlobalConfig.name} | ${String(to.name)}`
//     //
//     // if( !to?.meta?.loginRequired ) return next()
//     //
//     // const store = useStore()
//     //
//     // if( !store.local.loggedIn ) {
//     //
//     //     window.$tipper.tip(t('router.login'), {
//     //         stay: 4200,
//     //         type: TipType.WARNING
//     //     })
//     //
//     //     return router.back()
//     //
//     // }
//     //
//     // if( to.meta?.adminRequired ) {
//     //
//     //     // @ts-ignore
//     //     if( !store.local.admin  ) {
//     //
//     //         window.$tipper.tip(t('router.permission'), {
//     //             stay: 4200,
//     //             type: TipType.WARNING
//     //         })
//     //
//     //         return router.back()
//     //
//     //     }
//     //
//     // }
//
//     return next()
//
// })

export default router
