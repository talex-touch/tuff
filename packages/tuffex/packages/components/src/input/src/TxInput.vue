<script lang="ts" setup>
import type { StyleValue } from 'vue'
import { computed, ref, useAttrs } from 'vue'
import { useTxFormField } from '../../../../utils/form-field'
import { useMorphWindow } from '../../../../utils/use-morph-window'

defineOptions({
  name: 'TuffInput',
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<{
    modelValue?: string | number
    placeholder?: string
    type?: 'text' | 'password' | 'textarea' | 'date' | 'email' | 'number'
    disabled?: boolean
    readonly?: boolean
    clearable?: boolean
    rows?: number
    prefixIcon?: string
    suffixIcon?: string
    capsLockText?: string
  }>(),
  {
    modelValue: '',
    placeholder: '',
    type: 'text',
    disabled: false,
    readonly: false,
    clearable: false,
    rows: 3,
    prefixIcon: '',
    suffixIcon: '',
    capsLockText: 'CapsLock is on',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  'input': [value: string | number]
  'focus': [event: FocusEvent]
  'blur': [event: FocusEvent]
  'clear': []
}>()

/** Autofill tokens of values never written to a draft: credentials, one-time codes, payment cards. */
const SECRET_AUTOCOMPLETE = /^(?:current-password|new-password|one-time-code|cc-.+)$/

function isSecretAutocomplete(value: unknown): boolean {
  return typeof value === 'string' && value.split(/\s+/).some(token => SECRET_AUTOCOMPLETE.test(token))
}

const attrs = useAttrs()
const field = useTxFormField('input', {
  sensitive: () => props.type === 'password' || isSecretAutocomplete(attrs.autocomplete),
})

const isDisabled = computed(() => props.disabled || !!field?.disabled)
const isReadonly = computed(() => props.readonly || !!field?.readonly)

const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return field ? field.attrs(rest) : rest
})

const wrapperStyle = computed(() => attrs.style as StyleValue)

const inputValue = computed({
  get: () => props.modelValue ?? '',
  set: (val: string) => {
    const normalized = props.type === 'number'
      ? (val === '' ? '' : Number(val))
      : val
    emit('update:modelValue', normalized)
    emit('input', normalized)
  },
})

const inputEl = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
const isFocused = ref(false)
const capsLockOn = ref(false)
// Focusing eases the border and ring; a hover repaints the border at once.
const morphing = useMorphWindow(isFocused, 250)

const showClear = computed(() => {
  return props.clearable && inputValue.value !== '' && inputValue.value !== null && inputValue.value !== undefined && !isDisabled.value && !isReadonly.value
})

const showCapsLock = computed(() => {
  return props.type === 'password' && capsLockOn.value && isFocused.value
})

function handleClear() {
  if (isDisabled.value || isReadonly.value)
    return
  inputValue.value = ''
  emit('clear')
}

function handleFocus(e: FocusEvent) {
  isFocused.value = true
  emit('focus', e)
}

function handleBlur(e: FocusEvent) {
  isFocused.value = false
  capsLockOn.value = false
  emit('blur', e)
}

function handleKeydown(e: KeyboardEvent) {
  if (props.type === 'password') {
    capsLockOn.value = e.getModifierState('CapsLock')
  }
}

defineExpose({
  focus: () => inputEl.value?.focus?.(),
  blur: () => inputEl.value?.blur?.(),
  clear: () => handleClear(),
  setValue: (v: string) => (inputValue.value = v),
  getValue: () => inputValue.value,
  inputEl,
})
</script>

