<script setup lang="ts">
import type { ButtonEmits, ButtonProps } from './types'
import VWave from 'v-wave'
import { computed, nextTick, ref, watch } from 'vue'
import { useAutoResize } from '../../../../utils/animation/auto-resize'
import { useVibrate } from '../../../../utils/vibrate'
import Spinner from '../../spinner'

defineOptions({
  name: 'TxButton',
})

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

const { vWave } = VWave.createLocalWaveDirective()

const buttonRef = ref<HTMLButtonElement | null>(null)
const innerRef = ref<HTMLElement | null>(null)

const autoWidthEnabled = computed(() => {
  return !props.block && !props.circle
})

const { refresh: refreshAutoWidth, setEnabled: setAutoWidthEnabled } = useAutoResize(buttonRef, innerRef, {
  width: true,
  height: false,
  applyStyle: true,
  applyMode: 'transition',
  styleTarget: 'inner',
  immediate: true,
  rafBatch: true,
  durationMs: 180,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
  clearStyleOnFinish: true,
})

watch(
  autoWidthEnabled,
  (enabled) => {
    setAutoWidthEnabled(enabled)
    if (!enabled && innerRef.value)
      innerRef.value.style.width = ''
    void refreshAutoWidth()
  },
  { immediate: true },
)

watch(
  () => props.loading,
  () => {
    void refreshAutoWidth()
  },
)

const normalizedVariant = computed(() => {
  if (props.variant)
    return props.variant
  switch (props.type) {
    case 'primary':
      return 'primary'
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'danger':
      return 'danger'
    case 'info':
      return 'info'
    case 'text':
      return 'ghost'
    default:
      return 'secondary'
  }
})

const normalizedSize = computed(() => {
  if (!props.size)
    return 'md'
  if (props.size === 'lg' || props.size === 'large')
    return 'lg'
  if (props.size === 'sm' || props.size === 'small' || props.size === 'mini')
    return 'sm'
  return 'md'
})

const classList = computed(() => {
  return [
    `variant-${normalizedVariant.value}`,
    `tx-size-${normalizedSize.value}`,
    {
      'block': props.block,
      'loading': props.loading,
      'disabled': props.disabled,
      'plain': props.plain,
      'dashed': props.dashed,
      'round': props.round,
      'circle': props.circle,
      'auto-width': autoWidthEnabled.value,
    },
  ]
})

function handleClick(event: MouseEvent) {
  if (props.disabled || props.loading)
    return

  if (props.vibrate) {
    let vibrateType = props.vibrateType
    if (!vibrateType) {
      switch (normalizedVariant.value) {
        case 'primary':
          vibrateType = 'medium'
          break
        case 'success':
          vibrateType = 'success'
          break
        case 'warning':
          vibrateType = 'warning'
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
    v-wave
    class="tx-button fake-background transition-cubic"
    :class="classList"
    :type="nativeType"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span ref="innerRef" class="tx-button__inner">
      <Spinner v-if="loading" class="tx-button__spinner" />
      <i v-if="icon" class="tx-button__icon" :class="icon" />
      <slot />
    </span>
  </button>
</template>
