<script setup lang="ts">
import type { FloatingElementProps } from './types'
import { inject, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { TX_FLOATING_CONTEXT_KEY } from './context'

defineOptions({
  name: 'TxFloatingElement',
})

const props = withDefaults(defineProps<FloatingElementProps>(), {
  className: '',
  depth: 1,
})

const elementRef = ref<HTMLDivElement | null>(null)
const elementId = useId()
const context = inject(TX_FLOATING_CONTEXT_KEY, null)

function register() {
  if (!context || !elementRef.value)
    return
  const resolvedDepth = props.depth ?? 0.01
  context.registerElement(elementId, elementRef.value, resolvedDepth)
}

onMounted(register)
watch(() => props.depth, register)
onBeforeUnmount(() => {
  if (!context)
    return
  context.unregisterElement(elementId)
})
</script>

<template>
  <div ref="elementRef" class="tx-floating-element" :class="props.className">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.tx-floating-element {
  position: absolute;
  will-change: transform;
}
</style>
