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
// The multi-select virtual-focus cursor: rendered visibly and pointed at by the
// container's aria-activedescendant so keyboard users can see and hear it.
const isFocused = computed(() => !!ctx && ctx.multiple.value && ctx.focusedValue.value === props.value)
const itemId = computed(() => ctx?.getItemId(props.value))

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
    :id="itemId"
    ref="itemRef"
    class="tx-flat-radio-item"
    type="button"
    :role="isMultiple ? 'checkbox' : 'radio'"
    :class="{
      'is-selected': isSelected,
      'is-disabled': isDisabled,
      'is-multiple-selected': isMultiple && isSelected,
      'is-focused': isFocused,
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
  gap: var(--tx-flat-radio-item-gap, 4px);
  border: none;
  background: transparent;
  color: var(--tx-text-color-secondary, #606266);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  font-family: inherit;
  // The weight is on every item, not on `.is-selected`. Selecting used to take
  // that item from 400 to 500, which reflowed it, shoved its siblings, and moved
  // the indicator's width target while the indicator was still animating toward
  // the old one — the single largest source of the jitter, and one no easing
  // curve can hide. A hidden bold sizer would have kept the old look, but it
  // only works for the `label` prop, and the two call sites that matter
  // (StoreHeader, TxFineTuneCard) both pass slot content.
  font-weight: 500;
  line-height: 1;
  transition: color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;

  &:hover:not(.is-disabled):not(.is-selected) {
    color: var(--tx-text-color-primary, #303133);
  }

  &.is-selected {
    color: var(--tx-text-color-primary, #303133);
  }

  // Press feedback rides on the label and the icon, never on the item box: the
  // box is what readGeometry() measures, so scaling it would hand the indicator
  // a moving target and bring the reflow back through another door.
  &:active:not(.is-disabled) {
    .tx-flat-radio-item__icon,
    .tx-flat-radio-item__label {
      transform: scale(0.94);
    }
  }

  &.is-multiple-selected {
    background: var(--tx-bg-color-overlay, #fff);
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.08),
      0 1px 2px rgba(0, 0, 0, 0.04);
  }

  &.is-focused {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, transparent);
  }

  // Without this the UA's own outline lands on the pressed item, a hard
  // rectangle sitting on top of the sliding indicator.
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 45%, transparent);
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
    transition: transform 0.18s cubic-bezier(0.34, 1.4, 0.64, 1);
  }

  &__label {
    display: inline-flex;
    align-items: center;
    transition: transform 0.18s cubic-bezier(0.34, 1.4, 0.64, 1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-flat-radio-item {
    &__icon,
    &__label {
      transition: none;
    }

    &:active:not(.is-disabled) {
      .tx-flat-radio-item__icon,
      .tx-flat-radio-item__label {
        transform: none;
      }
    }
  }
}
</style>
