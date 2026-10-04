<script setup lang="ts">
import type { ProviderRegistryAdmin } from '~/composables/useProviderRegistryAdmin'
import type { ProviderRegistryTab } from '~/utils/admin-provider-registry'
import type { ProviderRegistryRecord, SceneRegistryRecord } from '~/utils/provider-registry-admin'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AdminConfirmDialog from '~/components/admin/AdminConfirmDialog.vue'
import { useAdminFormat } from '~/composables/useAdminFormat'
import { useProviderRegistryPanel } from '~/composables/useProviderRegistryPanel'
import { isModalKey } from '~/utils/admin-provider-registry'
import ProviderRegistryCheckDrawer from './ProviderRegistryCheckDrawer.vue'
import ProviderRegistryHealthTab from './ProviderRegistryHealthTab.vue'
import ProviderRegistryProviderDrawer from './ProviderRegistryProviderDrawer.vue'
import ProviderRegistryProvidersTab from './ProviderRegistryProvidersTab.vue'
import ProviderRegistryRoutesTab from './ProviderRegistryRoutesTab.vue'
import ProviderRegistrySceneDrawer from './ProviderRegistrySceneDrawer.vue'
import ProviderRegistryUsageTab from './ProviderRegistryUsageTab.vue'

/**
 * The provider registry page's body: the open tab, the editing drawers, and the
 * one confirmation every consequential action goes through
 * (`useProviderRegistryPanel`).
 *
 * The page owns the data (`useProviderRegistryAdmin`) and the tab (`?tab=`);
 * this stays an async chunk so no other page ships it.
 */
const props = defineProps<{
  admin: ProviderRegistryAdmin
  tab: ProviderRegistryTab
}>()

const { t } = useI18n()
const format = useAdminFormat()
const admin = props.admin

// The confirm dialog can sit over a drawer. TxDrawer listens for Tab and Escape on
// `document` whatever is on top, so keys the dialog has handled stop at <body>:
// otherwise Escape closes the drawer too and Tab pulls focus back into it.
function keepModalKeys(event: KeyboardEvent) {
  if (isModalKey(event))
    event.stopPropagation()
}
onMounted(() => document.body.addEventListener('keydown', keepModalKeys))
onBeforeUnmount(() => document.body.removeEventListener('keydown', keepModalKeys))

const activeTab = ref<{ refresh: () => Promise<void> } | null>(null)

const {
  confirmOpen,
  confirmLoading,
  pendingConfirm,
  setConfirmOpen,
  runConfirmed,
  providerDrawer,
  openProviderDrawer,
  closeProviderDrawer,
  setProviderDrawerOpen,
  submitProviderDrawer,
  sceneDrawer,
  openSceneDrawer,
  closeSceneDrawer,
  setSceneDrawerOpen,
  submitSceneDrawer,
  confirmExecute,
  checkDrawer,
  openCheckDrawer,
  closeCheckDrawer,
  setCheckDrawerOpen,
  submitCheck,
  confirmProviderStatus,
  confirmSceneStatus,
  confirmDeleteProvider,
  confirmDeleteScene,
} = useProviderRegistryPanel(admin, t, format)

defineExpose({
  /** The open tab's own list, when it pages on the server (usage, health). */
  refresh: async () => {
    await activeTab.value?.refresh()
  },
  openCreateProvider: () => openProviderDrawer('create', null),
  openCreateScene: () => openSceneDrawer('create', null),
})
</script>

<template>
  <div class="RegistryPanel">
    <ProviderRegistryProvidersTab
      v-if="tab === 'providers'"
      ref="activeTab"
      :admin="admin"
      @check="openCheckDrawer"
      @edit="(provider: ProviderRegistryRecord) => openProviderDrawer('edit', provider)"
      @quota="(provider: ProviderRegistryRecord) => openProviderDrawer('quota', provider)"
      @delete="confirmDeleteProvider"
      @toggle-status="confirmProviderStatus"
    />
    <ProviderRegistryRoutesTab
      v-else-if="tab === 'routes'"
      ref="activeTab"
      :admin="admin"
      @run="(scene: SceneRegistryRecord) => openSceneDrawer('run', scene)"
      @edit="(scene: SceneRegistryRecord) => openSceneDrawer('edit', scene)"
      @delete="confirmDeleteScene"
      @toggle-status="confirmSceneStatus"
    />
    <ProviderRegistryUsageTab v-else-if="tab === 'usage'" ref="activeTab" :admin="admin" />
    <ProviderRegistryHealthTab v-else ref="activeTab" :admin="admin" />

    <!-- Every way out of a drawer goes through its close: see `setProviderDrawerOpen`. -->
    <ProviderRegistryProviderDrawer
      :open="providerDrawer.open"
      :admin="admin"
      :mode="providerDrawer.mode"
      :provider="providerDrawer.provider"
      @update:open="setProviderDrawerOpen"
      @submit="submitProviderDrawer"
      @close="closeProviderDrawer"
    />
    <ProviderRegistrySceneDrawer
      :open="sceneDrawer.open"
      :admin="admin"
      :mode="sceneDrawer.mode"
      :scene="sceneDrawer.scene"
      @update:open="setSceneDrawerOpen"
      @submit="submitSceneDrawer"
      @close="closeSceneDrawer"
      @execute="confirmExecute"
    />
    <ProviderRegistryCheckDrawer
      v-model:capability="checkDrawer.capability"
      :open="checkDrawer.open"
      :admin="admin"
      :provider="checkDrawer.provider"
      @update:open="setCheckDrawerOpen"
      @submit="submitCheck"
      @close="closeCheckDrawer"
    />
    <AdminConfirmDialog
      :open="confirmOpen"
      :title="pendingConfirm?.title ?? ''"
      :description="pendingConfirm?.description"
      :confirm-label="pendingConfirm?.confirmLabel"
      :tone="pendingConfirm?.tone ?? 'danger'"
      :loading="confirmLoading"
      @update:open="setConfirmOpen"
      @confirm="runConfirmed"
    />
  </div>
</template>

<style scoped>
.RegistryPanel {
  min-width: 0;
}
</style>
