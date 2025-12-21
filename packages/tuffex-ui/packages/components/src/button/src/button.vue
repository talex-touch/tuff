<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useVibrate } from '../../../../utils/vibrate'
import type { ButtonEmits, ButtonProps } from './types'
import Spinner from '../../spinner';
import VWave from 'v-wave'

defineOptions({
  name: 'TxButton',
})

const { vWave } = VWave.createLocalWaveDirective()

const props = withDefaults(defineProps<ButtonProps>(), {
  variant: undefined,
  size: undefined,
  block: false,
  type: undefined,
  plain: false,
  round: false,
  circle: false,
  loading: false,
  disabled: false,
  icon: undefined,
  autofocus: false,
  nativeType: 'button',
  vibrate: true,
  vibrateType: 'light',
})

const emit = defineEmits<ButtonEmits>()

const buttonRef = ref<HTMLButtonElement>()

const normalizedVariant = computed(() => {
  if (props.variant) return props.variant
  switch (props.type) {
    case 'primary':
      return 'primary'
    case 'danger':
      return 'danger'
    case 'text':
      return 'ghost'
    default:
      return 'secondary'
  }
})

const normalizedSize = computed(() => {
  if (!props.size) return 'md'
  if (props.size === 'lg' || props.size === 'large') return 'lg'
  if (props.size === 'sm' || props.size === 'small' || props.size === 'mini') return 'sm'
  return 'md'
})

const classList = computed(() => {
  return [
    'tx-button',
    `variant-${normalizedVariant.value}`,
    `tx-size-${normalizedSize.value}`,
    {
      block: props.block,
      loading: props.loading,
      disabled: props.disabled,
    },
  ]
})

function handleClick(event: MouseEvent) {
  if (props.disabled || props.loading) return

  if (props.vibrate) {
    let vibrateType = props.vibrateType
    if (!vibrateType) {
      switch (normalizedVariant.value) {
        case 'primary':
          vibrateType = 'medium'
          break
        case 'danger':
          vibrateType = 'error'
          break
        default:
          vibrateType = 'light'
      }
    }
    useVibrate(vibrateType)
  }

  emit('click', event)
}

if (props.autofocus) {
  nextTick(() => {
    buttonRef.value?.focus()
  })
}
</script>

<template>
  <button
    ref="buttonRef"
    class="tx-button fake-background"
    :class="classList"
    :type="nativeType"
    :disabled="disabled || loading"
    @click="handleClick"
    v-wave
  >
    <Spinner v-if="loading" class="tx-button__spinner" />
    <slot />
  </button>
</template>
