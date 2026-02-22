<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { useWatermarkGuard } from '~/composables/useWatermarkGuard'
import { useWatermarkTrackingCode } from '~/composables/useWatermarkTrackingCode'

const colorMode = useColorMode()
const { code: trackingCode } = useWatermarkTrackingCode()

const overlayRef = ref<HTMLDivElement | null>(null)
const backgroundUrl = ref('')
const tileSize = ref({ width: 0, height: 0 })

const isDark = computed(() => colorMode.value === 'dark')

async function rebuildQr(code: string) {
  if (!import.meta.client)
    return
  if (!code)
    return
  const size = 200
  tileSize.value = {
    width: size,
    height: size,
  }
  const dark = isDark.value ? 'rgba(255, 255, 255, 0.9)' : 'rgba(15, 23, 42, 0.9)'
  backgroundUrl.value = await QRCode.toDataURL(code, {
    width: size,
    margin: 0,
    color: {
      dark,
      light: '#0000',
    },
  })
}

watch(trackingCode, (value) => {
  if (!value)
    return
  void rebuildQr(value)
}, { immediate: true })

watch(isDark, () => {
  if (trackingCode.value)
    void rebuildQr(trackingCode.value)
})

onMounted(() => {
  if (trackingCode.value)
    void rebuildQr(trackingCode.value)
})

useWatermarkGuard({
  target: () => overlayRef.value,
  minOpacity: 0.08,
  source: 'visible',
})
</script>

<template>
  <div
    ref="overlayRef"
    class="wm-visible"
    :style="{
      backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : 'none',
      backgroundSize: tileSize.width ? `${tileSize.width}px ${tileSize.height}px` : undefined,
    }"
    aria-hidden="true"
  />
</template>

<style scoped>
.wm-visible {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.32;
  z-index: 11;
  background-repeat: repeat;
  background-size: 200px 200px;
  mix-blend-mode: normal;
}
</style>
