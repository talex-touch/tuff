<script setup lang="ts">
import type { CodeEditorEmits, CodeEditorLanguage, CodeEditorProps, CodeEditorTheme, CodeEditorViewMode } from './types'
import type { Extension } from '@codemirror/state'
import type { Panel } from '@codemirror/view'
import type { CodeEditorSearchState } from './TxCodeEditorSearchPanel.vue'
import { computed, createVNode, getCurrentInstance, onBeforeUnmount, onMounted, reactive, ref, render, watch } from 'vue'
import { EditorState, StateEffect } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view'
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  foldAll,
  HighlightStyle,
  indentUnit,
  StreamLanguage,
  unfoldAll,
  syntaxHighlighting,
} from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { getSearchQuery, openSearchPanel, search, searchKeymap } from '@codemirror/search'
import TxCodeEditorSearchPanel from './TxCodeEditorSearchPanel.vue'
import type { Diagnostic } from '@codemirror/lint'
import { lintGutter, lintKeymap, linter } from '@codemirror/lint'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { javascript } from '@codemirror/lang-javascript'
import { yaml } from '@codemirror/lang-yaml'
import { parse as parseYaml, parseDocument, stringify as stringifyYaml } from 'yaml'
import { hasDocument, hasNavigator } from '@talex-touch/utils/env'
import { iniParser, tomlParser } from './stream-parsers'
import { isStructuredLanguage } from './tree-parser'
import TxCodeEditorTree from './TxCodeEditorTree.vue'

defineOptions({
  name: 'TxCodeEditorRuntime',
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

const currentInstance = getCurrentInstance()
const containerRef = ref<HTMLDivElement | null>(null)
const viewRef = ref<EditorView | null>(null)
const isFocused = ref(false)
const autoTheme = ref<'light' | 'dark'>('light')
const liveSource = ref(props.modelValue ?? '')
const internalViewMode = ref<CodeEditorViewMode>(props.viewMode ?? 'code')
const canTreePreview = computed(() => isStructuredLanguage(props.language))
const activeViewMode = computed<CodeEditorViewMode>({
  get: () => {
    const mode = props.viewMode ?? internalViewMode.value
    return mode === 'tree' && canTreePreview.value ? 'tree' : 'code'
  },
  set: (next) => {
    const resolved: CodeEditorViewMode = next === 'tree' && canTreePreview.value ? 'tree' : 'code'
    internalViewMode.value = resolved
    emit('update:viewMode', resolved)
  },
})

function setViewMode(mode: CodeEditorViewMode) {
  activeViewMode.value = mode
}

function handleTreeUpdateSource(next: string) {
  liveSource.value = next
  applyValue(next, true)
}
let themeObserver: MutationObserver | null = null

let suppressEmit = false
let allowEmit = false

const baseTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    lineHeight: '1.6',
    fontFamily: 'var(--tx-font-family-mono, ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace)',
    backgroundColor: 'transparent',
  },
  '.cm-content': {
    padding: '10px 0',
  },
  '.cm-line': {
    padding: '0 12px',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    minHeight: '160px',
    alignItems: 'stretch',
  },
  '.cm-gutters': {
    border: 'none',
    minHeight: '100%',
    userSelect: 'none',
    fontSize: '12px',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '30px',
    padding: '0 8px 0 6px',
  },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 4px',
  },
  '&.cm-focused': {
    outline: 'none',
  },
})

type ResolvedTheme = Exclude<CodeEditorTheme, 'auto'>

