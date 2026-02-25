import type { Ref } from 'vue'
import type { StorePluginListItem } from './useStoreData'
import { computed, ref } from 'vue'

interface CategoryTag {
  tag: string
  filter: string
  label?: string
}

/**
 * Composable for managing store categories
 * Handles category filtering and tag management
 */
export function useStoreCategories(plugins: Ref<StorePluginListItem[]>) {
  const tagInd = ref(0)
  const tags = ref<CategoryTag[]>([{ tag: 'store.categories.all', filter: '' }])

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

    const base: CategoryTag[] = [{ tag: 'store.categories.all', filter: '' }]

    for (const category of categories) {
      const lower = category.toLowerCase()

      // Map common category names to i18n keys
      const categoryKeyMap: Record<string, string> = {
        tools: 'store.categories.utilities',
        productivity: 'store.categories.productivity',
        development: 'store.categories.development',
        design: 'store.categories.design',
        media: 'store.categories.media',
        writing: 'store.categories.writing',
        dev: 'store.categories.dev'
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
