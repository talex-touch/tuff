<script lang="ts" name="TButton" setup>
import { TxButton } from '@talex-touch/tuffex'

withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    block?: boolean
    loading?: boolean
    disabled?: boolean
    nativeType?: 'button' | 'submit' | 'reset'
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    block: false,
    loading: false,
    disabled: false,
    nativeType: 'button'
  }
)

const emits = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()
</script>

<template>
  <TxButton
    :variant="variant"
    :size="size"
    :block="block"
    :loading="loading"
    :disabled="disabled"
    :native-type="nativeType"
    v-bind="$attrs"
    @click="(event) => emits('click', event)"
  >
    <slot />
  </TxButton>
</template>
