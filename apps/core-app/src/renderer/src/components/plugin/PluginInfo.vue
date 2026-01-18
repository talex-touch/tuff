<script lang="ts" name="PluginInfo" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import type { VNode } from 'vue'
import { TxSplitButton } from '@talex-touch/tuffex'
import { PluginStatus as EPluginStatus } from '@talex-touch/utils'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { ElMessageBox } from 'element-plus'
import { computed, ref, useSlots, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import DefaultIcon from '~/assets/svg/EmptyAppPlaceholder.svg?url'
import StatusIcon from '~/components/base/StatusIcon.vue'
import TvTabItem from '~/components/tabs/vertical/TvTabItem.vue'
import TvTabs from '~/components/tabs/vertical/TvTabs.vue'
import { useStartupInfo } from '~/modules/hooks/useStartupInfo'
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
const transport = useTuffTransport()
const { startupInfo } = useStartupInfo()
const { t } = useI18n()

// Tabs state
const tabsModel = ref<Record<number, string>>({ 1: 'Overview' })

// Loading states
const loadingStates = ref({
  toggle: false,
  reload: false,
  openFolder: false,
  uninstall: false,
  openDevTools: false
})

const hasIssues = computed(() => props.plugin.issues && props.plugin.issues.length > 0)
const hasErrors = computed(() => props.plugin.issues?.some((issue) => issue.type === 'error'))

const isAppDev = computed(() => startupInfo.value?.isDev === true)

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

type PluginIndicatorTone = 'none' | 'loading' | 'warning' | 'success' | 'error' | 'info'

const indicatorTone = computed<PluginIndicatorTone>(() => {
  const status = props.plugin.status

  if (status === EPluginStatus.LOADING || status === EPluginStatus.DEV_RECONNECTING)
    return 'loading'
  if (hasErrors.value) return 'error'
  if (hasIssues.value) return 'warning'

  if (status === EPluginStatus.LOAD_FAILED || status === EPluginStatus.CRASHED) return 'error'
  if (status === EPluginStatus.DEV_DISCONNECTED) return 'warning'
  if (status === EPluginStatus.DISABLED || status === EPluginStatus.DISABLING) return 'info'
  if (
    status === EPluginStatus.ACTIVE ||
    status === EPluginStatus.ENABLED ||
    status === EPluginStatus.LOADED
  )
    return 'success'

  return 'none'
})

async function handleReloadPlugin(): Promise<void> {
  if (!props.plugin || loadingStates.value.reload) return

  loadingStates.value.reload = true
  try {
    await pluginSDK.reload(props.plugin.name)
  } finally {
    loadingStates.value.reload = false
  }
}

async function handleOpenPluginFolder(): Promise<void> {
  if (!props.plugin || loadingStates.value.openFolder) return

  loadingStates.value.openFolder = true
  try {
    await pluginSDK.openFolder(props.plugin.name)
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
    const openDevTools = defineRawEvent<string, void>('plugin:open-devtools')
    await transport.send(openDevTools, props.plugin.name)
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

type PrimaryAction = 'run' | 'stop' | 'reload' | 'reconnect' | 'none'

const primaryAction = computed(() => {
  const status = props.plugin.status

  if (status === EPluginStatus.ENABLED) {
    return {
      action: 'stop' as const,
      label: t('plugin.actions.stop'),
      icon: 'i-ri-stop-fill',
      disabled: loadingStates.value.toggle,
      loading: loadingStates.value.toggle
    }
  }

  if (status === EPluginStatus.LOAD_FAILED) {
    return {
      action: 'reload' as const,
      label: t('plugin.actions.reload'),
      icon: 'i-ri-refresh-line',
      disabled: loadingStates.value.reload || loadingStates.value.toggle,
      loading: loadingStates.value.reload || loadingStates.value.toggle
    }
  }

  if (status === EPluginStatus.DEV_DISCONNECTED) {
    return {
      action: 'reconnect' as const,
      label: t('plugin.actions.reconnect'),
      icon: 'i-ri-plug-line',
      disabled: loadingStates.value.toggle,
      loading: loadingStates.value.toggle
    }
  }

  if (
    status === EPluginStatus.ACTIVE ||
    status === EPluginStatus.LOADING ||
    status === EPluginStatus.DISABLING ||
    status === EPluginStatus.DEV_RECONNECTING
  ) {
    return {
      action: 'none' as const,
      label:
        status === EPluginStatus.DEV_RECONNECTING
          ? t('plugin.actions.reconnecting')
          : t('plugin.actions.running'),
      icon: 'i-ri-loader-4-line',
      disabled: true,
      loading: true
    }
  }

  return {
    action: 'run' as const,
    label: t('plugin.actions.run'),
    icon: 'i-ri-play-fill',
    disabled: loadingStates.value.toggle,
    loading: loadingStates.value.toggle
  }
})

async function handlePrimaryAction(): Promise<void> {
  if (!props.plugin || primaryAction.value.disabled) return

  const pluginName = props.plugin.name
  const action: PrimaryAction = primaryAction.value.action
  if (action === 'none') return

  loadingStates.value.toggle = true
  try {
    if (action === 'run') {
      await pluginSDK.enable(pluginName)
    } else if (action === 'stop') {
      await pluginSDK.disable(pluginName)
    } else if (action === 'reload') {
      await handleReloadPlugin()
    } else if (action === 'reconnect') {
      await pluginSDK.reconnectDevServer(pluginName)
    }
  } catch (error) {
    console.error(
      `[PluginInfo] Failed primary action "${action}" for plugin "${pluginName}":`,
      error
    )
    toast.error(t('system.unknownError'))
  } finally {
    loadingStates.value.toggle = false
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
          <StatusIcon
            colorful
            :empty="DefaultIcon"
            :alt="plugin.name"
            :icon="plugin.icon"
            :size="32"
            :tone="indicatorTone"
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
        <TxSplitButton
          variant="primary"
          size="sm"
          :icon="primaryAction.icon"
          :loading="primaryAction.loading"
          :disabled="primaryAction.disabled"
          @click="handlePrimaryAction"
        >
          {{ primaryAction.label }}
          <template #menu="{ close }">
            <div class="plugin-actions-menu">
              <div
                class="action-item"
                :class="{ disabled: loadingStates.reload }"
                @click="
                  () => {
                    if (loadingStates.reload) return
                    close()
                    void handleReloadPlugin()
                  }
                "
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
                @click="
                  () => {
                    if (loadingStates.openFolder) return
                    close()
                    void handleOpenPluginFolder()
                  }
                "
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
                @click="
                  () => {
                    if (loadingStates.openDevTools) return
                    close()
                    void handleOpenDevTools()
                  }
                "
              >
                <i v-if="!loadingStates.openDevTools" class="i-ri-bug-line" />
                <i v-else class="i-ri-loader-4-line animate-spin" />
                <span>{{ t('plugin.actions.openDevTools') }}</span>
              </div>
              <div
                class="action-item danger"
                :class="{ disabled: loadingStates.uninstall }"
                @click="
                  () => {
                    if (loadingStates.uninstall) return
                    close()
                    void handleUninstallPlugin()
                  }
                "
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
          </template>
        </TxSplitButton>
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
