<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { buildNoiseWatermarkDataUrl } from '~/utils/watermark'
import { WATERMARK_BANDS, deriveWatermarkSeeds } from '~/utils/watermark-config'
import { useWatermarkGuard } from '~/composables/useWatermarkGuard'
import { useWatermarkFingerprint } from '~/composables/useWatermarkFingerprint'
import { useWatermarkToken } from '~/composables/useWatermarkToken'

const { tokenSeed } = useWatermarkToken()
useWatermarkFingerprint()

const hostRef = ref<HTMLDivElement | null>(null)
const layerRefs = ref<HTMLDivElement[]>([])
const defaultLayerStyle = { opacity: 1, blur: 0 }

const LAYER_STYLES = [
  { opacity: 1, blur: 0 },
  { opacity: 0.7, blur: 0 },
  { opacity: 0.5, blur: 0 },
]

function createHost() {
  if (!import.meta.client)
    return
  const host = document.createElement('div')
  const randomKey = Math.random().toString(36).slice(2, 10)
  host.setAttribute('data-layer', randomKey)
  host.style.cssText = [
    'position:fixed',
    'inset:0',
    'pointer-events:none',
    'z-index:999999',
    'opacity:0.06',
  ].join(';')

  const shadow = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = `
    .wm-layer {
      position: absolute;
      inset: 0;
      background-repeat: repeat;
      mix-blend-mode: normal;
    }
  `
  const fragment = document.createDocumentFragment()
  layerRefs.value = []
  WATERMARK_BANDS.forEach((band, index) => {
    const layer = document.createElement('div')
    const layerStyle = LAYER_STYLES[index] ?? defaultLayerStyle
    layer.className = 'wm-layer'
    layer.style.backgroundSize = `${band.tile}px ${band.tile}px`
    layer.style.backgroundPosition = '0 0'
    layer.style.opacity = String(layerStyle.opacity)
    layer.style.filter = layerStyle.blur ? `blur(${layerStyle.blur}px)` : 'none'
    fragment.appendChild(layer)
    layerRefs.value.push(layer)
  })
  shadow.append(style, fragment)
  document.body.appendChild(host)
  hostRef.value = host
}

function destroyHost() {
  if (hostRef.value && hostRef.value.isConnected)
    hostRef.value.remove()
  hostRef.value = null
  layerRefs.value = []
}

function rebuildNoise(seed: number) {
  if (!seed || !layerRefs.value.length)
    return
  const seeds = deriveWatermarkSeeds(seed, WATERMARK_BANDS.length)
  WATERMARK_BANDS.forEach((band, index) => {
    const layer = layerRefs.value[index]
    const layerSeed = seeds[index]
    if (!layer)
      return
    if (typeof layerSeed !== 'number')
      return
    const url = buildNoiseWatermarkDataUrl({
      seed: layerSeed,
      size: band.size,
      cell: band.cell,
      amplitude: band.amplitude,
      base: band.base,
    })
    layer.style.backgroundImage = url ? `url(${url})` : 'none'
  })
}

watch(tokenSeed, (value) => {
  if (!value)
    return
  rebuildNoise(value)
}, { immediate: true })

onMounted(() => {
  createHost()
  if (tokenSeed.value)
    rebuildNoise(tokenSeed.value)
})

onUnmounted(() => {
  destroyHost()
})

useWatermarkGuard({
  target: () => hostRef.value,
  minOpacity: 0.015,
  source: 'invisible',
})
</script>

<template>
  <div class="wm-placeholder" aria-hidden="true" />
</template>

<style scoped>
.wm-placeholder {
  display: none;
}
</style>
