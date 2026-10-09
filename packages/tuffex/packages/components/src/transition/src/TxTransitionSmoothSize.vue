<script setup lang="ts">
import type { StyleValue } from 'vue'
import type { TxTransitionSmoothSizeProps } from './types'
import { computed, ref, useAttrs } from 'vue'
import { timeScaleSpring } from '../../../../utils/animation/jelly'
import { MORPH_BOX_SPRING, useMorphBox } from '../../../../utils/use-morph-box'

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

/** The duration at which the size runs liquid's `snappy` spring unchanged. */
const SPRING_REFERENCE_MS = 220

const attrs = useAttrs()
const outerRef = ref<HTMLElement | null>(null)
const innerRef = ref<HTMLElement | null>(null)

// The size rides the spring TxMorph uses, on `duration`'s clock: a change
// mid-flight moves the target and keeps the momentum instead of restarting a
// tween from where it stopped. `easing` stays with the content's transition.
useMorphBox(outerRef, innerRef, {
  width: () => props.width,
  height: () => props.height,
  spring: () => timeScaleSpring(MORPH_BOX_SPRING, props.duration, SPRING_REFERENCE_MS),
  enabled: () => props.duration > 0,
})

const name = computed(() => {
  if (props.motion === 'slide-fade')
    return 'tx-slide-fade'
  if (props.motion === 'rebound')
    return 'tx-rebound'
  if (props.motion === 'blur')
    return 'tx-blur'
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
  <div
    ref="outerRef"
    class="tx-transition-smooth-size__outer"
    :class="{ 'is-width': width }"
    v-bind="passThroughAttrs"
  >
    <div ref="innerRef" class="tx-transition-smooth-size__inner">
      <div :class="wrapperClass" :style="wrapperStyle">
        <Transition :name="name" :appear="appear" :mode="mode">
          <slot />
        </Transition>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.tx-transition-smooth-size__outer {
  box-sizing: border-box;
  width: 100%;
  overflow: hidden;
}

// A sprung width shrinks to its content at rest, and the content keeps its own
// width whatever the box is doing mid-flight: that is the size it springs to.
.tx-transition-smooth-size__outer.is-width {
  width: fit-content;
  max-width: 100%;
}

// flow-root keeps the content's own margins inside the measured box.
.tx-transition-smooth-size__inner {
  display: flow-root;
}

.tx-transition-smooth-size__outer.is-width > .tx-transition-smooth-size__inner {
  width: max-content;
}
</style>
