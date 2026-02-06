<script lang="ts" setup>
import { computed, ref, useAttrs } from 'vue'

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
  }>(),
  {
    modelValue: '',
    placeholder: '',
    type: 'text',
    disabled: false,
    readonly: false,
    clearable: false,
    rows: 3,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
  'input': [value: string | number]
  'focus': [event: FocusEvent]
  'blur': [event: FocusEvent]
  'clear': []
}>()

const attrs = useAttrs()

const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

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

const showClear = computed(() => {
  return props.clearable && inputValue.value !== '' && inputValue.value !== null && inputValue.value !== undefined && !props.disabled && !props.readonly
})

function handleClear() {
  inputValue.value = ''
  emit('clear')
}

function handleFocus(e: FocusEvent) {
  emit('focus', e)
}

function handleBlur(e: FocusEvent) {
  emit('blur', e)
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
        'is-disabled': disabled,
        'is-readonly': readonly,
        'is-textarea': type === 'textarea',
      },
      attrs.class,
    ]"
    :style="attrs.style"
  >
    <slot name="prefix" />

    <textarea
      v-if="type === 'textarea'"
      ref="inputEl"
      v-model="inputValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :rows="rows"
      class="tx-input__inner tx-input__textarea"
      v-bind="inputAttrs"
      @focus="handleFocus"
      @blur="handleBlur"
    />
    <input
      v-else
      ref="inputEl"
      v-model="inputValue"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      class="tx-input__inner"
      v-bind="inputAttrs"
      @focus="handleFocus"
      @blur="handleBlur"
    >

    <span v-if="showClear" class="tx-input__clear" @click="handleClear">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95 1.414-1.414z" />
      </svg>
    </span>

    <slot name="suffix" />
  </div>
</template>

<style lang="scss" scoped>
.tx-input {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
  height: 32px;
  padding: 0 0.5rem;
  border-radius: 12px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  background-color: var(--tx-bg-color, #fff);
  transition: border-color 0.25s, box-shadow 0.25s;

  &:hover:not(.is-disabled) {
    border-color: var(--tx-color-primary-light-3, #79bbff);
  }

  &:focus-within:not(.is-disabled) {
    border-color: var(--tx-color-primary, #409eff);
    border-bottom-width: 2px;
    box-shadow: 0 1px 4px 1px var(--tx-color-primary-light-7, #c6e2ff);
  }

  &__inner {
    flex: 1;
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 14px;
    color: var(--tx-text-color-primary, #303133);

    &::placeholder {
      color: var(--tx-text-color-placeholder, #a8abb2);
    }
  }

  &__textarea {
    height: auto;
    padding: 8px 0;
    resize: vertical;
    line-height: 1.5;
  }

  &__clear {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--tx-text-color-placeholder, #a8abb2);
    transition: color 0.2s;

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

    .tuff-input__inner {
      cursor: not-allowed;
      color: var(--tx-disabled-text-color, #c0c4cc);
    }
  }

  &.is-readonly {
    .tuff-input__inner {
      cursor: default;
    }
  }
}
</style>
