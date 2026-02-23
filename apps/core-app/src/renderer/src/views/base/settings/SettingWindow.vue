<!--
  SettingWindow Component

  Window behavior settings page
  Allows users to configure window closing, minimizing, and auto-start behavior
-->
<script setup lang="ts" name="SettingWindow">
import { useTuffTransport } from '@talex-touch/utils/transport'
import { TrayEvents } from '@talex-touch/utils/transport/events'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
// Import UI components
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { appSetting } from '~/modules/channel/storage'
import { devLog } from '~/utils/dev-log'

// Import storage
const { t } = useI18n()
const transport = useTuffTransport()

const windowSettings = ref({
  closeToTray: true,
  startMinimized: false,
  startSilent: false,
  autoStart: false
})

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

onMounted(async () => {
  try {
    ensureWindowSettings()
    const autoStartStatus = await transport.send(TrayEvents.autostart.get)
    const autoStart =
      autoStartStatus !== null ? Boolean(autoStartStatus) : !!appSetting.setup?.autoStart

    windowSettings.value = {
      closeToTray: !!appSetting.window.closeToTray,
      startMinimized: !!appSetting.window.startMinimized,
      startSilent: !!appSetting.window.startSilent,
      autoStart
    }
    if (appSetting.setup) {
      appSetting.setup.autoStart = autoStart
    }

    devLog('[SettingWindow] Window settings loaded:', windowSettings.value)
  } catch (error) {
    console.error('[SettingWindow] Failed to load window settings:', error)
  }
})

async function updateCloseToTray(value: boolean) {
  try {
    ensureWindowSettings()
    appSetting.window.closeToTray = value
    windowSettings.value.closeToTray = value
    devLog('[SettingWindow] Close to tray setting updated:', value)
  } catch (error) {
    console.error('[SettingWindow] Failed to update close to tray setting:', error)
  }
}

async function updateStartMinimized(value: boolean) {
  try {
    ensureWindowSettings()
    appSetting.window.startMinimized = value
    windowSettings.value.startMinimized = value
    devLog('[SettingWindow] Start minimized setting updated:', value)
  } catch (error) {
    console.error('[SettingWindow] Failed to update start minimized setting:', error)
  }
}

async function updateStartSilent(value: boolean) {
  try {
    ensureWindowSettings()
    appSetting.window.startSilent = value
    windowSettings.value.startSilent = value
    devLog('[SettingWindow] Start silent setting updated:', value)
  } catch (error) {
    console.error('[SettingWindow] Failed to update start silent setting:', error)
  }
}

async function updateAutoStart(value: boolean) {
  try {
    if (appSetting.setup) {
      appSetting.setup.autoStart = value
    }
    await transport.send(TrayEvents.autostart.update, value)
    windowSettings.value.autoStart = value
    devLog('[SettingWindow] Auto start setting updated:', value)
  } catch (error) {
    console.error('[SettingWindow] Failed to update auto start setting:', error)
  }
}
</script>

<template>
  <TuffGroupBlock
    :name="t('settings.window.groupTitle')"
    :description="t('settings.window.groupDesc')"
    default-icon="i-carbon-laptop"
    active-icon="i-carbon-laptop"
    memory-name="setting-window"
  >
    <!-- Close window to tray switch -->
    <TuffBlockSwitch
      v-model="windowSettings.closeToTray"
      :title="t('settings.window.closeToTray')"
      :description="t('settings.window.closeToTrayDesc')"
      default-icon="i-carbon-minimize"
      active-icon="i-carbon-minimize"
      @update:model-value="updateCloseToTray"
    />

    <!-- Start minimized switch -->
    <TuffBlockSwitch
      v-model="windowSettings.startMinimized"
      :title="t('settings.window.startMinimized')"
      :description="t('settings.window.startMinimizedDesc')"
      default-icon="i-carbon-view-off"
      active-icon="i-carbon-view-off"
      @update:model-value="updateStartMinimized"
    />

    <!-- Start silent switch -->
    <TuffBlockSwitch
      v-model="windowSettings.startSilent"
      :title="t('settings.window.startSilent')"
      :description="t('settings.window.startSilentDesc')"
      default-icon="i-carbon-notification-off"
      active-icon="i-carbon-notification-off"
      @update:model-value="updateStartSilent"
    />

    <!-- Auto start switch -->
    <TuffBlockSwitch
      v-model="windowSettings.autoStart"
      :title="t('settings.window.autoStart')"
      :description="t('settings.window.autoStartDesc')"
      default-icon="i-carbon-play"
      active-icon="i-carbon-play-filled"
      @update:model-value="updateAutoStart"
    />
  </TuffGroupBlock>
</template>

<style scoped>
/* Component specific styles can be added here */
</style>
