<script lang="ts" setup>
import TxModal from './TxModal.vue'

defineOptions({
  name: 'TModal',
})
</script>

<template>
  <TxModal v-bind="$attrs">
    <template #header>
      <slot name="header" />
    </template>

    <slot />

    <template #footer>
      <slot name="footer" />
    </template>
  </TxModal>
</template>
