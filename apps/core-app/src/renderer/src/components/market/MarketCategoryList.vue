<script setup lang="ts" name="MarketCategoryList">
import { useI18n } from 'vue-i18n'

interface CategoryTag {
  tag: string
  filter: string
  label?: string
}

defineProps<{
  categories: CategoryTag[]
  selectedIndex: number
}>()

const emit = defineEmits<{
  'update:selected-index': [index: number]
}>()

const { t } = useI18n()

function handleSelect(index: number): void {
  emit('update:selected-index', index)
}

function getCategoryIcon(category: CategoryTag): string {
  const filter = category.filter
  const iconMap: Record<string, string> = {
    '': 'i-carbon-apps',
    'productivity': 'i-carbon-rocket',
    'development': 'i-carbon-code',
    'tools': 'i-carbon-tools',
    'utilities': 'i-carbon-tools-alt',
    'design': 'i-carbon-paint-brush',
    'media': 'i-carbon-image',
    'writing': 'i-carbon-pen',
    'dev': 'i-carbon-terminal'
  }
  return iconMap[filter] || 'i-carbon-folder'
}
</script>

<template>
  <div class="market-category-list">
    <div class="category-header">
      <h3>{{ t('market.categories.title') }}</h3>
    </div>
    <div class="category-items">
      <button
        v-for="(category, index) in categories"
        :key="category.tag || category.label || index"
        :class="{ active: selectedIndex === index }"
        class="category-item"
        @click="handleSelect(index)"
      >
        <i :class="getCategoryIcon(category)" class="category-icon" />
        <span class="category-label">{{ category.label ?? t(category.tag) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.market-category-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  height: 100%;
}

.category-header {
  padding: 0 1rem;

  h3 {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--el-text-color-secondary);
    opacity: 0.7;
  }
}

.category-items {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.category-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 1rem;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  font-size: 0.875rem;
  color: var(--el-text-color-regular);

  &:hover {
    background: var(--el-fill-color-light);
    color: var(--el-color-primary);

    .category-icon {
      color: var(--el-color-primary);
    }
  }

  &.active {
    background: rgba(var(--el-color-primary-rgb), 0.12);
    color: var(--el-color-primary);
    font-weight: 600;

    .category-icon {
      color: var(--el-color-primary);
    }

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 60%;
      background: var(--el-color-primary);
      border-radius: 0 4px 4px 0;
    }
  }
}

.category-icon {
  font-size: 1.125rem;
  color: var(--el-text-color-secondary);
  transition: color 0.2s ease;
  flex-shrink: 0;
}

.category-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
