<script setup lang="ts" name="SetupPermissions">
import { TuffSwitch, TxButton, TxCard, TxCardItem, TxStatusBadge } from '@talex-touch/tuffex'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { StorageEvents, TrayEvents } from '@talex-touch/utils/transport/events'
import type { Component } from 'vue'
import { computed, inject, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TGroupBlock from '~/components/base/group/TGroupBlock.vue'
import RemixIcon from '~/components/icon/RemixIcon.vue'
import { appSetting } from '~/modules/channel/storage/index'
import { useStartupInfo } from '~/modules/hooks/useStartupInfo'
import Done from './Done.vue'

type StepFunction = (
  call: { comp: Component; rect?: { width: number; height: number } },
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
const isContinuing = ref(false)

// Initialize appSettingtata.setup if not exists
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
    const fileAccessResult = await Promise.race<SystemPermissionCheckResult>([
      transport.send(systemPermissionCheck, 'fileAccess'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
    ])

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
        const accResult = await Promise.race<SystemPermissionCheckResult>([
          transport.send(systemPermissionCheck, 'accessibility'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ])

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
      const notifResult = await Promise.race<SystemPermissionCheckResult>([
        transport.send(systemPermissionCheck, 'notifications'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ])

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
        const adminResult = await Promise.race<SystemPermissionCheckResult>([
          transport.send(systemPermissionCheck, 'adminPrivileges'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ])

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
  if (isContinuing.value) return
  isContinuing.value = true
  try {
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
          microphone: appSetting.setup.microphone ?? false,
          autoStart: settings.value.autoStart,
          showTray: settings.value.showTray,
          adminPrivileges: permissions.value.adminPrivileges.status === 'granted',
          hideDock: settings.value.hideDock ?? false,
          runAsAdmin: appSetting.setup.runAsAdmin ?? false,
          customDesktop: appSetting.setup.customDesktop ?? false
        }
      }
    )
  } finally {
    isContinuing.value = false
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

function getPermissionIcon(type: string): string {
  const icons: Record<string, string> = {
    fileAccess: 'folder-open',
    accessibility: 'keyboard',
    notifications: 'notification-3',
    adminPrivileges: 'shield-user'
  }
  return icons[type] || 'settings'
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
        <TxCard
          class="PermissionItem"
          :class="{ required: permissions.fileAccess.required }"
          variant="solid"
          background="mask"
          shadow="none"
          :radius="12"
          :padding="0"
        >
          <div class="PermissionItem-Content">
            <RemixIcon :name="getPermissionIcon('fileAccess')" :style="'line'" />
            <div class="PermissionItem-Label">
              <h3>
                {{ t('setupPermissions.fileAccess') }}
                <span v-if="permissions.fileAccess.required" class="required-badge">{{
                  t('setupPermissions.required')
                }}</span>
              </h3>
              <p>{{ t('setupPermissions.fileAccessDesc') }}</p>
            </div>
          </div>
          <div class="PermissionItem-Action">
            <TxStatusBadge
              class="StatusBadge"
              size="sm"
              :text="getStatusText(permissions.fileAccess.status)"
              :status-key="permissions.fileAccess.status"
            />
            <TxButton size="small" :loading="isLoading" @click="checkAllPermissions">
              {{ t('setupPermissions.recheck') }}
            </TxButton>
          </div>
        </TxCard>

        <!-- Accessibility Permission (macOS, Optional) -->
        <TxCard
          v-if="isMacOS"
          class="PermissionItem"
          variant="solid"
          background="mask"
          shadow="none"
          :radius="12"
          :padding="0"
        >
          <div class="PermissionItem-Content">
            <RemixIcon :name="getPermissionIcon('accessibility')" :style="'line'" />
            <div class="PermissionItem-Label">
              <h3>{{ t('setupPermissions.accessibility') }}</h3>
              <p>{{ t('setupPermissions.accessibilityDesc') }}</p>
            </div>
          </div>
          <div class="PermissionItem-Action">
            <TxStatusBadge
              class="StatusBadge"
              size="sm"
              :text="getStatusText(permissions.accessibility.status)"
              :status-key="permissions.accessibility.status"
            />
            <TxButton
              v-if="permissions.accessibility.status !== 'granted'"
              size="small"
              type="primary"
              @click="requestPermission('accessibility')"
            >
              {{ t('setupPermissions.openSettings') }}
            </TxButton>
          </div>
        </TxCard>

        <!-- Admin Privileges (Windows) -->
        <TxCard
          v-if="isWindows"
          class="PermissionItem"
          variant="solid"
          background="mask"
          shadow="none"
          :radius="12"
          :padding="0"
        >
          <div class="PermissionItem-Content">
            <RemixIcon :name="getPermissionIcon('adminPrivileges')" :style="'line'" />
            <div class="PermissionItem-Label">
              <h3>{{ t('setupPermissions.adminPrivileges') }}</h3>
              <p>{{ t('setupPermissions.adminPrivilegesDesc') }}</p>
            </div>
          </div>
          <div class="PermissionItem-Action">
            <TxStatusBadge
              class="StatusBadge"
              size="sm"
              :text="getStatusText(permissions.adminPrivileges.status)"
              :status-key="permissions.adminPrivileges.status"
            />
            <TxButton
              v-if="permissions.adminPrivileges.status !== 'granted'"
              size="small"
              type="warning"
              @click="checkAllPermissions"
            >
              {{ t('setupPermissions.recheck') }}
            </TxButton>
          </div>
        </TxCard>

        <!-- Notification Permission -->
        <TxCard
          class="PermissionItem"
          variant="solid"
          background="mask"
          shadow="none"
          :radius="12"
          :padding="0"
        >
          <div class="PermissionItem-Content">
            <RemixIcon :name="getPermissionIcon('notifications')" :style="'line'" />
            <div class="PermissionItem-Label">
              <h3>{{ t('setupPermissions.notifications') }}</h3>
              <p>{{ t('setupPermissions.notificationsDesc') }}</p>
            </div>
          </div>
          <div class="PermissionItem-Action">
            <TxStatusBadge
              class="StatusBadge"
              size="sm"
              :text="getStatusText(permissions.notifications.status)"
              :status-key="permissions.notifications.status"
            />
            <TxButton
              v-if="permissions.notifications.status !== 'granted'"
              size="small"
              type="primary"
              @click="requestPermission('notifications')"
            >
              {{ t('setupPermissions.openSettings') }}
            </TxButton>
          </div>
        </TxCard>
      </TGroupBlock>

      <!-- Settings Section -->
      <TGroupBlock
        :name="t('setupPermissions.settingsTitle')"
        icon="settings"
        :description="t('setupPermissions.settingsTitle')"
        :shrink="false"
      >
        <TxCard
          class="SetupPermissions-SettingCard"
          variant="solid"
          background="mask"
          shadow="none"
          :radius="12"
          :padding="0"
        >
          <TxCardItem
            :title="t('setupPermissions.autoStart')"
            :description="t('setupPermissions.autoStartDesc')"
            icon-class="i-ri-play-circle-line"
            class="SetupPermissions-SettingItem"
          >
            <template #right>
              <TuffSwitch v-model="settings.autoStart" @update:model-value="updateAutoStart" />
            </template>
          </TxCardItem>

          <TxCardItem
            :title="t('setupPermissions.showTray')"
            :description="t('setupPermissions.showTrayDesc')"
            icon-class="i-ri-inbox-line"
            class="SetupPermissions-SettingItem"
          >
            <template #right>
              <TuffSwitch v-model="settings.showTray" @update:model-value="updateShowTray" />
            </template>
          </TxCardItem>
        </TxCard>
      </TGroupBlock>
    </div>

    <div class="SetupPermissions-Actions">
      <TxButton :loading="isLoading" @click="checkAllPermissions">
        {{ t('setupPermissions.recheck') }}
      </TxButton>
      <TxButton type="primary" :loading="isContinuing" @click="handleContinue">
        {{ t('setupPermissions.continue') }}
      </TxButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.SetupPermissions {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1.5rem;
  gap: 1rem;
  overflow: hidden;

  &-Header {
    h1 {
      margin: 0 0 0.35rem;
      font-size: 1.7rem;
      font-weight: 700;
      color: var(--tx-text-color-primary);
    }

    p {
      margin: 0;
      font-size: 0.96rem;
      color: var(--tx-text-color-regular);
      line-height: 1.45;
    }
  }

  &-Content {
    flex: 1;
    overflow: auto;
    padding-right: 0.2rem;

    :deep(.TGroupBlock-Container) {
      margin-bottom: 1rem;
    }
  }

  &-Actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding-top: 0.95rem;
    border-top: 1px solid var(--tx-border-color);
    margin-top: 0.25rem;
    flex-shrink: 0;
  }
}

.PermissionItem {
  margin-bottom: 0.6rem;
  padding: 0.8rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;

  &:last-child {
    margin-bottom: 0;
  }

  &.required {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-warning) 30%, transparent);
  }

  &-Content {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;

    :deep(.remix) {
      font-size: 1.05rem;
      margin-top: 0.15rem;
      color: var(--tx-text-color-secondary);
    }
  }

  &-Label {
    flex: 1;
    min-width: 0;

    h3 {
      margin: 0 0 0.2rem;
      font-size: 1rem;
      font-weight: 600;
      color: var(--tx-text-color-primary);
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }

    p {
      margin: 0;
      font-size: 0.88rem;
      color: var(--tx-text-color-secondary);
      line-height: 1.35;
    }
  }

  &-Action {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-shrink: 0;
  }
}

.required-badge {
  display: inline-flex;
  font-size: 0.72rem;
  color: var(--tx-color-warning);
  background: color-mix(in srgb, var(--tx-color-warning) 18%, transparent);
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  font-weight: 600;
}

.StatusBadge {
  min-width: 84px;
  justify-content: center;
}

.SetupPermissions-SettingCard {
  overflow: hidden;
}

.SetupPermissions-SettingItem {
  --tx-card-item-padding: 0.72rem 0.9rem;
  --tx-card-item-gap: 0.72rem;
}

.SetupPermissions-SettingItem + .SetupPermissions-SettingItem {
  border-top: 1px solid color-mix(in srgb, var(--tx-border-color) 80%, transparent);
}

@media (max-width: 900px) {
  .PermissionItem {
    flex-direction: column;

    &-Action {
      width: 100%;
      justify-content: space-between;
    }
  }

  .SetupPermissions-Actions {
    justify-content: stretch;

    :deep(button) {
      flex: 1;
    }
  }
}
</style>
