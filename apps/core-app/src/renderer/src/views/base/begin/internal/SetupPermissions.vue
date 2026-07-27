<script setup lang="ts" name="SetupPermissions">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents, StorageEvents } from '@talex-touch/utils/transport/events'
import type { Component } from 'vue'
import { inject, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { appSetting } from '~/modules/storage/app-storage'
import { createRendererLogger } from '~/utils/renderer-log'
import Done from './Done.vue'

type StepFunction = (
  call: { comp: Component; rect?: { width: number; height: number } },
  dataAction?: () => void
) => void

const { t } = useI18n()
const step: StepFunction = inject('step')!
const transport = useTuffTransport()
const setupPermissionsLog = createRendererLogger('SetupPermissions')

const settings = ref({
  autoStart: false,
  showTray: true,
  hideDock: false
})
const traySettingsAvailable = ref(false)
const isContinuing = ref(false)

function createDefaultPermissionAudit() {
  return {
    at: 0,
    version: '',
    appUpdate: false,
    missing: [] as string[]
  }
}

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

onMounted(loadSettings)

async function loadSettings(): Promise<void> {
  if (appSetting.setup) {
    settings.value.autoStart = appSetting.setup.autoStart ?? false
    settings.value.showTray = appSetting.setup.showTray ?? true
    settings.value.hideDock = appSetting.setup.hideDock ?? false
  }

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

function advance(): void {
  if (isContinuing.value) return
  isContinuing.value = true

  try {
    step(
      {
        comp: Done
      },
      () => {
        // This screen no longer owns file access, so preserve its existing permission metadata.
        appSetting.setup = {
          ...appSetting.setup,
          autoStart: settings.value.autoStart,
          showTray: settings.value.showTray,
          hideDock: settings.value.hideDock ?? false,
          lastPermissionAudit:
            appSetting.setup.lastPermissionAudit ?? createDefaultPermissionAudit()
        }
      }
    )
  } finally {
    isContinuing.value = false
  }
}
</script>

<template>
  <div class="SetupPermissions">
    <div class="SetupPermissions-Body">
      <h1>{{ t('setupPermissions.title') }}</h1>

      <div class="StartupOptions">
        <label class="StartupOptions-Row">
          <i class="i-carbon-play" />
          <span>{{ t('setupPermissions.autoStart') }}</span>
          <TxSwitch v-model="settings.autoStart" @change="updateAutoStart" />
        </label>
        <label v-if="traySettingsAvailable" class="StartupOptions-Row">
          <i class="i-carbon-portfolio" />
          <span>{{ t('setupPermissions.showTray') }}</span>
          <TxSwitch v-model="settings.showTray" @change="updateShowTray" />
        </label>
      </div>

      <p class="SetupPermissions-Footnote">
        {{ t('setupPermissions.jitNotice') }}
      </p>
    </div>

    <div class="SetupPermissions-Actions">
      <TxButton type="primary" :loading="isContinuing" @click="advance">
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
  gap: 0;
  overflow: hidden;

  h1 {
    margin: 0;
    font-size: 1.7rem;
    font-weight: 700;
    color: var(--tx-text-color-primary);
  }

  &-Body {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 1.25rem;
    padding: 0.5rem 0 1.5rem;
    overflow: auto;
  }

  &-Footnote {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.55;
    color: var(--tx-text-color-secondary);
  }

  &-Actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--tx-border-color-lighter);
    flex-shrink: 0;
  }
}

.StartupOptions {
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 12px;
  background-color: var(--tx-fill-color-lighter);
  overflow: hidden;

  &-Row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    cursor: pointer;

    & + & {
      border-top: 1px solid var(--tx-border-color-lighter);
    }

    i {
      flex-shrink: 0;
      font-size: 18px;
      color: var(--tx-text-color-secondary);
    }

    span {
      flex: 1;
      min-width: 0;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--tx-text-color-primary);
    }
  }
}
</style>
