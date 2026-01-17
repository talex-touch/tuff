import type { Ref } from 'vue'
import type { MarketPluginListItem } from './useMarketData'
import { computed, ref } from 'vue'

interface CategoryTag {
  tag: string
  filter: string
  label?: string
}

/**
 * Composable for managing market categories
 * Handles category filtering and tag management
 */
export function useMarketCategories(plugins: Ref<MarketPluginListItem[]>) {
  const tagInd = ref(0)
  const tags = ref<CategoryTag[]>([{ tag: 'market.categories.all', filter: '' }])

  const selectedTag = computed(() => tags.value[tagInd.value] ?? tags.value[0])

  function updateCategoryTags(): void {
    const categories = Array.from(
      new Set(
        plugins.value
          .map((plugin) => plugin.category)
          .filter(
            (category): category is string =>
              typeof category === 'string' && category.trim().length > 0
          )
      )
    )

    const base: CategoryTag[] = [{ tag: 'market.categories.all', filter: '' }]

    for (const category of categories) {
      const lower = category.toLowerCase()

      // Map common category names to i18n keys
      const categoryKeyMap: Record<string, string> = {
        tools: 'market.categories.utilities',
        productivity: 'market.categories.productivity',
        development: 'market.categories.development',
        design: 'market.categories.design',
        media: 'market.categories.media',
        writing: 'market.categories.writing',
        dev: 'market.categories.dev'
      }

      const tag = categoryKeyMap[lower] || ''

      base.push({
        tag,
        filter: lower,
        label: tag ? undefined : category
      })
    }

    tags.value = base
    if (tagInd.value >= tags.value.length) tagInd.value = 0
  }

  return {
    tags,
    tagInd,
    selectedTag,
    updateCategoryTags
  }
}
