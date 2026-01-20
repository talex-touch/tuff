<script setup lang="ts" name="SetupPermissions">
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { StorageEvents, TrayEvents } from '@talex-touch/utils/transport/events'
import { computed, inject, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TGroupBlock from '~/components/base/group/TGroupBlock.vue'
import TBlockSwitch from '~/components/base/switch/TBlockSwitch.vue'
import RemixIcon from '~/components/icon/RemixIcon.vue'
import { appSetting } from '~/modules/channel/storage/index'
import { useStartupInfo } from '~/modules/hooks/useStartupInfo'
import Done from './Done.vue'

type StepFunction = (
  call: { comp: any; rect?: { width: number; height: number } },
  dataAction?: () => void
) => void

const { t } = useI18n()
const step: StepFunction = inject('step')!
const transport = useTuffTransport()
const { startupInfo } = useStartupInfo()

const platform = computed(() => startupInfo.value?.platform || process.platform)
const isMacOS = computed(() => platform.value === 'darwin')
const isWindows = computed(() => platform.value === 'win32')

type SystemPermissionStatus = 'granted' | 'denied' | 'notDetermined' | 'unsupported'

interface SystemPermissionCheckResult {
  status: SystemPermissionStatus
  canRequest: boolean
  message?: string
}

const systemPermissionCheck = defineRawEvent<string, SystemPermissionCheckResult>(
  'system:permission:check'
)
const systemPermissionRequest = defineRawEvent<string, boolean>('system:permission:request')

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
  showTray: true,
  hideDock: false
})

const isLoading = ref(false)

// Initialize appSettingtata.setup if not exists
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

// Check permissions on mount
onMounted(async () => {
  await checkAllPermissions()
  await loadSettings()
})

