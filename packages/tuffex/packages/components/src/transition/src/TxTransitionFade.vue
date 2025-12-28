<script setup lang="ts">
import TxTransition from './TxTransition.vue'

defineOptions({ name: 'TxTransitionFade', inheritAttrs: false })
</script>

<template>
  <TxTransition preset="fade" v-bind="$attrs">
    <slot />
  </TxTransition>
</template>
