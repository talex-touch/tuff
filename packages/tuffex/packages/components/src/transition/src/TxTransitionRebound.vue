<script setup lang="ts">
import TxTransition from './TxTransition.vue'

defineOptions({ name: 'TxTransitionRebound', inheritAttrs: false })
</script>

<template>
  <TxTransition preset="rebound" v-bind="$attrs">
    <slot />
  </TxTransition>
</template>
