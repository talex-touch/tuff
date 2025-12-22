<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue'
import { useAutoResize } from '../../../../utils/animation/auto-resize'
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

const { refresh, size } = useAutoResize(outer, inner, {
  width: props.width,
  height: props.height,
  applyStyle: true,
  styleTarget: 'outer',
  rounding: props.rounding,
  immediate: props.immediate,
  rafBatch: props.rafBatch,
})

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
