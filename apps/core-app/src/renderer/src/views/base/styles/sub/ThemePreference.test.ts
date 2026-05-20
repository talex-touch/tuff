import { describe, expect, it } from 'vitest'
import type { ThemeStyleState } from '../../../../modules/storage/theme-style.utils'
import { createThemeDetailRoute } from '../section-route'
import {
  applyThemeMaterialPreference,
  RECOMMENDED_THEME_MATERIAL,
  THEME_MATERIAL_OPTIONS
} from './theme-preference-state'

describe('ThemePreference behavior', () => {
  it('applies a material to the shared theme state', () => {
    const state: ThemeStyleState = {
      theme: {
        window: 'pure',
        style: {
          dark: false,
          auto: true
        },
        addon: {
          contrast: false,
          coloring: false
        },
        transition: {
          route: 'slide'
        }
      }
    }

    applyThemeMaterialPreference(state, 'filter')

    expect(state.theme.window).toBe('filter')
  })

  it('keeps material options addressable through the detail route', () => {
    expect(THEME_MATERIAL_OPTIONS.map((option) => createThemeDetailRoute(option.value))).toEqual([
      {
        path: '/styles/theme',
        query: {
          theme: 'pure'
        }
      },
      {
        path: '/styles/theme',
        query: {
          theme: RECOMMENDED_THEME_MATERIAL
        }
      },
      {
        path: '/styles/theme',
        query: {
          theme: 'filter'
        }
      }
    ])
  })
})
