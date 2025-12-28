<script setup lang="ts">
import TxTransition from './TxTransition.vue'

defineOptions({ name: 'TxTransitionSlideFade', inheritAttrs: false })
</script>

<template>
  <TxTransition preset="slide-fade" v-bind="$attrs">
    <slot />
  </TxTransition>
</template>
