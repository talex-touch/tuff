<script setup lang="ts">
import type {
  MarkdownEditorEmits,
  MarkdownEditorMode,
  MarkdownEditorProps,
  MarkdownEditorToolbarActionKey,
} from './types'
import type { CSSProperties } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { hasDocument } from '@talex-touch/utils/env'
import { TxIcon } from '../../icon'
import { serializeMarkdown } from './markdown-serializer'

defineOptions({
  name: 'TxMarkdownEditor',
})

const defaultToolbarActions: MarkdownEditorToolbarActionKey[] = [
  'heading',
  'bold',
  'italic',
  'strike',
  'quote',
  'code',
  'bulletList',
  'orderedList',
  'link',
  'undo',
  'redo',
]

const editorModes: MarkdownEditorMode[] = ['wysiwyg', 'source', 'preview']

const actionMeta: Record<MarkdownEditorToolbarActionKey, { label: string; icon: string }> = {
  heading: { label: 'Heading', icon: 'i-ri-heading' },
  bold: { label: 'Bold', icon: 'i-ri-bold' },
  italic: { label: 'Italic', icon: 'i-ri-italic' },
  strike: { label: 'Strike', icon: 'i-ri-strikethrough' },
  quote: { label: 'Quote', icon: 'i-ri-double-quotes-l' },
  code: { label: 'Code', icon: 'i-ri-code-line' },
  bulletList: { label: 'Bullet list', icon: 'i-ri-list-unordered' },
  orderedList: { label: 'Ordered list', icon: 'i-ri-list-ordered' },
  link: { label: 'Link', icon: 'i-ri-link' },
  undo: { label: 'Undo', icon: 'i-ri-arrow-go-back-line' },
  redo: { label: 'Redo', icon: 'i-ri-arrow-go-forward-line' },
}

const modeMeta: Record<MarkdownEditorMode, { label: string; icon: string }> = {
  wysiwyg: { label: 'WYSIWYG', icon: 'i-ri-edit-2-line' },
  source: { label: 'Markdown source', icon: 'i-ri-markdown-line' },
  preview: { label: 'Preview', icon: 'i-ri-eye-line' },
}

const props = withDefaults(defineProps<MarkdownEditorProps>(), {
  modelValue: '',
  placeholder: '',
  defaultMode: 'wysiwyg',
  disabled: false,
  readonly: false,
  sanitize: true,
  theme: 'auto',
  toolbar: true,
  minHeight: 220,
  maxHeight: undefined,
})

const emit = defineEmits<MarkdownEditorEmits>()

const editorRef = ref<HTMLElement | null>(null)
const sourceRef = ref<HTMLTextAreaElement | null>(null)
const currentValue = ref(props.modelValue ?? '')
const sourceValue = ref(currentValue.value)
const editorHtml = ref('')
const previewHtml = ref('')
const internalMode = ref<MarkdownEditorMode>(props.mode ?? props.defaultMode)
const isFocused = ref(false)
const isComposing = ref(false)
const autoTheme = ref<'light' | 'dark'>('light')
let themeObserver: MutationObserver | null = null
let renderToken = 0

const resolvedMode = computed(() => props.mode ?? internalMode.value)

const resolvedTheme = computed<'light' | 'dark'>(() => {
  const theme = props.theme ?? 'auto'
  return theme === 'auto' ? autoTheme.value : theme
})

const toolbarActions = computed(() => props.toolbarActions?.length ? props.toolbarActions : defaultToolbarActions)

const editorStyle = computed<CSSProperties>(() => ({
  minHeight: normalizeSize(props.minHeight),
  maxHeight: normalizeSize(props.maxHeight),
}))

const canEdit = computed(() => !props.disabled && !props.readonly && resolvedMode.value !== 'preview')
const isEmpty = computed(() => currentValue.value.trim().length === 0)

function normalizeSize(value?: string | number): string | undefined {
  if (typeof value === 'number')
    return `${value}px`
  return value
}

