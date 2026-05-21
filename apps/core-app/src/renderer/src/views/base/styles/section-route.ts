import type { RouteLocationRaw } from 'vue-router'
import { STYLE_THEME_ROUTE_PATH } from '../../../base/style-routes'

export function createThemeDetailRoute(theme: string): RouteLocationRaw {
  return {
    path: STYLE_THEME_ROUTE_PATH,
    query: {
      theme
    }
  }
}
