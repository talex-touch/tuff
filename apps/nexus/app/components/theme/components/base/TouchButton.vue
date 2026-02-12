<script setup lang="ts">
interface Props {
  loading?: boolean
  disabled?: boolean
}

withDefaults(defineProps<Props>(), {
  loading: false,
  disabled: false,
})
</script>

<template>
  <TxButton variant="ghost" size="lg" :loading="loading" :disabled="disabled || loading" v-bind="$attrs">
    <slot />
  </TxButton>
</template>