async function renderMarkdown(markdown: string): Promise<string> {
  try {
    const { marked } = await import('marked')
    const rawHtml = await marked.parse(markdown ?? '', {
      breaks: true,
      gfm: true,
    }) as string

    if (!props.sanitize)
      return rawHtml

    const mod = await import('dompurify')
    return mod.default.sanitize(rawHtml)
  }
  catch {
    return ''
  }
}

async function syncRenderedHtml(markdown = currentValue.value) {
  const token = ++renderToken
  const html = await renderMarkdown(markdown)

  if (token !== renderToken)
    return

  editorHtml.value = html
  previewHtml.value = html
}

function emitValue(value: string) {
  if (value === currentValue.value)
    return

  currentValue.value = value
  sourceValue.value = value
  emit('update:modelValue', value)
  emit('change', value)
}

function syncFromEditor() {
  if (!editorRef.value || isComposing.value)
    return

  emitValue(serializeMarkdown(editorRef.value))
}

function handleSourceInput(event: Event) {
  emitValue((event.target as HTMLTextAreaElement).value)
}

function setMode(mode: MarkdownEditorMode) {
  if (props.disabled || resolvedMode.value === mode)
    return

  if (props.mode === undefined)
    internalMode.value = mode

  if (mode === 'source')
    sourceValue.value = currentValue.value
  else
    syncRenderedHtml()

  emit('update:mode', mode)
  emit('mode-change', mode)

  nextTick(() => {
    if (mode === 'source')
      sourceRef.value?.focus()
    if (mode === 'wysiwyg')
      editorRef.value?.focus()
  })
}

function runDocumentCommand(command: string, value?: string) {
  if (!hasDocument() || typeof document.execCommand !== 'function')
    return false

  try {
    return document.execCommand(command, false, value)
  }
  catch {
    return false
  }
}

async function requestLinkUrl(selectedText: string): Promise<string> {
  if (!props.linkPrompt)
    return ''

  return (await props.linkPrompt(selectedText)).trim()
}

async function runRichAction(action: MarkdownEditorToolbarActionKey) {
  if (!canEdit.value)
    return

  editorRef.value?.focus()

  if (action === 'heading')
    runDocumentCommand('formatBlock', 'h2')
  if (action === 'bold')
    runDocumentCommand('bold')
  if (action === 'italic')
    runDocumentCommand('italic')
  if (action === 'strike')
    runDocumentCommand('strikeThrough')
  if (action === 'quote')
    runDocumentCommand('formatBlock', 'blockquote')
  if (action === 'code')
    runDocumentCommand('formatBlock', 'pre')
  if (action === 'bulletList')
    runDocumentCommand('insertUnorderedList')
  if (action === 'orderedList')
    runDocumentCommand('insertOrderedList')
  if (action === 'undo')
    runDocumentCommand('undo')
  if (action === 'redo')
    runDocumentCommand('redo')
  if (action === 'link') {
    const selectedText = hasDocument() ? document.getSelection()?.toString() ?? '' : ''
    const href = await requestLinkUrl(selectedText)
    if (href)
      runDocumentCommand('createLink', href)
  }

  syncFromEditor()
}

function transformSelectedSource(transformer: (selected: string) => { value: string; start: number; end: number }) {
  const textarea = sourceRef.value
  if (!textarea || !canEdit.value)
    return

  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = sourceValue.value.slice(start, end)
  const result = transformer(selected)
  const next = `${sourceValue.value.slice(0, start)}${result.value}${sourceValue.value.slice(end)}`

  sourceValue.value = next
  emitValue(next)

  nextTick(() => {
    textarea.focus()
    textarea.setSelectionRange(start + result.start, start + result.end)
  })
}

function prefixSourceLines(prefixFactory: (index: number) => string) {
  transformSelectedSource((selected) => {
    const lines = (selected || '').split('\n')
    const value = lines.map((line, index) => `${prefixFactory(index)}${line}`).join('\n')
    return { value, start: 0, end: value.length }
  })
}

