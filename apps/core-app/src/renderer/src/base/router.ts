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

import { nextTick } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { appSetting } from '~/modules/channel/storage'
import { reportPerfToMain } from '~/modules/perf/perf-report'

const ROUTE_NAVIGATE_WARN_MS = 200
const ROUTE_RENDER_WARN_MS = 350
const ROUTE_COMPONENT_LOAD_WARN_MS = 150

function resolveRoutePattern(route: any): string {
  const last = Array.isArray(route?.matched) ? route.matched[route.matched.length - 1] : null
  const pattern = typeof last?.path === 'string' ? last.path : null
  return pattern || route?.path || route?.fullPath || 'unknown'
}

function withRouteComponentPerf(
  label: string,
  loader: () => Promise<any>,
): () => Promise<any> {
  return async () => {
    const startedAt = performance.now()
    const stack = new Error().stack
    try {
      return await loader()
    }
    finally {
      const durationMs = performance.now() - startedAt
      if (durationMs < ROUTE_COMPONENT_LOAD_WARN_MS) {
        return
      }
      reportPerfToMain({
        kind: 'ui.component.load',
        eventName: label,
        durationMs,
        at: Date.now(),
        stack,
        meta: { category: 'route-component' },
      })
    }
  }
}

const routes: any = [
  {
    path: '/',
    redirect: '/setting'
  },
  {
    path: '/market',
    name: 'Plugin Market',
    component: withRouteComponentPerf('/market', () => import('../views/base/Market.vue')),
    meta: {
      index: 2
    }
  },
  {
    path: '/market/:id',
    name: 'Market Detail',
    component: withRouteComponentPerf('/market/:id', () => import('../views/base/MarketDetail.vue')),
    meta: {
      index: 2,
      parentRoute: '/market'
    }
  },
  {
    path: '/plugin',
    name: 'Plugin',
    component: withRouteComponentPerf('/plugin', () => import('../views/base/Plugin.vue')),
    meta: {
      index: 3
    }
  },
  {
    path: '/downloads',
    name: 'Downloads',
    component: withRouteComponentPerf('/downloads', () => import('../components/download/DownloadCenterView.vue')),
    meta: {
      index: 7
    }
  },
  {
    path: '/details',
    name: '详细信息',
    component: withRouteComponentPerf('/details', () => import('../views/base/LingPan.vue')),
    meta: {
      index: 4,
      requiresDashboard: true
    }
  },
  {
    path: '/styles',
    name: 'Styles',
    component: withRouteComponentPerf('/styles', () => import('../views/base/styles/ThemeStyle.vue')),
    meta: {
      index: 5
    }
  },
  {
    path: '/styles/theme',
    name: 'Theme',
    component: withRouteComponentPerf('/styles/theme', () => import('../views/base/styles/sub/ThemePreference.vue')),
    meta: {
      index: 5
    }
  },
  {
    path: '/application',
    name: 'Application',
    component: withRouteComponentPerf('/application', () => import('../views/base/application/ApplicationIndex.vue')),
    meta: {
      index: 6
    }
  },
  {
    path: '/setting',
    name: 'AppSettings',
    component: withRouteComponentPerf('/setting', () => import('../views/base/settings/AppSettings.vue')),
    children: [
      {
        path: '/setting/storage',
        name: 'Storagable',
        component: withRouteComponentPerf('/setting/storage', () => import('../views/storage/Storagable.vue')),
        meta: {
          index: 1
        }
      }
    ],
    meta: {
      index: 1
    }
  },
  {
    path: '/intelligence',
    name: 'Intelligence',
    component: withRouteComponentPerf('/intelligence', () => import('../views/base/intelligence/IntelligencePage.vue')),
    meta: {
      index: 8
    }
  },
  {
    path: '/intelligence/channels',
    name: 'IntelligenceChannels',
    component: withRouteComponentPerf('/intelligence/channels', () => import('../views/base/intelligence/IntelligenceChannelsPage.vue')),
    meta: {
      index: 8
    }
  },
  {
    path: '/intelligence/capabilities',
    name: 'IntelligenceCapabilities',
    component: withRouteComponentPerf('/intelligence/capabilities', () => import('../views/base/intelligence/IntelligenceCapabilitiesPage.vue')),
    meta: {
      index: 8
    }
  },
  {
    path: '/intelligence/prompts',
    name: 'IntelligencePrompts',
    component: withRouteComponentPerf('/intelligence/prompts', () => import('../views/base/intelligence/IntelligencePromptsPage.vue')),
    meta: {
      index: 8
    }
  },
  {
    path: '/intelligence/audit',
    name: 'IntelligenceAudit',
    component: withRouteComponentPerf('/intelligence/audit', () => import('../views/base/intelligence/IntelligenceAuditPage.vue')),
    meta: {
      index: 8
    }
  },
  {
    path: '/intelligence/agents',
    name: 'IntelligenceAgents',
    component: withRouteComponentPerf('/intelligence/agents', () => import('../views/base/intelligence/IntelligenceAgentsPage.vue')),
    meta: {
      index: 8
    }
  },
  {
    path: '/meta-overlay',
    name: 'MetaOverlay',
    component: withRouteComponentPerf('/meta-overlay', () => import('../views/meta/MetaOverlay.vue')),
    meta: {
      index: 0
    }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  if (to.meta?.requiresDashboard && !appSetting.dashboard.enable) {
    next('/home')
  } else {
    next()
  }
})

const routeNavigationStarts = new Map<string, { startedAt: number, fromPattern: string, toPattern: string }>()

router.beforeEach((to, from, next) => {
  const toPattern = resolveRoutePattern(to)
  const fromPattern = resolveRoutePattern(from)
  routeNavigationStarts.set(to.fullPath, {
    startedAt: performance.now(),
    fromPattern,
    toPattern,
  })
  next()
})

router.afterEach((to, from) => {
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
        toName: typeof to.name === 'string' ? to.name : null,
      },
    })
  }

  void (async () => {
    await nextTick()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
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
        toName: typeof to.name === 'string' ? to.name : null,
      },
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
