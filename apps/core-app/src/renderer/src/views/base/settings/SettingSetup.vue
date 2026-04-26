<!--
  SettingSetup Component

  Initialization settings page
  Allows users to configure permissions, auto-start, and tray visibility
-->
<script setup lang="ts" name="SettingSetup">
import type { AppIndexSettings } from '@talex-touch/utils/transport/events/types'
import { TxButton } from '@talex-touch/tuffex'
import { useSettingsSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { useI18n } from 'vue-i18n'

import { toast } from 'vue-sonner'
import TuffBetaTag from '~/components/tuff/tags/TuffBetaTag.vue'
import TuffLinuxTag from '~/components/tuff/tags/TuffLinuxTag.vue'
import TuffMacOSTag from '~/components/tuff/tags/TuffMacOSTag.vue'
import TuffWindowsTag from '~/components/tuff/tags/TuffWindowsTag.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
// Import UI components
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffStatusBadge from '~/components/tuff/TuffStatusBadge.vue'

// Import storage and channel
import { appSetting } from '~/modules/channel/storage/index'
import { useStartupInfo } from '~/modules/hooks/useStartupInfo'
import {
  type SystemPermissionCheckResult,
  type SystemPermissionStatus,
  waitForPermissionGrant
} from '~/modules/system/system-permission-refresh'

const { t } = useI18n()
const transport = useTuffTransport()
const settingsSdk = useSettingsSdk()
const { startupInfo } = useStartupInfo()

const platform = computed(() => startupInfo.value?.platform || process.platform)
const isMacOS = computed(() => platform.value === 'darwin')
const isWindows = computed(() => platform.value === 'win32')
const isLinux = computed(() => platform.value === 'linux')
const showAdvancedSettings = computed(() => Boolean(appSetting?.dev?.advancedSettings))

interface PermissionState {
  status: SystemPermissionStatus
  checked: boolean
  canRequest: boolean
  message?: string
}

const systemPermissionCheck = defineRawEvent<string, SystemPermissionCheckResult>(
  'system:permission:check'
)
const systemPermissionRequest = defineRawEvent<string, boolean>('system:permission:request')

// Permission states
const permissions = ref<{
  accessibility: PermissionState
  notifications: PermissionState
  adminPrivileges: PermissionState
}>({
  accessibility: {
    status: 'notDetermined' as 'granted' | 'denied' | 'notDetermined' | 'unsupported',
    checked: false,
    canRequest: false,
    message: ''
  },
  notifications: {
    status: 'notDetermined' as 'granted' | 'denied' | 'notDetermined' | 'unsupported',
    checked: false,
    canRequest: false,
    message: ''
  },
  adminPrivileges: {
    status: 'notDetermined' as 'granted' | 'denied' | 'notDetermined' | 'unsupported',
    checked: false,
    canRequest: false,
    message: ''
  }
})

// Settings
const settings = ref({
  autoStart: false,
  showTray: true,
  hideDock: false,
  startSilent: false,
  omniAutoMountFeature: false,
  hideNoisySystemApps: true,
  runAsAdmin: false,
  customDesktop: false
})
const appIndexSettings = ref<AppIndexSettings | null>(null)
const traySettingsAvailable = ref(false)

const isLoading = ref(false)
let permissionRequestRevision = 0

function ensureWindowSettings(): void {
  if (!appSetting.window) {
    appSetting.window = {
      closeToTray: true,
      startMinimized: false,
      startSilent: false
    }
    return
  }

  if (appSetting.window.closeToTray === undefined) {
    appSetting.window.closeToTray = true
  }
  if (appSetting.window.startMinimized === undefined) {
    appSetting.window.startMinimized = false
  }
  if (appSetting.window.startSilent === undefined) {
    appSetting.window.startSilent = false
  }
}

function ensureOmniPanelSettings(): void {
  if (!appSetting.omniPanel || typeof appSetting.omniPanel !== 'object') {
    appSetting.omniPanel = {
      enableShortcut: false,
      enableMouseLongPress: true,
      mouseLongPressDurationMs: 600,
      autoMountFirstFeatureOnPluginInstall: false,
      featureHub: {
        items: []
      }
    }
    return
  }

  if (appSetting.omniPanel.enableShortcut === undefined) {
    appSetting.omniPanel.enableShortcut = false
  }
  if (appSetting.omniPanel.enableMouseLongPress === undefined) {
    appSetting.omniPanel.enableMouseLongPress = true
  }
  if (appSetting.omniPanel.mouseLongPressDurationMs === undefined) {
    appSetting.omniPanel.mouseLongPressDurationMs = 600
  }
  if (appSetting.omniPanel.autoMountFirstFeatureOnPluginInstall === undefined) {
    appSetting.omniPanel.autoMountFirstFeatureOnPluginInstall = false
  }
  if (!appSetting.omniPanel.featureHub || typeof appSetting.omniPanel.featureHub !== 'object') {
    appSetting.omniPanel.featureHub = {
      items: []
    }
  }
  if (!Array.isArray(appSetting.omniPanel.featureHub.items)) {
    appSetting.omniPanel.featureHub.items = []
  }
}

// Initialize appSetting.setup if not exists
if (!appSetting.setup) {
  appSetting.setup = {
    accessibility: false,
    notifications: false,
    microphone: false,
    autoStart: false,
    showTray: true,
    adminPrivileges: false,
    hideDock: false,
    runAsAdmin: false,
    customDesktop: false
  }
}

if (appSetting.setup.runAsAdmin === undefined) {
  appSetting.setup.runAsAdmin = false
}

if (appSetting.setup.customDesktop === undefined) {
  appSetting.setup.customDesktop = false
}

ensureOmniPanelSettings()

onMounted(async () => {
  await checkAllPermissions()
  await loadSettings()
})

onBeforeUnmount(() => {
  permissionRequestRevision += 1
})

function applyPermissionResult(type: string, result: SystemPermissionCheckResult): void {
  if (type === 'accessibility') {
    permissions.value.accessibility = {
      status: result.status,
      checked: true,
      canRequest: result.canRequest,
      message: result.message ?? ''
    }
    appSetting.setup.accessibility = result.status === 'granted'
    return
  }

  if (type === 'notifications') {
    permissions.value.notifications = {
      status: result.status,
      checked: true,
      canRequest: result.canRequest,
      message: result.message ?? ''
    }
    appSetting.setup.notifications = result.status === 'granted'
    return
  }

  if (type === 'adminPrivileges') {
    permissions.value.adminPrivileges = {
      status: result.status,
      checked: true,
      canRequest: result.canRequest,
      message: result.message ?? ''
    }
    appSetting.setup.adminPrivileges = result.status === 'granted'
  }
}

async function checkPermission(type: string): Promise<SystemPermissionCheckResult> {
  const result = await transport.send(systemPermissionCheck, type)
  applyPermissionResult(type, result)
  return result
}

async function checkAllPermissions(): Promise<void> {
  isLoading.value = true
  try {
    // Check accessibility permission (macOS)
    if (isMacOS.value) {
      await checkPermission('accessibility')
    }

    // Check notification permission
    await checkPermission('notifications')

    // Check admin privileges (Windows)
    if (isWindows.value) {
      await checkPermission('adminPrivileges')
    }
  } catch (error) {
    console.error('[SettingSetup] Failed to check permissions:', error)
    toast.error(t('setupPermissions.checkFailed'))
  } finally {
    isLoading.value = false
  }
}

async function loadSettings(): Promise<void> {
  if (appSetting.setup) {
    settings.value.autoStart = appSetting.setup.autoStart ?? false
    settings.value.showTray = appSetting.setup.showTray ?? true
    settings.value.hideDock = appSetting.setup.hideDock ?? false
    settings.value.runAsAdmin = appSetting.setup.runAsAdmin ?? false
    settings.value.customDesktop = appSetting.setup.customDesktop ?? false
  }

  ensureWindowSettings()
  ensureOmniPanelSettings()

  // Load autoStart from existing setting
  try {
    const autoStartResult = await settingsSdk.system.getAutoStart()
    settings.value.autoStart = Boolean(autoStartResult)
  } catch (error) {
    console.error('[SettingSetup] Failed to load autoStart:', error)
  }

  try {
    const traySettings = await settingsSdk.system.getTraySettings()
    traySettingsAvailable.value = traySettings.available === true
    settings.value.showTray = traySettings.showTray !== false
    settings.value.hideDock = traySettings.hideDock === true
  } catch (error) {
    console.error('[SettingSetup] Failed to load tray settings:', error)
    traySettingsAvailable.value = false
  }

  settings.value.startSilent = Boolean(appSetting.window?.startSilent)
  settings.value.omniAutoMountFeature = Boolean(
    appSetting.omniPanel?.autoMountFirstFeatureOnPluginInstall
  )

  await loadAppIndexSettings()
}

async function loadAppIndexSettings(): Promise<void> {
  try {
    const loaded = await settingsSdk.appIndex.getSettings()
    appIndexSettings.value = loaded
    settings.value.hideNoisySystemApps = loaded.hideNoisySystemApps
  } catch (error) {
    settings.value.hideNoisySystemApps = true
    console.error('[SettingSetup] Failed to load app index settings:', error)
  }
}

async function requestPermission(type: string): Promise<void> {
  const requestRevision = (permissionRequestRevision += 1)
  try {
    const current = await checkPermission(type)
    if (current.status === 'granted') {
      toast.success(t('common.success'))
      return
    }

    const opened = await transport.send(systemPermissionRequest, type)
    if (opened) {
      toast.info(t('setupPermissions.openSettings'))
    }

    if (type === 'accessibility') {
      await waitForPermissionGrant(() => checkPermission(type), {
        shouldContinue: () => requestRevision === permissionRequestRevision
      })
      return
    }

    setTimeout(() => {
      void checkPermission(type)
    }, 2000)
  } catch (error) {
    console.error(`[SettingSetup] Failed to request permission ${type}:`, error)
    toast.error(t('setupPermissions.requestFailed'))
  }
}

async function updateAutoStart(value: boolean): Promise<void> {
  settings.value.autoStart = value
  appSetting.setup.autoStart = value
  try {
    const current = await settingsSdk.system.updateAutoStart(value)
    settings.value.autoStart = Boolean(current)
    toast.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update autoStart:', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

async function updateShowTray(value: boolean): Promise<void> {
  settings.value.showTray = value
  appSetting.setup.showTray = value
  try {
    const updated = await settingsSdk.system.updateTraySettings({ showTray: value })
    traySettingsAvailable.value = updated.available === true
    settings.value.showTray = updated.showTray !== false
    settings.value.hideDock = updated.hideDock === true
    toast.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update showTray:', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

async function updateHideDock(value: boolean): Promise<void> {
  settings.value.hideDock = value
  appSetting.setup.hideDock = value
  try {
    const updated = await settingsSdk.system.updateTraySettings({ hideDock: value })
    traySettingsAvailable.value = updated.available === true
    settings.value.showTray = updated.showTray !== false
    settings.value.hideDock = updated.hideDock === true
    toast.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update hideDock:', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

async function updateStartSilent(value: boolean): Promise<void> {
  settings.value.startSilent = value
  ensureWindowSettings()
  appSetting.window.startSilent = value
  try {
    // Update auto-start setting to apply the change
    const current = await settingsSdk.system.updateAutoStart(settings.value.autoStart)
    settings.value.autoStart = Boolean(current)
    toast.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update startSilent:', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

async function updateOmniAutoMountFeature(value: boolean): Promise<void> {
  settings.value.omniAutoMountFeature = value
  ensureOmniPanelSettings()
  appSetting.omniPanel.autoMountFirstFeatureOnPluginInstall = value
  try {
    toast.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update omni auto mount setting:', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

async function updateRunAsAdmin(value: boolean): Promise<void> {
  settings.value.runAsAdmin = value
  appSetting.setup.runAsAdmin = value
  try {
    toast.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update runAsAdmin:', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

async function updateCustomDesktop(value: boolean): Promise<void> {
  settings.value.customDesktop = value
  appSetting.setup.customDesktop = value
  try {
    toast.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update customDesktop:', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

async function updateHideNoisySystemApps(value: boolean): Promise<void> {
  settings.value.hideNoisySystemApps = value
  try {
    const updated = await settingsSdk.appIndex.updateSettings({ hideNoisySystemApps: value })
    appIndexSettings.value = updated
    settings.value.hideNoisySystemApps = updated.hideNoisySystemApps
    toast.success(t('common.success'))
  } catch (error) {
    settings.value.hideNoisySystemApps = appIndexSettings.value?.hideNoisySystemApps ?? true
    console.error('[SettingSetup] Failed to update hideNoisySystemApps:', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

function getStatusText(status: string): string {
  switch (status) {
    case 'granted':
      return t('setupPermissions.statusGranted')
    case 'denied':
      return t('setupPermissions.statusDenied')
    case 'notDetermined':
      return t('setupPermissions.statusNotDetermined')
    case 'unsupported':
      return t('setupPermissions.statusUnsupported')
    default:
      return t('setupPermissions.statusUnknown')
  }
}

function getStatusIconClass(status: string): string {
  switch (status) {
    case 'granted':
      return 'i-carbon-checkmark-filled'
    case 'denied':
      return 'i-carbon-close-outline'
    case 'notDetermined':
      return 'i-carbon-help'
    default:
      return 'i-carbon-information'
  }
}
</script>

<template>
  <TuffGroupBlock
    :name="t('settings.setup.groupTitle')"
    :description="t('settings.setup.groupDesc')"
    default-icon="i-carbon-settings-services"
    active-icon="i-carbon-settings-check"
    memory-name="setting-setup"
  >
    <!-- Permissions Section -->
    <TuffBlockSlot
      v-if="isMacOS"
      :title="t('settings.setup.accessibility')"
      :description="t('settings.setup.accessibilityDesc')"
      :active="permissions.accessibility.status === 'granted'"
      :disabled="
        permissions.accessibility.status === 'unsupported' && !permissions.accessibility.canRequest
      "
      default-icon="i-carbon-screen"
      active-icon="i-carbon-screen"
    >
      <template #tags>
        <TuffMacOSTag />
      </template>
      <div class="PermissionActions">
        <TuffStatusBadge
          size="md"
          :status-key="permissions.accessibility.status"
          :icon="getStatusIconClass(permissions.accessibility.status)"
          :text="getStatusText(permissions.accessibility.status)"
        />
        <TxButton
          v-if="
            permissions.accessibility.status !== 'granted' && permissions.accessibility.canRequest
          "
          variant="flat"
          type="primary"
          size="sm"
          @click.stop="requestPermission('accessibility')"
        >
          {{ t('setupPermissions.openSettings') }}
        </TxButton>
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="isWindows"
      :title="t('settings.setup.adminPrivileges')"
      :description="t('settings.setup.adminPrivilegesDesc')"
      :active="permissions.adminPrivileges.status === 'granted'"
      default-icon="i-carbon-security"
      active-icon="i-carbon-security"
    >
      <template #tags>
        <TuffWindowsTag />
      </template>
      <div class="PermissionActions">
        <TuffStatusBadge
          size="md"
          :status-key="permissions.adminPrivileges.status"
          :icon="getStatusIconClass(permissions.adminPrivileges.status)"
          :text="getStatusText(permissions.adminPrivileges.status)"
        />
        <TxButton
          variant="flat"
          type="primary"
          size="sm"
          :class="{ 'is-loading': isLoading }"
          @click.stop="checkAllPermissions"
        >
          <span v-if="isLoading" class="i-carbon-renew animate-spin" />
          {{ t('setupPermissions.recheck') }}
        </TxButton>
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settings.setup.notifications')"
      :description="t('settings.setup.notificationsDesc')"
      :active="permissions.notifications.status === 'granted'"
      :disabled="
        permissions.notifications.status === 'unsupported' && !permissions.notifications.canRequest
      "
      default-icon="i-carbon-notification"
      active-icon="i-carbon-notification"
    >
      <div class="PermissionActions">
        <TuffStatusBadge
          size="md"
          :status-key="permissions.notifications.status"
          :icon="getStatusIconClass(permissions.notifications.status)"
          :text="getStatusText(permissions.notifications.status)"
        />
        <TxButton
          v-if="
            permissions.notifications.status !== 'granted' && permissions.notifications.canRequest
          "
          variant="flat"
          type="primary"
          size="sm"
          @click.stop="requestPermission('notifications')"
        >
          {{ t('setupPermissions.openSettings') }}
        </TxButton>
      </div>
    </TuffBlockSlot>

    <!-- Settings Section -->
    <TuffBlockSwitch
      v-model="settings.autoStart"
      :title="t('settings.setup.autoStart')"
      :description="t('settings.setup.autoStartDesc')"
      default-icon="i-carbon-play"
      active-icon="i-carbon-play-filled"
      @update:model-value="updateAutoStart"
    />

    <TuffBlockSwitch
      v-if="traySettingsAvailable"
      v-model="settings.showTray"
      :title="t('settings.setup.showTray')"
      :description="t('settings.setup.showTrayDesc')"
      default-icon="i-carbon-portfolio"
      active-icon="i-carbon-portfolio"
      @update:model-value="updateShowTray"
    />

    <TuffBlockSwitch
      v-if="isMacOS && traySettingsAvailable"
      v-model="settings.hideDock"
      :title="t('settings.setup.hideDock')"
      :description="t('settings.setup.hideDockDesc')"
      default-icon="i-carbon-screen"
      active-icon="i-carbon-screen"
      @update:model-value="updateHideDock"
    >
      <template #tags>
        <TuffMacOSTag />
      </template>
    </TuffBlockSwitch>

    <TuffBlockSwitch
      v-model="settings.startSilent"
      :title="t('settings.setup.startSilent')"
      :description="t('settings.setup.startSilentDesc')"
      default-icon="i-carbon-notification-off"
      active-icon="i-carbon-notification-off"
      @update:model-value="updateStartSilent"
    />

    <TuffBlockSwitch
      v-model="settings.omniAutoMountFeature"
      :title="t('settings.setup.omniAutoMountFeature')"
      :description="t('settings.setup.omniAutoMountFeatureDesc')"
      default-icon="i-carbon-data-share"
      active-icon="i-carbon-data-share"
      @update:model-value="updateOmniAutoMountFeature"
    />

    <TuffBlockSwitch
      v-if="showAdvancedSettings"
      v-model="settings.hideNoisySystemApps"
      :title="t('settings.setup.hideNoisySystemApps')"
      :description="t('settings.setup.hideNoisySystemAppsDesc')"
      default-icon="i-carbon-filter"
      active-icon="i-carbon-filter"
      @update:model-value="updateHideNoisySystemApps"
    />

    <TuffBlockSwitch
      v-if="isWindows"
      v-model="settings.runAsAdmin"
      :title="t('settings.setup.runAsAdmin')"
      :description="t('settings.setup.runAsAdminDesc')"
      default-icon="i-carbon-user-avatar"
      active-icon="i-carbon-user-avatar-filled"
      @update:model-value="updateRunAsAdmin"
    >
      <template #tags>
        <TuffWindowsTag />
      </template>
    </TuffBlockSwitch>

    <TuffBlockSwitch
      v-if="isLinux"
      v-model="settings.customDesktop"
      :title="t('settings.setup.customDesktop')"
      :description="t('settings.setup.customDesktopDesc')"
      default-icon="i-carbon-screen"
      active-icon="i-carbon-screen"
      @update:model-value="updateCustomDesktop"
    >
      <template #tags>
        <TuffLinuxTag />
        <TuffBetaTag />
      </template>
    </TuffBlockSwitch>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
.PermissionActions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
}

.PermissionActions .tx-button {
  min-width: 120px;
}

.PermissionActions .tx-button.is-loading {
  opacity: 0.6;
  pointer-events: none;
}
</style>
