<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { TouchSurfaceProps } from './types'
import { computed, ref } from 'vue'
import TxBaseSurface from '../../base-surface/src/TxBaseSurface.vue'
import TxGlassSurface from '../../glass-surface/src/TxGlassSurface.vue'
import { useLiquidTouch } from './use-liquid-touch'

defineOptions({
  name: 'TxTouchSurface',
})

const props = withDefaults(defineProps<TouchSurfaceProps>(), {
  surface: 'base',
})

const surfaceRef = ref<ComponentPublicInstance | null>(null)

const surfaceComponent = computed(() => {
  if (props.surface === 'base')
    return TxBaseSurface
  if (props.surface === 'glass')
    return TxGlassSurface
  return props.surface
})

useLiquidTouch(surfaceRef, {
  disabled: () => props.disabled,
  lean: () => props.lean,
  maxLean: () => props.maxLean,
  hoverLift: () => props.hoverLift,
  pressGrow: () => props.pressGrow,
  stretch: () => props.stretch,
  maxStretch: () => props.maxStretch,
  swell: () => props.swell,
  stiffness: () => props.stiffness,
  damping: () => props.damping,
})
</script>

<template>
  <component :is="surfaceComponent" ref="surfaceRef" class="tx-touch-surface">
    <slot />
  </component>
</template>
