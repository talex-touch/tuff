<script setup lang="ts">
import type { CodeEditorEmits, CodeEditorProps } from './types'
import type { Component } from 'vue'
import { onMounted, shallowRef } from 'vue'

defineOptions({
  name: 'TxCodeEditor',
})

const props = withDefaults(defineProps<CodeEditorProps>(), {
  modelValue: '',
  language: 'json',
  theme: 'auto',
  readOnly: false,
  lineNumbers: true,
  lineWrapping: false,
  placeholder: '',
  tabSize: 2,
  formatOnBlur: false,
  formatOnInit: false,
  lint: true,
  search: true,
  completion: true,
  extensions: () => [],
})

const emit = defineEmits<CodeEditorEmits>()

type RuntimeEditorExpose = {
  focus?: () => void
  blur?: () => void
  format?: () => boolean
  openSearch?: () => boolean
  foldAll?: () => boolean
  unfoldAll?: () => boolean
  copy?: () => Promise<boolean>
  getValue?: () => string
  getView?: () => unknown
}

const RuntimeEditor = shallowRef<Component | null>(null)
const editorRef = shallowRef<RuntimeEditorExpose | null>(null)

onMounted(async () => {
  RuntimeEditor.value = (await import('./TxCodeEditorRuntime.vue')).default
})

function emitModelValue(value: string) {
  emit('update:modelValue', value)
}

function emitChange(value: string) {
  emit('change', value)
}

function emitFormat(payload: Parameters<CodeEditorEmits>[1]) {
  emit('format', payload)
}

defineExpose({
  focus: () => editorRef.value?.focus?.(),
  blur: () => editorRef.value?.blur?.(),
  format: () => editorRef.value?.format?.() ?? false,
  openSearch: () => editorRef.value?.openSearch?.() ?? false,
  foldAll: () => editorRef.value?.foldAll?.() ?? false,
  unfoldAll: () => editorRef.value?.unfoldAll?.() ?? false,
  copy: () => editorRef.value?.copy?.() ?? Promise.resolve(false),
  getValue: () => editorRef.value?.getValue?.() ?? props.modelValue ?? '',
  getView: () => editorRef.value?.getView?.() ?? null,
})
</script>

<template>
  <component
    v-if="RuntimeEditor"
    :is="RuntimeEditor"
    ref="editorRef"
    v-bind="props"
    @update:model-value="emitModelValue"
    @change="emitChange"
    @focus="() => emit('focus')"
    @blur="() => emit('blur')"
    @format="emitFormat"
  >
    <template v-if="$slots.toolbar" #toolbar="slotProps">
      <slot name="toolbar" v-bind="slotProps" />
    </template>
  </component>
</template>

<style lang="scss">
.tx-code-editor {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 160px;
  border-radius: 12px;
  border: 1px solid var(--tx-code-editor-border, var(--tx-border-color, #dcdfe6));
  background: var(--tx-code-editor-bg, var(--tx-fill-color-blank, #ffffff));
  overflow: hidden;
  transition: border-color 0.25s, box-shadow 0.25s;

  &.is-focused {
    border-color: var(--tx-code-editor-focus, var(--tx-color-primary, #409eff));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--tx-code-editor-focus, #409eff) 35%, transparent);
  }

  &.is-readonly {
    opacity: 0.92;
  }

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--tx-code-editor-border, var(--tx-border-color, #dcdfe6));
    background: var(--tx-code-editor-toolbar-bg, var(--tx-fill-color-lighter, #fafafa));
    color: var(--tx-code-editor-text, var(--tx-text-color-primary, #303133));
  }

  &__view {
    flex: 1;
    min-height: 160px;
  }

  .cm-editor {
    height: 100%;
    background: transparent;
  }

  .cm-content {
    min-height: 160px;
  }
}
</style>
