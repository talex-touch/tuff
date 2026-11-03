<script setup lang="ts">
import type { TxEmojiPack } from '../../icon/src/emoji-pack'
import type { MarkdownEmoji } from './emoji'
import type { MarkdownEditorHighlightColor, MarkdownEditorLabels, MarkdownEditorMode, MarkdownEditorToolbarActionKey } from './types'
import { hasDocument } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue'
import { TxBaseAnchor } from '../../base-anchor'
import { TxIcon } from '../../icon'
import MarkdownEditorEmojiPicker from './MarkdownEditorEmojiPicker.vue'
import MarkdownEditorHighlightPicker from './MarkdownEditorHighlightPicker.vue'
import { MARKDOWN_EDITOR_ACTION_ICONS, MARKDOWN_EDITOR_MODE_ICONS, MARKDOWN_EDITOR_UI_ICONS } from './toolbar-icons'

// Internal: the formatting row and mode switch of TxMarkdownEditor. The editor
// computes every command; this only reports which button was pressed.
defineOptions({ name: 'TxMarkdownEditorToolbar' })

const props = defineProps<{
  actions: MarkdownEditorToolbarActionKey[]
  labels: MarkdownEditorLabels
  mode: MarkdownEditorMode
  theme: 'light' | 'dark'
  disabled: boolean
  /** Formatting applies: an editable mode of an editable editor. */
  formatting: boolean
  canUndo: boolean
  canRedo: boolean
  pressed: ReadonlySet<string>
  /** The comments UI is on. */
  comments: boolean
  canComment: boolean
  commentCount: number
  commentsOpen: boolean
  /** The highlighter's colour: what the highlight button applies. */
  highlightColor: MarkdownEditorHighlightColor
  emojiPacks?: readonly TxEmojiPack[]
}>()

const emit = defineEmits<{
  'action': [action: MarkdownEditorToolbarActionKey]
  'mode': [mode: MarkdownEditorMode]
  'comment': []
  'toggle-comments': []
  'emoji': [emoji: MarkdownEmoji]
  'emoji-open': [open: boolean]
  /** A colour from the menu, or `null` to remove the highlight. */
  'highlight': [color: MarkdownEditorHighlightColor | null]
  'highlight-open': [open: boolean]
}>()

const MODES: MarkdownEditorMode[] = ['wysiwyg', 'source', 'preview']

const GROUPS: Record<MarkdownEditorToolbarActionKey, number> = {
  heading: 0,
  bold: 0,
  italic: 0,
  strike: 0,
  code: 0,
  highlight: 0,
  quote: 1,
  bulletList: 1,
  orderedList: 1,
  taskList: 1,
  link: 2,
  image: 2,
  table: 2,
  codeBlock: 2,
  math: 2,
  divider: 2,
  emoji: 2,
  undo: 3,
  redo: 3,
}

const TOGGLES = new Set<MarkdownEditorToolbarActionKey>([
  'heading',
  'bold',
  'italic',
  'strike',
  'code',
  'highlight',
  'quote',
  'bulletList',
  'orderedList',
  'taskList',
  'link',
  'codeBlock',
])

const SHORTCUTS: Partial<Record<MarkdownEditorToolbarActionKey | 'comment', string>> = {
  bold: 'B',
  italic: 'I',
  strike: 'Shift+X',
  code: 'E',
  highlight: 'Shift+H',
  link: 'K',
  undo: 'Z',
  redo: 'Shift+Z',
  comment: 'Alt+M',
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

function hint(label: string, key: MarkdownEditorToolbarActionKey | 'comment'): string {
  const shortcut = SHORTCUTS[key]
  if (!shortcut)
    return label
  if (!isMac)
    return `${label} (Ctrl+${shortcut})`
  // Option, Shift, Command, then the key: the order macOS menus print.
  const parts = shortcut.split('+')
  const glyphs = `${parts.includes('Alt') ? '\u2325' : ''}${parts.includes('Shift') ? '\u21E7' : ''}\u2318`
  return `${label} (${glyphs}${parts[parts.length - 1]})`
}

// The caller's order, with a separator wherever the group changes.
const items = computed(() => props.actions.map((action, index) => ({
  action,
  separated: index > 0 && GROUPS[action] !== GROUPS[props.actions[index - 1]!],
})))

function isDisabled(action: MarkdownEditorToolbarActionKey): boolean {
  if (props.disabled)
    return true
  if (action === 'undo')
    return !props.canUndo
  if (action === 'redo')
    return !props.canRedo
  return !props.formatting
}

const modeIndex = computed(() => Math.max(0, MODES.indexOf(props.mode)))

// Each opening mounts a menu afresh, so it takes focus again even when it
// reopens before its closing motion has finished.
const opens = ref(0)

const emojiOpen = ref(false)
watch(emojiOpen, (open) => {
  if (open)
    opens.value++
  emit('emoji-open', open)
})

function pickEmoji(emoji: MarkdownEmoji): void {
  emojiOpen.value = false
  emit('emoji', emoji)
}

const highlightOpen = ref(false)
// Opened with the keyboard, the menu takes focus; from the mouse, the editor
// keeps it. Read from the key or pointer that comes before the click: the
// anchor opens in a capture listener, and the menu mounts before the
// button's own click handler runs.
const highlightKeyboard = ref(false)

function onCaretKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ')
    highlightKeyboard.value = true
}
watch(highlightOpen, (open) => {
  if (open)
    opens.value++
  emit('highlight-open', open)
})

