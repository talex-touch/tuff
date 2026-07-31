<script lang="ts" name="PluginInfo" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import { TxSplitButton } from '@talex-touch/tuffex/button'
import { TxTabItem, TxTabs } from '@talex-touch/tuffex/tabs'
import { PluginStatus as EPluginStatus } from '@talex-touch/utils'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { isPrivacySecretPasswordValid } from '@talex-touch/utils/transport/events/types/privacy'
import { computed, nextTick, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useRoute } from 'vue-router'
import DefaultIcon from '~/assets/svg/EmptyAppPlaceholder.svg?url'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import PluginFab from '~/components/plugin/PluginFab.vue'
import StatusIcon from '~/components/base/StatusIcon.vue'
import { usePluginExternalLinks } from '~/composables/plugin/usePluginExternalLinks'
import { useStartupInfo } from '~/modules/hooks/useStartupInfo'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'
import { createRendererLogger } from '~/utils/renderer-log'
import { focusModalDialog, handleModalDialogKeydown } from '~/utils/modal-dialog'
import PluginDetails from './tabs/PluginDetails.vue'
import PluginFeatures from './tabs/PluginFeatures.vue'
import PluginIssues from './tabs/PluginIssues.vue'
import PluginLogs from './tabs/PluginLogs.vue'
import PluginOverview from './tabs/PluginOverview.vue'
import PluginPermissions from './tabs/PluginPermissions.vue'
import PluginStorage from './tabs/PluginStorage.vue'
import PluginStructure from './tabs/PluginStructure.vue'

// Props
const props = defineProps<{
  plugin: ITouchPlugin
}>()

// SDK and state
const transport = useTuffTransport()
const { startupInfo } = useStartupInfo()
const { t } = useI18n()
const appSdk = useAppSdk()
const route = useRoute()
const pluginRef = toRef(props, 'plugin')
const { nexusPublishUrl } = usePluginExternalLinks(pluginRef)
const pluginInfoLog = createRendererLogger('PluginInfo')

// Tabs state
type PluginInfoTab =
  | 'Overview'
  | 'Features'
  | 'Permissions'
  | 'Storage'
  | 'Structure'
  | 'Logs'
  | 'Details'

const DEFAULT_PLUGIN_TAB: PluginInfoTab = 'Overview'
const ALWAYS_AVAILABLE_PLUGIN_TABS = new Set<PluginInfoTab>([
  'Overview',
  'Features',
  'Permissions',
  'Storage',
  'Logs',
  'Details'
])
const tabsModel = ref<PluginInfoTab>(DEFAULT_PLUGIN_TAB)

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

function resolvePluginTab(value: unknown): PluginInfoTab {
  if (typeof value !== 'string') return DEFAULT_PLUGIN_TAB
  if (ALWAYS_AVAILABLE_PLUGIN_TABS.has(value as PluginInfoTab)) {
    return value as PluginInfoTab
  }
  if (value === 'Structure' && (props.plugin.dev?.enable || isAppDev.value)) {
    return 'Structure'
  }
  return DEFAULT_PLUGIN_TAB
}

watch(
  [() => props.plugin.name, () => route.query.tab, isAppDev],
  ([, tab]) => {
    tabsModel.value = resolvePluginTab(tab)
  },
  { immediate: true }
)

type PluginIssueSeverity = 'none' | 'warning' | 'error'

const issueSeverity = computed<PluginIssueSeverity>(() => {
  if (hasErrors.value) return 'error'
  if (hasIssues.value) return 'warning'
  return 'none'
})
const issueFabRef = ref<HTMLElement | null>(null)
const showIssuesOverlay = ref(false)
const issuesOverlayExpanded = ref(false)
const issuesOverlayAnimating = ref(false)

function handleIssueFabSourceChange(source: HTMLElement | null): void {
  issueFabRef.value = source
}

function openIssuesOverlay(): void {
  if (!hasIssues.value) return
  showIssuesOverlay.value = true
}

watch(hasIssues, (value) => {
  if (!value && showIssuesOverlay.value) {
    showIssuesOverlay.value = false
  }
})

type PluginIndicatorTone = 'none' | 'loading' | 'warning' | 'success' | 'error' | 'info'

