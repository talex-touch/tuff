<script setup lang="ts">
import type { TxAiRevealProps } from '../../types'
import { computed } from 'vue'

defineOptions({
  name: 'TxAiReveal',
})

const props = withDefaults(defineProps<TxAiRevealProps>(), {
  as: 'div',
  motion: 'slide-fade',
  appear: true,
  duration: 220,
  disabledMotion: false,
})

// A one-shot entrance on the wrapper itself, not a <Transition> around the slot: the
// slot may hold any number of children, and Transition only accepts one. The wrapper is
// ours, so `as` is honoured and a consumer's class still lands on the same element.
const animated = computed(() => props.appear && !props.disabledMotion && props.motion !== 'none')

const rootClass = computed(() => ({
  'tx-ai-reveal': true,
  'is-appearing': animated.value,
  [`tx-ai-reveal--${props.motion}`]: animated.value,
}))

const rootStyle = computed(() => ({
  '--tx-ai-reveal-duration': `${props.duration}ms`,
}))
</script>

<template>
  <component
    :is="as"
    :class="rootClass"
    :style="rootStyle"
  >
    <slot />
  </component>
</template>
