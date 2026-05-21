import type { RouteRecordRaw } from 'vue-router'

export const STYLES_ROUTE_PATH = '/styles'
export const STYLE_THEME_ROUTE_SEGMENT = 'theme'
export const STYLE_THEME_ROUTE_PATH = `${STYLES_ROUTE_PATH}/${STYLE_THEME_ROUTE_SEGMENT}`

type RouteComponentLoader = <T>(label: string, loader: () => Promise<T>) => () => Promise<T>

export function createStylesRouteRecord(
  withRouteComponentPerf: RouteComponentLoader
): RouteRecordRaw {
  return {
    path: STYLES_ROUTE_PATH,
    name: '$I18n:router.styles',
    component: withRouteComponentPerf(
      STYLES_ROUTE_PATH,
      () => import('../views/base/styles/ThemeStyle.vue')
    ),
    meta: {
      index: 5,
      keepAlive: true
    },
    children: [
      {
        path: STYLE_THEME_ROUTE_SEGMENT,
        name: '$I18n:router.theme',
        component: withRouteComponentPerf(
          STYLE_THEME_ROUTE_PATH,
          () => import('../views/base/styles/sub/ThemePreference.vue')
        ),
        meta: {
          index: 5,
          keepAlive: true
        }
      }
    ]
  }
}
