<script setup lang="ts">
import { computed, provide, toRefs } from 'vue'
import type { TxRadioGroupProps, TxRadioValue } from './types'

defineOptions({ name: 'TxRadioGroup' })

const props = withDefaults(defineProps<TxRadioGroupProps>(), {
  modelValue: undefined,
  disabled: false,
  type: 'button',
})

const { disabled, type } = toRefs(props)

const emit = defineEmits<{
  (e: 'update:modelValue', v: TxRadioValue): void
  (e: 'change', v: TxRadioValue): void
}>()

const model = computed({
  get: () => props.modelValue,
  set: (v) => {
    emit('update:modelValue', v)
    emit('change', v)
  },
})

const ctx = {
  model,
  disabled: computed(() => disabled.value),
  type: computed(() => type.value),
}

provide('tx-radio-group', ctx)
</script>

<template>
  <div class="tx-radio-group" role="radiogroup" :aria-disabled="disabled" :class="`tx-radio-group--${type}`">
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.tx-radio-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;

  &--button {
    padding: 3px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
    background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 10%, transparent);
  }

  &--standard {
    flex-direction: column;
    gap: 8px;
    padding: 0;
    border: none;
    background: transparent;
  }
}
</style>
