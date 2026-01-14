<script lang="ts" name="Plugin" setup>
import type { ITouchPlugin } from '@talex-touch/utils'
import { useTouchSDK } from '@talex-touch/utils/renderer'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FlatButton from '~/components/base/button/FlatButton.vue'
import PluginEmptyState from '~/components/plugin/layout/PluginEmptyState.vue'
import PluginListModule from '~/components/plugin/layout/PluginListModule.vue'
import PluginInfo from '~/components/plugin/PluginInfo.vue'
import TuffAsideTemplate from '~/components/tuff/template/TuffAsideTemplate.vue'
import { usePluginSelection } from '~/modules/hooks/usePluginSelection'
import { appSetting } from '~/modules/channel/storage'
import PluginNew from './plugin/PluginNew.vue'

const { t } = useI18n()

const { plugins, curSelect, selectPlugin } = usePluginSelection()
const developerMode = computed(() => Boolean(appSetting?.dev?.developerMode))
const visiblePlugins = computed(() => {
  if (developerMode.value) return plugins.value
  return plugins.value.filter(p => !p.meta?.internal)
})

const drawerVisible = ref(false)
const touchSdk = useTouchSDK()
const searchQuery = ref('')
const selectedPlugin = ref<ITouchPlugin | null>(null)

const loadingStates = ref({
  openFolder: false
})

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

async function handleOpenPluginFolder(): Promise<void> {
  if (loadingStates.value.openFolder) return

  loadingStates.value.openFolder = true
  try {
    await touchSdk.openModuleFolder('plugins')
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
        <FlatButton class="action-btn add-btn flex-1" @click="drawerVisible = true">
          <i class="i-ri-add-line" />
          <span>{{ t('plugin.add', 'Add') }}</span>
        </FlatButton>
        <FlatButton
          class="action-btn folder-btn"
          :disabled="loadingStates.openFolder"
          @click="handleOpenPluginFolder"
        >
          <i v-if="!loadingStates.openFolder" class="i-ri-folder-open-line" />
          <i v-else class="i-ri-loader-4-line animate-spin" />
        </FlatButton>
      </div>
    </template>

    <!-- Main Content -->
    <template #main>
      <div v-if="curSelect" :key="curSelect.name" class="h-full flex flex-col">
        <div class="flex-1 overflow-auto p-0">
          <PluginInfo :plugin="curSelect" />
        </div>
      </div>
      <PluginEmptyState v-else />
    </template>
  </TuffAsideTemplate>

  <!-- New Plugin Drawer -->
  <el-drawer v-model="drawerVisible" direction="ltr" size="100%" :with-header="false">
    <PluginNew @close="drawerVisible = false" />
  </el-drawer>
</template>

<style lang="scss" scoped>
.plugin-shell {
  height: 100%;
}

.action-btn :deep(.FlatButton-Container) {
  @apply h-9 flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 ease-out px-3;
}

.action-btn :deep(.FlatButton-Container) i {
  @apply text-base;
}

.action-btn :deep(.FlatButton-Container:disabled) {
  @apply opacity-60 cursor-not-allowed;
  transform: none !important;
}

.add-btn :deep(.FlatButton-Container) {
  @apply bg-[var(--el-color-primary)] text-white;
}

.add-btn :deep(.FlatButton-Container:hover:not(:disabled)) {
  @apply bg-[var(--el-color-primary-light-3)] -translate-y-px;
}

.folder-btn :deep(.FlatButton-Container) {
  @apply bg-[var(--el-fill-color)] text-[var(--el-text-color-primary)] border border-[var(--el-border-color)] px-3;
}

.folder-btn :deep(.FlatButton-Container:hover:not(:disabled)) {
  @apply bg-[var(--el-fill-color-light)] border-[var(--el-color-primary-light-5)] text-[var(--el-color-primary)];
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