function pickHighlight(color: MarkdownEditorHighlightColor | null): void {
  highlightOpen.value = false
  emit('highlight', color)
}

// TxBaseAnchor closes either menu on Escape from a bubbling listener on the
// document, which hears the key after every ancestor of the editor and leaves
// it unclaimed: an overlay around the editor that closes on Escape would close
// along with the menu. While one is open, claim the key first, in the
// document's capture phase. Not from the menu itself: a highlight menu opened
// with the mouse leaves focus in the text.
function claimEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing)
    return
  if (!emojiOpen.value && !highlightOpen.value)
    return
  event.preventDefault()
  emojiOpen.value = false
  highlightOpen.value = false
}

watch(() => emojiOpen.value || highlightOpen.value, (open) => {
  if (!hasDocument())
    return
  if (open)
    document.addEventListener('keydown', claimEscape, true)
  else
    document.removeEventListener('keydown', claimEscape, true)
})

onBeforeUnmount(() => {
  if (hasDocument())
    document.removeEventListener('keydown', claimEscape, true)
})

const layerClass = computed(() => ['tx-markdown-editor-layer', `tx-markdown-editor-layer--${props.theme}`])

// One tab stop for the whole row; the arrow keys move between its buttons.
const root = ref<HTMLElement | null>(null)
let current = 0

function buttons(): HTMLButtonElement[] {
  return Array.from(root.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])
}

function syncTabStops(): void {
  const list = buttons()
  if (!list.length)
    return
  if (!list[current] || list[current]!.disabled)
    current = Math.max(0, list.findIndex(button => !button.disabled))
  list.forEach((button, index) => {
    button.tabIndex = index === current ? 0 : -1
  })
}

