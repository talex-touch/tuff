<script setup lang="ts">
import type { TxTransitionSmoothSizeProps } from './types'
import { computed, type StyleValue, useAttrs } from 'vue'
import TxAutoSizer from '../../auto-sizer/src/TxAutoSizer.vue'

defineOptions({
  name: 'TxTransitionSmoothSize',
  inheritAttrs: false,
})

const props = withDefaults(defineProps<TxTransitionSmoothSizeProps>(), {
  appear: true,
  mode: 'out-in',
  duration: 220,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
  width: false,
  height: true,
  motion: 'fade',
})

const attrs = useAttrs()

const name = computed(() => {
  if (props.motion === 'slide-fade')
    return 'tx-slide-fade'
  if (props.motion === 'rebound')
    return 'tx-rebound'
  return 'tx-fade'
})

const styleVars = computed(() => {
  return {
    '--tx-transition-duration': `${props.duration}ms`,
    '--tx-transition-easing': props.easing,
  } as Record<string, string>
})

const wrapperClass = computed(() => {
  return ['tx-transition', 'tx-transition-smooth-size', attrs.class] as any
})

const wrapperStyle = computed<StyleValue>(() => {
  return [styleVars.value, attrs.style] as any
})

const passThroughAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})
</script>

<template>
  <TxAutoSizer
    class="tx-transition-smooth-size__outer"
    :width="width"
    :height="height"
    :duration-ms="duration"
    :easing="easing"
    outer-class="overflow-hidden"
    v-bind="passThroughAttrs"
  >
    <div :class="wrapperClass" :style="wrapperStyle">
      <Transition :name="name" :appear="appear" :mode="mode">
        <slot />
      </Transition>
    </div>
  </TxAutoSizer>
</template>

<style lang="scss">
.tx-transition-smooth-size__outer {
  width: 100%;
}
</style>
