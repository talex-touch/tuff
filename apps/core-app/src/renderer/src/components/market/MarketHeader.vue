<script setup lang="ts" name="MarketHeader">
import { useI18n } from 'vue-i18n'
import FlatButton from '~/components/base/button/FlatButton.vue'
import FlatCompletion from '~/components/base/input/FlatCompletion.vue'
import TLabelSelect from '~/components/base/select/TLabelSelect.vue'
import TLabelSelectItem from '~/components/base/select/TLabelSelectItem.vue'

defineProps<{
  loading: boolean
  sourcesCount: number
  providerStats?: {
    total: number
    success: number
    failed: number
    totalPlugins: number
  }
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
  <div flex="~ col" gap-3 pb-3 border-b="1 solid [var(--el-border-color-lighter)]">
    <div flex items-center justify-between gap-4>
      <div flex="~ col" gap-1>
        <h2 m-0 text-xl font-700 tracking-tight text="[var(--el-text-color-primary)]">
          {{ t('market.title') }}
        </h2>
        <span text-sm op-70 text="[var(--el-text-color-regular)]">
          {{ t('market.subtitle') }}
        </span>
      </div>

      <div flex items-center gap-3>
        <FlatCompletion
          :fetch="() => []"
          :placeholder="t('market.searchPlaceholder')"
          class="search-input"
          @search="handleSearch"
        />

        <div flex items-center gap-2>
          <FlatButton mini @click="emit('open-source-editor')">
            <div class="i-carbon-list" />
          </FlatButton>
          <div flex items-center gap-2 text-xs>
            <span op-60 whitespace-nowrap text="[var(--el-text-color-regular)]">
              {{ sourcesCount }} {{ t('market.sources') }}
            </span>
            <span v-if="providerStats" class="provider-status">
              <span class="status-success">
                <i class="i-ri-check-line" />
                {{ providerStats.success }}
              </span>
              <span v-if="providerStats.failed > 0" class="status-failed">
                <i class="i-ri-close-line" />
                {{ providerStats.failed }}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div flex items-center justify-end gap-2>
      <TLabelSelect v-model="viewType">
        <TLabelSelectItem value="grid" icon="i-carbon-table-split" />
        <TLabelSelectItem value="list" icon="i-carbon-list-boxes" />
      </TLabelSelect>

      <FlatButton mini :disabled="loading" @click="emit('refresh')">
        <i :class="loading ? 'i-ri-loader-4-line animate-spin' : 'i-ri-refresh-line'" text-base />
        <span>{{ loading ? t('market.loading') : t('market.refresh') }}</span>
      </FlatButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.search-input :deep(.FlatInput-Container) {
  width: 280px;
  margin: 0;
}

.provider-status {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}

.status-success {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  color: var(--el-color-success);
  font-weight: 500;
}

.status-failed {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  color: var(--el-color-danger);
  font-weight: 500;
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
