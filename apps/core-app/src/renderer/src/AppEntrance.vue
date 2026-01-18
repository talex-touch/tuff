<script name="AppEntrance" setup lang="ts">
import { isCoreBox, isDivisionBox, isMetaOverlay } from '@talex-touch/utils/renderer'
import { Toaster } from 'vue-sonner'
import { logAppEntranceMode } from './modules/devtools/app-entrance-log'
import { useAppLifecycle } from './modules/hooks/useAppLifecycle'
import { useAppState } from './modules/hooks/useAppStates'
import { useStartupInfo } from './modules/hooks/useStartupInfo'
import CoreBox from './views/box/CoreBox.vue'
import MetaOverlay from './views/meta/MetaOverlay.vue'

declare global {
  interface Window {
    $isMetaOverlay?: boolean
  }
}

const props = defineProps<{
  onReady: () => Promise<void>
}>()
const init = ref(false)
const { appStates } = useAppState()
const { entry } = useAppLifecycle()
const { startupInfo } = useStartupInfo()

const isMetaOverlayMode = computed(() => {
  return window.$isMetaOverlay === true || isMetaOverlay()
})

setTimeout(async () => {
  await entry(props.onReady)
  const mode = isCoreBox() ? (isDivisionBox() ? 'DivisionBox' : 'CoreBox') : 'MainApp'
  logAppEntranceMode(
    mode,
    {
      startupInfoId: startupInfo.value?.id,
      platform: startupInfo.value?.platform
    },
    { onceKey: `appentrance:${mode}` }
  )
  init.value = true
}, 100)
</script>

<template>
  <div class="AppEntrance absolute inset-0" :class="{ 'has-update': appStates.hasUpdate }">
    <Toaster position="bottom-left" theme="system" rich-colors />
    <!-- MetaOverlay: render directly like CoreBox, not via router-view -->
    <template v-if="isMetaOverlayMode">
      <MetaOverlay />
    </template>
    <!-- CoreBox: render directly -->
    <template v-else-if="isCoreBox()">
      <CoreBox />
    </template>
    <!-- Main Window: render slot (AppLayout from App.vue) -->
    <template v-else-if="init">
      <slot />
    </template>
  </div>
</template>
