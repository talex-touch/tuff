<script lang="ts" name="PluginInfo" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import type { VNode } from 'vue'
import { PluginStatus as EPluginStatus } from '@talex-touch/utils'
import { useTouchSDK } from '@talex-touch/utils/renderer'
import { ElMessageBox, ElPopover } from 'element-plus'
import { computed, ref, useSlots, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import DefaultIcon from '~/assets/svg/EmptyAppPlaceholder.svg?url'
import TuffIcon from '~/components/base/TuffIcon.vue'
import PluginStatus from '~/components/plugin/action/PluginStatus.vue'
import TvTabItem from '~/components/tabs/vertical/TvTabItem.vue'
import TvTabs from '~/components/tabs/vertical/TvTabs.vue'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'
import PluginDetails from './tabs/PluginDetails.vue'
import PluginFeatures from './tabs/PluginFeatures.vue'
import PluginIssues from './tabs/PluginIssues.vue'
import PluginLogs from './tabs/PluginLogs.vue'
import PluginOverview from './tabs/PluginOverview.vue'
import PluginPermissions from './tabs/PluginPermissions.vue'
import PluginStorage from './tabs/PluginStorage.vue'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// SDK and state
const touchSdk = useTouchSDK()
const { t } = useI18n()

// Tabs state
const tabsModel = ref<Record<number, string>>({ 1: 'Overview' })

// Loading states
const loadingStates = ref({
  reload: false,
  openFolder: false,
  uninstall: false,
  openDevTools: false
})

const hasIssues = computed(() => props.plugin.issues && props.plugin.issues.length > 0)
const hasErrors = computed(() => props.plugin.issues?.some((issue) => issue.type === 'error'))

const isAppDev = computed(() => window.$startupInfo?.isDev === true)

// Watch for errors and auto-select the 'Issues' tab
const slots = useSlots()
const tabItems = computed(() => {
  const defaultSlots = slots.default?.() || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return defaultSlots.filter((vnode: VNode) => (vnode.type as any)?.name === 'TvTabItem')
})

watchEffect(() => {
  if (hasErrors.value) {
    const issuesTabIndex = tabItems.value.findIndex(
      (vnode: VNode) => vnode.props?.name === 'Issues'
    )
    if (issuesTabIndex !== -1) {
      tabsModel.value = { [issuesTabIndex + 1]: 'Issues' }
    }
  }
})

// Status mapping
const statusMap = {
  [EPluginStatus.ACTIVE]: { indicator: 'bg-green-500' },
  [EPluginStatus.ENABLED]: { indicator: 'bg-green-500' },
  [EPluginStatus.DISABLED]: { indicator: 'bg-yellow-500' },
  [EPluginStatus.CRASHED]: { indicator: 'bg-red-500' },
  [EPluginStatus.LOAD_FAILED]: { indicator: 'bg-red-500' },
  [EPluginStatus.LOADING]: { indicator: 'bg-blue-500' },
  [EPluginStatus.DEV_DISCONNECTED]: { indicator: 'bg-orange-500' },
  [EPluginStatus.DEV_RECONNECTING]: { indicator: 'bg-orange-500' }
}

const statusClass = computed(() => {
  if (!props.plugin) return { indicator: 'bg-gray-400' }
  return statusMap[props.plugin.status] ?? { indicator: 'bg-gray-400' }
})

async function handleReloadPlugin(): Promise<void> {
  if (!props.plugin) return

  await touchSdk.reloadPlugin(props.plugin.name)
}

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

async function handleOpenDevTools(): Promise<void> {
  if (!props.plugin || loadingStates.value.openDevTools) return

  loadingStates.value.openDevTools = true
  try {
    await touchSdk.openPluginDevTools(props.plugin.name)
  } catch (error) {
    console.error('Failed to open plugin DevTools:', error)
    toast.error(t('plugin.actions.openDevToolsFailed'))
  } finally {
    loadingStates.value.openDevTools = false
  }
}

async function handleUninstallPlugin(): Promise<void> {
  if (!props.plugin || loadingStates.value.uninstall) return

  try {
    await ElMessageBox.confirm(
      t('plugin.uninstall.confirmMessage', { name: props.plugin.name }),
      t('plugin.uninstall.confirmTitle'),
      {
        type: 'warning',
        confirmButtonText: t('plugin.uninstall.confirmButton'),
        cancelButtonText: t('plugin.uninstall.cancelButton')
      }
    )
  } catch {
    return
  }

  loadingStates.value.uninstall = true
  try {
    const success = await pluginSDK.uninstall(props.plugin.name)
    if (success) {
      toast.success(t('plugin.uninstall.success', { name: props.plugin.name }))
    } else {
      toast.error(t('plugin.uninstall.failed', { name: props.plugin.name }))
    }
  } catch (error) {
    console.error('Failed to uninstall plugin:', error)
    toast.error(t('plugin.uninstall.failed', { name: props.plugin.name }))
  } finally {
    loadingStates.value.uninstall = false
  }
}
</script>

<template>
  <div
    class="plugin-info-root h-full flex flex-col relative"
    :class="{ 'has-error-glow': hasErrors }"
  >
    <div class="PluginInfo-Header flex items-center justify-between px-4 py-2">
      <div class="flex items-center gap-2 min-w-0">
        <div class="relative">
          <TuffIcon
            colorful
            :empty="DefaultIcon"
            :alt="plugin.name"
            :icon="plugin.icon"
            :size="32"
          />
          <div
            class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800"
            :class="statusClass.indicator"
          />
        </div>

        <div class="min-w-0 flex-1">
          <div class="PluginInfo-TitleRow flex items-center gap-2 min-w-0">
            <h1
              class="PluginInfo-Name text-base font-semibold text-gray-900 dark:text-white truncate"
            >
              {{ plugin.name }}
            </h1>
            <span class="PluginInfo-Version text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">
              v{{ plugin.version }}
            </span>
            <span
              v-if="plugin.dev?.enable"
              class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded flex-shrink-0"
            >
              <i class="i-ri-code-line" />
              {{ t('plugin.badges.dev') }}
            </span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <PluginStatus class="PluginInfo-CompactStatus" :plugin="plugin" :shrink="true" />
        <ElPopover
          placement="bottom-end"
          :width="200"
          trigger="click"
          popper-class="plugin-actions-popover"
        >
          <template #reference>
            <button
              class="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <i class="i-ri-more-2-line text-lg text-gray-600 dark:text-gray-400" />
            </button>
          </template>
          <div class="plugin-actions-menu">
            <div
              class="action-item"
              :class="{ disabled: loadingStates.reload }"
              @click="handleReloadPlugin"
            >
              <i v-if="!loadingStates.reload" class="i-ri-refresh-line" />
              <i v-else class="i-ri-loader-4-line animate-spin" />
              <span>{{
                loadingStates.reload ? t('plugin.actions.reloading') : t('plugin.actions.reload')
              }}</span>
            </div>
            <div
              class="action-item"
              :class="{ disabled: loadingStates.openFolder }"
              @click="handleOpenPluginFolder"
            >
              <i v-if="!loadingStates.openFolder" class="i-ri-folder-open-line" />
              <i v-else class="i-ri-loader-4-line animate-spin" />
              <span>{{
                loadingStates.openFolder
                  ? t('plugin.actions.opening')
                  : t('plugin.actions.openFolder')
              }}</span>
            </div>
            <div
              v-if="plugin.dev?.enable || isAppDev"
              class="action-item"
              :class="{ disabled: loadingStates.openDevTools }"
              @click="handleOpenDevTools"
            >
              <i v-if="!loadingStates.openDevTools" class="i-ri-bug-line" />
              <i v-else class="i-ri-loader-4-line animate-spin" />
              <span>{{ t('plugin.actions.openDevTools') }}</span>
            </div>
            <div
              class="action-item danger"
              :class="{ disabled: loadingStates.uninstall }"
              @click="handleUninstallPlugin"
            >
              <i v-if="!loadingStates.uninstall" class="i-ri-delete-bin-6-line" />
              <i v-else class="i-ri-loader-4-line animate-spin" />
              <span>{{
                loadingStates.uninstall
                  ? t('plugin.actions.uninstalling')
                  : t('plugin.actions.uninstall')
              }}</span>
            </div>
          </div>
        </ElPopover>
      </div>
    </div>

    <!-- Tabs Section -->
    <div class="flex-1 overflow-hidden">
      <TvTabs v-model="tabsModel" :show-indicator="false">
        <TvTabItem icon="dashboard-line" name="Overview" :label="t('plugin.tabs.overview')">
          <PluginOverview :plugin="plugin" />
        </TvTabItem>
        <TvTabItem v-if="hasIssues" name="Issues" :label="t('plugin.tabs.issues')">
          <template #icon>
            <i
              class="i-ri-error-warning-fill"
              :class="{ 'text-red-500': hasErrors, 'text-yellow-500': !hasErrors }"
            />
          </template>
          <PluginIssues :plugin="plugin" />
        </TvTabItem>
        <TvTabItem icon="function-line" name="Features" :label="t('plugin.tabs.features')">
          <PluginFeatures :plugin="plugin" />
        </TvTabItem>
        <TvTabItem
          icon="shield-keyhole-line"
          name="Permissions"
          :label="t('plugin.tabs.permissions')"
        >
          <PluginPermissions :plugin="plugin" />
        </TvTabItem>
        <TvTabItem icon="database-2-line" name="Storage" :label="t('plugin.tabs.storage')">
          <PluginStorage :plugin="plugin" />
        </TvTabItem>
        <TvTabItem icon="file-text-line" name="Logs" :label="t('plugin.tabs.logs')">
          <PluginLogs ref="pluginLogsRef" :plugin="plugin" />
        </TvTabItem>
        <TvTabItem icon="information-line" name="Details" :label="t('plugin.tabs.details')">
          <PluginDetails :plugin="plugin" />
        </TvTabItem>
      </TvTabs>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.PluginInfo-CompactStatus {
  :deep(.PluginStatus-Container) {
    border-bottom: 0;
    padding: 0;
    opacity: 1;
  }
}

.plugin-actions-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: var(--el-text-color-primary);

  &:hover:not(.disabled) {
    background-color: var(--el-fill-color-light);
  }

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.danger {
    color: #dc2626;
  }

  &.danger:not(.disabled):hover {
    background-color: rgba(220, 38, 38, 0.08);
  }

  i {
    font-size: 18px;
    flex-shrink: 0;
  }

  span {
    flex: 1;
  }
}

.plugin-info-root.has-error-glow {
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
    border-radius: 2px 2px 8px 2px;
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
    border-width: 2px;
    filter: blur(2px);
  }
}
</style>
