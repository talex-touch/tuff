<!-- Vue port of DistortionWave (https://github.com/Jakubantalik/Libraries.dev — MIT © 2026 Jakub Antalik). -->
<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { PlayOptions, WaveOptions } from './controller'
import type { DistortionWaveHandle, DistortionWaveProps } from './types'
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, useSlots, watch } from 'vue'
import { WaveController } from './controller'

defineOptions({ name: 'TxDistortionWave' })

const props = withDefaults(defineProps<DistortionWaveProps>(), {
  revealed: undefined,
  type: 'vertical',
  source: undefined,
  focus: undefined,
  waveStyle: undefined,
  palette: undefined,
  scale: 'auto',
  cornerRadius: undefined,
  scrub: undefined,
  capture: true,
  live: true,
  prewarm: true,
  resolution: undefined,
  reducedMotion: 'system',
  onFinish: undefined,
})

const emit = defineEmits<{
  finish: [revealed: boolean]
}>()

const slots = useSlots()
const rootRef = ref<HTMLDivElement | null>(null)
const firstRef = ref<HTMLDivElement | null>(null)
const secondRef = ref<HTMLDivElement | null>(null)
const controllerRef = shallowRef<WaveController | null>(null)

// Remember initial revealed state for SSR and pre-mount styling; afterwards WaveController owns layer styles.
const startRevealed = !!props.revealed
const hasRevealedSlot = computed(() => Boolean(slots.revealed))
const hasOverlaySlot = computed(() => Boolean(slots.overlay))

const LAYER_BASE: CSSProperties = {
  gridArea: '1 / 1',
  minWidth: '0',
  minHeight: '0',
  isolation: 'isolate',
}
const LAYER_HIDDEN: CSSProperties = {
  ...LAYER_BASE,
  opacity: '0',
  pointerEvents: 'none',
}

const initialFirstStyle: CSSProperties = hasRevealedSlot.value && startRevealed ? LAYER_HIDDEN : LAYER_BASE
const initialSecondStyle: CSSProperties = startRevealed ? LAYER_BASE : LAYER_HIDDEN

function handleFinish(revealed: boolean): void {
  // Vue dispatches `emit('finish', ...)` to both `@finish` listeners and `:on-finish` props once.
  emit('finish', revealed)
}

function buildOptions(): WaveOptions {
  return {
    revealed: props.revealed,
    type: props.type,
    source: props.source,
    focus: props.focus,
    waveStyle: props.waveStyle,
    palette: props.palette,
    scale: props.scale,
    cornerRadius: props.cornerRadius,
    scrub: props.scrub,
    capture: props.capture,
    live: props.live,
    prewarm: props.prewarm,
    resolution: props.resolution,
    reducedMotion: props.reducedMotion,
    onFinish: handleFinish,
  }
}

function syncController(): void {
  const c = controllerRef.value
  if (!c) return
  c.setRevealedLayer(secondRef.value)
  c.update(buildOptions())
}

function mountController(): void {
  if (controllerRef.value || !rootRef.value || !firstRef.value) return
  const made = new WaveController(rootRef.value, firstRef.value, secondRef.value)
  controllerRef.value = made
  made.update(buildOptions())
}

function destroyController(): void {
  controllerRef.value?.destroy()
  controllerRef.value = null
}

onMounted(mountController)
onActivated(mountController)
onDeactivated(destroyController)
onBeforeUnmount(destroyController)

watch(
  () => [
    props.revealed,
    props.type,
    props.source,
    props.focus,
    props.waveStyle,
    props.palette,
    props.scale,
    props.cornerRadius,
    props.scrub,
    props.capture,
    props.live,
    props.prewarm,
    props.resolution,
    props.reducedMotion,
    secondRef.value,
  ],
  syncController,
  { deep: true, flush: 'post' },
)

const handle: DistortionWaveHandle = {
  play: (options?: PlayOptions) => controllerRef.value?.play(options),
  reverse: () => controllerRef.value?.reverse(),
  reset: () => controllerRef.value?.reset(),
  prepare: () => (controllerRef.value ? controllerRef.value.prepare() : Promise.resolve()),
  get element() {
    return rootRef.value
  },
  get controller() {
    return controllerRef.value
  },
}

defineExpose(handle)
</script>

<template>
  <div ref="rootRef" class="tx-distortion-wave" data-distortion-wave="">
    <div ref="firstRef" class="tx-distortion-wave__layer" data-dw-layer="content" :style="initialFirstStyle">
      <slot />
    </div>
    <div
      v-if="hasRevealedSlot"
      ref="secondRef"
      class="tx-distortion-wave__layer"
      data-dw-layer="revealed"
      :style="initialSecondStyle"
    >
      <slot name="revealed" />
    </div>
    <div
      v-if="hasOverlaySlot"
      class="tx-distortion-wave__overlay"
      data-dw-layer="overlay"
      data-dw-skip=""
    >
      <slot name="overlay" />
    </div>
  </div>
</template>

<style lang="scss">
.tx-distortion-wave {
  position: relative;
  display: grid;
  isolation: isolate;
}

.tx-distortion-wave__overlay {
  position: relative;
  z-index: 2;
  grid-area: 1 / 1;
  min-width: 0;
  min-height: 0;
  pointer-events: none;
}

:where(.tx-distortion-wave__overlay) > * {
  pointer-events: auto;
}
</style>
