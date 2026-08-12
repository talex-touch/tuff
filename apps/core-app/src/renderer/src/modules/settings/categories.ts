/**
 * Settings information architecture.
 *
 * Single source of truth shared by the sidebar's settings context and the router, so a
 * category can never exist in the nav without a route (or the reverse).
 * Mirrors `docs/design/corebox/v2.5.0.pen` artboard `iqbKR`.
 */

export type SettingGroupKey = 'preference' | 'capability' | 'system'

export interface SettingCategory {
  /** Route segment under `/setting`, also the keep-alive key suffix. */
  key: string
  path: string
  /** UnoCSS icon class. The design specifies lucide; these are the `ri` equivalents. */
  icon: string
  /** i18n key under `settingsNav.category`. */
  labelKey: string
  group: SettingGroupKey
}

export const SETTING_GROUP_ORDER: SettingGroupKey[] = ['preference', 'capability', 'system']

export const SETTING_CATEGORIES: SettingCategory[] = [
  {
    key: 'overview',
    path: '/setting/overview',
    icon: 'i-ri-dashboard-3-line',
    labelKey: 'overview',
    group: 'preference'
  },
  {
    key: 'general',
    path: '/setting/general',
    icon: 'i-ri-settings-3-line',
    labelKey: 'general',
    group: 'preference'
  },
  {
    key: 'appearance',
    path: '/setting/appearance',
    icon: 'i-ri-palette-line',
    labelKey: 'appearance',
    group: 'preference'
  },
  {
    key: 'intelligence',
    path: '/setting/intelligence',
    icon: 'i-ri-sparkling-2-line',
    labelKey: 'intelligence',
    group: 'capability'
  },
  {
    key: 'plugins',
    path: '/setting/plugins',
    icon: 'i-ri-puzzle-line',
    labelKey: 'plugins',
    group: 'capability'
  },
  {
    key: 'file-index',
    path: '/setting/file-index',
    icon: 'i-ri-file-search-line',
    labelKey: 'fileIndex',
    group: 'capability'
  },
  {
    key: 'update',
    path: '/setting/update',
    icon: 'i-ri-refresh-line',
    labelKey: 'update',
    group: 'system'
  },
  {
    key: 'network',
    path: '/setting/network',
    icon: 'i-ri-global-line',
    labelKey: 'network',
    group: 'system'
  },
  {
    key: 'download',
    path: '/setting/download',
    icon: 'i-ri-download-2-line',
    labelKey: 'download',
    group: 'system'
  },
  {
    key: 'storage-usage',
    path: '/setting/storage-usage',
    icon: 'i-ri-hard-drive-2-line',
    labelKey: 'storage',
    group: 'system'
  },
  {
    key: 'about',
    path: '/setting/about',
    icon: 'i-ri-information-line',
    labelKey: 'about',
    group: 'system'
  }
]

export const DEFAULT_SETTING_PATH = '/setting/overview'

/**
 * Legacy `?section=` deep links from the single-page settings view.
 */
export const LEGACY_SECTION_REDIRECTS: Record<string, string> = {
  everything: '/setting/file-index',
  'file-index': '/setting/file-index'
}

export function groupedSettingCategories(): { group: SettingGroupKey; items: SettingCategory[] }[] {
  return SETTING_GROUP_ORDER.map((group) => ({
    group,
    items: SETTING_CATEGORIES.filter((category) => category.group === group)
  }))
}
