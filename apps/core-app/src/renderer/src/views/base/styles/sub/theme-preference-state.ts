import {
  normalizeWindowPreference,
  type ThemeStyleState,
  type ThemeWindowPreference
} from '../../../../modules/storage/theme-style.utils'

export interface ThemeMaterialOption {
  value: ThemeWindowPreference
  labelKey: string
  descriptionKey: string
  previewClass: string
}

export const RECOMMENDED_THEME_MATERIAL: ThemeWindowPreference = 'refraction'

export const THEME_MATERIAL_OPTIONS: ThemeMaterialOption[] = [
  {
    value: 'pure',
    labelKey: 'themeStyle.windowPure',
    descriptionKey: 'themePreference.pure',
    previewClass: 'pure'
  },
  {
    value: 'refraction',
    labelKey: 'themeStyle.windowRefraction',
    descriptionKey: 'themePreference.refraction',
    previewClass: 'refraction'
  },
  {
    value: 'filter',
    labelKey: 'themeStyle.windowFilter',
    descriptionKey: 'themePreference.filter',
    previewClass: 'filter'
  }
]

const FALLBACK_THEME_MATERIAL_OPTION: ThemeMaterialOption = {
  value: RECOMMENDED_THEME_MATERIAL,
  labelKey: 'themeStyle.windowRefraction',
  descriptionKey: 'themePreference.refraction',
  previewClass: 'refraction'
}

export function resolveThemeMaterial(value: unknown): ThemeWindowPreference {
  return normalizeWindowPreference(value)
}

export function getThemeMaterialOption(value: unknown): ThemeMaterialOption {
  const material = resolveThemeMaterial(value)
  return (
    THEME_MATERIAL_OPTIONS.find((option) => option.value === material) ??
    THEME_MATERIAL_OPTIONS.find((option) => option.value === RECOMMENDED_THEME_MATERIAL) ??
    FALLBACK_THEME_MATERIAL_OPTION
  )
}

export function isThemeMaterialSelected(current: unknown, target: unknown): boolean {
  return resolveThemeMaterial(current) === resolveThemeMaterial(target)
}

export function applyThemeMaterialPreference(
  target: ThemeStyleState,
  material: ThemeWindowPreference
): void {
  target.theme.window = material
}
