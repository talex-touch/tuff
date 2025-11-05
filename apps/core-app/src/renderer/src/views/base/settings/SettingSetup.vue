<!--
  SettingSetup Component

  Initialization settings page
  Allows users to configure permissions, auto-start, and tray visibility
-->
<script setup lang="ts" name="SettingSetup">
import { useI18n } from 'vue-i18n'
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'

// Import UI components
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'
import TBlockSwitch from '~/components/base/switch/TBlockSwitch.vue'
import RemixIcon from '~/components/icon/RemixIcon.vue'

// Import storage and channel
import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage/index'

const { t } = useI18n()

const platform = computed(() => window.$startupInfo?.platform || process.platform)
const isMacOS = computed(() => platform.value === 'darwin')
const isWindows = computed(() => platform.value === 'win32')

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
  startSilent: false
})

const isLoading = ref(false)

// Initialize appSetting.setup if not exists
if (!appSetting.setup) {
  appSetting.setup = {
    accessibility: false,
    notifications: false,
    autoStart: false,
    showTray: true,
    adminPrivileges: false,
    hideDock: false
  }
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
    ElMessage.error(t('setupPermissions.checkFailed'))
  } finally {
    isLoading.value = false
  }
}

function loadSettings(): void {
  if (appSetting.setup) {
    settings.value.autoStart = appSetting.setup.autoStart ?? false
    settings.value.showTray = appSetting.setup.showTray ?? true
    settings.value.hideDock = appSetting.setup.hideDock ?? false
  }

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
    } else if (appSetting.window?.startSilent !== undefined) {
      settings.value.startSilent = appSetting.window.startSilent
    }
  } catch (error) {
    console.error('[SettingSetup] Failed to load startSilent:', error)
  }
}

async function requestPermission(type: string): Promise<void> {
  try {
    const opened = await touchChannel.send('system:permission:request', type as any)
    if (opened) {
      ElMessage.info(t('setupPermissions.openSettings'))
    }
    // Recheck after a delay to allow user to grant permission
    setTimeout(async () => {
      await checkAllPermissions()
    }, 2000)
  } catch (error) {
    console.error(`[SettingSetup] Failed to request permission ${type}:`, error)
    ElMessage.error(t('setupPermissions.requestFailed'))
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
    ElMessage.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update autoStart:', error)
    ElMessage.error(t('setupPermissions.updateFailed'))
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
    ElMessage.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update showTray:', error)
    ElMessage.error(t('setupPermissions.updateFailed'))
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
    ElMessage.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update hideDock:', error)
    ElMessage.error(t('setupPermissions.updateFailed'))
  }
}

