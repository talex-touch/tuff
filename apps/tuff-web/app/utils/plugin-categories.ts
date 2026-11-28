export const PLUGIN_CATEGORIES = [
  { id: 'productivity', icon: 'i-carbon-time', i18nKey: 'plugins.categories.productivity' },
  { id: 'utilities', icon: 'i-carbon-tools', i18nKey: 'plugins.categories.utilities' },
  { id: 'development', icon: 'i-carbon-code', i18nKey: 'plugins.categories.development' },
  { id: 'writing', icon: 'i-carbon-pen', i18nKey: 'plugins.categories.writing' },
  { id: 'creativity', icon: 'i-carbon-cube', i18nKey: 'plugins.categories.creativity' },
  { id: 'ai', icon: 'i-carbon-ai', i18nKey: 'plugins.categories.ai' },
  { id: 'automation', icon: 'i-carbon-ai-status', i18nKey: 'plugins.categories.automation' },
  { id: 'communication', icon: 'i-carbon-chat', i18nKey: 'plugins.categories.communication' },
  { id: 'analytics', icon: 'i-carbon-chart-line-data', i18nKey: 'plugins.categories.analytics' },
  { id: 'design', icon: 'i-carbon-paint-brush', i18nKey: 'plugins.categories.design' },
  { id: 'education', icon: 'i-carbon-education', i18nKey: 'plugins.categories.education' },
  { id: 'finance', icon: 'i-carbon-currency', i18nKey: 'plugins.categories.finance' },
] as const

export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number]
export type PluginCategoryId = PluginCategory['id']

export const PLUGIN_CATEGORY_IDS = PLUGIN_CATEGORIES.map(category => category.id)

export function isPluginCategoryId(value: string): value is PluginCategoryId {
  return PLUGIN_CATEGORIES.some(category => category.id === value)
}