const themePalettes: Record<ResolvedTheme, {
  dark: boolean
  background: string
  text: string
  gutter: string
  gutterText: string
  border: string
  selection: string
  activeLine: string
  cursor: string
  toolbarBg: string
}> = {
  light: {
    dark: false,
    background: 'var(--tx-fill-color-blank, #ffffff)',
    text: 'var(--tx-text-color-primary, #303133)',
    gutter: 'var(--tx-fill-color-lighter, #fafafa)',
    gutterText: 'var(--tx-text-color-secondary, #909399)',
    border: 'var(--tx-border-color-light, var(--tx-border-color, #e4e7ed))',
    selection: 'color-mix(in srgb, var(--tx-color-primary, #409eff) 18%, transparent)',
    activeLine: 'color-mix(in srgb, var(--tx-fill-color-light, #f5f7fa) 75%, transparent)',
    cursor: 'var(--tx-color-primary, #409eff)',
    toolbarBg: 'var(--tx-fill-color-lighter, #fafafa)',
  },
  dark: {
    dark: true,
    background: 'var(--tx-bg-color-overlay, #14161a)',
    text: 'var(--tx-text-color-primary, #e6edf3)',
    gutter: 'color-mix(in srgb, var(--tx-fill-color-light, #1b1e24) 65%, transparent)',
    gutterText: 'var(--tx-text-color-secondary, #8b949e)',
    border: 'var(--tx-border-color, #2d323b)',
    selection: 'color-mix(in srgb, var(--tx-color-primary, #58a6ff) 26%, transparent)',
    activeLine: 'color-mix(in srgb, var(--tx-fill-color-light, #1f242d) 70%, transparent)',
    cursor: 'var(--tx-color-primary, #58a6ff)',
    toolbarBg: 'var(--tx-fill-color-light, #1b1e24)',
  },
  github: {
    dark: false,
    background: '#ffffff',
    text: '#24292f',
    gutter: '#f6f8fa',
    gutterText: '#57606a',
    border: '#d0d7de',
    selection: '#b6d6fd',
    activeLine: '#f6f8fa',
    cursor: '#0969da',
    toolbarBg: '#f6f8fa',
  },
  dracula: {
    dark: true,
    background: '#282a36',
    text: '#f8f8f2',
    gutter: '#282a36',
    gutterText: '#6272a4',
    border: '#44475a',
    selection: '#44475a',
    activeLine: '#343746',
    cursor: '#ff79c6',
    toolbarBg: '#2b2d3a',
  },
  monokai: {
    dark: true,
    background: '#272822',
    text: '#f8f8f2',
    gutter: '#272822',
    gutterText: '#75715e',
    border: '#3e3d32',
    selection: '#49483e',
    activeLine: '#3e3d32',
    cursor: '#f8f8f2',
    toolbarBg: '#2f2f2a',
  },
}

