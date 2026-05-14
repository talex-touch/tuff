<script setup lang="ts">
import { appSettings } from '@talex-touch/utils/renderer/storage'
import { usePermissionStartup } from '~/composables/usePermissionStartup'
import { appSetting } from '~/modules/storage/app-storage'
import { useDropperResolver } from '~/modules/hooks/dropper-resolver'
import { useGlobalBatteryOptimizer } from '~/modules/hooks/useBatteryOptimizer'
import { useLanguage } from '~/modules/lang'
import { captureAppContext } from '~/modules/mention/dialog-mention'
import { createRendererLogger } from '~/utils/renderer-log'

const emit = defineEmits<{
  beginnerRequired: []
  ready: []
}>()

const { initializeLanguage } = useLanguage()
const runtimeLog = createRendererLogger('MainWindowRuntime')

captureAppContext()
usePermissionStartup()
useGlobalBatteryOptimizer()

async function init(): Promise<void> {
  try {
    await initializeLanguage()
  } catch (error) {
    runtimeLog.error('Failed to initialize language', error)
  }

  useDropperResolver()

  await appSettings.whenHydrated()
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
