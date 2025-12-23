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
  }>(),
  {
    modelValue: false,
    disabled: false,
    size: 'default',
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
  <div
    role="switch"
    :aria-checked="isActive"
    :aria-disabled="disabled"
    :tabindex="disabled ? -1 : 0"
    class="tuff-switch" :class="[
      {
        'is-active': isActive,
        'is-disabled': disabled,
        [`tuff-switch--${size}`]: size !== 'default',
      },
    ]"
    @click="toggle"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <span class="tuff-switch__thumb" />
  </div>
</template>
