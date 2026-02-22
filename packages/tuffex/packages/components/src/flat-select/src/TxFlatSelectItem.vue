<script lang="ts" setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { FLAT_SELECT_KEY } from './types'
import type { TxFlatSelectValue } from './types'

defineOptions({ name: 'TxFlatSelectItem' })

const props = withDefaults(
  defineProps<{
    value: TxFlatSelectValue
    label?: string
    disabled?: boolean
  }>(),
  {
    label: undefined,
    disabled: false,
  },
)

const ctx = inject(FLAT_SELECT_KEY)
const itemRef = ref<HTMLElement | null>(null)

const isSelected = computed(() => ctx?.currentValue.value === props.value)

function handleClick() {
  if (props.disabled) return
  const label = props.label || String(props.value)
  ctx?.handleSelect(props.value, label)
}

onMounted(() => {
  if (itemRef.value && ctx) {
    const label = props.label || String(props.value)
    ctx.registerItem(props.value, label, itemRef.value)
  }
})

onBeforeUnmount(() => {
  ctx?.unregisterItem(props.value)
})
</script>

<template>
  <button
    ref="itemRef"
    type="button"
    class="tx-flat-select-item"
    :class="{
      'is-selected': isSelected,
      'is-disabled': disabled,
    }"
    :disabled="disabled || undefined"
    @click="handleClick"
  >
    <span class="tx-flat-select-item__label">
      <slot>{{ label || value }}</slot>
    </span>
    <span v-if="isSelected" class="tx-flat-select-item__check">
      <svg viewBox="0 0 24 24" width="14" height="14">
        <path fill="currentColor" d="M9.55 18l-5.7-5.7 1.425-1.425L9.55 15.15l9.175-9.175L20.15 7.4z" />
      </svg>
    </span>
  </button>
</template>

<style lang="scss" scoped>
.tx-flat-select-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  outline: none;
  box-sizing: border-box;
  flex-shrink: 0;

  &:hover:not(.is-disabled):not(.is-selected) {
    background: var(--tx-fill-color-light, #f5f7fa);
  }

  &.is-selected {
    color: var(--tx-color-primary, #409eff);
    font-weight: 500;
    background: color-mix(in srgb, var(--tx-color-primary, #409eff) 8%, transparent);
  }

  &.is-disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &__label {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__check {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    margin-left: 6px;
  }
}
</style>
