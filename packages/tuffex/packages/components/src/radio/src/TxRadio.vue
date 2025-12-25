<script setup lang="ts">
import { computed, inject, toRefs } from 'vue'
import type { TxRadioProps, TxRadioValue, TxRadioType } from './types'

defineOptions({ name: 'TxRadio' })

type RadioGroupContext = {
  model: { value: TxRadioValue | undefined }
  disabled: { value: boolean }
  type: { value: TxRadioType }
}

const group = inject<RadioGroupContext | null>('tx-radio-group', null)

const props = withDefaults(defineProps<TxRadioProps>(), {
  disabled: false,
  label: '',
  type: 'button',
})

const { label, type: propType } = toRefs(props)

const emit = defineEmits<{
  (e: 'click', v: TxRadioValue): void
}>()

const isDisabled = computed(() => (group?.disabled.value ?? false) || props.disabled)
const isChecked = computed(() => group?.model.value === props.value)
const radioType = computed(() => {
  const groupType = group?.type.value
  return (groupType ?? propType.value ?? 'button') as TxRadioType
})

function select() {
  if (!group) return
  if (isDisabled.value) return
  if (isChecked.value) return
  group.model.value = props.value
  emit('click', props.value)
}
</script>

<template>
  <button
    class="tx-radio"
    type="button"
    role="radio"
    :aria-checked="isChecked"
    :disabled="isDisabled"
    :class="[
      { 'is-checked': isChecked, 'is-disabled': isDisabled },
      `tx-radio--${radioType}`
    ]"
    @click="select"
  >
    <template v-if="radioType === 'standard'">
      <span class="tx-radio__indicator"></span>
      <span class="tx-radio__label"><slot>{{ label }}</slot></span>
    </template>
    <template v-else>
      <slot>{{ label }}</slot>
    </template>
  </button>
</template>

<style lang="scss" scoped>
.tx-radio {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  transition: background 0.16s ease, border-color 0.16s ease, transform 0.12s ease, color 0.16s ease;
  outline: none;

  &--button {
    justify-content: center;
    height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--tx-text-color-regular, #606266);
    font-size: 13px;

    &.is-checked {
      color: color-mix(in srgb, var(--tx-color-primary, #409eff) 92%, var(--tx-text-color-regular, #606266));
    }

    &:hover:not(.is-disabled):not(.is-checked) {
      background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 18%, transparent);
      border-color: color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 60%, transparent);
    }

    &:active:not(.is-disabled) {
      transform: scale(0.98);
    }

    &:focus-visible {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 26%, transparent);
    }
  }

  &--standard {
    gap: 8px;
    padding: 6px 2px;
    border: none;
    background: transparent;
    color: var(--tx-text-color-regular, #606266);
    font-size: 14px;
    border-radius: 10px;

    &.is-checked {
      color: var(--tx-text-color-primary, #303133);

      .tx-radio__indicator {
        background: var(--tx-color-primary, #409eff);
        border-color: var(--tx-color-primary, #409eff);
      }
    }

    &:hover:not(.is-disabled) {
      background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 14%, transparent);
    }

    &:active:not(.is-disabled) {
      transform: scale(0.99);
    }

    &:focus-visible {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 22%, transparent);
    }
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.tx-radio__indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--tx-border-color-light, #e4e7ed);
  background: transparent;
  flex-shrink: 0;
  transition: background 0.16s ease, border-color 0.16s ease;

  &::after {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: white;
    opacity: 1;
    transform: scale(0);
    transition: transform 0.18s cubic-bezier(0.2, 0.9, 0.2, 1);
  }
}

.tx-radio--standard.is-checked .tx-radio__indicator::after {
  transform: scale(1);
}

.tx-radio__label {
  display: inline;
}
</style>
