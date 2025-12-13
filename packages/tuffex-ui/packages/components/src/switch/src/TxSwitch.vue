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
  }
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
  if (props.disabled) return
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
    :class="[
      'tuff-switch',
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

<style lang="scss" scoped>
.tuff-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 44px;
  height: 24px;
  cursor: pointer;
  border-radius: 12px;
  background-color: var(--tx-fill-color, #f0f2f5);
  transition: all 0.25s ease-in-out;

  &__thumb {
    position: absolute;
    height: 70%;
    aspect-ratio: 1 / 1;
    top: 15%;
    left: 10%;
    border-radius: 5px;
    background-color: var(--tx-text-color-secondary, #909399);
    transition: all 0.25s ease-in-out;
  }

  &.is-active {
    background-color: var(--tx-color-primary, #409eff);
    
    .tuff-switch__thumb {
      left: 50%;
      filter: brightness(2);
    }
  }

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }

  &:hover:not(.is-disabled) {
    box-shadow: 0 0 16px 1px var(--tx-color-primary-light-3, #79bbff);
  }

  &:active:not(.is-disabled) .tuff-switch__thumb {
    transform: scale(0.75);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary-light-5, #a0cfff);
    outline-offset: 2px;
  }

  // Size variants
  &--small {
    width: 36px;
    height: 20px;
    border-radius: 10px;

    .tuff-switch__thumb {
      border-radius: 4px;
    }
  }

  &--large {
    width: 52px;
    height: 28px;
    border-radius: 14px;

    .tuff-switch__thumb {
      border-radius: 6px;
    }
  }
}
</style>
