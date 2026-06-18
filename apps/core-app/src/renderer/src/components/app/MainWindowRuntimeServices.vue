<script setup lang="ts">
import { appSettings } from '@talex-touch/utils/renderer/storage'
import { usePermissionStartup } from '~/composables/usePermissionStartup'
import { useStartupPermissionAudit } from '~/composables/useStartupPermissionAudit'
import { appSetting } from '~/modules/storage/app-storage'
import { useDropperResolver } from '~/modules/hooks/dropper-resolver'
import { useGlobalBatteryOptimizer } from '~/modules/hooks/useBatteryOptimizer'
import { setupLanguageSync, useLanguage } from '~/modules/lang'
import { captureAppContext } from '~/modules/mention/dialog-mention'
import { createRendererLogger } from '~/utils/renderer-log'

const emit = defineEmits<{
  beginnerRequired: []
  ready: []
}>()

const { initializeLanguage } = useLanguage()
const runtimeLog = createRendererLogger('MainWindowRuntime')
const { runAudit: runStartupPermissionAudit } = useStartupPermissionAudit()

captureAppContext()
usePermissionStartup()
useGlobalBatteryOptimizer()

async function init(): Promise<void> {
  try {
    await initializeLanguage()
    setupLanguageSync()
  } catch (error) {
    runtimeLog.error('Failed to initialize language', error)
  }

  useDropperResolver()

  await appSettings.whenHydrated()
  void runStartupPermissionAudit()
  if (!appSetting?.beginner?.init) {
    emit('beginnerRequired')
  }
}

onMounted(() => {
  void init().finally(() => {
    emit('ready')
  })
})
</script>

<template>
  <slot />
</template>
