<script lang="ts" setup>
import { computed } from 'vue'

defineOptions({
  name: 'TuffSwitch',
})

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    disabled?: boolean
    size?: 'small' | 'default' | 'large'
    /** Accessible name. Prefer `ariaLabelledby` when a visible label already exists. */
    ariaLabel?: string
    /** Id of a visible label element that names this switch. */
    ariaLabelledby?: string
  }>(),
  {
    modelValue: false,
    disabled: false,
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

function toggle() {
  if (props.disabled)
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
    :aria-disabled="disabled"
    :aria-label="ariaLabelledby ? undefined : ariaLabel"
    :aria-labelledby="ariaLabelledby"
    :disabled="disabled"
    class="tuff-switch" :class="[
      {
        'is-active': isActive,
        'is-disabled': disabled,
        [`tuff-switch--${size}`]: size !== 'default',
      },
    ]"
    @click="toggle"
  >
    <span class="tuff-switch__thumb" />
  </button>
</template>
