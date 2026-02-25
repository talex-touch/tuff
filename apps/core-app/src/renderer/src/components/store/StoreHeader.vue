<script setup lang="ts" name="StoreHeader">
import type { StoreProviderResultMeta } from '@talex-touch/utils/store'
import { TxButton, TxFlipOverlay, TxRadio, TxRadioGroup } from '@talex-touch/tuffex'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatCompletion from '~/components/base/input/FlatCompletion.vue'
import TLabelSelect from '~/components/base/select/TLabelSelect.vue'
import TLabelSelectItem from '~/components/base/select/TLabelSelectItem.vue'

defineProps<{
  loading: boolean
  sourcesCount: number
  showCliTab?: boolean
  providerStats?: {
    total: number
    success: number
    failed: number
    totalPlugins: number
  }
  providerDetails?: StoreProviderResultMeta[]
}>()

const emit = defineEmits<{
  refresh: []
  'open-source-editor': [source: HTMLElement | null]
  search: [query: string]
}>()

const { t } = useI18n()

const showErrorDrawer = ref(false)
const errorDrawerSource = ref<HTMLElement | null>(null)

function handleSearch(query: string): void {
  emit('search', query)
}

function openErrorDetails(event?: MouseEvent): void {
  if (event?.currentTarget instanceof HTMLElement) {
    errorDrawerSource.value = event.currentTarget
  }
  showErrorDrawer.value = true
}

function openSourceEditor(event?: MouseEvent): void {
  const source = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null
  emit('open-source-editor', source)
}

const viewType = defineModel<'grid' | 'list'>('viewType', { default: 'grid' })
const tabs = defineModel<'store' | 'installed' | 'docs' | 'cli'>('tabs', { default: 'store' })
</script>

<template>
  <div flex="~ col" border-b="1 solid [var(--tx-border-color-lighter)]">
    <div
      flex="~ justify-between items-center"
      border-b="1 solid [var(--tx-border-color-lighter)]"
      p="x-4 y-2"
      bg="[var(--tx-bg-color-page)]"
      class="fake-background"
      style="--fake-opacity: 0.5"
    >
      <TxRadioGroup v-model="tabs" glass>
        <TxRadio value="store" :label="t('flatNavBar.store')" />
        <TxRadio value="installed" :label="t('store.installed')" />
        <TxRadio value="docs" :label="t('store.docs')" />
        <TxRadio v-if="showCliTab" value="cli" :label="t('store.cli')" />
      </TxRadioGroup>

      <div v-if="tabs === 'store'" flex items-center gap-2>
        <div flex items-center gap-2 text-xs>
          <span op-60 whitespace-nowrap text="[var(--tx-text-color-regular)]">
            {{ sourcesCount }} {{ t('store.sources') }}
          </span>
          <TxButton
            v-if="providerStats"
            variant="flat"
            size="sm"
            class="provider-status"
            :class="{ clickable: providerStats.failed > 0 }"
            :disabled="providerStats.failed === 0"
            @click="providerStats.failed > 0 && openErrorDetails($event)"
          >
            <span class="status-success">
              <i class="i-ri-check-line" />
              {{ providerStats.success }}
            </span>
            <span
              v-if="providerStats.failed > 0"
              class="status-failed"
              :title="t('store.clickToViewErrors')"
            >
              <i class="i-ri-close-line" />
              {{ providerStats.failed }}
            </span>
          </TxButton>
        </div>
        <TxButton variant="flat" size="sm" @click="openSourceEditor($event)">
          <div class="i-carbon-list" />
        </TxButton>
      </div>
    </div>

    <div v-if="tabs === 'store'" flex items-center justify-between gap-4 px-4 py-2>
      <div flex items-center gap-3>
        <FlatCompletion
          :fetch="() => []"
          :placeholder="t('store.searchPlaceholder')"
          class="search-input"
          @search="handleSearch"
        />
      </div>

      <div flex items-center gap-2>
        <TLabelSelect v-model="viewType">
          <TLabelSelectItem value="grid" icon="i-carbon-table-split" />
          <TLabelSelectItem value="list" icon="i-carbon-list-boxes" />
        </TLabelSelect>

        <TxButton variant="flat" size="sm" :disabled="loading" @click="emit('refresh')">
          <i :class="loading ? 'i-ri-loader-4-line animate-spin' : 'i-ri-refresh-line'" text-base />
          <span>{{ loading ? t('store.loading') : t('store.refresh') }}</span>
        </TxButton>
      </div>
    </div>
  </div>

  <!-- Error Details Drawer -->
  <Teleport to="body">
    <TxFlipOverlay
      v-model="showErrorDrawer"
      :source="errorDrawerSource"
      :header-title="t('store.errorDetails')"
    >
      <template #default>
        <div class="error-drawer">
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
                    {{ t('store.statusSuccess') }}
                  </span>
                  <span v-else class="status-badge error">
                    <i class="i-ri-close-line" />
                    {{ t('store.statusFailed') }}
                  </span>
                  <span class="item-count">{{ provider.itemCount }} {{ t('store.plugins') }}</span>
                </div>
                <div v-if="!provider.success && provider.error" class="error-message">
                  <code>{{ provider.error }}</code>
                </div>
              </div>
            </div>
            <div v-else class="empty-state">
              {{ t('store.noProviderData') }}
            </div>
          </div>
        </div>
      </template>
    </TxFlipOverlay>
  </Teleport>
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
  background: var(--tx-fill-color-light);
  border: 1px solid var(--tx-border-color-lighter);

  &.clickable {
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: var(--tx-fill-color);
      border-color: var(--tx-color-danger-light-5);
    }
  }
}

.status-success {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  color: var(--tx-color-success);
  font-weight: 500;
}

.status-failed {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  color: var(--tx-color-danger);
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

.error-drawer {
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}

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
  background: var(--tx-fill-color-lighter);
  border: 1px solid var(--tx-border-color-lighter);

  &.is-error {
    border-color: var(--tx-color-danger-light-5);
    background: var(--tx-color-danger-light-9);
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
  color: var(--tx-text-color-primary);
}

.provider-type {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--tx-fill-color);
  color: var(--tx-text-color-secondary);
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
    color: var(--tx-color-success);
    background: var(--tx-color-success-light-9);
  }

  &.error {
    color: var(--tx-color-danger);
    background: var(--tx-color-danger-light-9);
  }
}

.item-count {
  font-size: 0.75rem;
  color: var(--tx-text-color-secondary);
}

.error-message {
  margin-top: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  background: var(--tx-fill-color-dark);
  overflow-x: auto;

  code {
    font-size: 0.75rem;
    color: var(--tx-color-danger);
    word-break: break-all;
    white-space: pre-wrap;
  }
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--tx-text-color-secondary);
}
</style>
