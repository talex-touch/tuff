<!--
  SettingSetup Component

  Initialization settings page
  Allows users to configure permissions, auto-start, and tray visibility
-->
<script setup lang="ts" name="SettingSetup">
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import FlatButton from '~/components/base/button/FlatButton.vue'
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
import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage/index'

const { t } = useI18n()

const platform = computed(() => window.$startupInfo?.platform || process.platform)
const isMacOS = computed(() => platform.value === 'darwin')
const isWindows = computed(() => platform.value === 'win32')
const isLinux = computed(() => platform.value === 'linux')

// Permission states
const permissions = ref({
  accessibility: {
    status: 'notDetermined' as 'granted' | 'denied' | 'notDetermined' | 'unsupported',
    checked: false
  },
  notifications: {
    status: 'notDetermined' as 'granted' | 'denied' | 'notDetermined' | 'unsupported',
    checked: false
  },
  adminPrivileges: {
    status: 'notDetermined' as 'granted' | 'denied' | 'notDetermined' | 'unsupported',
    checked: false
  }
})

// Settings
const settings = ref({
  autoStart: false,
  showTray: true,
  hideDock: false,
  startSilent: false,
  runAsAdmin: false,
  customDesktop: false
})

const isLoading = ref(false)

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

// Initialize appSetting.setup if not exists
if (!appSetting.setup) {
  appSetting.setup = {
    accessibility: false,
    notifications: false,
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

onMounted(async () => {
  await checkAllPermissions()
  loadSettings()
})

async function checkAllPermissions(): Promise<void> {
  isLoading.value = true
  try {
    // Check accessibility permission (macOS)
    if (isMacOS.value) {
      const accResult = await touchChannel.send('system:permission:check', 'accessibility' as any)
      permissions.value.accessibility = {
        status: accResult.status,
        checked: true
      }
      appSetting.setup.accessibility = accResult.status === 'granted'
    }

    // Check notification permission
    const notifResult = await touchChannel.send('system:permission:check', 'notifications' as any)
    permissions.value.notifications = {
      status: notifResult.status,
      checked: true
    }
    appSetting.setup.notifications = notifResult.status === 'granted'

    // Check admin privileges (Windows)
    if (isWindows.value) {
      const adminResult = await touchChannel.send(
        'system:permission:check',
        'adminPrivileges' as any
      )
      permissions.value.adminPrivileges = {
        status: adminResult.status,
        checked: true
      }
      appSetting.setup.adminPrivileges = adminResult.status === 'granted'
    }
  } catch (error) {
    console.error('[SettingSetup] Failed to check permissions:', error)
    toast.error(t('setupPermissions.checkFailed'))
  } finally {
    isLoading.value = false
  }
}

function loadSettings(): void {
  if (appSetting.setup) {
    settings.value.autoStart = appSetting.setup.autoStart ?? false
    settings.value.showTray = appSetting.setup.showTray ?? true
    settings.value.hideDock = appSetting.setup.hideDock ?? false
    settings.value.runAsAdmin = appSetting.setup.runAsAdmin ?? false
    settings.value.customDesktop = appSetting.setup.customDesktop ?? false
  }

  ensureWindowSettings()

  // Load autoStart from existing setting
  try {
    const autoStartResult = touchChannel.sendSync('tray:autostart:get')
    if (autoStartResult !== null) {
      settings.value.autoStart = autoStartResult as boolean
    }
  } catch (error) {
    console.error('[SettingSetup] Failed to load autoStart:', error)
  }

  // Load startSilent from existing setting
  try {
    const startSilentResult = touchChannel.sendSync('storage:get', 'app.window.startSilent')
    if (startSilentResult !== null && startSilentResult !== undefined) {
      settings.value.startSilent = startSilentResult as boolean
    } else {
      const windowSettings = appSetting.window
      if (windowSettings && windowSettings.startSilent !== undefined) {
        settings.value.startSilent = windowSettings.startSilent
      }
    }
  } catch (error) {
    console.error('[SettingSetup] Failed to load startSilent:', error)
  }
}

async function requestPermission(type: string): Promise<void> {
  try {
    const opened = await touchChannel.send('system:permission:request', type as any)
    if (opened) {
      toast.info(t('setupPermissions.openSettings'))
    }
    // Recheck after a delay to allow user to grant permission
    setTimeout(async () => {
      await checkAllPermissions()
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
    await touchChannel.send('storage:save', {
      key: 'app.autoStart',
      content: JSON.stringify(value),
      clear: false
    })
    await touchChannel.send('tray:autostart:update', value)
    toast.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update autoStart:', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

function updateShowTray(value: boolean): void {
  settings.value.showTray = value
  appSetting.setup.showTray = value
  try {
    touchChannel.send('storage:save', {
      key: 'app.setup.showTray',
      content: JSON.stringify(value),
      clear: false
    })
    touchChannel.send('tray:show:set', value)
    toast.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update showTray:', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

function updateHideDock(value: boolean): void {
  settings.value.hideDock = value
  appSetting.setup.hideDock = value
  try {
    touchChannel.send('storage:save', {
      key: 'app.setup.hideDock',
      content: JSON.stringify(value),
      clear: false
    })
    touchChannel.send('tray:hidedock:set', value)
    toast.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update hideDock:', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

function updateStartSilent(value: boolean): void {
  settings.value.startSilent = value
  ensureWindowSettings()
  appSetting.window.startSilent = value
  try {
    touchChannel.send('storage:save', {
      key: 'app.window.startSilent',
      content: JSON.stringify(value),
      clear: false
    })
    // Update auto-start setting to apply the change
    touchChannel.send('tray:autostart:update', settings.value.autoStart)
    toast.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update startSilent:', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

async function updateRunAsAdmin(value: boolean): Promise<void> {
  settings.value.runAsAdmin = value
  appSetting.setup.runAsAdmin = value
  try {
    await touchChannel.send('storage:save', {
      key: 'app.setup.runAsAdmin',
      content: JSON.stringify(value),
      clear: false
    })
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
    await touchChannel.send('storage:save', {
      key: 'app.setup.customDesktop',
      content: JSON.stringify(value),
      clear: false
    })
    toast.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update customDesktop:', error)
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
      :disabled="permissions.accessibility.status === 'unsupported'"
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
        <FlatButton
          v-if="permissions.accessibility.status !== 'granted'"
          primary
          mini
          @click.stop="requestPermission('accessibility')"
        >
          {{ t('setupPermissions.openSettings') }}
        </FlatButton>
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
        <FlatButton
          primary
          mini
          :class="{ 'is-loading': isLoading }"
          @click.stop="checkAllPermissions"
        >
          <span v-if="isLoading" class="i-carbon-renew animate-spin" />
          {{ t('setupPermissions.recheck') }}
        </FlatButton>
      </div>
    </TuffBlockSlot>

    <TuffBlockSlot
      :title="t('settings.setup.notifications')"
      :description="t('settings.setup.notificationsDesc')"
      :active="permissions.notifications.status === 'granted'"
      :disabled="permissions.notifications.status === 'unsupported'"
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
        <FlatButton
          v-if="permissions.notifications.status !== 'granted'"
          primary
          mini
          @click.stop="requestPermission('notifications')"
        >
          {{ t('setupPermissions.openSettings') }}
        </FlatButton>
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
      v-model="settings.showTray"
      :title="t('settings.setup.showTray')"
      :description="t('settings.setup.showTrayDesc')"
      default-icon="i-carbon-portfolio"
      active-icon="i-carbon-portfolio"
      @update:model-value="updateShowTray"
    />

    <TuffBlockSwitch
      v-if="isMacOS"
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

.PermissionActions .FlatButton-Container {
  min-width: 120px;
}

.PermissionActions .FlatButton-Container.is-loading {
  opacity: 0.6;
  pointer-events: none;
}
</style>
