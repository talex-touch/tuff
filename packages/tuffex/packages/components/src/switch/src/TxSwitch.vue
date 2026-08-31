<script lang="ts" setup>
import { computed } from 'vue'

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
    /** Accessible name. Prefer `ariaLabelledby` when a visible label already exists. */
    ariaLabel?: string
    /** Id of a visible label element that names this switch. */
    ariaLabelledby?: string
  }>(),
  {
    modelValue: false,
    disabled: false,
    loading: false,
    size: 'default',
    ariaLabel: 'Toggle',
    ariaLabelledby: undefined,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'change': [value: boolean]
}>()

const isActive = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
})

// Loading blocks input the same way `disabled` does, but stays a separate class
// so the ring indicator reads as "busy" instead of inheriting the dimmed look.
const isBlocked = computed(() => props.disabled || props.loading)

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
    :aria-label="ariaLabelledby ? undefined : ariaLabel"
    :aria-labelledby="ariaLabelledby"
    :disabled="isBlocked"
    class="tuff-switch" :class="[
      {
        'is-active': isActive,
        'is-disabled': disabled,
        'is-loading': loading,
        [`tuff-switch--${size}`]: size !== 'default',
      },
    ]"
    @click="toggle"
  >
    <span class="tuff-switch__thumb" />
  </button>
</template>
