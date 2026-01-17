import type { FilterCategory } from '~/types/marketplace'
import { computed } from 'vue'
import { PLUGIN_CATEGORIES } from '~/utils/plugin-categories'

export function useMarketCategories() {
  const { t } = useI18n()

  const categoryOptions = computed(() => [
    {
      id: 'all' as const,
      icon: 'i-carbon-view-all',
      label: t('market.filters.all'),
    },
    ...PLUGIN_CATEGORIES.map(category => ({
      ...category,
      label: t(category.i18nKey),
    })),
  ])

  const categoryLabels = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const option of categoryOptions.value) {
      if (option.id === 'all')
        continue
      map[option.id] = option.label
      map[option.id.toLowerCase()] = option.label
      map[option.label] = option.label
      map[option.label.toLowerCase()] = option.label
    }
    return map
  })

  function resolveCategoryLabel(category: string) {
    const exact = categoryLabels.value[category]
    if (exact)
      return exact
    const lower = categoryLabels.value[category.toLowerCase()]
    if (lower)
      return lower
    return category
  }

  function matchesCategory(category: string, target: FilterCategory) {
    if (target === 'all')
      return true

    if (category === target)
      return true

    const lowerCategory = category.toLowerCase()
    if (lowerCategory === target)
      return true

    const desiredLabel = categoryLabels.value[target]
    if (!desiredLabel)
      return true

    const pluginLabel = resolveCategoryLabel(category)
    return pluginLabel === desiredLabel || pluginLabel.toLowerCase() === desiredLabel.toLowerCase()
  }

  return {
    categoryOptions,
    categoryLabels,
    resolveCategoryLabel,
    matchesCategory,
  }
}
