<script name="AppEntrance" setup lang="ts">
import { isCoreBox, useTouchSDK } from '@talex-touch/utils/renderer'
import CoreBox from './views/box/CoreBox.vue'
import { touchChannel } from './modules/channel/channel-core'

const init = ref(false)
const props = defineProps<{
  onReady: () => Promise<void>
}>()

function entry(): void {
  const res: IStartupInfo = touchChannel.sendSync('app-ready')

  window.$startupInfo = res

  document.body.classList.add(window.$startupInfo.platform)

  useTouchSDK({ channel: touchChannel })

  props.onReady().then(() => {
    init.value = true
  })
}

setTimeout(entry, 100)
</script>

<template>
  <template v-if="isCoreBox()">
    <CoreBox />
  </template>
  <template v-else-if="init">
    <slot />
  </template>
</template>