function onFocusIn(event: FocusEvent): void {
  const index = buttons().indexOf(event.target as HTMLButtonElement)
  if (index >= 0) {
    current = index
    syncTabStops()
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
    return
  const list = buttons().filter(button => !button.disabled)
  const index = list.indexOf(event.target as HTMLButtonElement)
  if (index < 0)
    return
  event.preventDefault()
  const next = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? list.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length
  list[next]!.focus()
}

onMounted(syncTabStops)
onUpdated(syncTabStops)

// Function refs: inside `v-for`, a named ref would collect an array.
let picker: InstanceType<typeof TxBaseAnchor> | null = null
let highlightPicker: InstanceType<typeof TxBaseAnchor> | null = null

function setPicker(instance: unknown): void {
  picker = instance as InstanceType<typeof TxBaseAnchor> | null
}

function setHighlightPicker(instance: unknown): void {
  highlightPicker = instance as InstanceType<typeof TxBaseAnchor> | null
}

defineExpose({
  /** Whether `target` is inside the emoji or highlight menu, which live outside the editor. */
  containsFloating: (target: Node): boolean => !!picker?.containsFloating(target) || !!highlightPicker?.containsFloating(target),
})
</script>

<template>
  <div
    ref="root"
    class="tx-markdown-editor__toolbar"
    role="toolbar"
    :aria-label="labels.toolbar"
    @mousedown.prevent
    @focusin="onFocusIn"
    @keydown="onKeydown"
  >
    <div class="tx-markdown-editor__actions">
      <template v-for="item in items" :key="item.action">
        <span v-if="item.separated" class="tx-markdown-editor__separator" aria-hidden="true" />
        <TxBaseAnchor
          v-if="item.action === 'emoji'"
          :ref="setPicker"
          v-model="emojiOpen"
          :class="layerClass"
          :data-theme="theme"
          reference-class="tx-markdown-editor__anchor"
          placement="bottom-start"
          :offset="6"
          :width="316"
          :max-width="316"
          :max-height="380"
          :panel-padding="8"
          :disabled="isDisabled('emoji')"
        >
          <template #reference>
            <button
              type="button"
              class="tx-markdown-editor__button"
              :class="{ 'is-active': emojiOpen }"
              :aria-label="labels.emoji"
              :aria-expanded="emojiOpen"
              aria-haspopup="dialog"
              :title="labels.emoji"
              :disabled="isDisabled('emoji')"
            >
              <TxIcon :name="MARKDOWN_EDITOR_ACTION_ICONS.emoji" :size="16" />
            </button>
          </template>
          <MarkdownEditorEmojiPicker :key="opens" :labels="labels" :packs="emojiPacks" @pick="pickEmoji" />
        </TxBaseAnchor>
        <span
          v-else-if="item.action === 'highlight'"
          class="tx-markdown-editor__split"
          :style="{ '--tx-markdown-editor-pen': `var(--tx-markdown-editor-highlight-${highlightColor})` }"
        >
          <button
            type="button"
            class="tx-markdown-editor__button"
            :class="{ 'is-active': pressed.has('highlight') }"
            :aria-label="labels.highlight"
            :aria-pressed="pressed.has('highlight')"
            :title="hint(labels.highlight, 'highlight')"
            :disabled="isDisabled('highlight')"
            @click="emit('action', 'highlight')"
          >
            <TxIcon :name="MARKDOWN_EDITOR_ACTION_ICONS.highlight" :size="16" />
            <span class="tx-markdown-editor__pen" aria-hidden="true" />
          </button>
          <TxBaseAnchor
            :ref="setHighlightPicker"
            v-model="highlightOpen"
            :class="layerClass"
            :data-theme="theme"
            reference-class="tx-markdown-editor__anchor"
            placement="bottom-start"
            :offset="6"
            :width="168"
            :panel-padding="6"
            :disabled="isDisabled('highlight')"
          >
            <template #reference>
              <button
                type="button"
                class="tx-markdown-editor__button is-caret"
                :class="{ 'is-active': highlightOpen }"
                :aria-label="labels.highlightColors"
                :aria-expanded="highlightOpen"
                aria-haspopup="menu"
                :title="labels.highlightColors"
                :disabled="isDisabled('highlight')"
                @keydown="onCaretKeydown"
                @pointerdown="highlightKeyboard = false"
              >
                <TxIcon :name="MARKDOWN_EDITOR_UI_ICONS.highlightMenu" :size="12" />
              </button>
            </template>
            <MarkdownEditorHighlightPicker
              :key="opens"
              :labels="labels"
              :color="highlightColor"
              :autofocus="highlightKeyboard"
              @pick="pickHighlight"
            />
          </TxBaseAnchor>
        </span>
        <button
          v-else
          type="button"
          class="tx-markdown-editor__button"
          :class="{ 'is-active': pressed.has(item.action) }"
          :aria-label="labels[item.action]"
          :aria-pressed="TOGGLES.has(item.action) ? pressed.has(item.action) : undefined"
          :title="hint(labels[item.action], item.action)"
          :disabled="isDisabled(item.action)"
          @click="emit('action', item.action)"
        >
          <TxIcon :name="MARKDOWN_EDITOR_ACTION_ICONS[item.action]" :size="16" />
        </button>
      </template>
    </div>

    <div class="tx-markdown-editor__trailing">
      <template v-if="comments">
        <button
          type="button"
          class="tx-markdown-editor__button"
          :aria-label="labels.comment"
          :title="hint(labels.comment, 'comment')"
          :disabled="disabled || !canComment"
          @click="emit('comment')"
        >
          <TxIcon :name="MARKDOWN_EDITOR_UI_ICONS.comment" :size="16" />
        </button>
        <button
          type="button"
          class="tx-markdown-editor__button is-counted"
          :class="{ 'is-active': commentsOpen }"
          :aria-label="labels.comments"
          :aria-pressed="commentsOpen"
          :title="labels.comments"
          @click="emit('toggle-comments')"
        >
          <TxIcon :name="MARKDOWN_EDITOR_UI_ICONS.comments" :size="16" />
          <span v-if="commentCount" class="tx-markdown-editor__count">{{ commentCount }}</span>
        </button>
        <span class="tx-markdown-editor__separator" aria-hidden="true" />
      </template>

      <div
        class="tx-markdown-editor__modes"
        role="group"
        :aria-label="labels.modeGroup"
        :style="{ '--tx-markdown-editor-mode-index': modeIndex }"
      >
        <span class="tx-markdown-editor__mode-thumb" aria-hidden="true" />
        <button
          v-for="item in MODES"
          :key="item"
          type="button"
          class="tx-markdown-editor__mode"
          :class="{ 'is-active': mode === item }"
          :aria-label="labels[item]"
          :aria-pressed="mode === item"
          :title="labels[item]"
          :disabled="disabled"
          @click="emit('mode', item)"
        >
          <TxIcon :name="MARKDOWN_EDITOR_MODE_ICONS[item]" :size="15" />
          <span class="tx-markdown-editor__mode-label">{{ labels[item] }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.tx-markdown-editor__toolbar {
  container-type: inline-size;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 12px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--tx-markdown-editor-border);
  background: var(--tx-markdown-editor-toolbar-bg);
}

.tx-markdown-editor__actions,
.tx-markdown-editor__trailing {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

// Kept at the end of the row, also when it wraps onto a row of its own.
.tx-markdown-editor__trailing {
  flex: none;
  gap: 4px;
  margin-left: auto;
}

.tx-markdown-editor__anchor {
  display: inline-flex;
}

.tx-markdown-editor__split {
  display: inline-flex;
  flex: none;

  > .tx-markdown-editor__button {
    border-radius: 7px 0 0 7px;
  }

  .tx-markdown-editor__button.is-caret {
    min-width: 16px;
    padding: 0 2px;
    border-radius: 0 7px 7px 0;
  }
}

// The colour the button applies, under its glyph.
.tx-markdown-editor__pen {
  position: absolute;
  right: 8px;
  bottom: 3px;
  left: 8px;
  height: 3px;
  border-radius: 2px;
  background: var(--tx-markdown-editor-pen);
  pointer-events: none;
}

.tx-markdown-editor__button:disabled .tx-markdown-editor__pen {
  background: currentColor;
}

.tx-markdown-editor__separator {
  flex: none;
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: var(--tx-markdown-editor-border);
}

.tx-markdown-editor__button {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--tx-markdown-editor-muted);
  font: inherit;
  font-size: 12px;
  font-weight: var(--tx-font-weight-semibold, 600);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--tx-markdown-editor-text) 7%, transparent);
    color: var(--tx-markdown-editor-text);
  }

  &.is-active {
    background: color-mix(in srgb, var(--tx-markdown-editor-accent) 14%, transparent);
    color: var(--tx-markdown-editor-accent);
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--tx-markdown-editor-accent) 55%, transparent);
    outline-offset: 1px;
  }

  &:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }
}

