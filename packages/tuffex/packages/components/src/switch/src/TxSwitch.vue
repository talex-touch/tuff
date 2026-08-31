<script lang="ts" setup>
import { computed, useSlots } from 'vue'
import { TxTextTransformer } from '../../text-transformer'

defineOptions({
  name: 'TuffSwitch',
})

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    disabled?: boolean
    /** Pending async commit: morphs the thumb into a spinning ring and blocks toggling. */
    loading?: boolean
    size?: 'small' | 'default' | 'large'
    /** Visible text beside the track. Changes crossfade through `TxTextTransformer`. */
    label?: string
    /** Which side the label sits on. */
    labelPlacement?: 'start' | 'end'
    /** Accessible name. Ignored once a visible label or the default slot is present. */
    ariaLabel?: string
    /** Id of a visible label element that names this switch. */
    ariaLabelledby?: string
  }>(),
  {
    modelValue: false,
    disabled: false,
    loading: false,
    size: 'default',
    labelPlacement: 'end',
    ariaLabel: 'Toggle',
    ariaLabelledby: undefined,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'change': [value: boolean]
}>()

const slots = useSlots()

const isActive = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
})

// Loading blocks input the same way `disabled` does, but stays a separate class
// so the ring indicator reads as "busy" instead of inheriting the dimmed look.
const isBlocked = computed(() => props.disabled || props.loading)

const hasLabel = computed(() => Boolean(props.label) || Boolean(slots.default))

// A visible label already names the control, and a competing `aria-label` would
// override the text a speech-control user actually reads (label-in-name).
const effectiveAriaLabel = computed(() => {
  if (props.ariaLabelledby || hasLabel.value)
    return undefined
  return props.ariaLabel
})

function toggle() {
  if (isBlocked.value)
    return
  const newVal = !isActive.value
  isActive.value = newVal
  emit('change', newVal)
}
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="isActive"
    :aria-disabled="isBlocked"
    :aria-busy="loading || undefined"
    :aria-label="effectiveAriaLabel"
    :aria-labelledby="ariaLabelledby"
    :disabled="isBlocked"
    class="tuff-switch" :class="[
      {
        'is-active': isActive,
        'is-disabled': disabled,
        'is-loading': loading,
        'has-label': hasLabel,
        [`tuff-switch--${size}`]: size !== 'default',
      },
    ]"
    @click="toggle"
  >
    <span v-if="hasLabel && labelPlacement === 'start'" class="tuff-switch__label">
      <!-- The prop path animates; slot content is arbitrary nodes we cannot diff. -->
      <TxTextTransformer v-if="!slots.default" :text="label ?? ''" />
      <slot v-else />
    </span>

    <span class="tuff-switch__track">
      <span class="tuff-switch__thumb" />
    </span>

    <span v-if="hasLabel && labelPlacement === 'end'" class="tuff-switch__label">
      <TxTextTransformer v-if="!slots.default" :text="label ?? ''" />
      <slot v-else />
    </span>
  </button>
</template>