const shouldPreservePluginIconColor = computed(() => {
  const icon = props.plugin.icon
  if (!icon || icon.type === 'class' || icon.type === 'builtin' || icon.type === 'emoji') {
    return false
  }

  const value = icon.value.trim().toLowerCase()
  if (!value || value.startsWith('data:image/svg+xml')) return false

  const [path] = value.split(/[?#]/)
  return !path.endsWith('.svg')
})

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
  ) {
    return 'success'
  }

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
    pluginInfoLog.error('Failed to open plugin folder:', error)
  } finally {
    loadingStates.value.openFolder = false
  }
}

async function handleOpenDevTools(): Promise<void> {
  if (!props.plugin || loadingStates.value.openDevTools) return

  loadingStates.value.openDevTools = true
  try {
    const openDevTools = defineRawEvent<string, boolean>('plugin:open-devtools')
    const opened = await transport.send(openDevTools, props.plugin.name)
    if (!opened) {
      throw new Error(`Failed to open DevTools for plugin: ${props.plugin.name}`)
    }
  } catch (error) {
    pluginInfoLog.error('Failed to open plugin DevTools:', error)
    toast.error(t('plugin.actions.openDevToolsFailed'))
  } finally {
    loadingStates.value.openDevTools = false
  }
}

function openNexusPublishPage(): void {
  if (!nexusPublishUrl.value) return
  void appSdk.openExternal(nexusPublishUrl.value)
}

// Uninstall data disposition
interface UninstallIdentitySnapshot {
  readonly name: string
  readonly pluginInstanceId: string
  readonly activationGeneration: number
}

const uninstallConfirmVisible = ref(false)
const uninstallOrdinaryExport = ref(false)
const uninstallSecretBackup = ref(false)
const uninstallFinalImpact = ref(false)
const uninstallPassword = ref('')
const uninstallPasswordConfirmation = ref('')
const uninstallPasswordError = ref('')
const uninstallStatus = ref('')
const uninstallCanRetry = ref(true)
const uninstallDialogElement = ref<HTMLElement | null>(null)
let uninstallDialogIdentity: UninstallIdentitySnapshot | null = null
let uninstallRequestRevision = 0
let uninstallDisposed = false
let uninstallTrigger: HTMLElement | null = null

function snapshotUninstallIdentity(): UninstallIdentitySnapshot | null {
  const { name, pluginInstanceId, activationGeneration } = props.plugin
  if (
    typeof name !== 'string' ||
    name.length === 0 ||
    typeof pluginInstanceId !== 'string' ||
    pluginInstanceId.length === 0 ||
    !Number.isSafeInteger(activationGeneration) ||
    Number(activationGeneration) < 0
  ) {
    return null
  }
  return Object.freeze({
    name,
    pluginInstanceId,
    activationGeneration: Number(activationGeneration)
  })
}

function isSameUninstallIdentity(
  left: UninstallIdentitySnapshot | null,
  right: UninstallIdentitySnapshot | null
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.name === right.name &&
    left.pluginInstanceId === right.pluginInstanceId &&
    left.activationGeneration === right.activationGeneration
  )
}

function isCurrentUninstallRequest(revision: number, identity: UninstallIdentitySnapshot): boolean {
  return (
    !uninstallDisposed &&
    revision === uninstallRequestRevision &&
    isSameUninstallIdentity(uninstallDialogIdentity, identity) &&
    isSameUninstallIdentity(snapshotUninstallIdentity(), identity)
  )
}

function clearUninstallPasswords(): void {
  uninstallPassword.value = ''
  uninstallPasswordConfirmation.value = ''
}

function resetUninstallForm(): void {
  uninstallOrdinaryExport.value = false
  uninstallSecretBackup.value = false
  uninstallFinalImpact.value = false
  uninstallPasswordError.value = ''
  uninstallStatus.value = ''
  uninstallCanRetry.value = true
  clearUninstallPasswords()
}

function requestUninstall(trigger: HTMLElement | null): void {
  resetUninstallForm()
  uninstallDialogIdentity = snapshotUninstallIdentity()
  uninstallTrigger = trigger
  uninstallConfirmVisible.value = true
  if (!uninstallDialogIdentity) {
    uninstallCanRetry.value = false
    uninstallStatus.value = t('plugin.uninstall.identityUnavailable')
  }
  void nextTick(() => focusModalDialog(uninstallDialogElement.value))
}

function restoreUninstallTriggerFocus(): void {
  const trigger = uninstallTrigger
  uninstallTrigger = null
  void nextTick(() => {
    if (trigger?.isConnected && !trigger.matches(':disabled')) trigger.focus()
  })
}