const highlightPalettes: Record<ResolvedTheme, {
  keyword: string
  atom: string
  number: string
  string: string
  comment: string
  variable: string
  type: string
  property: string
  punctuation: string
  operator: string
  emphasis: string
}> = {
  light: {
    keyword: '#cf222e',
    atom: '#0550ae',
    number: '#0550ae',
    string: '#0a3069',
    comment: '#6e7781',
    variable: '#24292f',
    type: '#8250df',
    property: '#0550ae',
    punctuation: '#24292f',
    operator: '#cf222e',
    emphasis: '#1f6feb',
  },
  dark: {
    keyword: '#ff7b72',
    atom: '#79c0ff',
    number: '#79c0ff',
    string: '#a5d6ff',
    comment: '#8b949e',
    variable: '#e6edf3',
    type: '#d2a8ff',
    property: '#79c0ff',
    punctuation: '#e6edf3',
    operator: '#ff7b72',
    emphasis: '#58a6ff',
  },
  github: {
    keyword: '#cf222e',
    atom: '#0550ae',
    number: '#0550ae',
    string: '#0a3069',
    comment: '#6e7781',
    variable: '#24292f',
    type: '#8250df',
    property: '#0550ae',
    punctuation: '#24292f',
    operator: '#cf222e',
    emphasis: '#1f6feb',
  },
  dracula: {
    keyword: '#ff79c6',
    atom: '#bd93f9',
    number: '#bd93f9',
    string: '#f1fa8c',
    comment: '#6272a4',
    variable: '#f8f8f2',
    type: '#8be9fd',
    property: '#50fa7b',
    punctuation: '#f8f8f2',
    operator: '#ff79c6',
    emphasis: '#8be9fd',
  },
  monokai: {
    keyword: '#f92672',
    atom: '#ae81ff',
    number: '#ae81ff',
    string: '#e6db74',
    comment: '#75715e',
    variable: '#f8f8f2',
    type: '#66d9ef',
    property: '#a6e22e',
    punctuation: '#f8f8f2',
    operator: '#f92672',
    emphasis: '#66d9ef',
  },
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

function syncAutoTheme(): void {
  autoTheme.value = resolveAutoTheme()
}

function setupThemeObserver(): void {
  if (!hasDocument() || typeof MutationObserver === 'undefined')
    return

  const root = document.documentElement
  themeObserver?.disconnect()
  themeObserver = new MutationObserver(() => {
    syncAutoTheme()
  })
  const observerInit: MutationObserverInit = {
    attributes: true,
    attributeFilter: ['class', 'data-theme'],
  }
  themeObserver.observe(root, observerInit)
  if (document.body)
    themeObserver.observe(document.body, observerInit)
}

const resolvedTheme = computed<ResolvedTheme>(() => {
  const theme = props.theme ?? 'auto'
  if (theme === 'auto')
    return autoTheme.value
  return theme
})

const themeStyles = computed(() => themePalettes[resolvedTheme.value])
const rootStyle = computed(() => ({
  '--tx-code-editor-bg': themeStyles.value.background,
  '--tx-code-editor-border': themeStyles.value.border,
  '--tx-code-editor-toolbar-bg': themeStyles.value.toolbarBg,
  '--tx-code-editor-gutter-bg': themeStyles.value.gutter,
  '--tx-code-editor-muted': themeStyles.value.gutterText,
  '--tx-code-editor-text': themeStyles.value.text,
  '--tx-code-editor-focus': themeStyles.value.cursor,
  '--tx-code-editor-active-line': themeStyles.value.activeLine,
  '--tx-code-editor-selection': themeStyles.value.selection,
}))

function normalizeTabSize(value?: number) {
  if (!value || Number.isNaN(value) || value < 1)
    return 2
  return Math.round(value)
}

function createHighlightStyle(theme: ResolvedTheme) {
  const palette = highlightPalettes[theme]
  return HighlightStyle.define([
    { tag: tags.keyword, color: palette.keyword },
    { tag: [tags.atom, tags.bool, tags.null], color: palette.atom },
    { tag: [tags.number, tags.integer, tags.float], color: palette.number },
    { tag: [tags.string, tags.special(tags.string)], color: palette.string },
    { tag: [tags.comment, tags.lineComment, tags.blockComment], color: palette.comment, fontStyle: 'italic' },
    { tag: [tags.variableName, tags.definition(tags.variableName)], color: palette.variable },
    { tag: [tags.typeName, tags.className], color: palette.type },
    { tag: [tags.propertyName, tags.attributeName], color: palette.property },
    { tag: tags.operator, color: palette.operator },
    { tag: tags.punctuation, color: palette.punctuation },
    { tag: tags.emphasis, color: palette.emphasis, fontStyle: 'italic' },
    { tag: tags.strong, fontWeight: '700' },
    { tag: tags.link, color: palette.emphasis, textDecoration: 'underline' },
  ])
}

function createEditorTheme(theme: ResolvedTheme): Extension {
  const palette = themePalettes[theme]
  return EditorView.theme(
    {
      '&': {
        color: palette.text,
        backgroundColor: palette.background,
      },
      '.cm-content': {
        caretColor: palette.cursor,
      },
      '.cm-gutters': {
        backgroundColor: palette.gutter,
        color: palette.gutterText,
        borderRight: `1px solid ${palette.border}`,
      },
      '.cm-activeLine': {
        backgroundColor: palette.activeLine,
      },
      '.cm-activeLineGutter': {
        backgroundColor: palette.activeLine,
      },
      '.cm-selectionBackground': {
        backgroundColor: palette.selection,
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: palette.selection,
      },
    },
    { dark: palette.dark },
  )
}

type NormalizedLanguage = 'json' | 'yaml' | 'toml' | 'ini' | 'javascript'

function normalizeLanguage(language: CodeEditorLanguage): NormalizedLanguage {
  if (language === 'js')
    return 'javascript'
  return language
}

function getLanguageExtension(language: NormalizedLanguage): Extension {
  if (language === 'yaml')
    return yaml()
  if (language === 'toml')
    return StreamLanguage.define(tomlParser)
  if (language === 'ini')
    return StreamLanguage.define(iniParser)
  if (language === 'javascript')
    return javascript()
  return json()
}

function resolveDiagnosticsRange(pos: [number, number] | undefined, docLength: number) {
  const from = Math.max(0, Math.min(docLength, pos?.[0] ?? 0))
  const rawTo = pos?.[1] ?? from + 1
  let to = Math.max(from, Math.min(docLength, rawTo))
  if (to === from && docLength > from)
    to = from + 1
  return { from, to }
}

function createYamlDiagnostics(view: EditorView): Diagnostic[] {
  const text = view.state.doc.toString()
  if (!text.trim())
    return []

  try {
    const doc = parseDocument(text)
    const diagnostics: Diagnostic[] = []
    const errors = doc.errors ?? []
    const warnings = doc.warnings ?? []
    for (const error of errors) {
      const range = resolveDiagnosticsRange(error.pos, view.state.doc.length)
      diagnostics.push({
        ...range,
        severity: 'error',
        message: error.message || 'YAML parse error',
      })
    }
    for (const warning of warnings) {
      const range = resolveDiagnosticsRange(warning.pos, view.state.doc.length)
      diagnostics.push({
        ...range,
        severity: 'warning',
        message: warning.message || 'YAML warning',
      })
    }
    return diagnostics
  }
  catch (error) {
    const range = resolveDiagnosticsRange(undefined, view.state.doc.length)
    return [
      {
        ...range,
        severity: 'error',
        message: error instanceof Error ? error.message : 'YAML parse error',
      },
    ]
  }
}

function createLintExtension(language: NormalizedLanguage): Extension | null {
  if (language === 'yaml')
    return linter((view) => createYamlDiagnostics(view))
  if (language === 'json')
    return linter(jsonParseLinter())
  return null
}

function formatValue(value: string, language: NormalizedLanguage): string | null {
  if (!value.trim())
    return value

  const tabSize = normalizeTabSize(props.tabSize)
  try {
    if (language === 'yaml') {
      const parsed = parseYaml(value)
      return stringifyYaml(parsed, { indent: tabSize })
    }
    if (language !== 'json')
      return null
    const parsed = JSON.parse(value)
    return JSON.stringify(parsed, null, tabSize)
  }
  catch {
    return null
  }
}

function applyValue(next: string, emitChange: boolean) {
  const view = viewRef.value
  if (!view)
    return

  const current = view.state.doc.toString()
  if (next === current)
    return

  suppressEmit = true
  allowEmit = emitChange
  view.dispatch({
    changes: { from: 0, to: current.length, insert: next },
  })
  suppressEmit = false
  allowEmit = false
}

const updateListener = EditorView.updateListener.of((update) => {
  if (!update.docChanged)
    return
  const value = update.state.doc.toString()
  liveSource.value = value
  if (suppressEmit && !allowEmit)
    return
  emit('update:modelValue', value)
  emit('change', value)
})

function format(): boolean {
  const view = viewRef.value
  if (!view || props.readOnly)
    return false

  const language = normalizeLanguage(props.language)
  const current = view.state.doc.toString()
  const formatted = formatValue(current, language)
  if (formatted === null || formatted === current)
    return false

  applyValue(formatted, true)
  emit('format', { value: formatted, language })
  return true
}

function openSearch(): boolean {
  const view = viewRef.value
  if (!view || !props.search)
    return false
  openSearchPanel(view as EditorView)
  view.focus()
  return true
}

function foldAllLines(): boolean {
  const view = viewRef.value
  if (!view)
    return false
  return foldAll(view as EditorView)
}

function unfoldAllLines(): boolean {
  const view = viewRef.value
  if (!view)
    return false
  return unfoldAll(view as EditorView)
}

async function copyToClipboard(): Promise<boolean> {
  const view = viewRef.value
  if (!view)
    return false
  const value = view.state.doc.toString()
  if (!hasNavigator() || !navigator.clipboard)
    return false
  try {
    await navigator.clipboard.writeText(value)
    return true
  }
  catch {
    return false
  }
}

function getValue(): string {
  const view = viewRef.value
  return view ? view.state.doc.toString() : ''
}

function createSearchPanel(view: EditorView): Panel {
  const host = document.createElement('div')
  host.className = 'cm-search'

  const initial = getSearchQuery(view.state)
  const searchState = reactive<CodeEditorSearchState>({
    search: initial.search,
    replace: initial.replace,
    caseSensitive: initial.caseSensitive,
    regexp: initial.regexp,
    wholeWord: initial.wholeWord,
    readOnly: view.state.readOnly,
  })

  const vnode = createVNode(TxCodeEditorSearchPanel, {
    view,
    state: searchState,
  })
  if (currentInstance?.appContext)
    vnode.appContext = currentInstance.appContext
  render(vnode, host)

  return {
    dom: host,
    update(update) {
      const next = getSearchQuery(update.state)
      if (next.search !== searchState.search)
        searchState.search = next.search
      if (next.replace !== searchState.replace)
        searchState.replace = next.replace
      if (next.caseSensitive !== searchState.caseSensitive)
        searchState.caseSensitive = next.caseSensitive
      if (next.regexp !== searchState.regexp)
        searchState.regexp = next.regexp
      if (next.wholeWord !== searchState.wholeWord)
        searchState.wholeWord = next.wholeWord
      searchState.readOnly = update.state.readOnly
    },
    destroy() {
      render(null, host)
    },
  }
}

function buildExtensions(): Extension[] {
  const language = normalizeLanguage(props.language)
  const tabSize = normalizeTabSize(props.tabSize)
  const theme = resolvedTheme.value
  const extensions: Extension[] = [
    baseTheme,
    createEditorTheme(theme),
    syntaxHighlighting(createHighlightStyle(theme), { fallback: true }),
    indentUnit.of(' '.repeat(tabSize)),
    EditorState.tabSize.of(tabSize),
    EditorState.readOnly.of(props.readOnly),
    EditorView.editable.of(!props.readOnly),
    updateListener,
    drawSelection(),
    highlightActiveLine(),
    bracketMatching(),
    history(),
    foldGutter(),
    getLanguageExtension(language),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...(props.search ? searchKeymap : []),
      ...(props.completion ? completionKeymap : []),
      ...(props.completion ? closeBracketsKeymap : []),
      ...(props.lint ? lintKeymap : []),
      {
        key: 'Mod-Shift-f',
        run: () => {
          format()
          return true
        },
      },
    ]),
  ]

  if (props.lineNumbers) {
    extensions.push(lineNumbers())
    extensions.push(highlightActiveLineGutter())
  }

  if (props.lineWrapping)
    extensions.push(EditorView.lineWrapping)

  if (props.placeholder)
    extensions.push(placeholder(props.placeholder))

  if (props.search)
    extensions.push(search({ createPanel: createSearchPanel }))

  if (props.completion) {
    extensions.push(autocompletion())
    extensions.push(closeBrackets())
  }

  if (props.lint) {
    const lintExtension = createLintExtension(language)
    if (lintExtension) {
      extensions.push(lintExtension)
      extensions.push(lintGutter())
    }
  }

  if (props.extensions?.length)
    extensions.push(...props.extensions)

  return extensions
}

