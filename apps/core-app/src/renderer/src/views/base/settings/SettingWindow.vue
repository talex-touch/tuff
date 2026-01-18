<!--
  SettingWindow Component

  Window behavior settings page
  Allows users to configure window closing, minimizing, and auto-start behavior
-->
<script setup lang="ts" name="SettingWindow">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { StorageEvents, TrayEvents } from '@talex-touch/utils/transport/events'

import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
// Import UI components
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

// Import storage
const { t } = useI18n()
const transport = useTuffTransport()

const windowSettings = ref({
  closeToTray: true,
  startMinimized: false,
  startSilent: false,
  autoStart: false
})

onMounted(async () => {
  try {
    const [
      closeToTrayResult,
      startMinimizedResult,
      startSilentResult,
      autoStartResult,
      autoStartStatus
    ] = await Promise.all([
      transport.send(StorageEvents.app.get, { key: 'app.window.closeToTray' }),
      transport.send(StorageEvents.app.get, { key: 'app.window.startMinimized' }),
      transport.send(StorageEvents.app.get, { key: 'app.window.startSilent' }),
      transport.send(StorageEvents.app.get, { key: 'app.autoStart' }),
      transport.send(TrayEvents.autostart.get)
    ])

    const closeToTray =
      closeToTrayResult !== null && closeToTrayResult !== undefined ? closeToTrayResult : true
    const startMinimized =
      startMinimizedResult !== null && startMinimizedResult !== undefined
        ? startMinimizedResult
        : false
    const startSilent =
      startSilentResult !== null && startSilentResult !== undefined ? startSilentResult : false
    const autoStart =
      autoStartStatus !== null
        ? autoStartStatus
        : autoStartResult !== null && autoStartResult !== undefined
          ? autoStartResult
          : false

    windowSettings.value = {
      closeToTray: closeToTray as boolean,
      startMinimized: startMinimized as boolean,
      startSilent: startSilent as boolean,
      autoStart: autoStart as boolean
    }

    console.log('[SettingWindow] Window settings loaded:', windowSettings.value)
  } catch (error) {
    console.error('[SettingWindow] Failed to load window settings:', error)
  }
})

async function updateCloseToTray(value: boolean) {
  try {
    await transport.send(StorageEvents.app.save, {
      key: 'app.window.closeToTray',
      content: JSON.stringify(value),
      clear: false
    })
    windowSettings.value.closeToTray = value
    console.log('[SettingWindow] Close to tray setting updated:', value)
  } catch (error) {
    console.error('[SettingWindow] Failed to update close to tray setting:', error)
  }
}

async function updateStartMinimized(value: boolean) {
  try {
    await transport.send(StorageEvents.app.save, {
      key: 'app.window.startMinimized',
      content: JSON.stringify(value),
      clear: false
    })
    windowSettings.value.startMinimized = value
    console.log('[SettingWindow] Start minimized setting updated:', value)
  } catch (error) {
    console.error('[SettingWindow] Failed to update start minimized setting:', error)
  }
}

async function updateStartSilent(value: boolean) {
  try {
    await transport.send(StorageEvents.app.save, {
      key: 'app.window.startSilent',
      content: JSON.stringify(value),
      clear: false
    })
    windowSettings.value.startSilent = value
    console.log('[SettingWindow] Start silent setting updated:', value)
  } catch (error) {
    console.error('[SettingWindow] Failed to update start silent setting:', error)
  }
}

async function updateAutoStart(value: boolean) {
  try {
    await transport.send(StorageEvents.app.save, {
      key: 'app.autoStart',
      content: JSON.stringify(value),
      clear: false
    })
    await transport.send(TrayEvents.autostart.update, value)
    windowSettings.value.autoStart = value
    console.log('[SettingWindow] Auto start setting updated:', value)
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
