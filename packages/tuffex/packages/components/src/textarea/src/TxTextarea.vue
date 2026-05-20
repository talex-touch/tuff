<script setup lang="ts">
import type { StyleValue } from 'vue'
import { computed, ref, useAttrs } from 'vue'

defineOptions({
  name: 'TxTextarea',
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: string
    rows?: number
    disabled?: boolean
    readonly?: boolean
    maxLength?: number
    showCount?: boolean
    resize?: 'none' | 'vertical' | 'horizontal' | 'both'
    status?: 'default' | 'success' | 'error'
  }>(),
  {
    modelValue: '',
    placeholder: '',
    rows: 4,
    disabled: false,
    readonly: false,
    maxLength: undefined,
    showCount: false,
    resize: 'vertical',
    status: 'default',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'input': [value: string]
  'focus': [event: FocusEvent]
  'blur': [event: FocusEvent]
}>()

const attrs = useAttrs()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const isFocused = ref(false)

const textareaAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

const wrapperStyle = computed(() => attrs.style as StyleValue)

const textareaValue = computed({
  get: () => props.modelValue ?? '',
  set: (value: string) => {
    emit('update:modelValue', value)
    emit('input', value)
  },
})

const countText = computed(() => {
  const length = textareaValue.value.length
  return props.maxLength ? `${length}/${props.maxLength}` : `${length}`
})

function handleFocus(event: FocusEvent) {
  isFocused.value = true
  emit('focus', event)
}

function handleBlur(event: FocusEvent) {
  isFocused.value = false
  emit('blur', event)
}

defineExpose({
  focus: () => textareaRef.value?.focus(),
  blur: () => textareaRef.value?.blur(),
  textareaRef,
})
</script>

<template>
  <label
    class="tx-textarea"
    :class="[
      `tx-textarea--${status}`,
      `tx-textarea--resize-${resize}`,
      {
        'is-disabled': disabled,
        'is-readonly': readonly,
        'is-focused': isFocused,
        'has-counter': showCount,
      },
      attrs.class,
    ]"
    :style="wrapperStyle"
  >
    <textarea
      ref="textareaRef"
      v-model="textareaValue"
      class="tx-textarea__field"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled"
      :readonly="readonly"
      :maxlength="maxLength"
      v-bind="textareaAttrs"
      @focus="handleFocus"
      @blur="handleBlur"
    />
    <span v-if="showCount" class="tx-textarea__count" aria-live="polite">
      {{ countText }}
    </span>
  </label>
</template>

<style scoped>
.tx-textarea {
  position: relative;
  display: inline-flex;
  width: 100%;
  min-height: 96px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  border-radius: 12px;
  background: var(--tx-bg-color, #ffffff);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.tx-textarea:hover:not(.is-disabled) {
  border-color: var(--tx-color-primary-light-3, #79bbff);
}

.tx-textarea.is-focused:not(.is-disabled) {
  border-color: var(--tx-color-primary, #409eff);
  box-shadow: 0 0 0 3px var(--tx-color-primary-light-9, #ecf5ff);
}

.tx-textarea--success:not(.is-disabled) {
  border-color: var(--tx-color-success, #67c23a);
}

.tx-textarea--error:not(.is-disabled) {
  border-color: var(--tx-color-danger, #f56c6c);
}

.tx-textarea__field {
  width: 100%;
  min-width: 0;
  min-height: inherit;
  padding: 10px 12px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--tx-text-color-primary, #303133);
  font: inherit;
  line-height: 1.5;
}

.tx-textarea__field::placeholder {
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.tx-textarea--resize-none .tx-textarea__field {
  resize: none;
}

.tx-textarea--resize-vertical .tx-textarea__field {
  resize: vertical;
}

.tx-textarea--resize-horizontal .tx-textarea__field {
  resize: horizontal;
}

.tx-textarea--resize-both .tx-textarea__field {
  resize: both;
}

.tx-textarea.has-counter .tx-textarea__field {
  padding-bottom: 28px;
}

.tx-textarea__count {
  position: absolute;
  right: 10px;
  bottom: 6px;
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 12px;
  line-height: 1;
  pointer-events: none;
}

.tx-textarea.is-disabled {
  background: var(--tx-disabled-bg-color, #f5f7fa);
  cursor: not-allowed;
}

.tx-textarea.is-disabled .tx-textarea__field {
  color: var(--tx-disabled-text-color, #c0c4cc);
  cursor: not-allowed;
}

.tx-textarea.is-readonly .tx-textarea__field {
  cursor: default;
}
</style>
