import { describe, expect, it } from 'vitest'
import {
  getThemeMaterialOption,
  isThemeMaterialSelected,
  RECOMMENDED_THEME_MATERIAL,
  resolveThemeMaterial,
  THEME_MATERIAL_OPTIONS
} from './theme-preference-state'

describe('theme preference state', () => {
  it('normalizes route theme aliases for material detail pages', () => {
    expect(resolveThemeMaterial('default')).toBe('pure')
    expect(resolveThemeMaterial('mica')).toBe('refraction')
    expect(resolveThemeMaterial('unsupported')).toBe(RECOMMENDED_THEME_MATERIAL)
  })

  it('returns the registered option for the resolved material', () => {
    expect(getThemeMaterialOption('filter')).toMatchObject({
      value: 'filter',
      labelKey: 'themeStyle.windowFilter',
      previewClass: 'filter'
    })
  })

  it('keeps all public window materials represented in the detail selector', () => {
    expect(THEME_MATERIAL_OPTIONS.map((option) => option.value)).toEqual([
      'pure',
      'refraction',
      'filter'
    ])
  })

  it('compares selected material after normalization', () => {
    expect(isThemeMaterialSelected('default', 'pure')).toBe(true)
    expect(isThemeMaterialSelected('filter', 'refraction')).toBe(false)
  })
})
