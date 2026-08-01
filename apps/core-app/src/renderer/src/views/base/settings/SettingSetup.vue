<!--
  SettingSetup Component

  Initialization settings page
  Allows users to configure permissions, auto-start, and tray visibility
-->
<script setup lang="ts" name="SettingSetup">
import type { AppIndexSettings } from '@talex-touch/utils/transport/events/types'
import { TxButton } from '@talex-touch/tuffex/button'
import { appSettingOriginData } from '@talex-touch/utils/common/storage/entity/app-settings'
import { useNotificationSdk, useSettingsSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineEvent } from '@talex-touch/utils/transport/event/builder'
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
import { appSetting } from '~/modules/storage/app-storage'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import {
  type SystemPermissionCheckResult,
  type SystemPermissionStatus,
  waitForPermissionGrant
} from '~/modules/system/system-permission-refresh'
import { createRendererLogger } from '~/utils/renderer-log'
import { useFileAccessPermission } from '~/composables/useFileAccessPermission'
import { usePermissionAutoRefresh } from '~/composables/usePermissionAutoRefresh'

const { t } = useI18n()
const transport = useTuffTransport()
const settingsSdk = useSettingsSdk()
const notificationSdk = useNotificationSdk()
const { isMac: isMacOS, isWindows, isLinux } = useRendererPlatform()
const settingSetupLog = createRendererLogger('SettingSetup')

// Keep file-access metadata fresh for diagnostics even though this page no longer renders a card.
const { check: checkFileAccess } = useFileAccessPermission()
const showAdvancedSettings = computed(() => Boolean(appSetting?.dev?.advancedSettings))

interface PermissionState {
  status: SystemPermissionStatus
  checked: boolean
  canRequest: boolean
  message?: string
}

const systemPermissionCheck = defineEvent('system')
  .module('permission')
  .event('check')
  .define<string, SystemPermissionCheckResult>()
const systemPermissionRequest = defineEvent('system')
  .module('permission')
  .event('request')
  .define<string, boolean>()

// Permission states
const permissions = ref<{
  accessibility: PermissionState
  fullDiskAccess: PermissionState
  notifications: PermissionState
  microphone: PermissionState
  adminPrivileges: PermissionState
}>({
  accessibility: {
    status: 'notDetermined' as SystemPermissionStatus,
    checked: false,
    canRequest: false,
    message: ''
  },
  fullDiskAccess: {
    status: 'notDetermined' as SystemPermissionStatus,
    checked: false,
    canRequest: true,
    message: ''
  },
  notifications: {
    status: 'notDetermined' as SystemPermissionStatus,
    checked: false,
    canRequest: false,
    message: ''
  },
  microphone: {
    status: 'notDetermined' as SystemPermissionStatus,
    checked: false,
    canRequest: false,
    message: ''
  },
  adminPrivileges: {
    status: 'notDetermined' as SystemPermissionStatus,
    checked: false,
    canRequest: false,
    message: ''
  }
})

// Settings
const settings = ref({
  autoStart: false,
  showTray: true,
  hideDock: appSettingOriginData.setup.hideDock,
  startSilent: appSettingOriginData.window.startSilent,
  omniAutoMountFeature: appSettingOriginData.omniPanel.autoMountFirstFeatureOnPluginInstall,
  hideNoisySystemApps: true,
  runAsAdmin: false,
  customDesktop: false
})
const appIndexSettings = ref<AppIndexSettings | null>(null)
const traySettingsAvailable = ref(false)
let permissionRequestRevision = 0

function createDefaultPermissionAudit() {
  return {
    at: 0,
    version: '',
    appUpdate: false,
    missing: [] as string[]
  }
}

function ensureWindowSettings(): void {
  if (!appSetting.window) {
    appSetting.window = {
      closeToTray: true,
      startMinimized: false,
      startSilent: appSettingOriginData.window.startSilent
    }
    return
  }

  if (appSetting.window.closeToTray === undefined) {
    appSetting.window.closeToTray = true
  }
  if (appSetting.window.startMinimized === undefined) {
    appSetting.window.startMinimized = false
  }
  if (typeof appSetting.window.startSilent !== 'boolean') {
    appSetting.window.startSilent = appSettingOriginData.window.startSilent
  }
}

