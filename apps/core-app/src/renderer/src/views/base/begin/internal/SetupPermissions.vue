<script setup lang="ts" name="SetupPermissions">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxModal as TModal } from '@talex-touch/tuffex/modal'
import { useNotificationSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineEvent } from '@talex-touch/utils/transport/event/builder'
import { AppEvents, StorageEvents } from '@talex-touch/utils/transport/events'
import { StorageList } from '@talex-touch/utils'
import type { Component } from 'vue'
import { inject, onBeforeUnmount, onMounted, ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffStatusBadge from '~/components/tuff/TuffStatusBadge.vue'
import { appSetting } from '~/modules/storage/app-storage'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import {
  createRequiredFileAccessRootKey,
  type FileAccessRootCheckResult,
  resolveRequiredFileAccessStatus,
  summarizeRequiredFileAccessStatus,
  systemPermissionFileAccessRoots,
  systemPermissionRequestFileAccessRoots
} from '~/modules/system/system-permission-roots'
import {
  type SystemPermissionCheckResult,
  type SystemPermissionStatus,
  waitForPermissionGrant
} from '~/modules/system/system-permission-refresh'
import { createRendererLogger } from '~/utils/renderer-log'
import Done from './Done.vue'

type StepFunction = (
  call: { comp: Component; rect?: { width: number; height: number } },
  dataAction?: () => void
) => void

const { t } = useI18n()
const step: StepFunction = inject('step')!
const transport = useTuffTransport()
const notificationSdk = useNotificationSdk()
const { isMac: isMacOS, isWindows } = useRendererPlatform()
const setupPermissionsLog = createRendererLogger('SetupPermissions')

const systemPermissionCheck = defineEvent('system')
  .module('permission')
  .event('check')
  .define<string, SystemPermissionCheckResult>()
const systemPermissionRequest = defineEvent('system')
  .module('permission')
  .event('request')
  .define<string, boolean>()

// Permission states
const permissions = ref({
  fileAccess: {
    status: 'notDetermined' as SystemPermissionStatus,
    checked: false,
    required: true // File access is required
  },
  accessibility: {
    status: 'notDetermined' as SystemPermissionStatus,
    checked: false,
    required: false // Optional
  },
  notifications: {
    status: 'notDetermined' as SystemPermissionStatus,
    checked: false,
    required: false // Optional
  },
  microphone: {
    status: 'notDetermined' as SystemPermissionStatus,
    checked: false,
    required: false // Optional
  },
  adminPrivileges: {
    status: 'notDetermined' as SystemPermissionStatus,
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
const traySettingsAvailable = ref(false)

const isLoading = ref(false)
const isContinuing = ref(false)
const fileAccessRoots = ref<FileAccessRootCheckResult[]>([])
const fileAccessDialogVisible = ref(false)
let permissionRequestRevision = 0

function createDefaultPermissionAudit() {
  return {
    at: 0,
    version: '',
    appUpdate: false,
    missing: [] as string[]
  }
}

async function saveAppSettings(): Promise<void> {
  await transport.send(StorageEvents.app.save, {
    key: StorageList.APP_SETTING,
    value: toRaw(appSetting),
    clear: false
  })
}

// Initialize appSettingtata.setup if not exists
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
    hideDock: false,
    runAsAdmin: false,
    customDesktop: false,
    lastPermissionAudit: createDefaultPermissionAudit()
  }
} else if (!appSetting.setup.lastPermissionAudit) {
  appSetting.setup.lastPermissionAudit = createDefaultPermissionAudit()
}

if (appSetting.setup.fileAccess === undefined) {
  appSetting.setup.fileAccess = false
}

if (appSetting.setup.fileAccessRootKey === undefined) {
  appSetting.setup.fileAccessRootKey = ''
}

// Check permissions on mount
onMounted(async () => {
  await checkAllPermissions()
  await loadSettings()
})

onBeforeUnmount(() => {
  permissionRequestRevision += 1
})

function applyPermissionResult(type: string, result: SystemPermissionCheckResult): void {
  if (type === 'fileAccess') {
    permissions.value.fileAccess = {
      status: result.status,
      checked: true,
      required: true
    }
    return
  }

  if (type === 'accessibility') {
    permissions.value.accessibility = {
      status: result.status,
      checked: true,
      required: false
    }
    appSetting.setup.accessibility = result.status === 'granted'
    return
  }

  if (type === 'notifications') {
    permissions.value.notifications = {
      status: result.status,
      checked: true,
      required: false
    }
    appSetting.setup.notifications = result.status === 'granted'
    return
  }

  if (type === 'microphone') {
    permissions.value.microphone = {
      status: result.status,
      checked: true,
      required: false
    }
    appSetting.setup.microphone = result.status === 'granted'
    return
  }

  if (type === 'adminPrivileges') {
    permissions.value.adminPrivileges = {
      status: result.status,
      checked: true,
      required: false
    }
    appSetting.setup.adminPrivileges = result.status === 'granted'
  }
}

function applyFileAccessRoots(roots: FileAccessRootCheckResult[]): void {
  const probedStatus = summarizeRequiredFileAccessStatus(roots)
  const rootKey = createRequiredFileAccessRootKey(roots)
  fileAccessRoots.value = roots
  permissions.value.fileAccess = {
    status: resolveRequiredFileAccessStatus(
      roots,
      appSetting.setup.fileAccess === true,
      appSetting.setup.fileAccessRootKey ?? ''
    ),
    checked: true,
    required: true
  }
  if (probedStatus === 'granted') {
    appSetting.setup.fileAccess = true
    appSetting.setup.fileAccessRootKey = rootKey
  } else if (probedStatus === 'denied') {
    appSetting.setup.fileAccess = false
    appSetting.setup.fileAccessRootKey = ''
  }
}

async function checkPermission(type: string): Promise<SystemPermissionCheckResult> {
  const result = await Promise.race<SystemPermissionCheckResult>([
    transport.send(systemPermissionCheck, type),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
  ])

  if (result && result.status) {
    applyPermissionResult(type, result)
  }

  return result
}

async function checkFileAccessRoots(): Promise<void> {
  const roots = await transport.send(systemPermissionFileAccessRoots)
  applyFileAccessRoots(Array.isArray(roots) ? roots : [])
}

async function checkAllPermissions(): Promise<void> {
  if (isLoading.value) {
    // Already checking, avoid duplicate requests
    return
  }

  isLoading.value = true
  try {
    // Check file access permission (required)
    await checkFileAccessRoots()

    // Check accessibility permission (macOS, optional)
    if (isMacOS.value) {
      try {
        await checkPermission('accessibility')
      } catch (error) {
        setupPermissionsLog.warn('Failed to check accessibility permission', error)
      }
    }

    if (isMacOS.value || isWindows.value) {
      try {
        await checkPermission('microphone')
      } catch (error) {
        setupPermissionsLog.warn('Failed to check microphone permission', error)
      }
    }

    // Check notification permission (macOS only, optional)
    if (isMacOS.value) {
      try {
        await checkPermission('notifications')
      } catch (error) {
        setupPermissionsLog.warn('Failed to check notification permission', error)
      }
    }

    // Check admin privileges (Windows, optional)
    if (isWindows.value) {
      try {
        await checkPermission('adminPrivileges')
      } catch (error) {
        setupPermissionsLog.warn('Failed to check admin privileges', error)
      }
    }
  } catch (error) {
    setupPermissionsLog.error('Failed to check permissions', error)
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
  }

  // Load autoStart from existing setting
  try {
    const autoStartResult = await transport.send(AppEvents.system.autoStartGet)
    settings.value.autoStart = Boolean(autoStartResult)
  } catch (error) {
    setupPermissionsLog.error('Failed to load autoStart', error)
  }

  try {
    const traySettings = await transport.send(AppEvents.system.traySettingsGet)
    traySettingsAvailable.value = traySettings?.available === true
    if (traySettings) {
      settings.value.showTray = traySettings.showTray !== false
      settings.value.hideDock = traySettings.hideDock === true
    }
  } catch (error) {
    setupPermissionsLog.error('Failed to load tray settings', error)
    traySettingsAvailable.value = false
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
    setupPermissionsLog.error(`Failed to request permission ${type}`, error)
    toast.error(t('setupPermissions.requestFailed'))
  }
}

async function requestFileAccessRoots(): Promise<void> {
  try {
    const roots = await transport.send(systemPermissionRequestFileAccessRoots)
    applyFileAccessRoots(Array.isArray(roots) ? roots : [])
    await saveAppSettings()
    if (permissions.value.fileAccess.status === 'granted') {
      toast.success(t('common.success'))
      return
    }
    toast.info(t('setupPermissions.fileAccessPrompted'))
  } catch (error) {
    setupPermissionsLog.error('Failed to request file access roots', error)
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
    setupPermissionsLog.error('Failed to send notification test', error)
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
    await transport.send(AppEvents.system.autoStartUpdate, value)
  } catch (error) {
    setupPermissionsLog.error('Failed to update autoStart', error)
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
    await transport.send(AppEvents.system.traySettingsUpdate, { showTray: value })
  } catch (error) {
    setupPermissionsLog.error('Failed to update showTray', error)
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
          fileAccess: permissions.value.fileAccess.status === 'granted',
          fileAccessRootKey:
            permissions.value.fileAccess.status === 'granted'
              ? createRequiredFileAccessRootKey(fileAccessRoots.value)
              : '',
          accessibility: permissions.value.accessibility.status === 'granted',
          notifications: permissions.value.notifications.status === 'granted',
          microphone: permissions.value.microphone.status === 'granted',
          autoStart: settings.value.autoStart,
          showTray: settings.value.showTray,
          adminPrivileges: permissions.value.adminPrivileges.status === 'granted',
          hideDock: settings.value.hideDock ?? false,
          runAsAdmin: appSetting.setup.runAsAdmin ?? false,
          customDesktop: appSetting.setup.customDesktop ?? false,
          lastPermissionAudit:
            appSetting.setup.lastPermissionAudit ?? createDefaultPermissionAudit()
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
    case 'unsupported':
      return 'i-carbon-minimize'
    default:
      return 'i-carbon-information'
  }
}

function getFileAccessPurposeText(purpose: string): string {
  return t(`setupPermissions.fileAccessPurposes.${purpose}`)
}

function getFileAccessRootDisplayStatus(root: FileAccessRootCheckResult): SystemPermissionStatus {
  if (permissions.value.fileAccess.status === 'granted' && root.required) {
    return 'granted'
  }
  return root.status
}
</script>

<template>
  <div class="SetupPermissions">
    <div class="SetupPermissions-Header">
      <h1>{{ t('setupPermissions.title') }}</h1>
      <p>{{ t('setupPermissions.description') }}</p>
      <p class="SetupPermissions-PrivacyNote">
        {{ t('setupPermissions.privacyNote') }}
      </p>
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
            <TxButton size="sm" type="primary" @click.stop="fileAccessDialogVisible = true">
              <span class="i-carbon-folder-details" aria-hidden="true" />
              {{ t('setupPermissions.manageFileAccess') }}
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
          v-if="isMacOS || isWindows"
          class="PermissionSlot"
          :title="t('setupPermissions.microphone')"
          :description="t('setupPermissions.microphoneDesc')"
          :active="permissions.microphone.status === 'granted'"
          default-icon="i-carbon-microphone"
          active-icon="i-carbon-microphone-filled"
        >
          <div class="PermissionActions">
            <TuffStatusBadge
              size="md"
              :status-key="permissions.microphone.status"
              :icon="getStatusIconClass(permissions.microphone.status)"
              :text="getStatusText(permissions.microphone.status)"
            />
            <TxButton
              v-if="permissions.microphone.status !== 'granted'"
              size="sm"
              type="primary"
              @click.stop="requestPermission('microphone')"
            >
              {{ t('setupPermissions.openSettings') }}
            </TxButton>
          </div>
        </TuffBlockSlot>

        <TuffBlockSlot
          v-if="isMacOS"
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
              @click.stop="
                isMacOS ? testNotificationPermission() : requestPermission('notifications')
              "
            >
              {{
                t(isMacOS ? 'setupPermissions.testNotification' : 'setupPermissions.openSettings')
              }}
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
          v-if="traySettingsAvailable"
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

    <TModal
      v-model="fileAccessDialogVisible"
      :title="t('setupPermissions.fileAccessDialogTitle')"
      width="720px"
    >
      <div class="FileAccessDialog">
        <p class="FileAccessDialog-Desc">
          {{ t('setupPermissions.fileAccessDialogDesc') }}
        </p>
        <div class="FileAccessDialog-Actions">
          <TuffStatusBadge
            size="md"
            :status-key="permissions.fileAccess.status"
            :icon="getStatusIconClass(permissions.fileAccess.status)"
            :text="getStatusText(permissions.fileAccess.status)"
          />
          <TxButton
            v-if="permissions.fileAccess.status !== 'granted'"
            size="sm"
            type="primary"
            @click="requestFileAccessRoots"
          >
            {{ t('setupPermissions.requestFileAccess') }}
          </TxButton>
          <TxButton size="sm" :loading="isLoading" @click="checkAllPermissions">
            {{ t('setupPermissions.recheck') }}
          </TxButton>
        </div>
        <ul v-if="fileAccessRoots.length" class="FileAccessRootList">
          <li v-for="root in fileAccessRoots" :key="root.path" class="FileAccessRootItem">
            <span
              class="FileAccessRootStatus"
              :data-status="getFileAccessRootDisplayStatus(root)"
            />
            <span class="FileAccessRootMeta">
              <strong>{{ t(`setupPermissions.fileAccessRoots.${root.id}`) }}</strong>
              <small>{{ getFileAccessPurposeText(root.purpose) }} · {{ root.path }}</small>
            </span>
            <span class="FileAccessRootBadges">
              <TuffStatusBadge
                size="sm"
                :status-key="getFileAccessRootDisplayStatus(root)"
                :icon="getStatusIconClass(getFileAccessRootDisplayStatus(root))"
                :text="getStatusText(getFileAccessRootDisplayStatus(root))"
              />
              <span v-if="root.required" class="required-badge">
                {{ t('setupPermissions.required') }}
              </span>
            </span>
          </li>
        </ul>
        <p v-else class="FileAccessDialog-Empty">
          {{ t('setupPermissions.fileAccessNoRoots') }}
        </p>
      </div>
      <template #footer>
        <TxButton @click="fileAccessDialogVisible = false">
          {{ t('common.close') }}
        </TxButton>
      </template>
    </TModal>
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

    .SetupPermissions-PrivacyNote {
      margin-top: 0.45rem;
      color: var(--tx-text-color-secondary);
      font-size: 0.84rem;
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

.FileAccessDialog {
  display: grid;
  gap: 0.9rem;
}

.FileAccessDialog-Desc {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 0.86rem;
  line-height: 1.5;
}

.FileAccessDialog-Actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.FileAccessDialog-Empty {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 0.84rem;
}

.FileAccessRootList {
  display: grid;
  gap: 0.45rem;
  width: 100%;
  max-height: min(420px, 55vh);
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.FileAccessRootItem {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.55rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--tx-border-color);
  border-radius: 8px;
  background: color-mix(in srgb, var(--tx-background-color) 82%, transparent);
}

.FileAccessRootBadges {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.FileAccessRootStatus {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--tx-text-color-placeholder);

  &[data-status='granted'] {
    background: var(--tx-color-success);
  }

  &[data-status='denied'] {
    background: var(--tx-color-danger);
  }

  &[data-status='notDetermined'] {
    background: var(--tx-color-warning);
  }
}

.FileAccessRootMeta {
  min-width: 0;

  strong,
  small {
    display: block;
  }

  strong {
    color: var(--tx-text-color-primary);
    font-size: 0.84rem;
    line-height: 1.35;
  }

  small {
    color: var(--tx-text-color-secondary);
    font-size: 0.76rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
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
