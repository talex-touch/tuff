<script name="AppEntrance" setup lang="ts">
import { useArgMapper } from '@talex-touch/utils/renderer'
import { configureZIndex } from '@talex-touch/tuffex/utils'
import { Toaster } from 'vue-sonner'
import type { AppEntranceMode } from './modules/devtools/app-entrance-log'
import { logAppEntranceMode } from './modules/devtools/app-entrance-log'
import { useAppLifecycle } from './modules/hooks/useAppLifecycle'
import { useAppState } from './modules/hooks/useAppStates'
import { useStartupInfo } from './modules/hooks/useStartupInfo'
import { resolvedTheme } from './modules/storage/theme-style'
import CoreBox from './views/box/CoreBox.vue'
import MetaOverlay from './views/meta/MetaOverlay.vue'
import OmniPanel from './views/omni-panel/OmniPanel.vue'
import { createRendererLogger } from './utils/renderer-log'

const FloatingBall = defineAsyncComponent(() => import('./views/assistant/FloatingBall.vue'))
const WhatsChangedDialog = defineAsyncComponent(
  () => import('./components/update/WhatsChangedDialog.vue')
)
const VoicePanel = defineAsyncComponent(() => import('./views/assistant/VoicePanel.vue'))
const ScreenshotOverlay = defineAsyncComponent(
  () => import('./views/screenshot/ScreenshotOverlay.vue')
)
const ScreenshotEditorShell = defineAsyncComponent(
  () => import('./views/screenshot/ScreenshotEditorShell.vue')
)

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

configureZIndex({ seed: 10000 })

onMounted(() => {
  void initializeEntrance()
})

watchEffect(() => {
  const mode = appEntranceMode.value
  document.body.classList.toggle('core-box', mode === 'CoreBox' || mode === 'DivisionBox')
  document.body.classList.toggle('division-box', mode === 'DivisionBox')
  document.body.classList.toggle(
    'screenshot-surface',
    mode === 'ScreenshotOverlay' || mode === 'ScreenshotEditor'
  )
})
</script>

<template>
  <div class="AppEntrance absolute inset-0" :class="{ 'has-update': showUpdateIndicator }">
    <Toaster
      v-if="
        appEntranceMode !== 'CoreBox' &&
        appEntranceMode !== 'DivisionBox' &&
        appEntranceMode !== 'ScreenshotOverlay'
      "
      position="bottom-left"
      :theme="resolvedTheme"
      rich-colors
    />
    <WhatsChangedDialog v-if="appEntranceMode === 'MainApp'" />
    <template v-if="appEntranceMode === 'MetaOverlay'">
      <MetaOverlay />
    </template>
    <template v-else-if="appEntranceMode === 'AssistantFloatingBall'">
      <FloatingBall />
    </template>
    <template v-else-if="appEntranceMode === 'AssistantVoicePanel'">
      <VoicePanel />
    </template>
    <template v-else-if="appEntranceMode === 'ScreenshotOverlay'">
      <ScreenshotOverlay />
    </template>
    <template v-else-if="appEntranceMode === 'ScreenshotEditor'">
      <ScreenshotEditorShell />
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
