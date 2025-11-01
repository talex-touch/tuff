<!--
  SettingWindow Component

  Window behavior settings page
  Allows users to configure window closing, minimizing, and auto-start behavior
-->
<script setup lang="ts" name="SettingWindow">
import { useI18n } from 'vue-i18n'
import { ref, onMounted } from 'vue'

// Import UI components
import TGroupBlock from '@comp/base/group/TGroupBlock.vue'
import TBlockSwitch from '~/components/base/switch/TBlockSwitch.vue'

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
  <t-group-block
    :name="t('settings.window.groupTitle')"
    icon="window"
    :description="t('settings.window.groupDesc')"
  >
    <!-- Close window to tray switch -->
    <t-block-switch
      v-model="windowSettings.closeToTray"
      :title="t('settings.window.closeToTray')"
      icon="minimize"
      :description="t('settings.window.closeToTrayDesc')"
      @update:model-value="updateCloseToTray"
    />

    <!-- Start minimized switch -->
    <t-block-switch
      v-model="windowSettings.startMinimized"
      :title="t('settings.window.startMinimized')"
      icon="eye-off"
      :description="t('settings.window.startMinimizedDesc')"
      @update:model-value="updateStartMinimized"
    />

    <!-- Start silent switch -->
    <t-block-switch
      v-model="windowSettings.startSilent"
      :title="t('settings.window.startSilent')"
      icon="bell-off"
      :description="t('settings.window.startSilentDesc')"
      @update:model-value="updateStartSilent"
    />

    <!-- Auto start switch -->
    <t-block-switch
      v-model="windowSettings.autoStart"
      :title="t('settings.window.autoStart')"
      icon="play-circle"
      :description="t('settings.window.autoStartDesc')"
      @update:model-value="updateAutoStart"
    />
  </t-group-block>
</template>

<style scoped>
/* Component specific styles can be added here */
</style>
