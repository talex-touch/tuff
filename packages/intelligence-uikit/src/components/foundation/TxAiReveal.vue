<script setup lang="ts">
import type { TxAiRevealProps } from '../../types'
import { computed } from 'vue'
import { TxStagger, TxTransition } from '@talex-touch/tuffex'

defineOptions({
  name: 'TxAiReveal',
})

const props = withDefaults(defineProps<TxAiRevealProps>(), {
  as: 'div',
  motion: 'slide-fade',
  appear: true,
  duration: 220,
  delay: 0,
  delayStep: 28,
  disabledMotion: false,
})

const transitionPreset = computed(() => {
  if (props.motion === 'rebound')
    return 'rebound'
  if (props.motion === 'fade' || props.motion === 'blur')
    return 'fade'
  return 'slide-fade'
})

const rootStyle = computed(() => ({
  '--tx-ai-reveal-delay': `${props.delay}ms`,
  '--tx-ai-reveal-duration': `${props.duration}ms`,
}))
</script>

<template>
  <component
    :is="as"
    v-if="disabledMotion || motion === 'none'"
    class="tx-ai-reveal"
    :style="rootStyle"
  >
    <slot />
  </component>

  <TxStagger
    v-else
    :tag="as"
    class="tx-ai-reveal"
    :appear="appear"
    :duration="duration"
    :delay-base="delay"
    :delay-step="delayStep"
  >
    <TxTransition :preset="transitionPreset" :duration="duration">
      <slot />
    </TxTransition>
  </TxStagger>
</template>
