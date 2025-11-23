<script setup lang="ts" name="MarketHeader">
import { useI18n } from 'vue-i18n'
import FlatButton from '~/components/base/button/FlatButton.vue'
import FlatCompletion from '~/components/base/input/FlatCompletion.vue'
import TLabelSelect from '~/components/base/select/TLabelSelect.vue'
import TLabelSelectItem from '~/components/base/select/TLabelSelectItem.vue'

defineProps<{
  loading: boolean
  sourcesCount: number
}>()

const emit = defineEmits<{
  refresh: []
  'open-source-editor': []
  search: [query: string]
}>()

const { t } = useI18n()

function handleSearch(query: string): void {
  emit('search', query)
}

const viewType = defineModel<'grid' | 'list'>('viewType', { default: 'grid' })
</script>

<template>
  <div class="market-header">
    <div class="market-header-top">
      <div class="market-header-title">
        <h2>{{ t('market.title') }}</h2>
        <span class="market-subtitle">{{ t('market.subtitle') }}</span>
      </div>

      <div class="market-header-actions">
        <FlatCompletion :fetch="() => []" :placeholder="t('market.searchPlaceholder')" @search="handleSearch" />
        
        <div class="market-sources" flex items-center gap-2>
          <FlatButton mini @click="emit('open-source-editor')">
            <div class="i-carbon-list" />
          </FlatButton>
          <span class="source-count">{{ sourcesCount }} {{ t('market.sources') }}</span>
        </div>
      </div>
    </div>

    <div class="market-header-controls">
      <div class="view-toggle">
        <TLabelSelect v-model="viewType">
          <TLabelSelectItem value="grid" icon="i-carbon-table-split" />
          <TLabelSelectItem value="list" icon="i-carbon-list-boxes" />
        </TLabelSelect>
      </div>

      <FlatButton
        mini
        class="refresh-button"
        :disabled="loading"
        @click="emit('refresh')"
      >
        <i :class="loading ? 'i-ri-loader-4-line animate-spin' : 'i-ri-refresh-line'" />
        <span>{{ loading ? t('market.loading') : t('market.refresh') }}</span>
      </FlatButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.market-header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

.market-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
}

.market-header-title {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;

  h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--el-text-color-primary);
    letter-spacing: -0.025em;
  }

  .market-subtitle {
    font-size: 0.875rem;
    color: var(--el-text-color-regular);
    opacity: 0.8;
  }
}

.market-header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;

  :deep(.FlatInput-Container) {
    width: 320px;
    margin: 0;
  }
}

.market-sources {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  .source-count {
    font-size: 0.8rem;
    color: var(--el-text-color-regular);
    opacity: 0.7;
    white-space: nowrap;
  }
}

.market-header-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
}

.refresh-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;

  :deep(.FlatButton-Container) {
    min-width: 0;
    padding: 0 0.75rem;
  }

  i {
    font-size: 1rem;
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
