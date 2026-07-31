<script setup lang="ts">
import type { StyleValue } from 'vue'
import type { TxTransitionProps } from './types'
import { computed, useAttrs } from 'vue'
import TxTransitionSmoothSize from './TxTransitionSmoothSize.vue'

defineOptions({
  name: 'TxTransition',
  inheritAttrs: false,
})

const props = withDefaults(defineProps<TxTransitionProps>(), {
  preset: 'fade',
  group: false,
  tag: 'div',
  appear: true,
  mode: 'out-in',
  duration: 180,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
})

const attrs = useAttrs()

const name = computed(() => {
  if (props.preset === 'slide-fade')
    return 'tx-slide-fade'
  if (props.preset === 'rebound')
    return 'tx-rebound'
  // `smooth-size` has no TransitionGroup CSS — its animation lives in the dedicated
  // non-group TxTransitionSmoothSize path, which handles the `!group` case above. Only a
  // grouped smooth-size reaches this `name`, where `tx-smooth-size-*` classes don't exist
  // and would silently animate nothing, so fall through to `tx-fade` (it ships `-move`
  // support) to keep grouped lists animating.
  return 'tx-fade'
})

const styleVars = computed(() => {
  return {
    '--tx-transition-duration': `${props.duration}ms`,
    '--tx-transition-easing': props.easing,
  } as Record<string, string>
})

const passThroughAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})

const wrapperClass = computed(() => {
  return ['tx-transition', attrs.class] as any
})

const wrapperStyle = computed<StyleValue>(() => {
  return [styleVars.value, attrs.style] as any
})
</script>

<template>
  <TxTransitionSmoothSize
    v-if="preset === 'smooth-size' && !group"
    :class="wrapperClass"
    :style="wrapperStyle"
    v-bind="passThroughAttrs"
    :duration="duration"
    :easing="easing"
    :appear="appear"
    :mode="mode"
  >
    <slot />
  </TxTransitionSmoothSize>

  <div v-else :class="wrapperClass" :style="wrapperStyle">
    <TransitionGroup
      v-if="group"
      :name="name"
      :tag="tag"
      :appear="appear"
      v-bind="passThroughAttrs"
    >
      <slot />
    </TransitionGroup>

    <Transition
      v-else
      :name="name"
      :appear="appear"
      :mode="mode"
      v-bind="passThroughAttrs"
    >
      <slot />
    </Transition>
  </div>
</template>

<style lang="scss">
.tx-transition {
  --tx-transition-duration: 180ms;
  --tx-transition-easing: cubic-bezier(0.2, 0, 0, 1);
}

.tx-fade-enter-active,
.tx-fade-leave-active {
  transition: opacity var(--tx-transition-duration) var(--tx-transition-easing);
}

.tx-fade-enter-from,
.tx-fade-leave-to {
  opacity: 0;
}

.tx-slide-fade-enter-active,
.tx-slide-fade-leave-active {
  transition:
    opacity var(--tx-transition-duration) var(--tx-transition-easing),
    transform var(--tx-transition-duration) var(--tx-transition-easing);
}

.tx-slide-fade-enter-from,
.tx-slide-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.tx-rebound-enter-active {
  transition:
    opacity var(--tx-transition-duration) cubic-bezier(0.34, 1.56, 0.64, 1),
    transform var(--tx-transition-duration) cubic-bezier(0.34, 1.56, 0.64, 1);
}

.tx-rebound-leave-active {
  transition:
    opacity var(--tx-transition-duration) var(--tx-transition-easing),
    transform var(--tx-transition-duration) var(--tx-transition-easing);
}

.tx-rebound-enter-from,
.tx-rebound-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
}

.tx-fade-move,
.tx-slide-fade-move,
.tx-rebound-move {
  transition: transform var(--tx-transition-duration) var(--tx-transition-easing);
}

@media (prefers-reduced-motion: reduce) {
  .tx-fade-enter-active,
  .tx-fade-leave-active,
  .tx-slide-fade-enter-active,
  .tx-slide-fade-leave-active,
  .tx-rebound-enter-active,
  .tx-rebound-leave-active,
  .tx-fade-move,
  .tx-slide-fade-move,
  .tx-rebound-move {
    transition-duration: 0.01ms;
  }

  .tx-slide-fade-enter-from,
  .tx-slide-fade-leave-to,
  .tx-rebound-enter-from,
  .tx-rebound-leave-to {
    transform: none;
  }
}
</style>
