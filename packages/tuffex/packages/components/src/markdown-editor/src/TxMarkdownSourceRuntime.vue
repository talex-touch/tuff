<script setup lang="ts">
import type { Extension } from '@codemirror/state'
import type { ViewUpdate } from '@codemirror/view'
import type { TxEmojiPack } from '../../icon/src/emoji-pack'
import type { EditorOverlay } from './editor-overlay'
import type { RichChangeKind, RichCommand } from './rich-surface'
import type { MarkdownEditorSelection, MarkdownTextChange } from './types'
import { defaultKeymap } from '@codemirror/commands'
import { Compartment, EditorSelection, EditorState } from '@codemirror/state'
import { drawSelection, EditorView, keymap, placeholder as placeholderText } from '@codemirror/view'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  changeKind,
  emojiCompletion,
  externalChange,
  setSourceOverlay,
  sourceHighlight,
  sourceInput,
  sourceLanguage,
  sourceOverlayField,
  sourceTheme,
} from './source-extensions'
import { changeLengthDelta } from './text-changes'

defineOptions({
  name: 'TxMarkdownSourceRuntime',
})

const props = defineProps<{
  /** Read once, when the view is created; later edits arrive through `applyChanges`. */
  doc: string
  editable: boolean
  placeholder: string
  ariaLabel: string
  dark: boolean
  math: boolean
  highlight: boolean
  callouts: boolean
  emoji: boolean
  emojiPacks?: readonly TxEmojiPack[]
  files?: (files: File[], at: number) => boolean
}>()

const emit = defineEmits<{
  (e: 'change', changes: MarkdownTextChange[], before: MarkdownEditorSelection, after: MarkdownEditorSelection, kind: RichChangeKind): void
  (e: 'selection'): void
  (e: 'command', command: RichCommand): void
  (e: 'focus'): void
  (e: 'blur'): void
  (e: 'ready'): void
}>()

const host = ref<HTMLElement | null>(null)
let view: EditorView | null = null
const configuration = new Compartment()
const language = new Compartment()
const appearance = new Compartment()

function configurationExtensions(): Extension {
  return [
    EditorView.editable.of(props.editable),
    EditorState.readOnly.of(!props.editable),
    EditorView.contentAttributes.of({ 'aria-label': props.ariaLabel }),
    props.placeholder ? placeholderText(props.placeholder) : [],
    props.emoji ? emojiCompletion(() => props.emojiPacks) : [],
  ]
}

function selectionOf(state: EditorState): MarkdownEditorSelection {
  const { anchor, head } = state.selection.main
  return { anchor, head }
}

function onUpdate(update: ViewUpdate): void {
  // One report per update: the shell's document is then never between two of
  // its transactions, even when it applies something while handling this one.
  if (update.docChanged && !update.transactions.some(tr => tr.annotation(externalChange))) {
    const changes: MarkdownTextChange[] = []
    update.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
      changes.push({ from, to, insert: inserted.toString() })
    })
    const last = update.transactions.filter(tr => tr.docChanged).pop()!
    emit('change', changes, selectionOf(update.startState), selectionOf(update.state), changeKind(last))
  }
  if (update.docChanged || update.selectionSet)
    emit('selection')
  if (update.focusChanged) {
    if (update.view.hasFocus)
      emit('focus')
    else
      emit('blur')
  }
}

onMounted(() => {
  if (!host.value)
    return
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.doc,
      extensions: [
        configuration.of(configurationExtensions()),
        language.of(sourceLanguage(props.math, props.highlight, props.callouts)),
        appearance.of(EditorView.darkTheme.of(props.dark)),
        EditorView.lineWrapping,
        drawSelection(),
        sourceTheme,
        sourceHighlight,
        sourceOverlayField,
        sourceInput({
          command: command => emit('command', command),
          files: (files, at) => props.files?.(files, at) ?? false,
          math: () => props.math,
        }),
        keymap.of(defaultKeymap),
        EditorView.updateListener.of(onUpdate),
      ],
    }),
  })
  emit('ready')
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

watch(
  () => [props.editable, props.placeholder, props.ariaLabel, props.emoji],
  () => view?.dispatch({ effects: configuration.reconfigure(configurationExtensions()) }),
)
watch(
  () => [props.math, props.highlight, props.callouts],
  () => view?.dispatch({ effects: language.reconfigure(sourceLanguage(props.math, props.highlight, props.callouts)) }),
)
watch(() => props.dark, dark => view?.dispatch({ effects: appearance.reconfigure(EditorView.darkTheme.of(dark)) }))

function clamp(pos: number, length: number): number {
  return Math.max(0, Math.min(length, pos))
}

/**
 * Changes already in the shell's document; `doc` is the result. The selection
 * maps through them, or moves to `selection`.
 */
function applyChanges(changes: MarkdownTextChange[], doc: string, selection?: MarkdownEditorSelection | null, scroll = false): void {
  if (!view)
    return
  const length = view.state.doc.length
  let last = 0
  const fits = changes.every((change) => {
    const ok = change.from >= last && change.to >= change.from && change.to <= length
    last = change.to
    return ok
  }) && length + changeLengthDelta(changes) === doc.length
  view.dispatch({
    // Out of step (should not happen): take the shell's document as it is.
    changes: fits ? changes : { from: 0, to: length, insert: doc },
    selection: selection
      ? EditorSelection.single(clamp(selection.anchor, doc.length), clamp(selection.head, doc.length))
      : undefined,
    annotations: externalChange.of(true),
    scrollIntoView: scroll,
  })
}

function setSelection(selection: MarkdownEditorSelection, scroll = true): void {
  if (!view)
    return
  const length = view.state.doc.length
  view.dispatch({
    selection: EditorSelection.single(clamp(selection.anchor, length), clamp(selection.head, length)),
    scrollIntoView: scroll,
  })
}

/** Client box of the selection: the caret, or the lines it spans. */
function selectionRect(): { left: number, top: number, right: number, bottom: number } | null {
  if (!view)
    return null
  const { from, to, empty } = view.state.selection.main
  const start = view.coordsAtPos(from, 1)
  const end = empty ? start : view.coordsAtPos(to, -1)
  if (!start || !end)
    return null
  if (end.top >= start.bottom - 1) {
    // Several lines: the full width of the text they cover.
    const content = view.contentDOM.getBoundingClientRect()
    return { left: content.left, top: start.top, right: content.right, bottom: end.bottom }
  }
  return { left: Math.min(start.left, end.left), top: start.top, right: Math.max(start.right, end.right), bottom: end.bottom }
}

defineExpose({
  applyChanges,
  getDoc: () => view?.state.doc.toString() ?? props.doc,
  getSelection: (): MarkdownEditorSelection | null => (view ? selectionOf(view.state) : null),
  setSelection,
  focus: () => view?.focus(),
  blur: () => view?.contentDOM.blur(),
  hasFocus: () => view?.hasFocus ?? false,
  setOverlay: (overlay: EditorOverlay) => view?.dispatch({ effects: setSourceOverlay.of(overlay) }),
  selectionRect,
  scrollToPos: (pos: number) => {
    if (view)
      view.dispatch({ effects: EditorView.scrollIntoView(clamp(pos, view.state.doc.length), { y: 'center' }) })
  },
  getView: () => view,
})
</script>

<template>
  <div ref="host" class="tx-markdown-editor__source" />
</template>
