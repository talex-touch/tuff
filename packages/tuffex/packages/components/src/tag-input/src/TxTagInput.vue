<script setup lang="ts">
import type { TagInputEmits, TagInputProps } from './types'
import { computed, ref } from 'vue'
import { TxTag } from '../../tag'

defineOptions({ name: 'TxTagInput' })

const props = withDefaults(defineProps<TagInputProps>(), {
  modelValue: () => [],
  placeholder: 'Add tag',
  disabled: false,
  max: 20,
  allowDuplicates: false,
  separators: () => [','],
  confirmOnBlur: true,
})

const emit = defineEmits<TagInputEmits>()

const inputRef = ref<HTMLInputElement | null>(null)
const inputValue = ref('')

const tags = computed(() => props.modelValue ?? [])

const canAddMore = computed(() => tags.value.length < (props.max ?? 0))
const inputDisabled = computed(() => props.disabled || !canAddMore.value)

function emitChange(next: string[]) {
  emit('update:modelValue', next)
  emit('change', next)
}

function normalizeTag(tag: string): string | null {
  const value = tag.trim()
  if (!value)
    return null
  return value
}

function addTags(values: string[]) {
  if (props.disabled)
    return
  const added: string[] = []
  const next = tags.value.slice()
  for (const raw of values) {
    const tag = normalizeTag(raw)
    if (!tag)
      continue
    if (!props.allowDuplicates && next.includes(tag))
      continue
    if (next.length >= (props.max ?? 0))
      break
    next.push(tag)
    added.push(tag)
  }
  if (added.length) {
    emit('add', added)
    emitChange(next)
  }
}

function removeTag(tag: string) {
  if (props.disabled)
    return
  const next = tags.value.filter(t => t !== tag)
  emit('remove', tag)
  emitChange(next)
}

function focusInput() {
  inputRef.value?.focus()
}

function splitBySeparators(value: string): string[] {
  const separators = props.separators ?? []
  if (!separators.length)
    return [value]
  const escaped = separators.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')
  if (!escaped)
    return [value]
  const pattern = new RegExp(`[${escaped}]`, 'g')
  return value.split(pattern)
}

function onInput(value: string) {
  inputValue.value = value
  const parts = splitBySeparators(value)
  if (parts.length > 1) {
    addTags(parts.slice(0, -1))
    inputValue.value = parts[parts.length - 1] ?? ''
  }
}

function confirmInput() {
  const parts = splitBySeparators(inputValue.value)
  addTags(parts)
  inputValue.value = ''
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    confirmInput()
    return
  }
  if (e.key === 'Backspace' && !inputValue.value && tags.value.length) {
    const lastTag = tags.value[tags.value.length - 1]
    if (lastTag)
      removeTag(lastTag)
  }
}

function onBlur(e: FocusEvent) {
  emit('blur', e)
  if (props.confirmOnBlur)
    confirmInput()
}
</script>

<template>
  <div
    class="tx-tag-input"
    :class="{ 'is-disabled': disabled }"
    @click="focusInput"
  >
    <div class="tx-tag-input__tags">
      <TxTag
        v-for="tag in tags"
        :key="tag"
        :label="tag"
        size="sm"
        closable
        :disabled="disabled"
        @close="removeTag(tag)"
      />
      <input
        ref="inputRef"
        class="tx-tag-input__input"
        :value="inputValue"
        :placeholder="inputDisabled ? '' : placeholder"
        :disabled="inputDisabled"
        @input="(e) => onInput((e.target as HTMLInputElement).value)"
        @keydown="onKeydown"
        @focus="(e) => emit('focus', e)"
        @blur="onBlur"
      >
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-tag-input {
  border: 1px solid var(--tx-border-color, #dcdfe6);
  border-radius: 12px;
  padding: 6px 8px;
  background: var(--tx-bg-color, #fff);
  cursor: text;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:hover:not(.is-disabled) {
    border-color: var(--tx-color-primary-light-3, #79bbff);
  }

  &:focus-within:not(.is-disabled) {
    border-color: var(--tx-color-primary, #409eff);
    box-shadow: 0 0 0 3px var(--tx-color-primary-light-7, #c6e2ff);
  }

  &.is-disabled {
    background: var(--tx-disabled-bg-color, #f5f7fa);
    cursor: not-allowed;
    opacity: 0.8;
  }
}

.tx-tag-input__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.tx-tag-input__input {
  flex: 1;
  min-width: 120px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--tx-text-color-primary, #303133);
  padding: 4px 2px;
}

.tx-tag-input__input::placeholder {
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.tx-tag-input__input:disabled {
  cursor: not-allowed;
}
</style>
