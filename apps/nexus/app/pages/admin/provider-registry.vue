<script setup lang="ts">
import type { ProviderRegistryTab } from '~/utils/admin-provider-registry'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxErrorState } from '@talex-touch/tuffex/error-state'
import { TxFlatRadio, TxFlatRadioItem } from '@talex-touch/tuffex/flat-radio'
import { computed, ref } from 'vue'
import AdminPageShell from '~/components/admin/AdminPageShell.vue'
import AdminStatGrid from '~/components/admin/AdminStatGrid.vue'
import { useAdminFormat } from '~/composables/useAdminFormat'
import { useAdminQueryState } from '~/composables/useAdminQueryState'
import { useProviderRegistryAdmin } from '~/composables/useProviderRegistryAdmin'
import { buildProviderRegistryStatItems, PROVIDER_REGISTRY_TABS } from '~/utils/admin-provider-registry'

definePageMeta({
  layout: 'admin',
  requiresAuth: true,
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

// The administrator gate is the layout's (`useAdminGate`): this page only mounts
// for an administrator, so it neither checks the role nor asks for data it
// cannot have. The layout never server-renders the page, and the heavy panel
// stays an async chunk (`LazyDashboardProviderRegistryAdminPanel`).
const { t } = useI18n()
const format = useAdminFormat()

// One registry for the whole page: the stat cards, the Refresh button and every
// tab read the same load.
const admin = useProviderRegistryAdmin()

// The four tabs are one page addressed by `?tab=providers|routes|usage|health`.
// Only the open tab is mounted; each list keeps its page and filters in the URL
// under its own prefix, so leaving a tab and coming back lands where it was.
const activeTab = useAdminQueryState<ProviderRegistryTab>('tab', PROVIDER_REGISTRY_TABS, 'providers')

function selectTab(value: unknown) {
  if ((PROVIDER_REGISTRY_TABS as readonly unknown[]).includes(value))
    activeTab.value = value as ProviderRegistryTab
}

const statItems = computed(() => buildProviderRegistryStatItems({
  providerCount: admin.providers.value.length,
  enabledProviderCount: admin.enabledProviders.value,
  capabilityCount: admin.capabilityCount.value,
  sceneCount: admin.sceneCount.value,
  usageTotal: admin.usageTotal.value,
  unhealthyTotal: admin.unhealthyTotal.value,
}, format, t))

interface RegistryPanelHandle {
  refresh: () => Promise<void>
  openCreateProvider: () => void
  openCreateScene: () => void
}

const panel = ref<RegistryPanelHandle | null>(null)
const registryBusy = computed(() => admin.registry.loading.value || admin.registry.refreshing.value)

function refresh() {
  void admin.refresh()
  // The usage and health tabs page their own list; the others follow the registry.
  void panel.value?.refresh()
}
</script>

<template>
  <AdminPageShell :title="t('dashboard.sections.menu.providerRegistry', 'Provider Registry')">
    <template #actions>
      <TxButton
        v-if="activeTab === 'providers'"
        variant="primary"
        size="sm"
        icon="i-carbon-add"
        :disabled="!panel"
        @click="panel?.openCreateProvider()"
      >
        {{ t('dashboard.providerRegistry.providers.create', 'Create provider') }}
      </TxButton>
      <TxButton
        v-else-if="activeTab === 'routes'"
        variant="primary"
        size="sm"
        icon="i-carbon-add"
        :disabled="!panel || !admin.providers.value.length"
        @click="panel?.openCreateScene()"
      >
        {{ t('dashboard.providerRegistry.routes.create', 'Create route') }}
      </TxButton>
      <TxButton variant="secondary" size="sm" :disabled="registryBusy" @click="refresh">
        {{ t('common.refresh', 'Refresh') }}
      </TxButton>
    </template>

    <!-- The cards sit above the tab strip on every tab (both are the page's nav). -->
    <template #nav>
      <div class="RegistryNav">
        <!-- The cards are one of the blocks the registry feeds: a first load that fails
             replaces them, and a retry brings the placeholders back while it runs. -->
        <TxErrorState
          v-if="admin.registryLoadError.value && !admin.registry.loading.value"
          layout="horizontal"
          align="start"
          surface="card"
          size="small"
          :title="t('dashboard.providerRegistry.errors.loadFailedTitle', 'Could not load the provider registry')"
          :description="admin.registryLoadError.value"
          :primary-action="{ label: t('common.retry', 'Retry'), variant: 'flat' }"
          @primary="refresh"
        />
        <AdminStatGrid v-else :items="statItems" :loading="admin.registry.loading.value" :skeleton-count="5" :min="176" />
        <TxFlatRadio
          :model-value="activeTab"
          size="md"
          :aria-label="t('dashboard.providerRegistry.tabsLabel', 'Provider registry section')"
          @update:model-value="selectTab"
        >
          <TxFlatRadioItem value="providers" :label="t('dashboard.providerRegistry.tabs.providers', 'Providers')" icon="i-carbon-cloud-service-management" />
          <TxFlatRadioItem value="routes" :label="t('dashboard.providerRegistry.tabs.routes', 'Capability routes')" icon="i-carbon-flow" />
          <TxFlatRadioItem value="usage" :label="t('dashboard.providerRegistry.tabs.usage', 'Usage')" icon="i-carbon-data-check" />
          <TxFlatRadioItem value="health" :label="t('dashboard.providerRegistry.tabs.health', 'Health')" icon="i-carbon-activity" />
        </TxFlatRadio>
      </div>
    </template>

    <div class="RegistryBody">
      <TxAlert
        v-if="admin.registryRefreshError.value"
        type="error"
        :closable="false"
        :title="t('dashboard.providerRegistry.errors.refreshFailed', 'Refresh failed. Showing the last loaded data.')"
      >
        <span class="RegistryNotice">
          <span>{{ admin.registryRefreshError.value }}</span>
          <TxButton variant="flat" size="sm" :loading="admin.registry.refreshing.value" @click="refresh">
            {{ t('common.retry', 'Retry') }}
          </TxButton>
        </span>
      </TxAlert>
      <LazyDashboardProviderRegistryAdminPanel ref="panel" :admin="admin" :tab="activeTab" />
    </div>
  </AdminPageShell>
</template>

<style scoped>
.RegistryNav {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.RegistryBody {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.RegistryNotice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
</style>
