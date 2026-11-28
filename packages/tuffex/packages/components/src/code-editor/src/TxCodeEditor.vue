<script setup lang="ts">
import type { CodeEditorEmits, CodeEditorProps, CodeEditorViewMode } from './types'
import type { Component } from 'vue'
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'

defineOptions({
  name: 'TxCodeEditor',
})

const props = withDefaults(defineProps<CodeEditorProps>(), {
  modelValue: '',
  language: 'json',
  theme: 'auto',
  viewMode: undefined,
  viewModeToggle: false,
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
  getViewMode?: () => CodeEditorViewMode
  setViewMode?: (mode: CodeEditorViewMode) => void
}

const RuntimeEditor = shallowRef<Component | null>(null)
const editorRef = shallowRef<RuntimeEditorExpose | null>(null)

let isUnmounted = false

onBeforeUnmount(() => {
  isUnmounted = true
})

onMounted(() => {
  void import('./TxCodeEditorRuntime.vue')
    .then((mod) => {
      if (!isUnmounted)
        RuntimeEditor.value = mod.default
    })
    .catch(() => {
      // Keep placeholder when dynamic runtime chunk fails to load.
    })
})

function emitModelValue(value: string) {
  emit('update:modelValue', value)
}

function emitViewMode(value: CodeEditorViewMode) {
  emit('update:viewMode', value)
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
  getViewMode: () => editorRef.value?.getViewMode?.() ?? props.viewMode ?? 'code',
  setViewMode: (mode: CodeEditorViewMode) => editorRef.value?.setViewMode?.(mode),
})
</script>

