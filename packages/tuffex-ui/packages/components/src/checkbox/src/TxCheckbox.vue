<script lang="ts" setup>
import { computed } from 'vue'

defineOptions({
  name: 'TuffCheckbox',
})

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    disabled?: boolean
    label?: string
  }>(),
  {
    modelValue: false,
    disabled: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'change': [value: boolean]
}>()

const isChecked = computed({
  get: () => props.modelValue,
  set: (val: boolean) => {
    emit('update:modelValue', val)
    emit('change', val)
  },
})

function toggle() {
  if (props.disabled) return
  isChecked.value = !isChecked.value
}
</script>

<template>
  <div
    role="checkbox"
    :aria-checked="isChecked"
    :aria-disabled="disabled"
    :tabindex="disabled ? -1 : 0"
    :class="[
      'tuff-checkbox',
      {
        'is-checked': isChecked,
        'is-disabled': disabled,
      },
    ]"
    @click="toggle"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <span class="tx-checkbox__inner">
      <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
        <polyline
          fill="none"
          stroke-width="24"
          points="88,214 173,284 304,138"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="tx-checkbox__tick"
        />
      </svg>
    </span>
    <span v-if="label || $slots.default" class="tx-checkbox__label">
      <slot>{{ label }}</slot>
    </span>
  </div>
</template>

<style lang="scss" scoped>
.tuff-checkbox {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;

  &__inner {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1px solid var(--tx-border-color, #dcdfe6);
    background-color: var(--tx-bg-color, #fff);
    transition: all 0.25s;

    svg {
      width: 100%;
      height: 100%;
    }

    .tuff-checkbox__tick {
      stroke: var(--tx-fill-color-light, #f5f7fa);
      stroke-dasharray: 306.27;
      stroke-dashoffset: 306.27;
      transition: stroke-dashoffset 0.3s ease;
    }
  }

  &__label {
    margin-left: 8px;
    font-size: 14px;
    color: var(--tx-text-color-regular, #606266);
  }

  &.is-checked {
    .tuff-checkbox__inner {
      background-color: var(--tx-color-primary, #409eff);
      border-color: var(--tx-color-primary, #409eff);

      .tuff-checkbox__tick {
        stroke-dashoffset: 0;
      }
    }
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.6;

    .tuff-checkbox__inner {
      background-color: var(--tx-disabled-bg-color, #f5f7fa);
    }

    .tuff-checkbox__label {
      color: var(--tx-disabled-text-color, #c0c4cc);
    }
  }

  &:hover:not(.is-disabled) {
    .tuff-checkbox__inner {
      border-color: var(--tx-color-primary, #409eff);
    }
  }

  &:focus-visible {
    .tuff-checkbox__inner {
      box-shadow: 0 0 0 2px var(--tx-color-primary-light-7, #c6e2ff);
    }
  }
}
</style>
