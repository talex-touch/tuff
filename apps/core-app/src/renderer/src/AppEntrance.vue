<script name="AppEntrance" setup lang="ts">
import { isCoreBox } from '@talex-touch/utils/renderer'
import CoreBox from './views/box/CoreBox.vue'
import { useAppState } from './modules/hooks/useAppStates'
import { useAppLifecycle } from './modules/hooks/useAppLifecycle'
import { Toaster } from 'vue-sonner'

const init = ref(false)
const props = defineProps<{
  onReady: () => Promise<void>
}>()
const { appStates } = useAppState()
const { entry } = useAppLifecycle()

setTimeout(async () => {
  await entry(props.onReady)
  init.value = true
}, 100)
</script>

<template>
  <div class="AppEntrance absolute inset-0" :class="{ 'has-update': appStates.hasUpdate }">
    <Toaster position="bottom-left" theme="system" rich-colors />
    <template v-if="isCoreBox()">
      <CoreBox />
    </template>
    <template v-else-if="init">
      <slot />
    </template>
  </div>
</template>
