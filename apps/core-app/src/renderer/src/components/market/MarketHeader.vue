<script setup lang="ts" name="MarketHeader">
import { TxRadio, TxRadioGroup } from '@talex-touch/tuffex'
import type { MarketProviderResultMeta } from '@talex-touch/utils/market'
import { ref } from 'vue'
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
  providerDetails?: MarketProviderResultMeta[]
}>()

const emit = defineEmits<{
  refresh: []
  'open-source-editor': []
  search: [query: string]
}>()

const { t } = useI18n()

const showErrorDrawer = ref(false)

function handleSearch(query: string): void {
  emit('search', query)
}

function openErrorDetails(): void {
  showErrorDrawer.value = true
}

const viewType = defineModel<'grid' | 'list'>('viewType', { default: 'grid' })
const tabs = defineModel<'market' | 'installed'>('tabs', { default: 'market' })
</script>

<template>
  <div flex="~ col" border-b="1 solid [var(--el-border-color-lighter)]">
    <div
      flex="~ justify-between items-center"
      border-b="1 solid [var(--el-border-color-lighter)]"
      p="x-4 y-2"
      bg="[var(--el-bg-color-page)]"
      class="fake-background"
      style="--fake-opacity: 0.5"
    >
      <TxRadioGroup v-model="tabs" glass>
        <TxRadio value="market" label="Market" />
        <TxRadio value="installed" label="Installed" />
      </TxRadioGroup>

      <div flex items-center gap-2>
        <div flex items-center gap-2 text-xs>
          <span op-60 whitespace-nowrap text="[var(--el-text-color-regular)]">
            {{ sourcesCount }} {{ t('market.sources') }}
          </span>
          <span
            v-if="providerStats"
            class="provider-status"
            :class="{ clickable: providerStats.failed > 0 }"
            @click="providerStats.failed > 0 && openErrorDetails()"
          >
            <span class="status-success">
              <i class="i-ri-check-line" />
              {{ providerStats.success }}
            </span>
            <span
              v-if="providerStats.failed > 0"
              class="status-failed"
              :title="t('market.clickToViewErrors')"
            >
              <i class="i-ri-close-line" />
              {{ providerStats.failed }}
            </span>
          </span>
        </div>
        <FlatButton mini @click="emit('open-source-editor')">
          <div class="i-carbon-list" />
        </FlatButton>
      </div>
    </div>

    <div flex items-center justify-between gap-4 px-4 py-2>
      <div flex items-center gap-3>
        <FlatCompletion
          :fetch="() => []"
          :placeholder="t('market.searchPlaceholder')"
          class="search-input"
          @search="handleSearch"
        />
      </div>

      <div flex items-center gap-2>
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
  </div>

  <!-- Error Details Drawer -->
  <el-drawer
    v-model="showErrorDrawer"
    :title="t('market.errorDetails')"
    direction="rtl"
    size="400px"
  >
    <div class="error-drawer-content">
      <div v-if="providerDetails?.length" class="provider-list">
        <div
          v-for="provider in providerDetails"
          :key="provider.providerId"
          class="provider-item"
          :class="{ 'is-error': !provider.success }"
        >
          <div class="provider-header">
            <span class="provider-name">{{ provider.providerName }}</span>
            <span class="provider-type">{{ provider.providerType }}</span>
          </div>
          <div class="provider-status-row">
            <span v-if="provider.success" class="status-badge success">
              <i class="i-ri-check-line" />
              {{ t('market.statusSuccess') }}
            </span>
            <span v-else class="status-badge error">
              <i class="i-ri-close-line" />
              {{ t('market.statusFailed') }}
            </span>
            <span class="item-count">{{ provider.itemCount }} {{ t('market.plugins') }}</span>
          </div>
          <div v-if="!provider.success && provider.error" class="error-message">
            <code>{{ provider.error }}</code>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        {{ t('market.noProviderData') }}
      </div>
    </div>
  </el-drawer>
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

  &.clickable {
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: var(--el-fill-color);
      border-color: var(--el-color-danger-light-5);
    }
  }
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

// Error drawer styles
.error-drawer-content {
  padding: 0.5rem;
}

.provider-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.provider-item {
  padding: 0.75rem;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);

  &.is-error {
    border-color: var(--el-color-danger-light-5);
    background: var(--el-color-danger-light-9);
  }
}

.provider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.provider-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.provider-type {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}

.provider-status-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;

  &.success {
    color: var(--el-color-success);
    background: var(--el-color-success-light-9);
  }

  &.error {
    color: var(--el-color-danger);
    background: var(--el-color-danger-light-9);
  }
}

.item-count {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
}

.error-message {
  margin-top: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  background: var(--el-fill-color-dark);
  overflow-x: auto;

  code {
    font-size: 0.75rem;
    color: var(--el-color-danger);
    word-break: break-all;
    white-space: pre-wrap;
  }
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--el-text-color-secondary);
}
</style>
