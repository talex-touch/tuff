<script setup lang="ts" name="SetupPermissions">
import { ref, onMounted, computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import Done from './Done.vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage/index'

type StepFunction = (call: { comp: any; rect?: { width: number; height: number } }, dataAction?: () => void) => void

const { t } = useI18n()
const step: StepFunction = inject('step')!

const platform = computed(() => window.$startupInfo?.platform || process.platform)
const isMacOS = computed(() => platform.value === 'darwin')
const isWindows = computed(() => platform.value === 'win32')
const isLinux = computed(() => platform.value === 'linux')

// Permission states
const permissions = ref({
  fileAccess: {
    status: 'notDetermined' as 'granted' | 'denied' | 'notDetermined' | 'unsupported',
    checked: false,
    required: true // File access is required
  },
  accessibility: {
    status: 'notDetermined' as 'granted' | 'denied' | 'notDetermined' | 'unsupported',
    checked: false,
    required: false // Optional
  },
  notifications: {
    status: 'notDetermined' as 'granted' | 'denied' | 'notDetermined' | 'unsupported',
    checked: false,
    required: false // Optional
  },
  adminPrivileges: {
    status: 'notDetermined' as 'granted' | 'denied' | 'notDetermined' | 'unsupported',
    checked: false,
    required: false // Optional
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

// Check permissions on mount
onMounted(async () => {
  await checkAllPermissions()
  loadSettings()
})

async function checkAllPermissions(): Promise<void> {
  if (isLoading.value) {
    // Already checking, avoid duplicate requests
    return
  }
  
  isLoading.value = true
  try {
    // Check file access permission (required)
    const fileAccessResult = await Promise.race([
      touchChannel.send('system:permission:check', 'fileAccess' as any),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
    ]) as any
    
    if (fileAccessResult && fileAccessResult.status) {
      permissions.value.fileAccess = {
        status: fileAccessResult.status,
        checked: true,
        required: true
      }
    }

    // Check accessibility permission (macOS, optional)
    if (isMacOS.value) {
      try {
        const accResult = await Promise.race([
          touchChannel.send('system:permission:check', 'accessibility' as any),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]) as any
        
        if (accResult && accResult.status) {
          permissions.value.accessibility = {
            status: accResult.status,
            checked: true,
            required: false
          }
          appSetting.setup.accessibility = accResult.status === 'granted'
        }
      } catch (error) {
        console.warn('[SetupPermissions] Failed to check accessibility permission:', error)
      }
    }

    // Check notification permission (optional)
    try {
      const notifResult = await Promise.race([
        touchChannel.send('system:permission:check', 'notifications' as any),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]) as any
      
      if (notifResult && notifResult.status) {
        permissions.value.notifications = {
          status: notifResult.status,
          checked: true,
          required: false
        }
        appSetting.setup.notifications = notifResult.status === 'granted'
      }
    } catch (error) {
      console.warn('[SetupPermissions] Failed to check notification permission:', error)
    }

    // Check admin privileges (Windows, optional)
    if (isWindows.value) {
      try {
        const adminResult = await Promise.race([
          touchChannel.send('system:permission:check', 'adminPrivileges' as any),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]) as any
        
        if (adminResult && adminResult.status) {
          permissions.value.adminPrivileges = {
            status: adminResult.status,
            checked: true,
            required: false
          }
          appSetting.setup.adminPrivileges = adminResult.status === 'granted'
        }
      } catch (error) {
        console.warn('[SetupPermissions] Failed to check admin privileges:', error)
      }
    }
  } catch (error) {
    console.error('[SetupPermissions] Failed to check permissions:', error)
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
  const autoStartResult = touchChannel.sendSync('tray:autostart:get')
  if (autoStartResult !== null) {
    settings.value.autoStart = autoStartResult as boolean
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
    console.error(`[SetupPermissions] Failed to request permission ${type}:`, error)
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
  } catch (error) {
    console.error('[SetupPermissions] Failed to update autoStart:', error)
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
  } catch (error) {
    console.error('[SetupPermissions] Failed to update showTray:', error)
    ElMessage.error(t('setupPermissions.updateFailed'))
  }
}

async function canContinue(): Promise<boolean> {
  // Check file access permission (required)
  if (permissions.value.fileAccess.checked) {
    return permissions.value.fileAccess.status === 'granted'
  }
  // If not checked yet, check now
  await checkAllPermissions()
  return permissions.value.fileAccess.status === 'granted'
}

async function handleContinue(): Promise<void> {
  const canProceed = await canContinue()
  if (!canProceed) {
    ElMessage.warning(t('setupPermissions.requiredFileAccess'))
    return
  }

  step(
    {
      comp: Done
    },
    () => {
      // Save all settings before proceeding
      appSetting.setup = {
        accessibility: permissions.value.accessibility.status === 'granted',
        notifications: permissions.value.notifications.status === 'granted',
        autoStart: settings.value.autoStart,
        showTray: settings.value.showTray,
        adminPrivileges: permissions.value.adminPrivileges.status === 'granted'
      }
    }
  )
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
  <div class="SetupPermissions">
    <div class="SetupPermissions-Header">
      <h1>{{ t('setupPermissions.title') }}</h1>
      <p>{{ t('setupPermissions.description') }}</p>
    </div>

    <div class="SetupPermissions-Content">
      <!-- Permissions Section -->
      <div class="SetupPermissions-Section">
        <h2>{{ t('setupPermissions.permissionsTitle') }}</h2>

        <!-- File Access Permission (Required) -->
        <div class="SetupPermissions-Item required">
          <div class="Item-Header">
            <div class="Item-Info">
              <span class="Item-Title">
                {{ t('setupPermissions.fileAccess') }}
                <span class="required-badge">{{ t('setupPermissions.required') }}</span>
              </span>
              <span class="Item-Description">{{ t('setupPermissions.fileAccessDesc') }}</span>
            </div>
            <div class="Item-Action">
              <span
                class="Item-Status"
                :style="{ color: getStatusColor(permissions.fileAccess.status) }"
              >
                {{ getStatusText(permissions.fileAccess.status) }}
              </span>
              <el-button size="small" :loading="isLoading" @click="checkAllPermissions">
                {{ t('setupPermissions.recheck') }}
              </el-button>
            </div>
          </div>
        </div>

        <!-- Accessibility Permission (macOS, Optional) -->
        <div v-if="isMacOS" class="SetupPermissions-Item">
          <div class="Item-Header">
            <div class="Item-Info">
              <span class="Item-Title">{{ t('setupPermissions.accessibility') }}</span>
              <span class="Item-Description">{{ t('setupPermissions.accessibilityDesc') }}</span>
            </div>
            <div class="Item-Action">
              <span
                class="Item-Status"
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
            </div>
          </div>
        </div>

        <!-- Admin Privileges (Windows) -->
        <div v-if="isWindows" class="SetupPermissions-Item">
          <div class="Item-Header">
            <div class="Item-Info">
              <span class="Item-Title">{{ t('setupPermissions.adminPrivileges') }}</span>
              <span class="Item-Description">{{ t('setupPermissions.adminPrivilegesDesc') }}</span>
            </div>
            <div class="Item-Action">
              <span
                class="Item-Status"
                :style="{ color: getStatusColor(permissions.adminPrivileges.status) }"
              >
                {{ getStatusText(permissions.adminPrivileges.status) }}
              </span>
              <el-button
                v-if="permissions.adminPrivileges.status !== 'granted'"
                size="small"
                type="warning"
                @click="checkAllPermissions"
              >
                {{ t('setupPermissions.recheck') }}
              </el-button>
            </div>
          </div>
        </div>

        <!-- Notification Permission -->
        <div class="SetupPermissions-Item">
          <div class="Item-Header">
            <div class="Item-Info">
              <span class="Item-Title">{{ t('setupPermissions.notifications') }}</span>
              <span class="Item-Description">{{ t('setupPermissions.notificationsDesc') }}</span>
            </div>
            <div class="Item-Action">
              <span
                class="Item-Status"
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
            </div>
          </div>
        </div>
      </div>

      <!-- Settings Section -->
      <div class="SetupPermissions-Section">
        <h2>{{ t('setupPermissions.settingsTitle') }}</h2>

        <!-- Auto Start -->
        <div class="SetupPermissions-Item">
          <div class="Item-Header">
            <div class="Item-Info">
              <span class="Item-Title">{{ t('setupPermissions.autoStart') }}</span>
              <span class="Item-Description">{{ t('setupPermissions.autoStartDesc') }}</span>
            </div>
            <div class="Item-Action">
              <el-switch v-model="settings.autoStart" @change="updateAutoStart" />
            </div>
          </div>
        </div>

        <!-- Show Tray -->
        <div class="SetupPermissions-Item">
          <div class="Item-Header">
            <div class="Item-Info">
              <span class="Item-Title">{{ t('setupPermissions.showTray') }}</span>
              <span class="Item-Description">{{ t('setupPermissions.showTrayDesc') }}</span>
            </div>
            <div class="Item-Action">
              <el-switch v-model="settings.showTray" @change="updateShowTray" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="SetupPermissions-Actions">
      <el-button @click="checkAllPermissions" :loading="isLoading">
        {{ t('setupPermissions.recheck') }}
      </el-button>
      <el-button type="primary" :disabled="!canContinue()" @click="handleContinue">
        {{ t('setupPermissions.continue') }}
      </el-button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.SetupPermissions {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 2rem;
  overflow-y: auto;

  &-Header {
    margin-bottom: 2rem;

    h1 {
      margin: 0 0 0.5rem 0;
      font-size: 1.8rem;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    p {
      margin: 0;
      font-size: 0.95rem;
      color: var(--el-text-color-regular);
      line-height: 1.6;
    }
  }

  &-Content {
    flex: 1;
    overflow-y: auto;
  }

  &-Section {
    margin-bottom: 2rem;

    h2 {
      margin: 0 0 1rem 0;
      font-size: 1.2rem;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
  }

  &-Item {
    padding: 1rem;
    margin-bottom: 0.75rem;
    border-radius: 8px;
    border: 1px solid var(--el-border-color);
    background-color: var(--el-fill-color-lighter);
    transition: all 0.3s ease;

    &.required {
      border-color: var(--el-color-warning);
      background-color: var(--el-color-warning-light-9);
    }

    &:hover {
      border-color: var(--el-color-primary);
      background-color: var(--el-fill-color-light);
    }

    .Item-Header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }

    .Item-Info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .Item-Title {
      font-size: 1rem;
      font-weight: 500;
      color: var(--el-text-color-primary);

      .required-badge {
        margin-left: 0.5rem;
        font-size: 0.75rem;
        color: var(--el-color-warning);
        background-color: var(--el-color-warning-light-9);
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 500;
      }
    }

    .Item-Description {
      font-size: 0.85rem;
      color: var(--el-text-color-regular);
      line-height: 1.5;
    }

    .Item-Action {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .Item-Status {
      font-size: 0.85rem;
      font-weight: 500;
      min-width: 80px;
      text-align: right;
    }
  }

  &-Actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--el-border-color);
    margin-top: 1rem;
  }
}
</style>

