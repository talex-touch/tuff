<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue'
import { useAutoResize } from '../../../../utils/animation/auto-resize'
import { useFlip } from '../../../../utils/animation/flip'
import type { AutoSizerProps } from './types'

defineOptions({
  name: 'TxAutoSizer',
  inheritAttrs: false,
})

const props = withDefaults(defineProps<AutoSizerProps>(), {
  as: 'div',
  innerAs: 'div',
  width: true,
  height: true,
  durationMs: 200,
  easing: 'ease',
  outerClass: 'overflow-hidden',
  innerClass: undefined,
  rounding: 'ceil',
  immediate: true,
  rafBatch: true,
})

const attrs = useAttrs()

const outer = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)

const { refresh, size, setEnabled } = useAutoResize(outer, inner, {
  width: props.width,
  height: props.height,
  applyStyle: true,
  applyMode: 'transition',
  styleTarget: 'outer',
  rounding: props.rounding,
  immediate: props.immediate,
  rafBatch: props.rafBatch,
  durationMs: props.durationMs,
  easing: props.easing,
  clearStyleOnFinish: true,
})

const { flip: rawFlip } = useFlip(outer, {
  mode: 'size',
  duration: props.durationMs,
  easing: props.easing,
  includeScale: false,
  size: {
    width: props.width,
    height: props.height,
  },
})

async function flip(action: () => void | Promise<void>) {
  setEnabled(false)
  try {
    await rawFlip(action)
  }
  finally {
    setEnabled(true)
    await refresh()
  }
}

const transitionProperty = computed(() => {
  return [props.width ? 'width' : '', props.height ? 'height' : ''].filter(Boolean).join(',')
})

const baseStyle = computed(() => {
  return {
    transitionProperty: transitionProperty.value,
    transitionDuration: `${props.durationMs}ms`,
    transitionTimingFunction: props.easing,
  }
})

const mergedClass = computed(() => {
  return [props.outerClass, attrs.class]
})

const mergedStyle = computed(() => {
  return [baseStyle.value, attrs.style]
})

const passthroughAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})

defineExpose({
  refresh,
  flip,
  size,
  focus: () => (outer.value as any)?.focus?.(),
  outerEl: outer,
})
</script>

<template>
  <component :is="as" ref="outer" :class="mergedClass" :style="mergedStyle" v-bind="passthroughAttrs">
    <component :is="innerAs" ref="inner" :class="innerClass">
      <slot />
    </component>
  </component>
</template>
