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

import { createRouter, createWebHashHistory } from 'vue-router'
import { appSetting } from '~/modules/channel/storage'

const routes: any = [
  {
    path: '/',
    redirect: '/setting'
  },
  {
    path: '/market',
    name: 'Plugin Market',
    component: () => import('../views/base/Market.vue'),
    meta: {
      index: 2
    }
  },
  {
    path: '/market/:id',
    name: 'Market Detail',
    component: () => import('../views/base/MarketDetail.vue'),
    meta: {
      index: 2,
      parentRoute: '/market'
    }
  },
  {
    path: '/plugin',
    name: 'Plugin',
    component: () => import('../views/base/Plugin.vue'),
    meta: {
      index: 3
    }
  },
  {
    path: '/downloads',
    name: 'Downloads',
    component: () => import('../components/download/DownloadCenterView.vue'),
    meta: {
      index: 7
    }
  },
  {
    path: '/details',
    name: '详细信息',
    component: () => import('../views/base/LingPan.vue'),
    meta: {
      index: 4,
      requiresDashboard: true
    }
  },
  {
    path: '/styles',
    name: 'Styles',
    component: () => import('../views/base/styles/ThemeStyle.vue'),
    meta: {
      index: 5
    }
  },
  {
    path: '/styles/theme',
    name: 'Theme',
    component: () => import('../views/base/styles/sub/ThemePreference.vue'),
    meta: {
      index: 5
    }
  },
  {
    path: '/application',
    name: 'Application',
    component: () => import('../views/base/application/ApplicationIndex.vue'),
    meta: {
      index: 6
    }
  },
  {
    path: '/setting',
    name: 'AppSettings',
    component: () => import('../views/base/settings/AppSettings.vue'),
    children: [
      {
        path: '/setting/storage',
        name: 'Storagable',
        component: () => import('../views/storage/Storagable.vue'),
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
    component: () => import('../views/base/intelligence/IntelligencePage.vue'),
    meta: {
      index: 8
    }
  },
  {
    path: '/intelligence/channels',
    name: 'IntelligenceChannels',
    component: () => import('../views/base/intelligence/IntelligenceChannelsPage.vue'),
    meta: {
      index: 8
    }
  },
  {
    path: '/intelligence/capabilities',
    name: 'IntelligenceCapabilities',
    component: () => import('../views/base/intelligence/IntelligenceCapabilitiesPage.vue'),
    meta: {
      index: 8
    }
  },
  {
    path: '/intelligence/prompts',
    name: 'IntelligencePrompts',
    component: () => import('../views/base/intelligence/IntelligencePromptsPage.vue'),
    meta: {
      index: 8
    }
  },
  {
    path: '/intelligence/audit',
    name: 'IntelligenceAudit',
    component: () => import('../views/base/intelligence/IntelligenceAuditPage.vue'),
    meta: {
      index: 8
    }
  },
  {
    path: '/intelligence/agents',
    name: 'IntelligenceAgents',
    component: () => import('../views/base/intelligence/IntelligenceAgentsPage.vue'),
    meta: {
      index: 8
    }
  },
  {
    path: '/meta-overlay',
    name: 'MetaOverlay',
    component: () => import('../views/meta/MetaOverlay.vue'),
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