function closeUninstallConfirm(allowPending = false): void {
  if (!allowPending && loadingStates.value.uninstall) return
  uninstallConfirmVisible.value = false
  uninstallDialogIdentity = null
  resetUninstallForm()
  restoreUninstallTriggerFocus()
}

function handleUninstallDialogKeydown(event: KeyboardEvent): void {
  handleModalDialogKeydown(event, uninstallDialogElement.value, {
    close: () => closeUninstallConfirm(),
    pending: loadingStates.value.uninstall
  })
}

async function confirmUninstall(): Promise<void> {
  const identity = uninstallDialogIdentity
  if (
    !identity ||
    loadingStates.value.uninstall ||
    !uninstallCanRetry.value ||
    !uninstallFinalImpact.value ||
    !isSameUninstallIdentity(identity, snapshotUninstallIdentity())
  ) {
    if (uninstallConfirmVisible.value && !loadingStates.value.uninstall) {
      uninstallCanRetry.value = false
      uninstallStatus.value = t('plugin.uninstall.identityUnavailable')
      clearUninstallPasswords()
    }
    return
  }

  uninstallPasswordError.value = ''
  uninstallStatus.value = ''
  if (uninstallSecretBackup.value) {
    if (!isPrivacySecretPasswordValid(uninstallPassword.value)) {
      clearUninstallPasswords()
      uninstallPasswordError.value = t('plugin.uninstall.passwordMinimum')
      return
    }
    if (uninstallPassword.value !== uninstallPasswordConfirmation.value) {
      clearUninstallPasswords()
      uninstallPasswordError.value = t('plugin.uninstall.passwordMismatch')
      return
    }
  }

  const ordinaryExportEnabled = uninstallOrdinaryExport.value
  const secretBackupEnabled = uninstallSecretBackup.value
  const revision = ++uninstallRequestRevision
  loadingStates.value.uninstall = true
  uninstallFinalImpact.value = false
  try {
    const request = pluginSDK.uninstall({
      version: 1,
      plugin: identity,
      disposition: {
        confirmation: 'delete-plugin-and-data',
        ordinaryExport: { enabled: ordinaryExportEnabled },
        portableSecretBackup: secretBackupEnabled
          ? { enabled: true, password: uninstallPassword.value }
          : { enabled: false }
      }
    })
    clearUninstallPasswords()
    const result = await request
    if (!isCurrentUninstallRequest(revision, identity)) return

    if (result.success) {
      loadingStates.value.uninstall = false
      toast.success(t('plugin.uninstall.success', { name: identity.name }))
      closeUninstallConfirm(true)
      return
    }

    if (!result.installed && result.code === 'PLUGIN_UNINSTALL_NOT_FOUND') {
      loadingStates.value.uninstall = false
      toast.info(t('plugin.uninstall.alreadyRemoved', { name: identity.name }))
      closeUninstallConfirm(true)
      return
    }

    uninstallCanRetry.value = result.retryable
    uninstallStatus.value = t(
      result.status === 'cancelled'
        ? 'plugin.uninstall.cancelled'
        : result.retryable
          ? 'plugin.uninstall.retryableFailure'
          : 'plugin.uninstall.terminalFailure'
    )
  } catch {
    clearUninstallPasswords()
    if (!isCurrentUninstallRequest(revision, identity)) return
    uninstallCanRetry.value = true
    uninstallStatus.value = t('plugin.uninstall.outcomeUnknown')
    pluginInfoLog.error('Plugin uninstall request outcome is unknown')
    toast.error(t('plugin.uninstall.outcomeUnknown'))
  } finally {
    clearUninstallPasswords()
    loadingStates.value.uninstall = false
    if (!uninstallDisposed && !uninstallConfirmVisible.value && uninstallDialogIdentity === null) {
      restoreUninstallTriggerFocus()
    }
  }
}

async function handleUninstallPlugin(event?: MouseEvent): Promise<void> {
  if (!props.plugin || loadingStates.value.uninstall) return
  requestUninstall(event?.currentTarget instanceof HTMLElement ? event.currentTarget : null)
}

watch(uninstallSecretBackup, (enabled) => {
  if (!enabled) {
    uninstallPasswordError.value = ''
    clearUninstallPasswords()
  }
})