async function runSourceAction(action: MarkdownEditorToolbarActionKey) {
  if (action === 'link') {
    const textarea = sourceRef.value
    if (!textarea || !canEdit.value)
      return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = sourceValue.value.slice(start, end) || 'link'
    const href = await requestLinkUrl(selected)

    if (!href)
      return

    const value = `[${selected}](${href})`
    const next = `${sourceValue.value.slice(0, start)}${value}${sourceValue.value.slice(end)}`
    sourceValue.value = next
    emitValue(next)

    nextTick(() => {
      textarea.focus()
      textarea.setSelectionRange(start + 1, start + selected.length + 1)
    })
    return
  }

  if (action === 'heading') {
    prefixSourceLines(() => '## ')
    return
  }
  if (action === 'quote') {
    prefixSourceLines(() => '> ')
    return
  }
  if (action === 'bulletList') {
    prefixSourceLines(() => '- ')
    return
  }
  if (action === 'orderedList') {
    prefixSourceLines(index => `${index + 1}. `)
    return
  }
  if (action === 'undo' || action === 'redo') {
    sourceRef.value?.focus()
    runDocumentCommand(action)
    return
  }

  transformSelectedSource((selected) => {
    if (action === 'bold')
      return { value: `**${selected}**`, start: 2, end: selected.length + 2 }
    if (action === 'italic')
      return { value: `*${selected}*`, start: 1, end: selected.length + 1 }
    if (action === 'strike')
      return { value: `~~${selected}~~`, start: 2, end: selected.length + 2 }
    if (action === 'code')
      return { value: `\`${selected}\``, start: 1, end: selected.length + 1 }

    return { value: selected, start: 0, end: selected.length }
  })
}

async function runToolbarAction(action: MarkdownEditorToolbarActionKey) {
  if (resolvedMode.value === 'source')
    await runSourceAction(action)
  else
    await runRichAction(action)
}

function handleEditorKeydown(event: KeyboardEvent) {
  const modifier = event.metaKey || event.ctrlKey
  if (!modifier)
    return

  const key = event.key.toLowerCase()
  if (key !== 'b' && key !== 'i')
    return

  event.preventDefault()
  void runToolbarAction(key === 'b' ? 'bold' : 'italic')
}

function handleFocus() {
  isFocused.value = true
  emit('focus')
}

function handleBlur() {
  isFocused.value = false
  emit('blur')
}

function resolveAutoTheme(): 'light' | 'dark' {
  if (!hasDocument())
    return 'light'

  const root = document.documentElement
  const body = document.body
  const dataTheme = root.getAttribute('data-theme') || body?.getAttribute('data-theme')

  if (dataTheme === 'dark')
    return 'dark'
  if (dataTheme === 'light')
    return 'light'
  if (root.classList.contains('dark') || body?.classList.contains('dark'))
    return 'dark'
  if (root.classList.contains('light') || body?.classList.contains('light'))
    return 'light'

  return 'light'
}

function syncAutoTheme() {
  autoTheme.value = resolveAutoTheme()
}

function setupThemeObserver() {
  if (!hasDocument() || typeof MutationObserver === 'undefined')
    return

  themeObserver?.disconnect()
  themeObserver = new MutationObserver(() => {
    syncAutoTheme()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme'],
  })
}

watch(
  () => props.modelValue,
  async (next) => {
    const value = next ?? ''
    if (value === currentValue.value)
      return

    currentValue.value = value
    sourceValue.value = value
    await syncRenderedHtml(value)
  },
)

watch(
  () => props.mode,
  (mode) => {
    if (!mode)
      return

    if (mode === 'source')
      sourceValue.value = currentValue.value
    else
      syncRenderedHtml()
  },
)

watch(
  () => props.theme,
  (theme) => {
    if (theme === 'auto') {
      syncAutoTheme()
      setupThemeObserver()
      return
    }

    themeObserver?.disconnect()
    themeObserver = null
  },
)

onMounted(() => {
  syncRenderedHtml()

  if (props.theme === 'auto') {
    syncAutoTheme()
    setupThemeObserver()
  }
})

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = null
})

