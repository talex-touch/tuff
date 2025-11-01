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
  showTray: true
})

const isLoading = ref(false)

// Initialize appSetting.setup if not exists
if (!appSetting.setup) {
  appSetting.setup = {
    accessibility: false,
    notifications: false,
    autoStart: false,
    showTray: true,
    adminPrivileges: false
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
      const adminResult = await touchChannel.send('system:permission:check', 'adminPrivileges' as any)
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
</script>

<template>
  <t-group-block
    :name="t('settings.setup.groupTitle')"
    icon="setting"
    :description="t('settings.setup.groupDesc')"
  >
    <!-- Permissions Section -->
    <div class="SettingSetup-Permissions">
      <!-- Accessibility Permission (macOS) -->
      <div v-if="isMacOS" class="SettingSetup-PermissionItem">
        <div class="PermissionItem-Info">
          <span class="PermissionItem-Title">{{ t('settings.setup.accessibility') }}</span>
          <span class="PermissionItem-Description">{{ t('settings.setup.accessibilityDesc') }}</span>
        </div>
        <div class="PermissionItem-Action">
          <span
            class="PermissionItem-Status"
            :style="{ color: getStatusColor(permissions.accessibility.status) }"
          >
            {{ getStatusText(permissions.accessibility.status) }}
          </span>
          <el-button
            v-if="permissions.accessibility.status !== 'granted'"
            size="small"
            type="primary"
            @click="requestPermission('accessibility')"
          >
            {{ t('setupPermissions.openSettings') }}
          </el-button>
          <el-button size="small" :loading="isLoading" @click="checkAllPermissions">
            {{ t('setupPermissions.recheck') }}
          </el-button>
        </div>
      </div>

      <!-- Admin Privileges (Windows) -->
      <div v-if="isWindows" class="SettingSetup-PermissionItem">
        <div class="PermissionItem-Info">
          <span class="PermissionItem-Title">{{ t('settings.setup.adminPrivileges') }}</span>
          <span class="PermissionItem-Description">{{ t('settings.setup.adminPrivilegesDesc') }}</span>
        </div>
        <div class="PermissionItem-Action">
          <span
            class="PermissionItem-Status"
            :style="{ color: getStatusColor(permissions.adminPrivileges.status) }"
          >
            {{ getStatusText(permissions.adminPrivileges.status) }}
          </span>
          <el-button size="small" :loading="isLoading" @click="checkAllPermissions">
            {{ t('setupPermissions.recheck') }}
          </el-button>
        </div>
      </div>

      <!-- Notification Permission -->
      <div class="SettingSetup-PermissionItem">
        <div class="PermissionItem-Info">
          <span class="PermissionItem-Title">{{ t('settings.setup.notifications') }}</span>
          <span class="PermissionItem-Description">{{ t('settings.setup.notificationsDesc') }}</span>
        </div>
        <div class="PermissionItem-Action">
          <span
            class="PermissionItem-Status"
            :style="{ color: getStatusColor(permissions.notifications.status) }"
          >
            {{ getStatusText(permissions.notifications.status) }}
          </span>
          <el-button
            v-if="permissions.notifications.status !== 'granted'"
            size="small"
            type="primary"
            @click="requestPermission('notifications')"
          >
            {{ t('setupPermissions.openSettings') }}
          </el-button>
          <el-button size="small" :loading="isLoading" @click="checkAllPermissions">
            {{ t('setupPermissions.recheck') }}
          </el-button>
        </div>
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
      icon="icon"
      :description="t('settings.setup.showTrayDesc')"
      @update:model-value="updateShowTray"
    />
  </t-group-block>
</template>

<style lang="scss" scoped>
.SettingSetup-Permissions {
  margin-bottom: 1rem;
}

.SettingSetup-PermissionItem {
  padding: 1rem;
  margin-bottom: 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  background-color: var(--el-fill-color-lighter);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;

  .PermissionItem-Info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .PermissionItem-Title {
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--el-text-color-primary);
  }

  .PermissionItem-Description {
    font-size: 0.85rem;
    color: var(--el-text-color-regular);
    line-height: 1.5;
  }

  .PermissionItem-Action {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .PermissionItem-Status {
    font-size: 0.85rem;
    font-weight: 500;
    min-width: 80px;
    text-align: right;
  }
}
</style>

