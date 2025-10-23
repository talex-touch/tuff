<script name="AppEntrance" setup lang="ts">
import { initStorageChannel, isCoreBox, useTouchSDK } from '@talex-touch/utils/renderer'
import CoreBox from './views/box/CoreBox.vue'
import { touchChannel } from './modules/channel/channel-core'
import {
  preloadDebugStep,
  preloadLog,
  preloadRemoveOverlay,
  preloadState
} from '@talex-touch/utils/preload'
import { useAppState } from './modules/hooks/useAppStates'
import { useApplicationUpgrade } from './modules/hooks/useApplicationUpgrade'
import { Toaster } from 'vue-sonner'

const init = ref(false)
const props = defineProps<{
  onReady: () => Promise<void>
}>()
const { appStates } = useAppState()
const { checkApplicationUpgrade } = useApplicationUpgrade()

async function entry(): Promise<void> {
  try {
    preloadDebugStep('Requesting startup handshake...', 0.05)
    const res: IStartupInfo = touchChannel.sendSync('app-ready')
    preloadDebugStep('Startup handshake acknowledged', 0.05)

    window.$startupInfo = res

    preloadDebugStep('Initializing Touch SDK and storage channels', 0.05)
    useTouchSDK({ channel: touchChannel })
    initStorageChannel(touchChannel)

    preloadDebugStep('Running renderer warmup tasks', 0.05)
    await props.onReady()

    preloadDebugStep('Renderer warmup completed', 0.06)
    preloadState('finish')
    preloadLog('Tuff is ready.')
    preloadRemoveOverlay()

    checkApplicationUpgrade()

    init.value = true
  } catch (error) {
    console.error('[AppEntrance] Initialization failed', error)
    preloadLog('Renderer initialization failed. Check console output.')
  }
}

setTimeout(() => {
  void entry()
}, 100)
</script>

<template>
  <div class="AppEntrance absolute inset-0" :class="{ 'has-update': appStates.hasUpdate }">
    <Toaster theme="system" rich-colors />
    <template v-if="isCoreBox()">
      <CoreBox />
    </template>
    <template v-else-if="init">
      <slot />
    </template>
  </div>
</template>
