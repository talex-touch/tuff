<script lang="ts" setup>
import { computed, useSlots } from 'vue'

defineOptions({
  name: 'TxCheckbox',
})

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    disabled?: boolean
    label?: string
    labelPlacement?: 'start' | 'end'
    ariaLabel?: string
  }>(),
  {
    modelValue: false,
    disabled: false,
    labelPlacement: 'end',
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

const hasLabel = computed(() => Boolean(props.label) || Boolean(useSlots().default))

const effectiveAriaLabel = computed(() => {
  if (hasLabel.value) return undefined
  return props.ariaLabel
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
    :aria-label="effectiveAriaLabel"
    :tabindex="disabled ? -1 : 0"
    :class="[
      'tx-checkbox',
      {
        'is-checked': isChecked,
        'is-disabled': disabled,
      },
    ]"
    @click="toggle"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <span
      v-if="(label || $slots.default) && labelPlacement === 'start'"
      class="tx-checkbox__label"
    >
      <slot>{{ label }}</slot>
    </span>

    <span class="tx-checkbox__box" aria-hidden="true">
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

    <span v-if="(label || $slots.default) && labelPlacement === 'end'" class="tx-checkbox__label">
      <slot>{{ label }}</slot>
    </span>
  </div>
</template>

<style lang="scss" scoped>
.tx-checkbox {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  gap: 8px;
  outline: none;

  &__box {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 6px;
    border: 1px solid var(--tx-border-color, #dcdfe6);
    background-color: var(--tx-bg-color, #fff);
    transition: background-color 0.18s ease, border-color 0.18s ease, transform 0.12s ease,
      box-shadow 0.18s ease;

    svg {
      width: 100%;
      height: 100%;
    }

    .tx-checkbox__tick {
      stroke: var(--tx-fill-color-blank, #fff);
      stroke-dasharray: 306.27;
      stroke-dashoffset: 306.27;
      transition: stroke-dashoffset 0.3s ease;
    }
  }

  &__label {
    font-size: 14px;
    color: var(--tx-text-color-regular, #606266);
  }

  &.is-checked {
    .tx-checkbox__box {
      background-color: var(--tx-color-primary, #409eff);
      border-color: var(--tx-color-primary, #409eff);
      animation: tx-checkbox-pop 0.18s ease-out;

      .tx-checkbox__tick {
        stroke-dashoffset: 0;
        animation: tx-checkbox-tick 0.32s ease-out;
      }
    }
  }

  &.is-disabled {
    cursor: not-allowed;

    .tx-checkbox__box {
      background-color: var(--tx-disabled-bg-color, #f5f7fa);
      border-color: var(--tx-disabled-border-color, var(--tx-border-color-light, #e4e7ed));
    }

    .tx-checkbox__label {
      color: var(--tx-disabled-text-color, #c0c4cc);
    }
  }

  &.is-disabled.is-checked {
    .tx-checkbox__box {
      background-color: var(--tx-text-color-disabled, #c0c4cc);
      border-color: var(--tx-text-color-disabled, #c0c4cc);
    }
  }

  &:hover:not(.is-disabled) {
    .tx-checkbox__box {
      border-color: var(--tx-color-primary, #409eff);
      box-shadow: 0 0 0 3px var(--tx-color-primary-light-9, #ecf5ff);
    }
  }

  &:active:not(.is-disabled) {
    .tx-checkbox__box {
      transform: scale(0.96);
    }
  }

  &:focus-visible {
    .tx-checkbox__box {
      box-shadow: 0 0 0 3px var(--tx-color-primary-light-7, #c6e2ff);
    }
  }
}

@keyframes tx-checkbox-pop {
  0% {
    transform: scale(0.96);
  }
  60% {
    transform: scale(1.06);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes tx-checkbox-tick {
  0% {
    stroke-dashoffset: 306.27;
    opacity: 0.1;
  }
  100% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
}
</style>
