<script setup lang="ts">
import type { ButtonEmits, ButtonProps } from './types'
import VWave from 'v-wave'
import { computed, nextTick, ref, useSlots, watch } from 'vue'
import { useFlip } from '../../../../utils/animation/flip'
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
const slots = useSlots()

const autoWidthEnabled = computed(() => {
  return !props.block && !props.circle
})

const { flip: flipSize } = useFlip(buttonRef, {
  mode: 'size',
  includeScale: false,
  duration: 180,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
  size: {
    width: true,
    height: false,
  },
})

watch(
  () => props.loading,
  () => {
    if (!autoWidthEnabled.value)
      return
    void flipSize(async () => {
      await nextTick()
    })
  },
  { flush: 'sync' },
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

const spinnerSize = computed(() => {
  if (normalizedSize.value === 'sm')
    return 14
  if (normalizedSize.value === 'lg')
    return 18
  return 16
})

const innerStyle = computed(() => {
  return {
    '--tx-button-spinner-size': `${spinnerSize.value}px`,
  }
})

function hasDefaultContent(): boolean {
  const vnodes = slots.default?.()
  if (!vnodes || !vnodes.length)
    return false
  return vnodes.some((node) => {
    if (typeof node.children === 'string')
      return node.children.trim().length > 0
    if (Array.isArray(node.children))
      return node.children.some((c: any) => typeof c === 'string' ? c.trim().length > 0 : !!c)
    return !!node.children
  })
}

const isIconOnly = computed(() => {
  const slotHasContent = hasDefaultContent()
  return props.circle || (props.icon && !slotHasContent)
})

const toneClass = computed(() => {
  if (!props.type)
    return undefined
  return `tone-${props.type}`
})

const classList = computed(() => {
  return [
    `variant-${normalizedVariant.value}`,
    toneClass.value,
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
    class="tx-button fake-background isolate transition-cubic"
    :class="classList"
    :type="nativeType"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span ref="innerRef" class="tx-button__inner" :style="innerStyle">
      <template v-if="isIconOnly">
        <Spinner
          class="tx-button__spinner is-overlay"

          :visible="loading"
          :size="spinnerSize"
        />
      </template>
      <template v-else>
        <span class="tx-button__spinner-slot" :class="{ 'is-visible': loading }">
          <Spinner
            class="tx-button__spinner"
            :visible="loading"
            :size="spinnerSize"
          />
        </span>
      </template>

      <i v-if="icon" class="tx-button__icon" :class="icon" />
      <slot />
    </span>
  </button>
</template>