defineExpose({
  focus: () => (resolvedMode.value === 'source' ? sourceRef.value?.focus() : editorRef.value?.focus()),
  blur: () => (resolvedMode.value === 'source' ? sourceRef.value?.blur() : editorRef.value?.blur()),
  setMode,
  getMode: () => resolvedMode.value,
  getValue: () => currentValue.value,
  setValue: async (value: string) => {
    currentValue.value = value
    sourceValue.value = value
    emit('update:modelValue', value)
    emit('change', value)
    await syncRenderedHtml(value)
  },
})
</script>

<template>
  <div
    class="tx-markdown-editor"
    :class="[
      `tx-markdown-editor--${resolvedTheme}`,
      {
        'is-focused': isFocused,
        'is-disabled': disabled,
        'is-readonly': readonly,
        'is-empty': isEmpty,
      },
    ]"
    :data-theme="resolvedTheme"
  >
    <div v-if="toolbar" class="tx-markdown-editor__toolbar">
      <div class="tx-markdown-editor__actions">
        <button
          v-for="action in toolbarActions"
          :key="action"
          type="button"
          class="tx-markdown-editor__button"
          :aria-label="actionMeta[action].label"
          :title="actionMeta[action].label"
          :disabled="disabled || readonly || resolvedMode === 'preview'"
          @click="runToolbarAction(action)"
        >
          <TxIcon :name="actionMeta[action].icon" :size="16" />
        </button>
      </div>

      <div class="tx-markdown-editor__modes" role="tablist" aria-label="Markdown editor mode">
        <button
          v-for="mode in editorModes"
          :key="mode"
          type="button"
          class="tx-markdown-editor__button"
          :class="{ 'is-active': resolvedMode === mode }"
          :aria-label="modeMeta[mode].label"
          :title="modeMeta[mode].label"
          :aria-selected="resolvedMode === mode"
          :disabled="disabled"
          role="tab"
          @click="setMode(mode)"
        >
          <TxIcon :name="modeMeta[mode].icon" :size="16" />
        </button>
      </div>
    </div>

    <div class="tx-markdown-editor__body" :style="editorStyle">
      <div
        v-show="resolvedMode === 'wysiwyg'"
        ref="editorRef"
        class="tx-markdown-editor__surface markdown-body"
        :contenteditable="canEdit"
        :data-placeholder="placeholder"
        :data-empty="isEmpty ? 'true' : 'false'"
        role="textbox"
        aria-multiline="true"
        v-html="editorHtml"
        @input="syncFromEditor"
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown="handleEditorKeydown"
        @compositionstart="isComposing = true"
        @compositionend="() => { isComposing = false; syncFromEditor() }"
      />

      <textarea
        v-show="resolvedMode === 'source'"
        ref="sourceRef"
        v-model="sourceValue"
        class="tx-markdown-editor__source"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        spellcheck="false"
        @input="handleSourceInput"
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown="handleEditorKeydown"
      />

      <div
        v-show="resolvedMode === 'preview'"
        class="tx-markdown-editor__preview markdown-body"
        v-html="previewHtml"
      />
    </div>
  </div>
</template>

