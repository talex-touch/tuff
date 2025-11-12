<!--
  SettingWindow Component

  Window behavior settings page
  Allows users to configure window closing, minimizing, and auto-start behavior
-->
<script setup lang="ts" name="SettingWindow">
import { useI18n } from 'vue-i18n'
import { ref, onMounted } from 'vue'

// Import UI components
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'

// Import storage
import { touchChannel } from '~/modules/channel/channel-core'

const { t } = useI18n()

const windowSettings = ref({
  closeToTray: true,
  startMinimized: false,
  startSilent: false,
  autoStart: false
})

onMounted(async () => {
  try {
    const closeToTrayResult = touchChannel.sendSync('storage:get', 'app.window.closeToTray')
    const startMinimizedResult = touchChannel.sendSync('storage:get', 'app.window.startMinimized')
    const startSilentResult = touchChannel.sendSync('storage:get', 'app.window.startSilent')
    const autoStartResult = touchChannel.sendSync('storage:get', 'app.autoStart')

    const autoStartStatus = touchChannel.sendSync('tray:autostart:get') as boolean | null

    const closeToTray = closeToTrayResult !== null && closeToTrayResult !== undefined ? closeToTrayResult : true
    const startMinimized = startMinimizedResult !== null && startMinimizedResult !== undefined ? startMinimizedResult : false
    const startSilent = startSilentResult !== null && startSilentResult !== undefined ? startSilentResult : false
    const autoStart = autoStartStatus !== null ? autoStartStatus : (autoStartResult !== null && autoStartResult !== undefined ? autoStartResult : false)

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
    await touchChannel.send('storage:save', {
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
    await touchChannel.send('storage:save', {
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
    await touchChannel.send('storage:save', {
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
    await touchChannel.send('storage:save', {
      key: 'app.autoStart',
      content: JSON.stringify(value),
      clear: false
    })
    await touchChannel.send('tray:autostart:update', value)
    windowSettings.value.autoStart = value
    console.log('[SettingWindow] Auto start setting updated:', value)
  } catch (error) {
    console.error('[SettingWindow] Failed to update auto start setting:', error)
  }
}
</script>

<template>
  <tuff-group-block
    :name="t('settings.window.groupTitle')"
    :description="t('settings.window.groupDesc')"
    default-icon="i-carbon-laptop"
    active-icon="i-carbon-laptop"
    memory-name="setting-window"
  >
    <!-- Close window to tray switch -->
    <tuff-block-switch
      v-model="windowSettings.closeToTray"
      :title="t('settings.window.closeToTray')"
      :description="t('settings.window.closeToTrayDesc')"
      default-icon="i-carbon-minimize"
      active-icon="i-carbon-minimize"
      @update:model-value="updateCloseToTray"
    />

    <!-- Start minimized switch -->
    <tuff-block-switch
      v-model="windowSettings.startMinimized"
      :title="t('settings.window.startMinimized')"
      :description="t('settings.window.startMinimizedDesc')"
      default-icon="i-carbon-view-off"
      active-icon="i-carbon-view-off"
      @update:model-value="updateStartMinimized"
    />

    <!-- Start silent switch -->
    <tuff-block-switch
      v-model="windowSettings.startSilent"
      :title="t('settings.window.startSilent')"
      :description="t('settings.window.startSilentDesc')"
      default-icon="i-carbon-notification-off"
      active-icon="i-carbon-notification-off"
      @update:model-value="updateStartSilent"
    />

    <!-- Auto start switch -->
    <tuff-block-switch
      v-model="windowSettings.autoStart"
      :title="t('settings.window.autoStart')"
      :description="t('settings.window.autoStartDesc')"
      default-icon="i-carbon-play"
      active-icon="i-carbon-play-filled"
      @update:model-value="updateAutoStart"
    />
  </tuff-group-block>
</template>

<style scoped>
/* Component specific styles can be added here */
</style>