async function checkAllPermissions(): Promise<void> {
  if (isLoading.value) {
    // Already checking, avoid duplicate requests
    return
  }

  isLoading.value = true
  try {
    // Check file access permission (required)
    const fileAccessResult = (await Promise.race([
      transport.send(systemPermissionCheck, 'fileAccess'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
    ])) as any

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
        const accResult = (await Promise.race([
          transport.send(systemPermissionCheck, 'accessibility'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ])) as any

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
      const notifResult = (await Promise.race([
        transport.send(systemPermissionCheck, 'notifications'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ])) as any

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
        const adminResult = (await Promise.race([
          transport.send(systemPermissionCheck, 'adminPrivileges'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ])) as any

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
    toast.error(t('setupPermissions.checkFailed'))
  } finally {
    isLoading.value = false
  }
}

async function loadSettings(): Promise<void> {
  if (appSetting.setup) {
    settings.value.autoStart = appSetting.setup.autoStart ?? false
    settings.value.showTray = appSetting.setup.showTray ?? true
  }

  // Load autoStart from existing setting
  const autoStartResult = await transport.send(TrayEvents.autostart.get)
  if (autoStartResult !== null) {
    settings.value.autoStart = Boolean(autoStartResult)
  }
}

async function requestPermission(type: string): Promise<void> {
  try {
    const opened = await transport.send(systemPermissionRequest, type)
    if (opened) {
      toast.info(t('setupPermissions.openSettings'))
    }
    // Recheck after a delay to allow user to grant permission
    setTimeout(async () => {
      await checkAllPermissions()
    }, 2000)
  } catch (error) {
    console.error(`[SetupPermissions] Failed to request permission ${type}:`, error)
    toast.error(t('setupPermissions.requestFailed'))
  }
}

async function updateAutoStart(value: boolean): Promise<void> {
  settings.value.autoStart = value
  appSetting.setup.autoStart = value
  try {
    await transport.send(StorageEvents.app.save, {
      key: 'app.autoStart',
      content: JSON.stringify(value),
      clear: false
    })
    await transport.send(TrayEvents.autostart.update, value)
  } catch (error) {
    console.error('[SetupPermissions] Failed to update autoStart:', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

async function updateShowTray(value: boolean): Promise<void> {
  settings.value.showTray = value
  appSetting.setup.showTray = value
  try {
    await transport.send(StorageEvents.app.save, {
      key: 'app.setup.showTray',
      content: JSON.stringify(value),
      clear: false
    })
    await transport.send(TrayEvents.show.set, value)
  } catch (error) {
    console.error('[SetupPermissions] Failed to update showTray:', error)
    toast.error(t('setupPermissions.updateFailed'))
  }
}

function canContinue(): boolean {
  // Check file access permission (required)
  return permissions.value.fileAccess.status === 'granted'
}

async function canContinueAsync(): Promise<boolean> {
  // Check file access permission (required)
  if (permissions.value.fileAccess.checked) {
    return permissions.value.fileAccess.status === 'granted'
  }
  // If not checked yet, check now
  await checkAllPermissions()
  return permissions.value.fileAccess.status === 'granted'
}

async function handleContinue(): Promise<void> {
  const canProceed = await canContinueAsync()
  if (!canProceed) {
    toast.warning(t('setupPermissions.requiredFileAccess'))
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
        adminPrivileges: permissions.value.adminPrivileges.status === 'granted',
        hideDock: settings.value.hideDock ?? false,
        runAsAdmin: appSetting.setup.runAsAdmin ?? false,
        customDesktop: appSetting.setup.customDesktop ?? false
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

function getPermissionIcon(type: string): string {
  const icons: Record<string, string> = {
    fileAccess: 'folder-open',
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
  <div class="SetupPermissions">
    <div class="SetupPermissions-Header">
      <h1>{{ t('setupPermissions.title') }}</h1>
      <p>{{ t('setupPermissions.description') }}</p>
    </div>

    <div class="SetupPermissions-Content">
      <!-- Permissions Section -->
      <TGroupBlock
        :name="t('setupPermissions.permissionsTitle')"
        icon="shield"
        :description="t('setupPermissions.permissionsTitle')"
        :shrink="false"
      >
        <!-- File Access Permission (Required) -->
        <div
          class="PermissionItem TBlockSelection fake-background index-fix"
          :class="{ required: permissions.fileAccess.required }"
        >
          <div class="PermissionItem-Content TBlockSelection-Content">
            <RemixIcon :name="getPermissionIcon('fileAccess')" :style="'line'" />
            <div class="PermissionItem-Label TBlockSelection-Label">
              <h3>
                {{ t('setupPermissions.fileAccess') }}
                <span v-if="permissions.fileAccess.required" class="required-badge">{{
                  t('setupPermissions.required')
                }}</span>
              </h3>
              <p>{{ t('setupPermissions.fileAccessDesc') }}</p>
            </div>
          </div>
          <div class="PermissionItem-Action TBlockSelection-Func">
            <div
              class="StatusBadge"
              :style="{ color: getStatusColor(permissions.fileAccess.status) }"
            >
              <RemixIcon
                :name="getStatusIcon(permissions.fileAccess.status)"
                :style="permissions.fileAccess.status === 'granted' ? 'fill' : 'line'"
              />
              <span>{{ getStatusText(permissions.fileAccess.status) }}</span>
            </div>
            <el-button size="small" :loading="isLoading" @click="checkAllPermissions">
              {{ t('setupPermissions.recheck') }}
            </el-button>
          </div>
        </div>

        <!-- Accessibility Permission (macOS, Optional) -->
        <div v-if="isMacOS" class="PermissionItem TBlockSelection fake-background index-fix">
          <div class="PermissionItem-Content TBlockSelection-Content">
            <RemixIcon :name="getPermissionIcon('accessibility')" :style="'line'" />
            <div class="PermissionItem-Label TBlockSelection-Label">
              <h3>{{ t('setupPermissions.accessibility') }}</h3>
              <p>{{ t('setupPermissions.accessibilityDesc') }}</p>
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
              <h3>{{ t('setupPermissions.adminPrivileges') }}</h3>
              <p>{{ t('setupPermissions.adminPrivilegesDesc') }}</p>
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

        <!-- Notification Permission -->
        <div class="PermissionItem TBlockSelection fake-background index-fix">
          <div class="PermissionItem-Content TBlockSelection-Content">
            <RemixIcon :name="getPermissionIcon('notifications')" :style="'line'" />
            <div class="PermissionItem-Label TBlockSelection-Label">
              <h3>{{ t('setupPermissions.notifications') }}</h3>
              <p>{{ t('setupPermissions.notificationsDesc') }}</p>
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
      </TGroupBlock>

      <!-- Settings Section -->
      <TGroupBlock
        :name="t('setupPermissions.settingsTitle')"
        icon="settings"
        :description="t('setupPermissions.settingsTitle')"
        :shrink="false"
      >
        <!-- Auto Start -->
        <TBlockSwitch
          v-model="settings.autoStart"
          :title="t('setupPermissions.autoStart')"
          icon="play-circle"
          :description="t('setupPermissions.autoStartDesc')"
          @update:model-value="updateAutoStart"
        />

        <!-- Show Tray -->
        <TBlockSwitch
          v-model="settings.showTray"
          :title="t('setupPermissions.showTray')"
          icon="tray"
          :description="t('setupPermissions.showTrayDesc')"
          @update:model-value="updateShowTray"
        />
      </TGroupBlock>
    </div>

    <div class="SetupPermissions-Actions">
      <el-button :loading="isLoading" @click="checkAllPermissions">
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

    // Override TGroupBlock spacing
    :deep(.TGroupBlock-Container) {
      margin-bottom: 1.5rem;
    }
  }

  &-Actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--el-border-color);
    margin-top: 1.5rem;
    flex-shrink: 0;
  }
}

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

  &.required {
    --fake-color: var(--el-color-warning-light-9);

    .PermissionItem-Content {
      .PermissionItem-Label h3 .required-badge {
        display: inline-flex;
        margin-left: 0.5rem;
        font-size: 0.75rem;
        color: var(--el-color-warning);
        background-color: var(--el-color-warning-light-8);
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 500;
      }
    }
  }

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
