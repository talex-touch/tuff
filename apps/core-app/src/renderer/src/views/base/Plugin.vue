<script lang="ts" name="Plugin" setup>
import type { ITouchPlugin } from '@talex-touch/utils'
import { TxButton, TxFlipOverlay } from '@talex-touch/tuffex'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TouchScroll from '~/components/base/TouchScroll.vue'
import PluginEmptyState from '~/components/plugin/layout/PluginEmptyState.vue'
import PluginListModule from '~/components/plugin/layout/PluginListModule.vue'
import PluginInfo from '~/components/plugin/PluginInfo.vue'
import TuffAsideTemplate from '~/components/tuff/template/TuffAsideTemplate.vue'
import { appSetting } from '~/modules/channel/storage'
import { usePluginSelection } from '~/modules/hooks/usePluginSelection'
import { useStartupInfo } from '~/modules/hooks/useStartupInfo'
import PluginNew from './plugin/PluginNew.vue'

const { t } = useI18n()
const appSdk = useAppSdk()
const { ensureStartupInfo } = useStartupInfo()

const { plugins, curSelect, selectPlugin } = usePluginSelection()
const developerMode = computed(() => Boolean(appSetting?.dev?.developerMode))
const visiblePlugins = computed(() => {
  if (developerMode.value) return plugins.value
  return plugins.value.filter((p) => !p.meta?.internal)
})

const drawerVisible = ref(false)
const drawerSource = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const selectedPlugin = ref<ITouchPlugin | null>(null)

const loadingStates = ref({
  openFolder: false
})

const FLIP_DURATION = 420
const FLIP_ROTATE_X = 6
const FLIP_ROTATE_Y = 8
const FLIP_SPEED_BOOST = 1.08

// Running plugins (status 3 or 4)
const runningPlugins = computed(() =>
  visiblePlugins.value.filter((plugin) => plugin.status === 3 || plugin.status === 4)
)

// Filtered plugins based on search query
const filteredRunningPlugins = computed(() => {
  if (!searchQuery.value.trim()) return runningPlugins.value
  const query = searchQuery.value.toLowerCase()
  return runningPlugins.value.filter(
    (plugin) =>
      plugin.name.toLowerCase().includes(query) || plugin.desc?.toLowerCase().includes(query)
  )
})

const filteredAllPlugins = computed(() => {
  if (!searchQuery.value.trim()) return visiblePlugins.value
  const query = searchQuery.value.toLowerCase()
  return visiblePlugins.value.filter(
    (plugin) =>
      plugin.name.toLowerCase().includes(query) || plugin.desc?.toLowerCase().includes(query)
  )
})

function handleSelectPlugin(plugin: ITouchPlugin | null) {
  selectedPlugin.value = plugin
  if (plugin) selectPlugin(plugin.name)
}

function openNewPluginDrawer(event: MouseEvent) {
  if (event.currentTarget instanceof HTMLElement) {
    drawerSource.value = event.currentTarget
  }
  drawerVisible.value = true
}

async function handleOpenPluginFolder(): Promise<void> {
  if (loadingStates.value.openFolder) return

  loadingStates.value.openFolder = true
  try {
    const info = await ensureStartupInfo()
    const pluginPath = info?.path?.pluginPath || info?.path?.modulePath
    if (!pluginPath) {
      throw new Error('Plugin path unavailable')
    }
    await appSdk.showInFolder(pluginPath)
  } catch (error) {
    console.error('Failed to open plugin folder:', error)
  } finally {
    loadingStates.value.openFolder = false
  }
}
</script>

<template>
  <TuffAsideTemplate
    v-model="searchQuery"
    class="plugin-shell flex-1"
    search-id="plugin-search"
    :search-placeholder="t('plugin.searchPlaceholder', 'Search plugins...')"
  >
    <!-- Plugin List -->
    <PluginListModule
      v-model="selectedPlugin"
      :shrink="true"
      :plugins="filteredRunningPlugins"
      @update:model-value="handleSelectPlugin"
    >
      <template #name>
        {{ t('plugin.running', 'Running') }}
      </template>
    </PluginListModule>

    <PluginListModule
      v-model="selectedPlugin"
      :shrink="false"
      :plugins="filteredAllPlugins"
      @update:model-value="handleSelectPlugin"
    >
      <template #name>
        {{ t('plugin.all', 'All') }}
      </template>
    </PluginListModule>

    <!-- Footer with actions -->
    <template #footer>
      <div class="flex gap-2">
        <TxButton variant="flat" class="action-btn add-btn flex-1" @click="openNewPluginDrawer">
          <i class="i-ri-add-line" />
          <span>{{ t('plugin.add', 'Add') }}</span>
        </TxButton>
        <TxButton
          variant="flat"
          class="action-btn folder-btn"
          :disabled="loadingStates.openFolder"
          @click="handleOpenPluginFolder"
        >
          <i v-if="!loadingStates.openFolder" class="i-ri-folder-open-line" />
          <i v-else class="i-ri-loader-4-line animate-spin" />
        </TxButton>
      </div>
    </template>

    <!-- Main Content -->
    <template #main>
      <div v-if="curSelect" :key="curSelect.name" class="h-full flex flex-col">
        <TouchScroll no-padding class="flex-1">
          <PluginInfo :plugin="curSelect" />
        </TouchScroll>
      </div>
      <PluginEmptyState v-else />
    </template>
  </TuffAsideTemplate>

  <!-- New Plugin Drawer -->
  <Teleport to="body">
    <TxFlipOverlay
      v-model="drawerVisible"
      :source="drawerSource"
      :duration="FLIP_DURATION"
      :rotate-x="FLIP_ROTATE_X"
      :rotate-y="FLIP_ROTATE_Y"
      :speed-boost="FLIP_SPEED_BOOST"
      transition-name="PluginDrawer-Mask"
      mask-class="PluginDrawer-Mask"
      card-class="PluginDrawer-Card"
    >
      <template #default="{ close }">
        <div class="PluginDrawer">
          <PluginNew @close="close" />
        </div>
      </template>
    </TxFlipOverlay>
  </Teleport>
</template>

<style lang="scss" scoped>
.plugin-shell {
  height: 100%;
}

.action-btn :deep(.tx-button) {
  @apply h-9 flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 ease-out px-3;
}

.action-btn :deep(.tx-button) i {
  @apply text-base;
}

.action-btn :deep(.tx-button:disabled) {
  @apply opacity-60 cursor-not-allowed;
  transform: none !important;
}

.add-btn :deep(.tx-button) {
  @apply bg-[var(--tx-color-primary)] text-white;
}

.add-btn :deep(.tx-button:hover:not(:disabled)) {
  @apply bg-[var(--tx-color-primary-light-3)] -translate-y-px;
}

.folder-btn :deep(.tx-button) {
  @apply bg-[var(--tx-fill-color)] text-[var(--tx-text-color-primary)] border border-[var(--tx-border-color)] px-3;
}

.folder-btn :deep(.tx-button:hover:not(:disabled)) {
  @apply bg-[var(--tx-fill-color-light)] border-[var(--tx-color-primary-light-5)] text-[var(--tx-color-primary)];
}

:global(.PluginDrawer-Mask) {
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(6px);
}

:global(.PluginDrawer-Card) {
  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  background: var(--tx-bg-color-page);
  border-radius: 0;
  overflow: hidden;
}

.PluginDrawer {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
