<script setup lang="ts" name="SetupPermissions">
import { TxButton } from '@talex-touch/tuffex'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { StorageEvents, TrayEvents } from '@talex-touch/utils/transport/events'
import type { Component } from 'vue'
import { computed, inject, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffStatusBadge from '~/components/tuff/TuffStatusBadge.vue'
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

function getStatusIconClass(status: string): string {
  switch (status) {
    case 'granted':
      return 'i-carbon-checkmark-filled'
    case 'denied':
      return 'i-carbon-close-outline'
    case 'notDetermined':
      return 'i-carbon-help'
    case 'unsupported':
      return 'i-carbon-minimize'
    default:
      return 'i-carbon-information'
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
      <TuffGroupBlock
        :name="t('setupPermissions.permissionsTitle')"
        :description="t('setupPermissions.permissionsTitle')"
        default-icon="i-carbon-security"
        active-icon="i-carbon-security"
        memory-name="beginner-setup-permissions"
      >
        <TuffBlockSlot
          class="PermissionSlot"
          :title="t('setupPermissions.fileAccess')"
          :description="t('setupPermissions.fileAccessDesc')"
          :active="permissions.fileAccess.status === 'granted'"
          default-icon="i-carbon-folder-open"
          active-icon="i-carbon-folder-open"
        >
          <template #tags>
            <span v-if="permissions.fileAccess.required" class="required-badge">
              {{ t('setupPermissions.required') }}
            </span>
          </template>
          <div class="PermissionActions">
            <TuffStatusBadge
              size="md"
              :status-key="permissions.fileAccess.status"
              :icon="getStatusIconClass(permissions.fileAccess.status)"
              :text="getStatusText(permissions.fileAccess.status)"
            />
            <TxButton size="sm" :loading="isLoading" @click.stop="checkAllPermissions">
              {{ t('setupPermissions.recheck') }}
            </TxButton>
          </div>
        </TuffBlockSlot>

        <TuffBlockSlot
          v-if="isMacOS"
          class="PermissionSlot"
          :title="t('setupPermissions.accessibility')"
          :description="t('setupPermissions.accessibilityDesc')"
          :active="permissions.accessibility.status === 'granted'"
          default-icon="i-carbon-keyboard"
          active-icon="i-carbon-keyboard"
        >
          <div class="PermissionActions">
            <TuffStatusBadge
              size="md"
              :status-key="permissions.accessibility.status"
              :icon="getStatusIconClass(permissions.accessibility.status)"
              :text="getStatusText(permissions.accessibility.status)"
            />
            <TxButton
              v-if="permissions.accessibility.status !== 'granted'"
              size="sm"
              type="primary"
              @click.stop="requestPermission('accessibility')"
            >
              {{ t('setupPermissions.openSettings') }}
            </TxButton>
          </div>
        </TuffBlockSlot>

        <TuffBlockSlot
          v-if="isWindows"
          class="PermissionSlot"
          :title="t('setupPermissions.adminPrivileges')"
          :description="t('setupPermissions.adminPrivilegesDesc')"
          :active="permissions.adminPrivileges.status === 'granted'"
          default-icon="i-carbon-security"
          active-icon="i-carbon-security"
        >
          <div class="PermissionActions">
            <TuffStatusBadge
              size="md"
              :status-key="permissions.adminPrivileges.status"
              :icon="getStatusIconClass(permissions.adminPrivileges.status)"
              :text="getStatusText(permissions.adminPrivileges.status)"
            />
            <TxButton
              v-if="permissions.adminPrivileges.status !== 'granted'"
              size="sm"
              type="warning"
              @click.stop="checkAllPermissions"
            >
              {{ t('setupPermissions.recheck') }}
            </TxButton>
          </div>
        </TuffBlockSlot>

        <TuffBlockSlot
          class="PermissionSlot"
          :title="t('setupPermissions.notifications')"
          :description="t('setupPermissions.notificationsDesc')"
          :active="permissions.notifications.status === 'granted'"
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
              v-if="permissions.notifications.status !== 'granted'"
              size="sm"
              type="primary"
              @click.stop="requestPermission('notifications')"
            >
              {{ t('setupPermissions.openSettings') }}
            </TxButton>
          </div>
        </TuffBlockSlot>
      </TuffGroupBlock>

      <TuffGroupBlock
        :name="t('setupPermissions.settingsTitle')"
        :description="t('setupPermissions.settingsTitle')"
        default-icon="i-carbon-settings"
        active-icon="i-carbon-settings-check"
        memory-name="beginner-setup-toggles"
      >
        <TuffBlockSwitch
          v-model="settings.autoStart"
          :title="t('setupPermissions.autoStart')"
          :description="t('setupPermissions.autoStartDesc')"
          default-icon="i-carbon-play"
          active-icon="i-carbon-play-filled"
          @update:model-value="updateAutoStart"
        />

        <TuffBlockSwitch
          v-model="settings.showTray"
          :title="t('setupPermissions.showTray')"
          :description="t('setupPermissions.showTrayDesc')"
          default-icon="i-carbon-portfolio"
          active-icon="i-carbon-portfolio"
          @update:model-value="updateShowTray"
        />
      </TuffGroupBlock>
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

.PermissionSlot {
  :deep(.TBlockSlot-Container) {
    height: auto;
    min-height: 72px;
    padding-top: 8px;
    padding-bottom: 8px;
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

.PermissionActions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
}

@media (max-width: 900px) {
  .PermissionActions {
    justify-content: flex-start;
  }

  .SetupPermissions-Actions {
    justify-content: stretch;

    :deep(button) {
      flex: 1;
    }
  }
}
</style>
