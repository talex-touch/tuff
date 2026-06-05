<script name="FlatButton" lang="ts" setup>
import { TxButton } from '@talex-touch/tuffex/button'

defineProps<{
  primary?: boolean
  mini?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()
</script>

<template>
  <TxButton
    variant="flat"
    :type="primary ? 'primary' : undefined"
    :size="mini ? 'sm' : undefined"
    :disabled="disabled"
    v-bind="$attrs"
    @click="(event) => emit('click', event)"
  >
    <slot />
  </TxButton>
</template>
