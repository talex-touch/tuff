<!--
  SettingWindow Component

  Displays window behavior settings in the settings page.
  Allows users to configure window closing and minimizing behavior.
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

// Local reactive state for settings
const windowSettings = ref({
  closeToTray: true,
  startMinimized: false
})

// Load settings on mount
onMounted(async () => {
  try {
    // Load settings from storage
    const closeToTrayResult = touchChannel.sendSync('storage:get', 'app.window.closeToTray')
    const startMinimizedResult = touchChannel.sendSync('storage:get', 'app.window.startMinimized')
    
    const closeToTray = closeToTrayResult !== null && closeToTrayResult !== undefined ? closeToTrayResult : true
    const startMinimized = startMinimizedResult !== null && startMinimizedResult !== undefined ? startMinimizedResult : false

    windowSettings.value = {
      closeToTray: closeToTray as boolean,
      startMinimized: startMinimized as boolean
    }

    console.log('[SettingWindow] Window settings loaded:', windowSettings.value)
  } catch (error) {
    console.error('[SettingWindow] Failed to load window settings:', error)
  }
})

// Update close to tray setting
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

// Update start minimized setting
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
  </t-group-block>
</template>

<style scoped>
/* Component specific styles can be added here */
</style>