watch(
  [
    () => props.plugin.name,
    () => props.plugin.pluginInstanceId,
    () => props.plugin.activationGeneration
  ],
  () => {
    if (!uninstallConfirmVisible.value && !loadingStates.value.uninstall) return
    const wasPending = loadingStates.value.uninstall
    uninstallRequestRevision += 1
    uninstallConfirmVisible.value = false
    uninstallDialogIdentity = null
    resetUninstallForm()
    if (!wasPending) restoreUninstallTriggerFocus()
  },
  { flush: 'sync' }
)

onBeforeUnmount(() => {
  uninstallDisposed = true
  uninstallRequestRevision += 1
  loadingStates.value.uninstall = false
  uninstallConfirmVisible.value = false
  uninstallDialogIdentity = null
  resetUninstallForm()
  uninstallTrigger = null
})

type PrimaryAction = 'run' | 'stop' | 'reload' | 'reconnect' | 'none'

const isPluginRunning = computed(() => props.plugin.status === EPluginStatus.ACTIVE)

const primaryAction = computed(() => {
  const status = props.plugin.status

  if (status === EPluginStatus.ACTIVE || status === EPluginStatus.ENABLED) {
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
    pluginInfoLog.error(`Failed primary action "${action}" for plugin "${pluginName}":`, error)
    toast.error(t('system.unknownError'))
  } finally {
    loadingStates.value.toggle = false
  }
}
</script>

<template>
  <div
    class="plugin-info-root h-full min-h-0 flex flex-col relative overflow-hidden"
    :class="{ 'has-error-glow': hasErrors }"
  >
    <div class="PluginInfo-Body">
      <div class="PluginInfo-Header flex shrink-0 items-center justify-between px-4 py-2">
        <div class="flex items-center gap-2 min-w-0">
          <div class="relative">
            <StatusIcon
              class="PluginInfo-HeaderIcon"
              :colorful="shouldPreservePluginIconColor"
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
              <span
                class="PluginInfo-Version text-xs text-gray-600 dark:text-gray-400 flex-shrink-0"
              >
                v{{ plugin.version }}
              </span>
              <span
                v-if="plugin.dev?.enable"
                class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded flex-shrink-0"
              >
                <i class="i-ri-code-line" />
                {{ t('plugin.badges.dev') }}
              </span>
              <span v-if="isPluginRunning" class="PluginInfo-RunningBadge flex-shrink-0">
                <i class="i-ri-loader-4-line animate-spin" />
                {{ t('plugin.actions.running') }}
              </span>
              <button
                v-if="nexusPublishUrl"
                type="button"
                class="PluginInfo-LinkText"
                @click="openNexusPublishPage"
              >
                {{ t('plugin.details.openPublishPage') }}
              </button>
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
                    loadingStates.reload
                      ? t('plugin.actions.reloading')
                      : t('plugin.actions.reload')
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
                <button
                  type="button"
                  data-testid="plugin-uninstall-action"
                  class="action-item danger"
                  :class="{ disabled: loadingStates.uninstall }"
                  :disabled="loadingStates.uninstall"
                  @click="
                    (event) => {
                      if (loadingStates.uninstall) return
                      close()
                      void handleUninstallPlugin(event)
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
                </button>
              </div>
            </template>
          </TxSplitButton>
        </div>
      </div>

      <!-- Tabs Section -->
      <div class="PluginInfo-TabsShell">
        <TxTabs
          v-model="tabsModel"
          placement="top"
          :show-indicator="false"
          :content-padding="0"
          borderless
        >
          <TxTabItem icon-class="i-ri-dashboard-line" name="Overview">
            <template #name>{{ t('plugin.tabs.overview') }}</template>
            <PluginOverview :plugin="plugin" />
          </TxTabItem>
          <TxTabItem icon-class="i-ri-function-line" name="Features">
            <template #name>{{ t('plugin.tabs.features') }}</template>
            <PluginFeatures :plugin="plugin" />
          </TxTabItem>
          <TxTabItem icon-class="i-ri-shield-keyhole-line" name="Permissions">
            <template #name>{{ t('plugin.tabs.permissions') }}</template>
            <PluginPermissions :plugin="plugin" />
          </TxTabItem>
          <TxTabItem icon-class="i-ri-database-2-line" name="Storage">
            <template #name>{{ t('plugin.tabs.storage') }}</template>
            <PluginStorage :plugin="plugin" />
          </TxTabItem>
          <TxTabItem
            v-if="plugin.dev?.enable || isAppDev"
            icon-class="i-ri-folder-chart-line"
            name="Structure"
          >
            <template #name>{{ t('plugin.tabs.structure') }}</template>
            <PluginStructure :plugin="plugin" />
          </TxTabItem>
          <TxTabItem icon-class="i-ri-file-text-line" name="Logs">
            <template #name>{{ t('plugin.tabs.logs') }}</template>
            <PluginLogs ref="pluginLogsRef" :plugin="plugin" />
          </TxTabItem>
          <TxTabItem icon-class="i-ri-information-line" name="Details">
            <template #name>{{ t('plugin.tabs.details') }}</template>
            <PluginDetails :plugin="plugin" />
          </TxTabItem>
        </TxTabs>
      </div>
    </div>

    <PluginFab
      v-if="hasIssues"
      :severity="issueSeverity === 'error' ? 'error' : 'warning'"
      :title="t('plugin.tabs.issues')"
      @source-change="handleIssueFabSourceChange"
      @click="openIssuesOverlay"
    />

    <FlipDialog
      v-model="showIssuesOverlay"
      v-model:expanded="issuesOverlayExpanded"
      v-model:animating="issuesOverlayAnimating"
      :reference="issueFabRef"
      :header-title="t('plugin.tabs.issues')"
      scrollable
      size="lg"
    >
      <template #default>
        <div class="PluginInfo-IssuesDialog">
          <PluginIssues :plugin="plugin" />
        </div>
      </template>
    </FlipDialog>

    <div
      v-if="uninstallConfirmVisible"
      class="PluginInfo-UninstallBackdrop"
      role="presentation"
      @click.self="closeUninstallConfirm()"
    >
      <section
        ref="uninstallDialogElement"
        class="PluginInfo-UninstallDialog"
        data-testid="plugin-uninstall-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugin-uninstall-title"
        aria-describedby="plugin-uninstall-description"
        :aria-busy="loadingStates.uninstall"
        tabindex="-1"
        @keydown="handleUninstallDialogKeydown"
      >
        <h2 id="plugin-uninstall-title">{{ t('plugin.uninstall.dataDispositionTitle') }}</h2>
        <p id="plugin-uninstall-description">
          {{ t('plugin.uninstall.dataDispositionDescription', { name: plugin.name }) }}
        </p>

        <label class="PluginInfo-UninstallChoice">
          <input
            v-model="uninstallOrdinaryExport"
            data-testid="plugin-uninstall-ordinary-export"
            type="checkbox"
            :disabled="loadingStates.uninstall"
          />
          <span>
            <strong>{{ t('plugin.uninstall.ordinaryExportLabel') }}</strong>
            <small>{{ t('plugin.uninstall.ordinaryExportDescription') }}</small>
          </span>
        </label>

        <label class="PluginInfo-UninstallChoice">
          <input
            v-model="uninstallSecretBackup"
            data-testid="plugin-uninstall-secret-backup"
            type="checkbox"
            :disabled="loadingStates.uninstall"
          />
          <span>
            <strong>{{ t('plugin.uninstall.secretBackupLabel') }}</strong>
            <small>{{ t('plugin.uninstall.secretBackupDescription') }}</small>
          </span>
        </label>

        <div v-if="uninstallSecretBackup" class="PluginInfo-UninstallPasswords">
          <label>
            <span>{{ t('plugin.uninstall.passwordLabel') }}</span>
            <input
              v-model="uninstallPassword"
              data-testid="plugin-uninstall-password"
              type="password"
              autocomplete="new-password"
              :disabled="loadingStates.uninstall"
            />
          </label>
          <label>
            <span>{{ t('plugin.uninstall.passwordConfirmationLabel') }}</span>
            <input
              v-model="uninstallPasswordConfirmation"
              data-testid="plugin-uninstall-password-confirmation"
              type="password"
              autocomplete="new-password"
              :disabled="loadingStates.uninstall"
            />
          </label>
          <p
            v-if="uninstallPasswordError"
            data-testid="plugin-uninstall-password-error"
            role="alert"
          >
            {{ uninstallPasswordError }}
          </p>
        </div>

        <label class="PluginInfo-UninstallChoice PluginInfo-UninstallImpact">
          <input
            v-model="uninstallFinalImpact"
            data-testid="plugin-uninstall-final-impact"
            type="checkbox"
            :disabled="loadingStates.uninstall"
          />
          <span>
            <strong>{{ t('plugin.uninstall.finalImpactLabel') }}</strong>
            <small>{{ t('plugin.uninstall.finalImpactDescription') }}</small>
          </span>
        </label>

        <p data-testid="plugin-uninstall-status" aria-live="polite">
          {{ loadingStates.uninstall ? t('plugin.uninstall.pending') : uninstallStatus }}
        </p>

        <div class="PluginInfo-UninstallActions">
          <button
            type="button"
            data-testid="plugin-uninstall-cancel"
            :disabled="loadingStates.uninstall"
            @click="closeUninstallConfirm()"
          >
            {{ t('plugin.uninstall.cancelButton') }}
          </button>
          <button
            type="button"
            data-testid="plugin-uninstall-confirm"
            class="danger"
            :disabled="loadingStates.uninstall || !uninstallCanRetry || !uninstallFinalImpact"
            @click="confirmUninstall"
          >
            {{ t('plugin.uninstall.confirmButton') }}
          </button>
        </div>
      </section>
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
  width: 100%;
  appearance: none;
  border: 0;
  background: transparent;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: var(--tx-text-color-primary);

  &:hover:not(.disabled) {
    background-color: var(--tx-fill-color-light);
  }

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.danger {
    color: var(--tx-color-danger);
  }

  &.danger:not(.disabled):hover {
    background-color: color-mix(in srgb, var(--tx-color-danger) 8%, transparent);
  }

  i {
    font-size: 18px;
    flex-shrink: 0;
  }

  span {
    flex: 1;
  }
}

.PluginInfo-HeaderIcon {
  color: currentcolor;
  --icon-color: currentColor;
}

.PluginInfo-RunningBadge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--tx-color-success) 35%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-color-success) 10%, transparent);
  color: var(--tx-color-success);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;

  i {
    font-size: 13px;
  }
}