<template>
  <div
    v-if="!RuntimeEditor"
    class="tx-code-editor-placeholder"
    aria-hidden="true"
  />
  <component
    v-else
    :is="RuntimeEditor"
    ref="editorRef"
    v-bind="props"
    @update:model-value="emitModelValue"
    @update:view-mode="emitViewMode"
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
  --_bg: var(--tx-code-editor-bg, var(--tx-fill-color-blank, #fff));
  --_tbg: var(--tx-code-editor-toolbar-bg, var(--tx-fill-color-lighter, #fafafa));
  --_bd: var(--tx-code-editor-border, var(--tx-border-color, #dcdfe6));
  --_fg: var(--tx-code-editor-text, var(--tx-text-color-primary, #303133));
  --_mu: var(--tx-code-editor-muted, var(--tx-text-color-secondary, #909399));
  --_fc: var(--tx-code-editor-focus, var(--tx-color-primary, #409eff));
  --_al: var(--tx-code-editor-active-line, var(--tx-fill-color-light, #f5f7fa));
  --_sans: var(--tx-font-family, system-ui, sans-serif);
  --_mono: var(--tx-font-family-mono, ui-monospace, monospace);
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 160px;
  border-radius: var(--tx-code-editor-radius, 14px);
  border: 1px solid var(--_bd);
  background: var(--_bg);
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &.is-focused {
    border-color: color-mix(in srgb, var(--_fc) 65%, var(--_bd));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--_fc) 16%, transparent);
  }
  &.is-readonly { opacity: 0.92; }

  &__toolbar, &__mode-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--_bd);
    background: var(--_tbg);
    color: var(--_fg);
  }
  &__toolbar { gap: 12px; padding: 8px 12px; }
  &__mode-bar { gap: 8px; padding: 5px 5px 5px 10px; }

  &__lang {
    font: 600 10.5px/1 var(--_mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--_mu);
  }
  &__mode-switch {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--_bd) 40%, transparent);
  }
  &__mode-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 22px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--_mu);
    font: 500 11px/1 var(--_sans);
    cursor: pointer;
    transition: background-color 0.16s ease, color 0.16s ease;

    &:hover:not(.is-active) { color: var(--_fg); }
    &.is-active {
      background: var(--_bg);
      color: var(--_fg);
      font-weight: 600;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
    }
  }

  &__view { display: flex; flex-direction: column; flex: 1; min-height: 160px; }

  .cm-editor { flex: 1; width: 100%; height: 100%; background: transparent; }
  .cm-scroller, .cm-content { min-height: var(--tx-code-editor-min-height, 160px); }
  .cm-scroller { align-items: stretch !important; }
  .cm-gutters {
    height: auto !important;
    min-height: var(--tx-code-editor-min-height, 160px) !important;
    align-self: stretch !important;
    border-right: 1px solid color-mix(in srgb, var(--_bd) 55%, transparent);
  }
  .cm-searchMatch {
    background: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 26%, transparent);
    border-radius: 3px;
  }
  .cm-searchMatch-selected {
    background: color-mix(in srgb, var(--_fc) 32%, transparent);
    outline: 1px solid color-mix(in srgb, var(--_fc) 65%, transparent);
  }
  .cm-panels { background: var(--_tbg); color: var(--_fg); border-color: var(--_bd); font-family: var(--_sans); z-index: 2; }
  .cm-panels-bottom { border-top: 1px solid var(--_bd); }
  .cm-panels-top { border-bottom: 1px solid var(--_bd); }

  .cm-search {
    position: relative;
    padding: 6px;
    font-size: 12px;
    line-height: 1.4;
  }
  .tx-code-editor-search {
    .cm-textfield, .cm-button {
      height: 26px;
      margin: 0;
      box-sizing: border-box;
      border-radius: 7px;
      border: 1px solid var(--_bd);
      background: var(--_bg);
      color: var(--_fg);
      font: inherit;
    }
    .cm-textfield {
      min-width: 112px;
      flex: 1 1 120px;
      max-width: 200px;
      padding: 0 8px;
      outline: none;
      &::placeholder { color: var(--_mu); }
      &:focus {
        border-color: var(--_fc);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--_fc) 18%, transparent);
      }
    }
    .cm-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 9px;
      background-image: none;
      font-weight: 500;
      line-height: 1;
      cursor: pointer;
      &:hover { background: var(--_al); border-color: color-mix(in srgb, var(--_fc) 35%, var(--_bd)); }
      &:active { background: color-mix(in srgb, var(--_fc) 12%, var(--_bg)); }
    }
    button[name='close'] {
      position: absolute;
      top: 6px;
      right: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      padding: 0;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: var(--_mu);
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      &:hover { background: var(--_al); color: var(--_fg); }
    }
    .cm-button:focus-visible, button[name='close']:focus-visible { outline: 2px solid var(--_fc); outline-offset: 1px; }
  }

  .cm-tooltip {
    border: 1px solid var(--_bd);
    border-radius: 10px;
    background: var(--_bg);
    color: var(--_fg);
    box-shadow: var(--tx-box-shadow-light, 4px 8px 24px rgba(0, 0, 0, 0.12));
    overflow: hidden;
  }
  .cm-tooltip-autocomplete > ul > li[aria-selected] {
    background: color-mix(in srgb, var(--_fc) 14%, transparent);
    color: var(--_fg);
  }

  &[data-theme='dark'], &[data-theme='dracula'], &[data-theme='monokai'] {
    --tx-code-editor-tree-string: #7ee787;
    --tx-code-editor-tree-number: #ff7b72;
    --tx-code-editor-tree-bool: #f0b429;
  }
}

.tx-code-editor-search { display: flex; flex-direction: column; gap: 6px; }
.tx-ce-sr, .tx-ce-st { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.tx-ce-sr { padding-right: 28px; }
.tx-ce-st { gap: 4px; }
.tx-ce-sc {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 8px 0 6px;
  border-radius: 7px;
  border: 1px solid transparent;
  .tx-checkbox__box { width: 15px; height: 15px; border-radius: 4.5px; }
  .tx-checkbox__label { font: 500 11.5px/1 var(--_sans); color: var(--_mu); white-space: nowrap; }
  &:hover { background: var(--_al); .tx-checkbox__label { color: var(--_fg); } }
  &.is-checked {
    background: color-mix(in srgb, var(--_fc) 10%, transparent);
    border-color: color-mix(in srgb, var(--_fc) 28%, transparent);
    .tx-checkbox__label { color: var(--_fc); }
  }
}

.tx-code-editor-tree {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: var(--tx-code-editor-min-height, 160px);
  background: var(--_bg);
  color: var(--_fg);
  font: 12.5px/1.6 var(--_mono);
}
.tx-ce-tb {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 8px 5px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--_bd) 70%, transparent);
  background: color-mix(in srgb, var(--_tbg) 65%, transparent);
}
.tx-ce-tc {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--_mu);
}
.tx-ce-td { opacity: 0.6; }
.tx-ce-ti { color: var(--_fg); font-weight: 500; &.is-root { color: var(--_mu); font-weight: 400; } }
.tx-ce-ta { display: inline-flex; align-items: center; gap: 4px; flex: none; }
.tx-ce-tbtn {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 7px;
  border: 1px solid var(--_bd);
  border-radius: 5px;
  background: var(--_bg);
  color: var(--_mu);
  font: 500 10.5px/1 var(--_sans);
  cursor: pointer;
  &:hover { color: var(--_fg); border-color: color-mix(in srgb, var(--_fc) 40%, var(--_bd)); }
}
.tx-ce-tbody { flex: 1; overflow: auto; padding: 8px 10px; }
.tx-ce-terr { display: flex; flex-direction: column; gap: 6px; padding: 16px 14px; font-family: var(--_sans); }
.tx-ce-tet { margin: 0; font-size: 12.5px; font-weight: 600; color: var(--_fg); }
.tx-ce-tem { margin: 0; font: 11.5px/1.4 var(--_mono); color: var(--tx-color-danger, #f56c6c); }

.tx-ce-nr {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 1px 6px 1px calc(var(--tx-tree-depth, 0) * 16px + 2px);
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  &:hover { background: var(--_al); }
  &.is-selected { background: color-mix(in srgb, var(--_fc) 10%, transparent); }
}
.tx-ce-nt, .tx-ce-ns { width: 16px; height: 16px; flex: none; }
.tx-ce-nt {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--_mu);
  cursor: pointer;
  svg { width: 12px; height: 12px; transition: transform 0.14s ease; }
  &.is-expanded svg { transform: rotate(90deg); }
  &:hover { color: var(--_fg); }
}
.tx-ce-nk { color: var(--_fg); font-weight: 500; &.is-index { color: var(--_mu); font-weight: 400; } }
.tx-ce-nm { color: var(--_mu); }
.tx-code-editor-tree-node__count {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 5px;
  background: var(--_al);
  color: var(--_mu);
  font: 500 10.5px/1 var(--_sans);
}
.tx-ce-nv {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  &.is-string { color: var(--tx-code-editor-tree-string, #15803d); }
  &.is-number { color: var(--tx-code-editor-tree-number, #dc2626); font-variant-numeric: tabular-nums; }
  &.is-bool { color: var(--tx-code-editor-tree-bool, #d97706); font-weight: 500; }
  &.is-null { color: var(--_fc); font-style: italic; }
}
.tx-ce-nc { gap: 0; .tx-checkbox__box { width: 14px; height: 14px; border-radius: 4px; } }
.tx-code-editor-tree-node__swatch {
  width: 12px;
  height: 12px;
  border-radius: 3.5px;
  border: 1px solid color-mix(in srgb, var(--_fg) 20%, transparent);
  flex: none;
}
.tx-ce-nch {
  position: relative;
  &::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 20px;
    left: calc(var(--tx-tree-depth, 0) * 16px + 10px);
    width: 1px;
    background: color-mix(in srgb, var(--_bd) 65%, transparent);
    pointer-events: none;
  }
}
.tx-ce-ncl { padding: 0 6px 0 calc(var(--tx-tree-depth, 0) * 16px + 23px); line-height: 20px; }
</style>