function reconfigure() {
  const view = viewRef.value
  if (!view)
    return
  view.dispatch({ effects: StateEffect.reconfigure.of(buildExtensions()) })
}

function handleFocus() {
  if (!isFocused.value) {
    isFocused.value = true
    emit('focus')
  }
}

function handleBlur() {
  if (isFocused.value) {
    isFocused.value = false
    emit('blur')
  }
  if (props.formatOnBlur)
    format()
}

onMounted(() => {
  if (!containerRef.value)
    return

  if (props.theme === 'auto') {
    syncAutoTheme()
    setupThemeObserver()
  }

  const state = EditorState.create({
    doc: props.modelValue ?? '',
    extensions: buildExtensions(),
  })
  const view = new EditorView({
    state,
    parent: containerRef.value,
  })
  viewRef.value = view
  view.dom.addEventListener('focus', handleFocus, true)
  view.dom.addEventListener('blur', handleBlur, true)

  if (props.formatOnInit)
    format()
})

onBeforeUnmount(() => {
  themeObserver?.disconnect()
  themeObserver = null
  const view = viewRef.value
  if (!view)
    return
  view.dom.removeEventListener('focus', handleFocus, true)
  view.dom.removeEventListener('blur', handleBlur, true)
  view.destroy()
  viewRef.value = null
})