<style lang="scss">
.tx-markdown-editor {
  --tx-markdown-editor-border: var(--tx-border-color, #dcdfe6);
  --tx-markdown-editor-bg: var(--tx-fill-color-blank, #ffffff);
  --tx-markdown-editor-toolbar-bg: var(--tx-fill-color-lighter, #fafafa);
  --tx-markdown-editor-text: var(--tx-text-color-primary, #303133);
  --tx-markdown-editor-muted: var(--tx-text-color-secondary, #606266);
  --tx-markdown-editor-focus: var(--tx-color-primary, #409eff);

  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--tx-markdown-editor-border);
  border-radius: 12px;
  background: var(--tx-markdown-editor-bg);
  color: var(--tx-markdown-editor-text);
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;

  &.is-focused {
    border-color: var(--tx-markdown-editor-focus);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--tx-markdown-editor-focus) 18%, transparent);
  }

  &.is-disabled {
    opacity: 0.62;
    cursor: not-allowed;
  }

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px;
    border-bottom: 1px solid var(--tx-markdown-editor-border);
    background: var(--tx-markdown-editor-toolbar-bg);
  }

  &__actions,
  &__modes {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  &__actions {
    flex-wrap: wrap;
  }

  &__modes {
    flex-shrink: 0;
    padding: 2px;
    border-radius: 9px;
    border: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  }

  &__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--tx-markdown-editor-muted);
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;

    &:hover:not(:disabled),
    &.is-active {
      background: color-mix(in srgb, var(--tx-markdown-editor-focus) 12%, transparent);
      color: var(--tx-markdown-editor-focus);
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--tx-markdown-editor-focus) 40%, transparent);
      outline-offset: 2px;
    }

    &:disabled {
      opacity: 0.42;
      cursor: not-allowed;
    }
  }

  &__body {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 220px;
    overflow: auto;
  }

  &__surface,
  &__preview,
  &__source {
    width: 100%;
    min-height: inherit;
    padding: 16px;
  }

  &__surface,
  &__preview {
    outline: 0;
    color: var(--tx-markdown-editor-text);
  }

  &__surface[data-empty='true']::before {
    content: attr(data-placeholder);
    color: var(--tx-text-color-placeholder, #a8abb2);
    pointer-events: none;
  }

  &__source {
    border: 0;
    outline: 0;
    resize: none;
    background: transparent;
    color: var(--tx-markdown-editor-text);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    font-size: 13px;
    line-height: 1.65;
  }

  &__source::placeholder {
    color: var(--tx-text-color-placeholder, #a8abb2);
  }

  .markdown-body {
    font-size: 14px;
    line-height: 1.7;

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      margin: 1.35em 0 0.55em;
      font-weight: 650;
      line-height: 1.35;
    }

    h1 {
      font-size: 1.8em;
      padding-bottom: 0.3em;
      border-bottom: 1px solid var(--tx-markdown-editor-border);
    }

    h2 {
      font-size: 1.45em;
      padding-bottom: 0.25em;
      border-bottom: 1px solid var(--tx-markdown-editor-border);
    }

    h3 {
      font-size: 1.2em;
    }

    p,
    ul,
    ol,
    blockquote,
    pre,
    table {
      margin: 0 0 1em;
    }

    ul,
    ol {
      padding-left: 1.5em;
    }

    li + li {
      margin-top: 0.25em;
    }

    a {
      color: var(--tx-markdown-editor-focus);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    code {
      padding: 0.15em 0.35em;
      border-radius: 4px;
      background: color-mix(in srgb, currentColor 9%, transparent);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
      font-size: 0.9em;
    }

    pre {
      padding: 12px;
      border-radius: 8px;
      border: 1px solid var(--tx-markdown-editor-border);
      background: color-mix(in srgb, currentColor 5%, transparent);
      overflow: auto;

      code {
        padding: 0;
        background: transparent;
      }
    }

    blockquote {
      padding: 10px 14px;
      border-left: 4px solid color-mix(in srgb, var(--tx-markdown-editor-focus) 55%, transparent);
      border-radius: 0 8px 8px 0;
      background: color-mix(in srgb, var(--tx-markdown-editor-focus) 7%, transparent);
      color: var(--tx-markdown-editor-muted);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      overflow: auto;
    }

    th,
    td {
      padding: 8px 10px;
      border: 1px solid var(--tx-markdown-editor-border);
      text-align: left;
    }

    th {
      background: color-mix(in srgb, currentColor 6%, transparent);
      font-weight: 650;
    }

    hr {
      height: 1px;
      margin: 20px 0;
      border: 0;
      background: var(--tx-markdown-editor-border);
    }

    img {
      max-width: 100%;
      border-radius: 8px;
    }

    > :first-child {
      margin-top: 0;
    }

    > :last-child {
      margin-bottom: 0;
    }
  }

  &--dark {
    --tx-markdown-editor-border: var(--tx-border-color, #414243);
    --tx-markdown-editor-bg: var(--tx-fill-color-blank, #0d1117);
    --tx-markdown-editor-toolbar-bg: var(--tx-fill-color, #161b22);
    --tx-markdown-editor-text: var(--tx-text-color-primary, #e6edf3);
    --tx-markdown-editor-muted: var(--tx-text-color-secondary, #8b949e);
  }
}
</style>
