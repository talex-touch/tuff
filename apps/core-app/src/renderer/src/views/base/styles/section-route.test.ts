import { describe, expect, it, vi } from 'vitest'
import {
  createStylesRouteRecord,
  STYLES_ROUTE_PATH,
  STYLE_THEME_ROUTE_PATH
} from '../../../base/style-routes'
import { createThemeDetailRoute } from './section-route'

describe('style section route', () => {
  it('links window material cards to the registered theme detail path', () => {
    expect(createThemeDetailRoute('pure')).toEqual({
      path: STYLE_THEME_ROUTE_PATH,
      query: {
        theme: 'pure'
      }
    })
  })

  it('registers the material detail route as a styles child route', () => {
    const loader = vi.fn(<T>(_label: string, loadComponent: () => Promise<T>) => loadComponent)
    const route = createStylesRouteRecord(loader)

    expect(route.path).toBe(STYLES_ROUTE_PATH)
    expect(route.children?.[0]?.path).toBe('theme')
    expect(loader).toHaveBeenCalledWith(STYLES_ROUTE_PATH, expect.any(Function))
    expect(loader).toHaveBeenCalledWith(STYLE_THEME_ROUTE_PATH, expect.any(Function))
  })
})
