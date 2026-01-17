<script setup lang="ts">
import { TuffFlatButton } from '@talex-touch/tuffex'

const props = withDefaults(
  defineProps<{
    primary?: boolean
    mini?: boolean
    disabled?: boolean
    loading?: boolean
  }>(),
  {
    primary: false,
    mini: false,
    disabled: false,
    loading: false,
  },
)

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()
</script>

<template>
  <TuffFlatButton
    :primary="primary"
    :mini="mini"
    :disabled="disabled"
    :loading="loading"
    v-bind="$attrs"
    @click="(event) => emit('click', event)"
  >
    <slot />
  </TuffFlatButton>
</template>