watch(
  () => props.theme,
  (next) => {
    if (next === 'auto') {
      syncAutoTheme()
      setupThemeObserver()
      return
    }
    themeObserver?.disconnect()
    themeObserver = null
  },
)

watch(
  () => props.modelValue,
  (next) => {
    const normalized = next ?? ''
    liveSource.value = normalized
    applyValue(normalized, false)
  },
)

watch(
  () => [
    props.language,
    props.readOnly,
    props.lineNumbers,
    props.lineWrapping,
    props.placeholder,
    props.tabSize,
    props.lint,
    props.search,
    props.completion,
    props.extensions,
  ],
  () => {
    reconfigure()
  },
  { deep: true },
)

watch(
  () => resolvedTheme.value,
  () => {
    reconfigure()
  },
)

defineExpose({
  focus: () => viewRef.value?.focus(),
  blur: () => viewRef.value?.contentDOM?.blur(),
  format: () => format(),
  openSearch: () => openSearch(),
  foldAll: () => foldAllLines(),
  unfoldAll: () => unfoldAllLines(),
  copy: () => copyToClipboard(),
  getValue: () => getValue(),
  getView: () => viewRef.value as unknown,
  getViewMode: () => activeViewMode.value,
  setViewMode,
})
</script>

<template>
  <div
    class="tx-code-editor"
    :class="{
      'is-focused': isFocused,
      'is-readonly': readOnly,
      'is-tree': activeViewMode === 'tree',
    }"
    :data-theme="resolvedTheme"
    :style="rootStyle"
  >
    <div v-if="$slots.toolbar" class="tx-code-editor__toolbar">
      <slot
        name="toolbar"
        :format="format"
        :open-search="openSearch"
        :fold-all="foldAllLines"
        :unfold-all="unfoldAllLines"
        :copy="copyToClipboard"
        :get-value="getValue"
        :view-mode="activeViewMode"
        :set-view-mode="setViewMode"
        :can-tree-preview="canTreePreview"
      />
    </div>
    <div v-else-if="viewModeToggle && canTreePreview" class="tx-code-editor__mode-bar">
      <span class="tx-code-editor__lang">{{ language }}</span>
      <div class="tx-code-editor__mode-switch" role="tablist" aria-label="Editor view mode">
        <button
          type="button"
          role="tab"
          class="tx-code-editor__mode-btn"
          :class="{ 'is-active': activeViewMode === 'code' }"
          :aria-selected="activeViewMode === 'code'"
          @click="setViewMode('code')"
        >
          Code
        </button>
        <button
          type="button"
          role="tab"
          class="tx-code-editor__mode-btn"
          :class="{ 'is-active': activeViewMode === 'tree' }"
          :aria-selected="activeViewMode === 'tree'"
          @click="setViewMode('tree')"
        >
          Tree
        </button>
      </div>
    </div>
    <div v-show="activeViewMode === 'code'" ref="containerRef" class="tx-code-editor__view" />
    <TxCodeEditorTree
      v-if="activeViewMode === 'tree'"
      :source="liveSource"
      :language="language"
      :tab-size="tabSize"
      :read-only="readOnly"
      @update-source="handleTreeUpdateSource"
      @switch-to-code="setViewMode('code')"
    />
  </div>
</template>