.PluginInfo-LinkText {
  flex-shrink: 0;
  appearance: none;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--tx-color-primary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
}

.PluginInfo-Body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.PluginInfo-TabsShell {
  flex: 1;
  min-height: 0;
  overflow: hidden;
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

.PluginInfo-IssuesDialog {
  position: relative;
  width: 100%;
  min-height: 100%;
}

.PluginInfo-IssuesDialog :deep(.p-4) {
  padding-top: 24px;
  padding-right: 56px;
}

.PluginInfo-UninstallBackdrop {
  position: fixed;
  inset: 0;
  z-index: 10020;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.38);
}

.PluginInfo-UninstallDialog {
  box-sizing: border-box;
  width: min(520px, 100%);
  max-height: min(720px, calc(100vh - 40px));
  overflow: auto;
  padding: 20px;
  border: 1px solid var(--tx-border-color);
  border-radius: 6px;
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
  box-shadow: var(--tx-box-shadow-dark);

  h2 {
    margin: 0 0 8px;
    font-size: 16px;
  }

  > p {
    margin: 0 0 14px;
    color: var(--tx-text-color-secondary);
    font-size: 13px;
  }
}

.PluginInfo-UninstallChoice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--tx-border-color);
  font-size: 13px;

  input {
    margin-top: 2px;

    &:focus-visible {
      outline: 2px solid var(--tx-color-primary);
      outline-offset: 2px;
    }
  }

  > span {
    display: grid;
    gap: 3px;
  }

  small {
    color: var(--tx-text-color-secondary);
    font-size: 12px;
  }
}

.PluginInfo-UninstallImpact {
  margin-top: 10px;
  color: var(--tx-color-danger);
}

.PluginInfo-UninstallPasswords {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 8px 0 12px 26px;

  label {
    display: grid;
    gap: 5px;
    font-size: 12px;
  }

  input {
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid var(--tx-border-color);
    border-radius: 6px;
    background: var(--tx-fill-color-blank);
    color: inherit;
  }

  p {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--tx-color-danger);
    font-size: 12px;
  }
}

.PluginInfo-UninstallActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;

  button {
    padding: 7px 12px;
    border: 1px solid var(--tx-border-color);
    border-radius: 6px;
    background: var(--tx-bg-color);
    color: var(--tx-text-color-primary);
    cursor: pointer;
  }

  button.danger {
    border-color: var(--tx-color-danger);
    background: var(--tx-color-danger);
    color: white;
  }

  button:disabled {
    cursor: default;
    opacity: 0.55;
  }

  button:focus-visible {
    outline: 2px solid var(--tx-color-primary);
    outline-offset: 2px;
  }
}

@media (max-width: 640px) {
  .PluginInfo-UninstallPasswords {
    grid-template-columns: 1fr;
  }
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
