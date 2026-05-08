<script setup lang="ts">
import type { StepsContext, StepsDirection, StepsSize } from './types'
import { provide, ref, watch } from 'vue'

interface Props {
  direction?: StepsDirection
  size?: StepsSize
  active?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  direction: 'horizontal',
  size: 'medium',
  active: 0,
})

const activeStep = ref(props.active)
const stepKeys = ref<string[]>([])

watch(() => props.active, (newValue) => {
  activeStep.value = newValue
})

provide<StepsContext>('steps', {
  direction: props.direction,
  size: props.size,
  activeStep,
  stepKeys,
  registerStep: (key: string) => {
    if (!stepKeys.value.includes(key))
      stepKeys.value = [...stepKeys.value, key]
  },
  unregisterStep: (key: string) => {
    stepKeys.value = stepKeys.value.filter(item => item !== key)
  },
  setActiveStep: (step: number | string) => {
    activeStep.value = step
  },
})
</script>

<template>
  <div
    class="tx-steps" :class="[
      `tx-steps--${direction}`,
      `tx-steps--${size}`,
    ]"
    role="list"
  >
    <slot />
  </div>
</template>

<style scoped>
.tx-steps {
  display: flex;
}

.tx-steps--horizontal {
  flex-direction: row;
  align-items: center;
  width: 100%;
}

.tx-steps--vertical {
  flex-direction: column;
  align-items: stretch;
}

.tx-steps--small {
  font-size: 12px;
}

.tx-steps--medium {
  font-size: 14px;
}

.tx-steps--large {
  font-size: 16px;
}
</style>
