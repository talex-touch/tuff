import type { RouteLocationRaw } from 'vue-router'

export function createThemeDetailRoute(theme: string): RouteLocationRaw {
  return {
    path: '/styles/theme',
    query: {
      theme
    }
  }
}
