<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'ghost'
    type?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'text'
    size?: 'sm' | 'md' | 'lg' | 'small' | 'large' | 'mini'
    block?: boolean
    plain?: boolean
    round?: boolean
    circle?: boolean
    loading?: boolean
    disabled?: boolean
    icon?: string
    autofocus?: boolean
    nativeType?: 'button' | 'submit' | 'reset'
    dashed?: boolean
    vibrate?: boolean
    vibrateType?: 'light' | 'medium' | 'success' | 'warning' | 'error'
  }>(),
  {
    variant: undefined,
    type: undefined,
    size: undefined,
    block: false,
    plain: false,
    round: false,
    circle: false,
    loading: false,
    disabled: false,
    icon: undefined,
    autofocus: false,
    nativeType: 'button',
    dashed: false,
    vibrate: true,
    vibrateType: undefined,
  },
)

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()
</script>

<template>
  <TxButton
    :variant="variant"
    :type="type"
    :size="size"
    :block="block"
    :plain="plain"
    :round="round"
    :circle="circle"
    :loading="loading"
    :disabled="disabled"
    :icon="icon"
    :autofocus="autofocus"
    :native-type="nativeType"
    :dashed="dashed"
    :vibrate="vibrate"
    :vibrate-type="vibrateType"
    v-bind="$attrs"
    @click="(event) => emit('click', event)"
  >
    <slot />
  </TxButton>
</template>
