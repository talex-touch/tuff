<script name="AppEntrance" setup lang="ts">
import { useArgMapper } from '@talex-touch/utils/renderer'
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
import { createRendererLogger } from './utils/renderer-log'

const props = defineProps<{
  onReady: () => Promise<void>
}>()
const init = ref(false)
const { appStates } = useAppState()
const { entry } = useAppLifecycle()
const { startupContext, startupInfo } = useStartupInfo()
const argMapper = useArgMapper()
const entranceLog = createRendererLogger('AppEntrance')

const appEntranceMode = computed<AppEntranceMode>(() => {
  return startupContext.value?.windowMode ?? 'MainApp'
})
const showUpdateIndicator = computed(() => {
  return startupContext.value?.windowMode === 'MainApp' && appStates.hasUpdate
})

async function initializeEntrance(): Promise<void> {
  await entry(props.onReady)
  const mode = appEntranceMode.value
  if (mode === 'CoreBox' && argMapper.rawCoreType && import.meta.env.DEV) {
    entranceLog.warn('Unknown coreType, fallback to CoreBox', {
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
}

onMounted(() => {
  void initializeEntrance()
})

watchEffect(() => {
  const mode = appEntranceMode.value
  document.body.classList.toggle('core-box', mode === 'CoreBox' || mode === 'DivisionBox')
  document.body.classList.toggle('division-box', mode === 'DivisionBox')
})
</script>

<template>
  <div class="AppEntrance absolute inset-0" :class="{ 'has-update': showUpdateIndicator }">
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
