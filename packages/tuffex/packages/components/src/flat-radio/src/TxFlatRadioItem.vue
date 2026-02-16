<script setup lang="ts">
import type { TxFlatRadioContext, TxFlatRadioItemProps } from './types'
import { computed, getCurrentInstance, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { FLAT_RADIO_KEY } from './types'

defineOptions({ name: 'TxFlatRadioItem' })

const props = withDefaults(defineProps<TxFlatRadioItemProps>(), {
  label: undefined,
  icon: undefined,
  disabled: false,
})

const ctx = inject<TxFlatRadioContext>(FLAT_RADIO_KEY)
if (!ctx) {
  if (getCurrentInstance()) {
    console.warn('[TxFlatRadioItem] must be used inside <TxFlatRadio>')
  }
}

const itemRef = ref<HTMLElement | null>(null)

const isSelected = computed(() => {
  if (!ctx) return false
  const mv = ctx.modelValue.value
  if (ctx.multiple.value) {
    return Array.isArray(mv) ? mv.includes(props.value) : false
  }
  return mv === props.value
})
const isDisabled = computed(() => props.disabled || ctx?.disabled.value)
const isMultiple = computed(() => ctx?.multiple.value ?? false)

function handleClick() {
  if (isDisabled.value) return
  ctx?.select(props.value)
}

onMounted(() => {
  if (itemRef.value && ctx) {
    ctx.registerItem(props.value, itemRef.value)
  }
})

onBeforeUnmount(() => {
  ctx?.unregisterItem(props.value)
})
</script>

<template>
  <button
    ref="itemRef"
    class="tx-flat-radio-item"
    type="button"
    :role="isMultiple ? 'checkbox' : 'radio'"
    :class="{
      'is-selected': isSelected,
      'is-disabled': isDisabled,
      'is-multiple-selected': isMultiple && isSelected,
    }"
    :aria-checked="isSelected"
    :disabled="isDisabled || undefined"
    :tabindex="-1"
    @click="handleClick"
  >
    <span v-if="$slots.icon || icon" class="tx-flat-radio-item__icon">
      <slot name="icon">
        <i v-if="icon" :class="icon" />
      </slot>
    </span>
    <span v-if="$slots.default || label" class="tx-flat-radio-item__label">
      <slot>{{ label }}</slot>
    </span>
  </button>
</template>

<style lang="scss" scoped>
.tx-flat-radio-item {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--tx-text-color-secondary, #606266);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  font-family: inherit;
  line-height: 1;
  transition: color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;

  &:hover:not(.is-disabled):not(.is-selected) {
    color: var(--tx-text-color-primary, #303133);
  }

  &.is-selected {
    color: var(--tx-text-color-primary, #303133);
    font-weight: 500;
  }

  &.is-multiple-selected {
    background: var(--tx-bg-color-overlay, var(--el-bg-color-overlay, #fff));
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.08),
      0 1px 2px rgba(0, 0, 0, 0.04);
  }

  &.is-disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1em;
  }

  &__label {
    display: inline-flex;
    align-items: center;
  }
}
</style>
