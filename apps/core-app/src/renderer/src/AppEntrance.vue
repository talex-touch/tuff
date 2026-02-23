<script name="AppEntrance" setup lang="ts">
import { resolveRendererWindowMode, useArgMapper, useWindowRole } from '@talex-touch/utils/renderer'
import { Toaster } from 'vue-sonner'
import type { AppEntranceMode } from './modules/devtools/app-entrance-log'
import { logAppEntranceMode } from './modules/devtools/app-entrance-log'
import { useAppLifecycle } from './modules/hooks/useAppLifecycle'
import { useAppState } from './modules/hooks/useAppStates'
import { useStartupInfo } from './modules/hooks/useStartupInfo'
import FloatingBall from './views/assistant/FloatingBall.vue'
import VoicePanel from './views/assistant/VoicePanel.vue'
import CoreBox from './views/box/CoreBox.vue'
import MetaOverlay from './views/meta/MetaOverlay.vue'
import OmniPanel from './views/omni-panel/OmniPanel.vue'

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
const argMapper = useArgMapper()
const role = useWindowRole()

const appEntranceMode = computed<AppEntranceMode>(() => {
  return resolveRendererWindowMode({
    ...role,
    metaOverlay: window.$isMetaOverlay === true || role.metaOverlay === true
  })
})

setTimeout(async () => {
  await entry(props.onReady)
  const mode = appEntranceMode.value
  if (mode === 'CoreBox' && argMapper.rawCoreType && import.meta.env.DEV) {
    console.warn('[AppEntrance] Unknown coreType, fallback to CoreBox', {
      rawCoreType: argMapper.rawCoreType
    })
  }

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
    <template v-if="appEntranceMode === 'MetaOverlay'">
      <MetaOverlay />
    </template>
    <template v-else-if="appEntranceMode === 'AssistantFloatingBall'">
      <FloatingBall />
    </template>
    <template v-else-if="appEntranceMode === 'AssistantVoicePanel'">
      <VoicePanel />
    </template>
    <template v-else-if="appEntranceMode === 'OmniPanel'">
      <OmniPanel />
    </template>
    <template v-else-if="appEntranceMode === 'CoreBox' || appEntranceMode === 'DivisionBox'">
      <CoreBox />
    </template>
    <template v-else-if="init">
      <slot />
    </template>
  </div>
</template>