.tx-markdown-editor__count {
  min-width: 14px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.tx-markdown-editor__modes {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 2px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--tx-markdown-editor-text) 6%, transparent);
}

.tx-markdown-editor__mode-thumb {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: calc((100% - 4px) / 3);
  border-radius: 7px;
  background: var(--tx-markdown-editor-bg-raised);
  box-shadow:
    0 0 0 1px var(--tx-markdown-editor-border),
    0 1px 2px rgb(0 0 0 / 8%);
  transform: translateX(calc(var(--tx-markdown-editor-mode-index, 0) * 100%));
  pointer-events: none;
}

.tx-markdown-editor__mode {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--tx-markdown-editor-muted);
  font: inherit;
  font-size: 13px;
  font-weight: var(--tx-font-weight-medium, 500);
  white-space: nowrap;
  cursor: pointer;

  &:hover:not(:disabled, .is-active) {
    color: var(--tx-markdown-editor-text);
  }

  &.is-active {
    color: var(--tx-markdown-editor-text);
    font-weight: var(--tx-font-weight-semibold, 600);
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--tx-markdown-editor-accent) 55%, transparent);
    outline-offset: 1px;
  }

  &:disabled {
    opacity: 0.38;
    cursor: not-allowed;
  }
}

.tx-markdown-editor__mode-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

@container (max-width: 520px) {
  .tx-markdown-editor__mode {
    padding: 0 8px;
  }

  .tx-markdown-editor__mode-label {
    display: none;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .tx-markdown-editor__mode-thumb {
    transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
  }
}
</style>