function ensureOmniPanelSettings(): void {
  if (!appSetting.omniPanel || typeof appSetting.omniPanel !== 'object') {
    appSetting.omniPanel = {
      enableShortcut: false,
      enableMouseLongPress: true,
      mouseLongPressDurationMs: 600,
      autoMountFirstFeatureOnPluginInstall:
        appSettingOriginData.omniPanel.autoMountFirstFeatureOnPluginInstall,
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
  if (typeof appSetting.omniPanel.autoMountFirstFeatureOnPluginInstall !== 'boolean') {
    appSetting.omniPanel.autoMountFirstFeatureOnPluginInstall =
      appSettingOriginData.omniPanel.autoMountFirstFeatureOnPluginInstall
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
    fileAccess: false,
    fileAccessRootKey: '',
    accessibility: false,
    notifications: false,
    microphone: false,
    autoStart: false,
    showTray: true,
    adminPrivileges: false,
    hideDock: appSettingOriginData.setup.hideDock,
    runAsAdmin: false,
    customDesktop: false,
    lastPermissionAudit: createDefaultPermissionAudit()
  }
} else if (!appSetting.setup.lastPermissionAudit) {
  appSetting.setup.lastPermissionAudit = createDefaultPermissionAudit()
}

if (typeof appSetting.setup.hideDock !== 'boolean') {
  appSetting.setup.hideDock = appSettingOriginData.setup.hideDock
}

if (appSetting.setup.fileAccess === undefined) {
  appSetting.setup.fileAccess = false
}

if (appSetting.setup.fileAccessRootKey === undefined) {
  appSetting.setup.fileAccessRootKey = ''
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

// Keep permission status live while the user is on this page — refresh silently on
// window focus (e.g. returning from System Settings) and on a background interval.
usePermissionAutoRefresh(() => checkAllPermissions({ silent: true }))

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

  if (type === 'fullDiskAccess') {
    permissions.value.fullDiskAccess = {
      status: result.status,
      checked: true,
      canRequest: result.canRequest,
      message: result.message ?? ''
    }
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

  if (type === 'microphone') {
    permissions.value.microphone = {
      status: result.status,
      checked: true,
      canRequest: result.canRequest,
      message: result.message ?? ''
    }
    appSetting.setup.microphone = result.status === 'granted'
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

async function checkAllPermissions(options: { silent?: boolean } = {}): Promise<void> {
  try {
    await checkFileAccess(options)

    // Check accessibility permission (macOS)
    if (isMacOS.value) {
      await checkPermission('accessibility')
      await checkPermission('fullDiskAccess')
    }

    if (isMacOS.value || isWindows.value) {
      await checkPermission('microphone')
    }

    // Check notification permission (macOS only)
    if (isMacOS.value) {
      await checkPermission('notifications')
    }

    // Check admin privileges (Windows)
    if (isWindows.value) {
      await checkPermission('adminPrivileges')
    }
  } catch (error) {
    settingSetupLog.error('Failed to check permissions', error)
    if (!options.silent) {
      toast.error(t('setupPermissions.checkFailed'))
    }
  }
}

async function loadSettings(): Promise<void> {
  if (appSetting.setup) {
    settings.value.autoStart = appSetting.setup.autoStart ?? false
    settings.value.showTray = appSetting.setup.showTray ?? true
    settings.value.hideDock =
      typeof appSetting.setup.hideDock === 'boolean'
        ? appSetting.setup.hideDock
        : appSettingOriginData.setup.hideDock
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
    settingSetupLog.error('Failed to load autoStart', error)
  }

  try {
    const traySettings = await settingsSdk.system.getTraySettings()
    traySettingsAvailable.value = traySettings.available === true
    settings.value.showTray = traySettings.showTray !== false
    settings.value.hideDock = traySettings.hideDock === true
  } catch (error) {
    settingSetupLog.error('Failed to load tray settings', error)
    traySettingsAvailable.value = false
  }

  settings.value.startSilent = appSetting.window.startSilent
  settings.value.omniAutoMountFeature = appSetting.omniPanel.autoMountFirstFeatureOnPluginInstall

  await loadAppIndexSettings()
}

async function loadAppIndexSettings(): Promise<void> {
  try {
    const loaded = await settingsSdk.appIndex.getSettings()
    appIndexSettings.value = loaded
    settings.value.hideNoisySystemApps = loaded.hideNoisySystemApps
  } catch (error) {
    settings.value.hideNoisySystemApps = true
    settingSetupLog.error('Failed to load app index settings', error)
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

    if (type === 'microphone' && isMacOS.value) {
      await waitForPermissionGrant(() => checkPermission(type), {
        shouldContinue: () => requestRevision === permissionRequestRevision
      })
      return
    }

    setTimeout(() => {
      void checkPermission(type)
    }, 2000)
  } catch (error) {
    settingSetupLog.error(`Failed to request permission ${type}`, error)
    toast.error(t('setupPermissions.requestFailed'))
  }
}

async function testNotificationPermission(): Promise<void> {
  try {
    await notificationSdk.notify({
      channel: 'system',
      level: 'info',
      title: t('setupPermissions.testNotificationTitle'),
      message: t('setupPermissions.testNotificationBody')
    })
    toast.info(t('setupPermissions.testNotificationSent'))
  } catch (error) {
    settingSetupLog.error('Failed to send notification test', error)
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
    settingSetupLog.error('Failed to update autoStart', error)
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
    settingSetupLog.error('Failed to update showTray', error)
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
    settingSetupLog.error('Failed to update hideDock', error)
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
    settingSetupLog.error('Failed to update startSilent', error)
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
    settingSetupLog.error('Failed to update omni auto mount setting', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

async function updateRunAsAdmin(value: boolean): Promise<void> {
  settings.value.runAsAdmin = value
  appSetting.setup.runAsAdmin = value
  try {
    toast.success(t('common.success'))
  } catch (error) {
    settingSetupLog.error('Failed to update runAsAdmin', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

async function updateCustomDesktop(value: boolean): Promise<void> {
  settings.value.customDesktop = value
  appSetting.setup.customDesktop = value
  try {
    toast.success(t('common.success'))
  } catch (error) {
    settingSetupLog.error('Failed to update customDesktop', error)
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
    settingSetupLog.error('Failed to update hideNoisySystemApps', error)
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
    case 'unverifiable':
      return t('setupPermissions.statusUnverifiable')
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
    case 'unverifiable':
      return 'i-carbon-information'
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
        @click="requestPermission('accessibility')"
      >
        {{ t('setupPermissions.openSettings') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="isMacOS"
      :title="t('setupPermissions.fullDiskAccess')"
      :description="t('setupPermissions.fullDiskAccessDesc')"
      :active="permissions.fullDiskAccess.status === 'granted'"
      :disabled="
        permissions.fullDiskAccess.status === 'unsupported' &&
        !permissions.fullDiskAccess.canRequest
      "
      default-icon="i-carbon-folder"
      active-icon="i-carbon-folder-details"
    >
      <template #tags>
        <TuffMacOSTag />
      </template>
      <TuffStatusBadge
        size="md"
        :status-key="permissions.fullDiskAccess.status"
        :icon="getStatusIconClass(permissions.fullDiskAccess.status)"
        :text="getStatusText(permissions.fullDiskAccess.status)"
      />
      <TxButton
        v-if="
          permissions.fullDiskAccess.status !== 'granted' && permissions.fullDiskAccess.canRequest
        "
        variant="flat"
        type="primary"
        size="sm"
        @click="requestPermission('fullDiskAccess')"
      >
        {{ t('setupPermissions.openSettings') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="isMacOS || isWindows"
      :title="t('setupPermissions.microphone')"
      :description="t('setupPermissions.microphoneDesc')"
      :active="permissions.microphone.status === 'granted'"
      :disabled="
        permissions.microphone.status === 'unsupported' && !permissions.microphone.canRequest
      "
      default-icon="i-carbon-microphone"
      active-icon="i-carbon-microphone-filled"
    >
      <TuffStatusBadge
        size="md"
        :status-key="permissions.microphone.status"
        :icon="getStatusIconClass(permissions.microphone.status)"
        :text="getStatusText(permissions.microphone.status)"
      />
      <TxButton
        v-if="permissions.microphone.status !== 'granted' && permissions.microphone.canRequest"
        variant="flat"
        type="primary"
        size="sm"
        @click="requestPermission('microphone')"
      >
        {{ t('setupPermissions.openSettings') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="isMacOS"
      :title="t('settings.setup.notifications')"
      :description="t('settings.setup.notificationsDesc')"
      :active="permissions.notifications.status === 'granted'"
      :disabled="
        permissions.notifications.status === 'unsupported' && !permissions.notifications.canRequest
      "
      default-icon="i-carbon-notification"
      active-icon="i-carbon-notification"
    >
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
        @click="testNotificationPermission"
      >
        {{ t('setupPermissions.testNotification') }}
      </TxButton>
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
      <TuffStatusBadge
        size="md"
        :status-key="permissions.adminPrivileges.status"
        :icon="getStatusIconClass(permissions.adminPrivileges.status)"
        :text="getStatusText(permissions.adminPrivileges.status)"
      />
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
      v-if="showAdvancedSettings && isMacOS && traySettingsAvailable"
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
      v-if="showAdvancedSettings"
      v-model="settings.startSilent"
      :title="t('settings.setup.startSilent')"
      :description="t('settings.setup.startSilentDesc')"
      default-icon="i-carbon-notification-off"
      active-icon="i-carbon-notification-off"
      @update:model-value="updateStartSilent"
    />

    <TuffBlockSwitch
      v-if="showAdvancedSettings"
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
  </TuffGroupBlock>
</template>
