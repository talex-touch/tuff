<script setup lang="ts">
import { Comment, computed, useSlots } from 'vue'
import type { StaggerProps } from './types'

defineOptions({
  name: 'TxStagger',
})

const props = withDefaults(defineProps<StaggerProps>(), {
  tag: 'div',
  appear: true,
  name: 'tx-stagger',
  duration: 180,
  delayStep: 24,
  delayBase: 0,
  easing: 'ease-out',
})

const slots = useSlots()

const rootStyle = computed(() => {
  return {
    '--tx-stagger-duration': `${props.duration}ms`,
    '--tx-stagger-delay-step': `${props.delayStep}ms`,
    '--tx-stagger-delay-base': `${props.delayBase}ms`,
    '--tx-stagger-easing': props.easing,
  } as Record<string, string>
})

const normalizedChildren = computed(() => {
  const vnodes = slots.default?.() ?? []
  return vnodes.filter(v => v.type !== Comment)
})
</script>

<template>
  <TransitionGroup
    :name="name"
    :tag="tag"
    :appear="appear"
    class="tx-stagger"
    :style="rootStyle"
  >
    <template v-for="(child, index) in normalizedChildren" :key="(child.key ?? index) as any">
      <component :is="child" :style="{ '--tx-stagger-index': index }" />
    </template>
  </TransitionGroup>
</template>

<style lang="scss">
.tx-stagger {
  --tx-stagger-index: 0;
}

.tx-stagger-enter-active,
.tx-stagger-leave-active {
  transition:
    opacity var(--tx-stagger-duration, 180ms) var(--tx-stagger-easing, ease-out),
    transform var(--tx-stagger-duration, 180ms) var(--tx-stagger-easing, ease-out);
  transition-delay: calc(var(--tx-stagger-delay-base, 0ms) + var(--tx-stagger-index, 0) * var(--tx-stagger-delay-step, 24ms));
}

.tx-stagger-enter-from,
.tx-stagger-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