<template>
  <div
    class="tx-input fake-background" :class="[
      {
        'is-disabled': isDisabled,
        'is-readonly': isReadonly,
        'is-invalid': field?.invalid,
        'is-textarea': type === 'textarea',
        'is-focused': isFocused,
        'is-morphing': morphing,
      },
      attrs.class,
    ]"
    :style="wrapperStyle"
  >
    <slot name="prefix">
      <i v-if="prefixIcon" class="tx-input__icon tx-input__icon--prefix" :class="prefixIcon" />
    </slot>

    <textarea
      v-if="type === 'textarea'"
      ref="inputEl"
      v-model="inputValue"
      :placeholder="placeholder"
      :disabled="isDisabled"
      :readonly="isReadonly"
      :rows="rows"
      class="tx-input__inner tx-input__textarea"
      v-bind="inputAttrs"
      @focus="handleFocus"
      @blur="handleBlur"
      @keydown="handleKeydown"
    />
    <input
      v-else
      ref="inputEl"
      v-model="inputValue"
      :type="type"
      :placeholder="placeholder"
      :disabled="isDisabled"
      :readonly="isReadonly"
      class="tx-input__inner"
      v-bind="inputAttrs"
      @focus="handleFocus"
      @blur="handleBlur"
      @keydown="handleKeydown"
    >

    <span v-if="showCapsLock" class="tx-input__capslock" role="status" aria-live="polite" :aria-label="capsLockText" :title="capsLockText">
      <svg viewBox="0 0 24 24" width="14" height="14">
        <path fill="currentColor" d="M12 2L4 10h3v4h10v-4h3L12 2zm-5 14v2h10v-2H7z" />
      </svg>
    </span>

    <Transition name="tx-input-clear">
      <button
        v-if="showClear"
        type="button"
        class="tx-input__clear"
        aria-label="Clear input"
        @click="handleClear"
      >
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path fill="currentColor" d="M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95 1.414-1.414z" />
        </svg>
      </button>
    </Transition>

    <slot name="suffix">
      <i v-if="suffixIcon" class="tx-input__icon tx-input__icon--suffix" :class="suffixIcon" />
    </slot>
  </div>
</template>

<style lang="scss" scoped>
.tx-input {
  position: relative;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 32px;
  /* The 13px inset is the old 1px border plus the 12px that clears the corner curve. */
  padding: 1px 13px;
  border: 0;
  border-radius: 12px;
  background-color: var(--tx-bg-color, #fff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6);

  /* The fake background sits inside the 1px ring so the ring is not covered. */
  &::before {
    top: 1px;
    left: 1px;
    width: calc(100% - 2px);
    height: calc(100% - 2px);
    border-radius: 11px;
  }

  &.is-morphing {
    transition: box-shadow 0.25s;

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }

  &:hover:not(.is-disabled) {
    box-shadow: inset 0 0 0 1px var(--tx-color-primary-light-3, #79bbff);
  }

  &:focus-within:not(.is-disabled),
  &.is-focused:not(.is-disabled) {
    transition: box-shadow 0.25s;
    box-shadow:
      inset 0 0 0 1px var(--tx-color-primary, #409eff),
      0 0 0 3px var(--tx-color-primary-light-9, #ecf5ff);

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }

  // Set by a TxFormItem while it shows an error for this field.
  &.is-invalid:not(.is-disabled) {
    box-shadow: inset 0 0 0 1px var(--tx-color-danger, #f56c6c);

    &:focus-within,
    &.is-focused {
      box-shadow:
        inset 0 0 0 1px var(--tx-color-danger, #f56c6c),
        0 0 0 3px color-mix(in srgb, var(--tx-color-danger, #f56c6c) 15%, transparent);
    }
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: var(--tx-text-color-placeholder, #a8abb2);
    flex-shrink: 0;

    &--prefix {
      margin-right: 6px;
    }

    &--suffix {
      margin-left: 6px;
    }
  }

  &__inner {
    flex: 1;
    min-width: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 14px;
    color: var(--tx-text-color-primary, #303133);

    &::placeholder {
      color: var(--tx-text-color-placeholder, #a8abb2);
    }

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      margin: 0;
      -webkit-appearance: none;
      appearance: none;
    }

    &[type='number'] {
      -moz-appearance: textfield;
    }
  }

  &__textarea {
    box-sizing: border-box;
    height: auto;
    padding: 8px 0;
    resize: vertical;
    line-height: 1.5;
  }

  &__capslock {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 4px;
    color: var(--tx-color-warning, #e6a23c);
    flex-shrink: 0;
  }

  &__clear {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--tx-text-color-placeholder, #a8abb2);
    flex-shrink: 0;

    &:hover {
      color: var(--tx-text-color-secondary, #909399);
    }
  }

  &.is-textarea {
    height: auto;
    min-height: 80px;
    align-items: flex-start;
  }

  &.is-disabled {
    background-color: var(--tx-disabled-bg-color, #f5f7fa);
    cursor: not-allowed;

    .tx-input__inner {
      cursor: not-allowed;
      color: var(--tx-disabled-text-color, #c0c4cc);
    }
  }

  &.is-readonly {
    .tx-input__inner {
      cursor: default;
    }
  }
}

.tx-input-clear-enter-active,
.tx-input-clear-leave-active {
  transition:
    opacity 0.16s ease,
    filter 0.16s ease,
    transform 0.16s ease;
}

.tx-input-clear-enter-from,
.tx-input-clear-leave-to {
  opacity: 0;
  filter: blur(3px);
  transform: scale(0.8);
}
</style>
