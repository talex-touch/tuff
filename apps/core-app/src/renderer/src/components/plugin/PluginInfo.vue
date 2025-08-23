<template>
  <div
    class="plugin-info-root h-full flex flex-col bg-gray-50 dark:bg-gray-900 relative"
    :class="{ 'has-error-glow': hasErrors }"
  >
    <!-- Plugin Header -->
    <div
      class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
    >
      <div class="flex items-center gap-3">
        <div class="relative">
          <div
            class="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"
          >
            <PluginIcon :alt="plugin.name" :icon="plugin.icon" />
          </div>
          <div
            class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800"
            :class="statusClass.indicator"
          />
        </div>

        <div class="min-w-0 flex-1">
          <h1 class="text-lg font-semibold text-gray-900 dark:text-white truncate">
            {{ plugin.name }}
          </h1>
          <p class="text-sm text-gray-600 dark:text-gray-400 truncate">{{ plugin.desc }}</p>
          <div class="flex gap-2 mt-1">
            <span
              v-if="plugin.dev?.enable"
              class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded"
            >
              <i class="i-ri-code-line" />
              Dev
            </span>
            <span
              class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded"
            >
              <i class="i-ri-price-tag-3-line" />
              v{{ plugin.version }}
            </span>
          </div>
        </div>
      </div>

      <FlatButton
        class="h-10 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 flex items-center justify-center transition-colors disabled:opacity-50"
        :disabled="loadingStates.openFolder"
        @click="handleOpenPluginFolder"
      >
        <i v-if="!loadingStates.openFolder" class="i-ri-folder-open-line text-lg" />
        <i v-else class="i-ri-loader-4-line text-lg animate-spin" />
        <span class="block text-sm">{{
          loadingStates.openFolder ? 'Opening...' : 'Open Folder'
        }}</span>
      </FlatButton>
    </div>

    <!-- Status Section -->
    <PluginStatus :plugin="plugin" />

    <!-- Tabs Section -->
    <div class="flex-1 overflow-hidden">
      <TvTabs v-model="activeTab">
        <TvTabItem icon="dashboard" name="Overview">
          <PluginOverview :plugin="plugin" />
        </TvTabItem>
        <TvTabItem v-if="hasIssues" name="Issues">
          <template #icon>
            <i
              class="i-ri-error-warning-fill"
              :class="{ 'text-red-500': hasErrors, 'text-yellow-500': !hasErrors }"
            />
          </template>
          <PluginIssues :plugin="plugin" />
        </TvTabItem>
        <TvTabItem icon="function" name="Features">
          <PluginFeatures :plugin="plugin" />
        </TvTabItem>
        <TvTabItem icon="database" name="Storage(Mock)">
          <PluginStorage :plugin="plugin" />
        </TvTabItem>
        <TvTabItem icon="file-text" name="Logs(Mock)">
          <PluginLogs :plugin="plugin" />
        </TvTabItem>
        <TvTabItem icon="information" name="Details">
          <PluginDetails :plugin="plugin" />
        </TvTabItem>
      </TvTabs>
    </div>
  </div>
</template>

<script lang="ts" name="PluginInfo" setup>
import { ref, computed, watchEffect } from 'vue'
import { PluginStatus as EPluginStatus } from '@talex-touch/utils'
import FlatButton from '../base/button/FlatButton.vue'
import PluginStatus from '@comp/plugin/action/PluginStatus.vue'
import TvTabs from '@comp/tabs/vertical/TvTabs.vue'
import TvTabItem from '@comp/tabs/vertical/TvTabItem.vue'
import PluginOverview from './tabs/PluginOverview.vue'
import PluginFeatures from './tabs/PluginFeatures.vue'
import PluginStorage from './tabs/PluginStorage.vue'
import PluginLogs from './tabs/PluginLogs.vue'
import PluginDetails from './tabs/PluginDetails.vue'
import PluginIssues from './tabs/PluginIssues.vue'
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import { useTouchSDK } from '@talex-touch/utils/renderer'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// SDK and state
const touchSdk = useTouchSDK()

// Tabs state
const activeTab = ref('Overview')

// Loading states
const loadingStates = ref({
  openFolder: false
})

const hasIssues = computed(() => props.plugin.issues && props.plugin.issues.length > 0)
const hasErrors = computed(() => props.plugin.issues?.some((issue) => issue.type === 'error'))

watchEffect(() => {
  if (hasErrors.value) {
    activeTab.value = 'Issues'
  }
})

// Status mapping
const statusMap = {
  [EPluginStatus.ACTIVE]: { indicator: 'bg-green-500' },
  [EPluginStatus.ENABLED]: { indicator: 'bg-green-500' },
  [EPluginStatus.DISABLED]: { indicator: 'bg-yellow-500' },
  [EPluginStatus.CRASHED]: { indicator: 'bg-red-500' },
  [EPluginStatus.LOAD_FAILED]: { indicator: 'bg-red-500' },
  [EPluginStatus.LOADING]: { indicator: 'bg-blue-500' }
}

const statusClass = computed(() => {
  if (!props.plugin) return { indicator: 'bg-gray-400' }
  return statusMap[props.plugin.status] ?? { indicator: 'bg-gray-400' }
})

// Action handlers
async function handleOpenPluginFolder(): Promise<void> {
  if (!props.plugin || loadingStates.value.openFolder) return

  loadingStates.value.openFolder = true
  try {
    await touchSdk.openPluginFolder(props.plugin.name)
  } catch (error) {
    console.error('Failed to open plugin folder:', error)
  } finally {
    loadingStates.value.openFolder = false
  }
}
</script>

<style lang="scss" scoped>
.plugin-info-root.has-error-glow {
  &::before,
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 0.5rem; /* match parent */
    pointer-events: none;
  }

  &::after {
    pointer-events: none;
    animation: spin 1s linear infinite;
    z-index: 10;
    border: 1px solid rgba(239, 68, 68, 1);
    border-radius: 4px 8px 8px 4px;
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0%,
  100% {
    border-width: 5px;
    filter: blur(5px);
  }
  50% {
    border-width: 1px;
    filter: blur(0px);
  }
}
</style>