function updateStartSilent(value: boolean): void {
  settings.value.startSilent = value
  if (!appSetting.window) {
    appSetting.window = {}
  }
  appSetting.window.startSilent = value
  try {
    touchChannel.send('storage:save', {
      key: 'app.window.startSilent',
      content: JSON.stringify(value),
      clear: false
    })
    // Update auto-start setting to apply the change
    touchChannel.send('tray:autostart:update', settings.value.autoStart)
    ElMessage.success(t('common.success'))
  } catch (error) {
    console.error('[SettingSetup] Failed to update startSilent:', error)
    ElMessage.error(t('setupPermissions.updateFailed'))
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

function getStatusColor(status: string): string {
  switch (status) {
    case 'granted':
      return 'var(--el-color-success)'
    case 'denied':
      return 'var(--el-color-danger)'
    case 'notDetermined':
      return 'var(--el-color-warning)'
    default:
      return 'var(--el-color-info)'
  }
}

function getPermissionIcon(type: string): string {
  const icons: Record<string, string> = {
    accessibility: 'keyboard',
    notifications: 'notification-3',
    adminPrivileges: 'shield-user'
  }
  return icons[type] || 'settings'
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'granted':
      return 'checkbox-circle'
    case 'denied':
      return 'close-circle'
    case 'notDetermined':
      return 'question-line'
    default:
      return 'information'
  }
}
</script>

<template>
  <t-group-block
    :name="t('settings.setup.groupTitle')"
    icon="setting"
    :description="t('settings.setup.groupDesc')"
  >
    <!-- Permissions Section -->
    <!-- Accessibility Permission (macOS) -->
    <div v-if="isMacOS" class="PermissionItem TBlockSelection fake-background index-fix">
      <div class="PermissionItem-Content TBlockSelection-Content">
        <RemixIcon :name="getPermissionIcon('accessibility')" :style="'line'" />
        <div class="PermissionItem-Label TBlockSelection-Label">
          <h3>{{ t('settings.setup.accessibility') }}</h3>
          <p>{{ t('settings.setup.accessibilityDesc') }}</p>
        </div>
      </div>
      <div class="PermissionItem-Action TBlockSelection-Func">
        <div
          class="StatusBadge"
          :style="{ color: getStatusColor(permissions.accessibility.status) }"
        >
          <RemixIcon
            :name="getStatusIcon(permissions.accessibility.status)"
            :style="permissions.accessibility.status === 'granted' ? 'fill' : 'line'"
          />
          <span>{{ getStatusText(permissions.accessibility.status) }}</span>
        </div>
        <el-button
          v-if="permissions.accessibility.status !== 'granted'"
          size="small"
          type="primary"
          @click="requestPermission('accessibility')"
        >
          {{ t('setupPermissions.openSettings') }}
        </el-button>
      </div>
    </div>

    <!-- Admin Privileges (Windows) -->
    <div v-if="isWindows" class="PermissionItem TBlockSelection fake-background index-fix">
      <div class="PermissionItem-Content TBlockSelection-Content">
        <RemixIcon :name="getPermissionIcon('adminPrivileges')" :style="'line'" />
        <div class="PermissionItem-Label TBlockSelection-Label">
          <h3>{{ t('settings.setup.adminPrivileges') }}</h3>
          <p>{{ t('settings.setup.adminPrivilegesDesc') }}</p>
        </div>
      </div>
      <div class="PermissionItem-Action TBlockSelection-Func">
        <div
          class="StatusBadge"
          :style="{ color: getStatusColor(permissions.adminPrivileges.status) }"
        >
          <RemixIcon
            :name="getStatusIcon(permissions.adminPrivileges.status)"
            :style="permissions.adminPrivileges.status === 'granted' ? 'fill' : 'line'"
          />
          <span>{{ getStatusText(permissions.adminPrivileges.status) }}</span>
        </div>
        <el-button size="small" :loading="isLoading" @click="checkAllPermissions">
          {{ t('setupPermissions.recheck') }}
        </el-button>
      </div>
    </div>

    <!-- Notification Permission -->
    <div class="PermissionItem TBlockSelection fake-background index-fix">
      <div class="PermissionItem-Content TBlockSelection-Content">
        <RemixIcon :name="getPermissionIcon('notifications')" :style="'line'" />
        <div class="PermissionItem-Label TBlockSelection-Label">
          <h3>{{ t('settings.setup.notifications') }}</h3>
          <p>{{ t('settings.setup.notificationsDesc') }}</p>
        </div>
      </div>
      <div class="PermissionItem-Action TBlockSelection-Func">
        <div
          class="StatusBadge"
          :style="{ color: getStatusColor(permissions.notifications.status) }"
        >
          <RemixIcon
            :name="getStatusIcon(permissions.notifications.status)"
            :style="permissions.notifications.status === 'granted' ? 'fill' : 'line'"
          />
          <span>{{ getStatusText(permissions.notifications.status) }}</span>
        </div>
        <el-button
          v-if="permissions.notifications.status !== 'granted'"
          size="small"
          type="primary"
          @click="requestPermission('notifications')"
        >
          {{ t('setupPermissions.openSettings') }}
        </el-button>
      </div>
    </div>

    <!-- Settings Section -->
    <!-- Auto Start -->
    <t-block-switch
      v-model="settings.autoStart"
      :title="t('settings.setup.autoStart')"
      icon="play-circle"
      :description="t('settings.setup.autoStartDesc')"
      @update:model-value="updateAutoStart"
    />

    <!-- Show Tray -->
    <t-block-switch
      v-model="settings.showTray"
      :title="t('settings.setup.showTray')"
      icon="tray"
      :description="t('settings.setup.showTrayDesc')"
      @update:model-value="updateShowTray"
    />

    <!-- Hide Dock (macOS only) -->
    <t-block-switch
      v-if="isMacOS"
      v-model="settings.hideDock"
      :title="t('settings.setup.hideDock')"
      icon="macbook"
      :description="t('settings.setup.hideDockDesc')"
      @update:model-value="updateHideDock"
    />

    <!-- Start Silent -->
    <t-block-switch
      v-model="settings.startSilent"
      :title="t('settings.setup.startSilent')"
      icon="bell-off"
      :description="t('settings.setup.startSilentDesc')"
      @update:model-value="updateStartSilent"
    />
  </t-group-block>
</template>

<style lang="scss" scoped>
.PermissionItem {
  position: relative;
  margin-bottom: 0;
  padding: 4px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  height: 56px;
  user-select: none;
  border-radius: 0;
  box-sizing: border-box;
  --fake-color: var(--el-fill-color-dark);
  --fake-radius: 0;
  --fake-inner-opacity: 0.5;

  &:hover {
    --fake-color: var(--el-fill-color);
  }

  .PermissionItem-Content {
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    cursor: default;

    > * {
      margin-right: 16px;
      font-size: 20px;
    }

    .PermissionItem-Label {
      flex: 1;

      h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 400;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 0;
        font-size: 12px;
        font-weight: 300;
        opacity: 0.5;
        color: var(--el-text-color-regular);
      }
    }
  }

  .PermissionItem-Action {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-right: 32px;

    .StatusBadge {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 12px;
      font-weight: 500;
      min-width: 100px;
      white-space: nowrap;

      .remix {
        font-size: 16px;
      }
    }
  }
}

.touch-blur .PermissionItem {
  --fake-color: var(--el-fill-color);

  &:hover {
    --fake-color: var(--el-fill-color-light);
  }
}
</style>
