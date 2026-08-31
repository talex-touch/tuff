<script lang="ts" setup>
import { computed, useSlots } from 'vue'

defineOptions({
  name: 'TxCheckbox',
})

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    disabled?: boolean
    /** Pending async commit: the box becomes a spinning ring and blocks toggling. */
    loading?: boolean
    label?: string
    labelPlacement?: 'start' | 'end'
    variant?: 'fill' | 'checkmark'
    ariaLabel?: string
    /**
     * Partial selection — some but not all of the governed items are checked.
     * Renders the dash and reports `aria-checked="mixed"`; activating it
     * resolves to checked, matching a native input's `indeterminate` behaviour.
     */
    indeterminate?: boolean
  }>(),
  {
    modelValue: false,
    disabled: false,
    loading: false,
    labelPlacement: 'end',
    variant: 'checkmark',
    indeterminate: false,
  },
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
  if (hasLabel.value)
    return undefined
  return props.ariaLabel
})

// `mixed` is the only value that lets a screen reader announce a partial
// selection; without it the dash is a purely visual claim the a11y tree denies.
const ariaChecked = computed<'mixed' | boolean>(() =>
  props.indeterminate ? 'mixed' : isChecked.value,
)

// Loading blocks input the same way `disabled` does, but stays a separate class
// so the ring reads as "busy" instead of inheriting the greyed-out disabled box.
const isBlocked = computed(() => props.disabled || props.loading)

function toggle() {
  if (isBlocked.value)
    return
  isChecked.value = props.indeterminate ? true : !isChecked.value
}
</script>

<template>
  <button
    type="button"
    role="checkbox"
    :aria-checked="ariaChecked"
    :aria-disabled="isBlocked"
    :aria-busy="loading || undefined"
    :aria-label="effectiveAriaLabel"
    :disabled="isBlocked"
    class="tx-checkbox" :class="[
      {
        'is-checked': isChecked,
        'is-indeterminate': indeterminate,
        'is-disabled': disabled,
        'is-loading': loading,
      },
      `tx-checkbox--${variant || 'checkmark'}`,
    ]"
    @click="toggle"
  >
    <span
      v-if="(label || $slots.default) && labelPlacement === 'start'"
      class="tx-checkbox__label"
    >
      <slot>{{ label }}</slot>
    </span>

    <span class="tx-checkbox__box" aria-hidden="true">
      <span v-if="indeterminate" class="tx-checkbox__dash" />
      <svg v-if="variant !== 'fill'" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
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
  </button>
</template>

<style lang="scss" scoped>
.tx-checkbox {
  --tx-checkbox-ring-color: var(--tx-text-color-secondary, #909399);

  appearance: none;
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: 0;
  cursor: pointer;
  color: inherit;
  font: inherit;
  text-align: inherit;
  background: transparent;
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
      box-shadow 0.18s ease, border-radius 0.18s ease;

    // Loading ring. Painted on every checkbox but transparent until `is-loading`,
    // so the box -> ring morph is one transition with no DOM swap. `inset: -1px`
    // lands it exactly on the box's own 1px border, whichever box-sizing applies.
    &::after {
      content: '';
      position: absolute;
      inset: -1px;
      border-radius: 50%;
      border: 2px solid var(--tx-checkbox-ring-color);
      border-top-color: transparent;
      opacity: 0;
      transition: opacity 0.18s ease;
    }

    svg {
      /* Out of the flex flow: when the indeterminate dash is also rendered,
         a static 100%-wide svg would sit beside it and shove it off-center. */
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .tx-checkbox__tick {
      stroke: var(--tx-checkbox-checkmark-color, #fff);
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

  &__dash {
    width: 8px;
    height: 1.5px;
    border-radius: 1px;
    background: var(--tx-checkbox-checkmark-color, #fff);
  }

  &.is-indeterminate {
    .tx-checkbox__box {
      background-color: var(--tx-color-primary, #409eff);
      border-color: var(--tx-color-primary, #409eff);
    }

    // A dash and a tick would read as two conflicting claims about the same
    // control, so the tick stands down while the selection is partial.
    .tx-checkbox__tick {
      display: none;
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

  // Must stay below every other state block: it shares their specificity and
  // overrides `border-color` / `border-radius` by source order.
  &.is-loading {
    cursor: progress;

    .tx-checkbox__box {
      border-radius: 50%;
      border-color: transparent;
      // The fill goes with the square. A white ring drawn on the primary fill
      // disappears against a light page at the rim, so the ring stroke — not the
      // fill — is what carries the state through the pending commit.
      background-color: transparent;

      &::after {
        opacity: 1;
        animation: tx-checkbox-ring-spin 0.7s linear infinite;
      }
    }

    // A tick or dash inside the ring would be a second, competing claim about a
    // value that has not landed yet.
    .tx-checkbox__tick,
    .tx-checkbox__dash {
      display: none;
    }
  }

  // Selected states keep the primary hue so the ring still reads as "on";
  // checked and mixed are indistinguishable here, and `aria-checked="mixed"`
  // is what preserves that difference while the commit is in flight.
  &.is-loading.is-checked,
  &.is-loading.is-indeterminate {
    --tx-checkbox-ring-color: var(--tx-color-primary, #409eff);
  }

  &:hover:not(.is-disabled):not(.is-loading) {
    .tx-checkbox__box {
      border-color: var(--tx-color-primary, #409eff);
      box-shadow: 0 0 0 3px var(--tx-color-primary-light-9, #ecf5ff);
    }
  }

  &:active:not(.is-disabled):not(.is-loading) {
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

@keyframes tx-checkbox-ring-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  // The ring's transparent top border is a static glyph on its own, so freezing
  // the rotation keeps the busy cue readable instead of erasing it.
  .tx-checkbox.is-loading .tx-checkbox__box::after {
    animation: none;
  }
}
</style>
