<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { AiAttachment } from '../../ai-elements/src/types'
import type {
  PromptBarCommand,
  PromptBarModel,
  PromptBarProps,
  PromptBarSendPayload,
  PromptBarSource,
} from './types'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import TxPromptBarMenu from './TxPromptBarMenu.vue'
import { useAutosize } from './use-autosize'
import { useTokenMenu } from './use-token-menu'

defineOptions({ name: 'TxPromptBar' })

const props = withDefaults(defineProps<PromptBarProps>(), {
  // An absent Boolean prop is cast to `false` unless a default is declared, so
  // `listening` has to opt out explicitly — otherwise it can never read as
  // "the host is not driving this" and the uncontrolled path is unreachable.
  listening: undefined,
  variant: 'rounded',
  placeholder: 'Write a message…',
  listeningPlaceholder: 'Listening…',
  minHeight: 28,
  maxHeight: 100,
  sendOnEnter: true,
  allowEmptySend: false,
  dictatable: false,
  sourcesHintText: 'Type to search sources & files',
  commandsHintText: 'Type to search commands',
  connectText: 'Connect',
  connectedText: 'Connected',
  sendLabel: 'Send',
  attachLabel: 'Add attachments and sources',
  modelLabel: 'Choose model',
  startDictationLabel: 'Start dictation',
  stopDictationLabel: 'Stop dictation',
  attachmentFallbackLabel: 'Attachment',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:model': [key: string]
  'update:listening': [listening: boolean]
  'send': [payload: PromptBarSendPayload]
  'attach': []
  'attachmentRemove': [id: string]
  'attachmentAdd': [files: File[]]
  'sourceSelect': [source: PromptBarSource]
  'commandSelect': [command: PromptBarCommand]
  'connectToggle': [source: PromptBarSource]
  'paste': [event: ClipboardEvent]
  'focus': [event: FocusEvent]
  'blur': [event: FocusEvent]
}>()

defineSlots<{
  /** Leading glyph for an `@` row — brand marks stay with the host. */
  'source-icon'?: (props: { source: PromptBarSource }) => unknown
  /** Replaces the attachment chip strip wholesale. */
  'attachments'?: (props: { attachments: AiAttachment[] }) => unknown
  /** Extra controls, inserted just before the send button. */
  'actions'?: (props: { send: () => void, canSend: boolean }) => unknown
}>()

const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const measureRef = ref<HTMLElement | null>(null)
const controlsRef = ref<HTMLElement | null>(null)
const leadRef = ref<HTMLElement | null>(null)
const trailRef = ref<HTMLElement | null>(null)

const uid = useId()
const tokenListboxId = `${uid}-sources`
const modelListboxId = `${uid}-models`

// Controlled where the host binds, self-held where it does not: an unbound
// composer that silently refuses to accept text would be a trap.
const internalDraft = ref('')
const internalModel = ref<string | undefined>(undefined)
const internalListening = ref(false)

const draft = computed(() => props.modelValue ?? internalDraft.value)
const attachments = computed(() => props.attachments ?? [])
const models = computed(() => props.models ?? [])
const listening = computed(() => props.listening ?? internalListening.value)

const plusOpen = ref(false)
const modelOpen = ref(false)
/** Explicit model highlight; `null` falls back to the selected row. */
const modelActive = ref<number | null>(null)
const composing = ref(false)

const tokenMenu = useTokenMenu<PromptBarSource, PromptBarCommand>({
  draft,
  sources: () => props.sources,
  commands: () => props.commands,
  forced: plusOpen,
})

const { menu, rows, activeIndex, engaged } = tokenMenu

const hasSources = computed(() => (props.sources?.length ?? 0) > 0)
/** Without rows to offer, the textarea is a plain text box, not a combobox. */
const mentionsEnabled = computed(() => hasSources.value || (props.commands?.length ?? 0) > 0)
const menuOpen = computed(() => Boolean(menu.value) && !props.disabled)
const anyMenuOpen = computed(() => menuOpen.value || modelOpen.value)

const selectedModelKey = computed(() => props.model ?? internalModel.value ?? models.value[0]?.key)
const selectedModelIndex = computed(() =>
  models.value.findIndex(entry => entry.key === selectedModelKey.value),
)
const selectedModel = computed(() => models.value[selectedModelIndex.value])
const modelHighlightIndex = computed(() => modelActive.value ?? selectedModelIndex.value)

const canSend = computed(
  () =>
    !props.disabled
    && !props.submitting
    && (props.allowEmptySend || draft.value.trim().length > 0 || attachments.value.length > 0),
)

const placeholder = computed(() => (listening.value ? props.listeningPlaceholder : props.placeholder))

const menuFooterText = computed(() =>
  menu.value === 'slash' ? props.commandsHintText : props.sourcesHintText,
)

const menuEmptyText = computed(() => {
  const format = props.emptyTextFormatter ?? ((query: string) => `No matches for "${query}"`)
  return format(tokenMenu.query.value)
})

const activeDescendant = computed(() => {
  if (!menuOpen.value || !engaged.value || rows.value.length === 0)
    return undefined
  return tokenOptionId(activeIndex.value)
})

const modelDescendant = computed(() => {
  if (!modelOpen.value || modelActive.value === null)
    return undefined
  return modelOptionId(modelHighlightIndex.value)
})

const { expanded } = useAutosize({
  textarea: inputRef,
  measure: measureRef,
  controls: controlsRef,
  fixed: () => [leadRef.value, trailRef.value],
  value: draft,
  minHeight: () => props.minHeight,
  maxHeight: () => props.maxHeight,
})

function tokenOptionId(index: number): string {
  return `${tokenListboxId}-${index}`
}

function modelOptionId(index: number): string {
  return `${modelListboxId}-${index}`
}

function updateDraft(value: string): void {
  internalDraft.value = value
  emit('update:modelValue', value)
}

function focus(): void {
  inputRef.value?.focus()
}

function closeMenus(): void {
  plusOpen.value = false
  modelOpen.value = false
}

function dismissMenus(): void {
  closeMenus()
  tokenMenu.dismiss()
}

function disengage(): void {
  engaged.value = false
}

function isSourceRow(_row: PromptBarSource | PromptBarCommand): _row is PromptBarSource {
  return menu.value === 'at'
}

function pickRow(row: PromptBarSource | PromptBarCommand): void {
  if (isSourceRow(row)) {
    // A row that still needs connecting has exactly one meaning, so activating
    // it anywhere connects. Upstream nests a second control inside the option,
    // which no keyboard can reach and which an assistive tree cannot express.
    if (row.connectable && !row.connected) {
      emit('connectToggle', row)
      return
    }

    if (row.attach) {
      const pending = tokenMenu.token.value
      if (pending)
        updateDraft(draft.value.slice(0, pending.start))
      emit('attach')
      closeMenus()
      focus()
      return
    }

    updateDraft(tokenMenu.insert(`@${row.name}`))
    emit('sourceSelect', row)
  }
  else {
    updateDraft(tokenMenu.insert(row.name))
    emit('commandSelect', row as PromptBarCommand)
  }

  closeMenus()
  focus()
}

function send(): void {
  if (!canSend.value)
    return

  emit('send', { text: draft.value, attachments: attachments.value })
  updateDraft('')
  closeMenus()
}

function togglePlus(): void {
  modelOpen.value = false
  plusOpen.value = !plusOpen.value
  tokenMenu.resume()
  focus()
}

function toggleModelMenu(): void {
  plusOpen.value = false
  modelOpen.value = !modelOpen.value
}

function selectModel(entry: PromptBarModel): void {
  internalModel.value = entry.key
  emit('update:model', entry.key)
  modelOpen.value = false
}

function moveModel(direction: 1 | -1): void {
  const total = models.value.length
  if (total === 0)
    return

  // Opening with a key adopts the current selection rather than stepping off
  // it, so the first press never skips the model already in use.
  if (modelActive.value === null) {
    modelActive.value
      = selectedModelIndex.value < 0 ? (direction === 1 ? 0 : total - 1) : selectedModelIndex.value
    return
  }

  modelActive.value = (modelActive.value + (direction === 1 ? 1 : total - 1)) % total
}

function toggleListening(): void {
  const next = !listening.value
  internalListening.value = next
  emit('update:listening', next)
}

function onInput(event: Event): void {
  plusOpen.value = false
  updateDraft((event.target as HTMLTextAreaElement).value)
}

function onKeydown(event: KeyboardEvent): void {
  // Enter confirms an IME candidate long before it means "send" — upstream
  // guards the send path but not the menu path, so a candidate chosen with the
  // menu open picks a row instead of committing the text.
  const isComposing = event.isComposing || event.keyCode === 229 || composing.value

  if (menuOpen.value && rows.value.length > 0 && !isComposing) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      tokenMenu.move(event.key === 'ArrowDown' ? 1 : -1)
      return
    }

    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
      const row = tokenMenu.activeRow.value
      if (row) {
        event.preventDefault()
        pickRow(row)
        return
      }
    }
  }

  if (event.key === 'Escape') {
    if (anyMenuOpen.value) {
      // Only swallow Escape when it actually closed something, so a host
      // dialog still closes when the composer has nothing open.
      event.preventDefault()
      event.stopPropagation()
    }
    dismissMenus()
    return
  }

  if (event.key === 'Enter' && !event.shiftKey && !isComposing && props.sendOnEnter) {
    event.preventDefault()
    send()
  }
}

function onModelKeydown(event: KeyboardEvent): void {
  if (!modelOpen.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      plusOpen.value = false
      modelOpen.value = true
      moveModel(event.key === 'ArrowDown' ? 1 : -1)
    }
    return
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveModel(event.key === 'ArrowDown' ? 1 : -1)
    return
  }

  if (event.key === 'Enter' || event.key === ' ') {
    const entry = models.value[modelHighlightIndex.value]
    if (entry) {
      event.preventDefault()
      selectModel(entry)
    }
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    modelOpen.value = false
  }
}

function onPaste(event: ClipboardEvent): void {
  emit('paste', event)

  const files = Array.from(event.clipboardData?.items ?? [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => Boolean(file))

  if (files.length > 0)
    emit('attachmentAdd', files)
}

function onDrop(event: DragEvent): void {
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length > 0)
    emit('attachmentAdd', files)
}

function attachmentLabel(attachment: AiAttachment): string {
  return attachment.name ?? props.attachmentFallbackLabel
}

function removeLabel(attachment: AiAttachment): string {
  const format
    = props.removeAttachmentLabelFormatter ?? ((name: string) => `Remove ${name}`)
  return format(attachmentLabel(attachment))
}

function onDocumentPointerDown(event: Event): void {
  const root = rootRef.value
  if (!root || root.contains(event.target as Node))
    return

  dismissMenus()
}

// Upstream leaves both popups open when the reader clicks away.
watch(
  anyMenuOpen,
  (open) => {
    if (typeof document === 'undefined')
      return

    if (open)
      document.addEventListener('pointerdown', onDocumentPointerDown, true)
    else
      document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  },
  { immediate: true },
)

watch(modelOpen, (open) => {
  if (!open)
    modelActive.value = null
})

onBeforeUnmount(() => {
  if (typeof document !== 'undefined')
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})

defineExpose({
  focus,
  /** Splices text in at the end of the draft, keeping a word separator. */
  insert: (text: string) => {
    const current = draft.value
    const separator = current.length > 0 && !/\s$/.test(current) ? ' ' : ''
    updateDraft(`${current}${separator}${text}`)
  },
  closeMenus,
  /** Reads as `boolean`: the instance proxy unwraps exposed refs. */
  menuOpen: anyMenuOpen,
})
</script>

<template>
  <div
    ref="rootRef"
    class="tx-bui-prompt-bar"
    :class="[`is-${variant}`, { 'is-disabled': disabled }]"
  >
    <TxPromptBarMenu
      v-if="menuOpen"
      :id="tokenListboxId"
      :rows="rows"
      :active-index="activeIndex"
      :engaged="engaged"
      :selected-index="activeIndex"
      :option-id="tokenOptionId"
      :row-height="36"
      :empty-text="menuEmptyText"
      :footer-text="menuFooterText"
      :label="menu === 'slash' ? commandsHintText : sourcesHintText"
      @pick="pickRow"
      @hover="tokenMenu.engage"
      @leave="disengage"
    >
      <template #row="{ row }">
        <span
          v-if="menu === 'at' && $slots['source-icon']"
          class="tx-bui-prompt-bar__row-icon"
          aria-hidden="true"
        >
          <slot name="source-icon" :source="(row as PromptBarSource)" />
        </span>
        <span class="tx-bui-prompt-bar__row-name">{{ row.name }}</span>
        <span class="tx-bui-prompt-bar__row-desc">{{ row.desc }}</span>
        <span
          v-if="menu === 'at' && (row as PromptBarSource).connectable"
          class="tx-bui-prompt-bar__row-connect"
          :class="{ 'is-connected': (row as PromptBarSource).connected }"
        >
          {{ (row as PromptBarSource).connected ? connectedText : connectText }}
        </span>
      </template>
    </TxPromptBarMenu>

    <TxPromptBarMenu
      v-if="modelOpen"
      :id="modelListboxId"
      :rows="models"
      :active-index="modelHighlightIndex"
      :engaged="modelActive !== null"
      :selected-index="selectedModelIndex"
      :option-id="modelOptionId"
      :row-height="30"
      :width="176"
      align="end"
      :label="modelLabel"
      @pick="selectModel"
      @hover="modelActive = $event"
      @leave="modelActive = null"
    >
      <template #row="{ row, selected }">
        <span class="tx-bui-prompt-bar__row-name is-grow">{{ row.name }}</span>
        <span v-if="row.tag" class="tx-bui-prompt-bar__row-tag">{{ row.tag }}</span>
        <span class="tx-bui-prompt-bar__row-check" :class="{ 'is-on': selected }" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </span>
      </template>
    </TxPromptBarMenu>

    <div
      class="tx-bui-prompt-bar__composer"
      :class="{ 'is-relaxed': attachments.length > 0 || expanded }"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <span ref="measureRef" class="tx-bui-prompt-bar__measure" aria-hidden="true">{{ draft }}</span>

      <slot name="attachments" :attachments="attachments">
        <div v-if="attachments.length > 0" class="tx-bui-prompt-bar__attachments">
          <span
            v-for="attachment in attachments"
            :key="attachment.id"
            class="tx-bui-prompt-bar__attachment"
          >
            <span class="tx-bui-prompt-bar__attachment-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
            </span>
            <span class="tx-bui-prompt-bar__attachment-name">{{ attachmentLabel(attachment) }}</span>
            <button
              type="button"
              class="tx-bui-prompt-bar__attachment-remove"
              :aria-label="removeLabel(attachment)"
              @click="emit('attachmentRemove', attachment.id)"
            >
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </span>
        </div>
      </slot>

      <div
        ref="controlsRef"
        class="tx-bui-prompt-bar__controls"
        :class="{ 'is-expanded': expanded, 'is-leadless': !hasSources }"
      >
        <div v-if="hasSources" ref="leadRef" class="tx-bui-prompt-bar__lead">
          <button
            type="button"
            class="tx-bui-prompt-bar__control tx-bui-prompt-bar__plus"
            :class="{ 'is-on': plusOpen }"
            :aria-label="attachLabel"
            :aria-expanded="plusOpen"
            :disabled="disabled"
            @click="togglePlus"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        <textarea
          ref="inputRef"
          class="tx-bui-prompt-bar__input"
          rows="1"
          :value="draft"
          :placeholder="placeholder"
          :aria-label="ariaLabel ?? placeholder"
          :disabled="disabled"
          :role="mentionsEnabled ? 'combobox' : undefined"
          :aria-haspopup="mentionsEnabled ? 'listbox' : undefined"
          :aria-autocomplete="mentionsEnabled ? 'list' : undefined"
          :aria-expanded="mentionsEnabled ? menuOpen : undefined"
          :aria-controls="menuOpen ? tokenListboxId : undefined"
          :aria-activedescendant="activeDescendant"
          @input="onInput"
          @keydown="onKeydown"
          @compositionstart="composing = true"
          @compositionend="composing = false"
          @paste="onPaste"
          @focus="emit('focus', $event)"
          @blur="emit('blur', $event)"
        />

        <div ref="trailRef" class="tx-bui-prompt-bar__trail">
          <button
            v-if="models.length > 0"
            type="button"
            class="tx-bui-prompt-bar__model"
            :aria-label="modelLabel"
            role="combobox"
            aria-haspopup="listbox"
            :aria-expanded="modelOpen"
            :aria-controls="modelOpen ? modelListboxId : undefined"
            :aria-activedescendant="modelDescendant"
            :disabled="disabled"
            @click="toggleModelMenu"
            @keydown="onModelKeydown"
          >
            {{ selectedModel?.name }}
            <span class="tx-bui-prompt-bar__model-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>

          <button
            v-if="dictatable"
            type="button"
            class="tx-bui-prompt-bar__control tx-bui-prompt-bar__dictate"
            :class="{ 'is-on': listening }"
            :aria-label="listening ? stopDictationLabel : startDictationLabel"
            :aria-pressed="listening"
            :disabled="disabled"
            @click="toggleListening"
          >
            <span v-if="listening" class="tx-bui-prompt-bar__bars" aria-hidden="true">
              <span class="tx-bui-prompt-bar__bar" />
              <span class="tx-bui-prompt-bar__bar" />
              <span class="tx-bui-prompt-bar__bar" />
            </span>
            <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
            </svg>
          </button>

          <slot name="actions" :send="send" :can-send="canSend" />

          <button
            type="button"
            class="tx-bui-prompt-bar__control tx-bui-prompt-bar__send"
            :class="{ 'is-ready': canSend }"
            :aria-label="sendLabel"
            :disabled="!canSend"
            @click="send"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-pop-in;
@include bui-keyframes-eq-bounce;

.tx-bui-prompt-bar {
  @include bui-scope;

  position: relative;
  width: 100%;

  .tx-bui-prompt-bar__composer {
    // The card edge is a spread ring, not a border: it costs no layout, and
    // focus recolours it by swapping one variable.
    --tx-bui-prompt-bar-ring: var(--tx-bui-line, #ecedef);
    --tx-bui-prompt-bar-cast: 0 1px 2px #1018280a, 0 2px 6px #10182808;

    position: relative;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    overflow: hidden;
    border-radius: 14px;
    background: var(--tx-bui-surface, #fff);
    box-shadow: 0 0 0 1px var(--tx-bui-prompt-bar-ring), var(--tx-bui-prompt-bar-cast);
    transition: box-shadow 0.15s ease, border-radius 0.15s ease;

    &:focus-within {
      --tx-bui-prompt-bar-ring: var(--tx-bui-line-strong, #e0e2e5);
    }
  }

  // Measures the draft as a single unwrapped line — the answer to "does this
  // still fit beside the controls?".
  .tx-bui-prompt-bar__measure {
    position: absolute;
    visibility: hidden;
    pointer-events: none;
    white-space: pre;
    font-size: 13px;
    line-height: 18px;
  }

  .tx-bui-prompt-bar__attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 2px 2px 0;
  }

  .tx-bui-prompt-bar__attachment {
    @include bui-pop-in(200ms);

    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 4px 4px 4px 6px;
    border-radius: var(--tx-bui-radius-chip, 6px);
    background: var(--tx-bui-field, #f2f2f3);
    box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
    color: var(--tx-bui-ink-2, #62656b);
    font-size: 11.5px;
  }

  .tx-bui-prompt-bar__attachment-icon {
    display: flex;
    flex: none;
  }

  .tx-bui-prompt-bar__attachment-name {
    max-width: 144px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-bui-prompt-bar__attachment-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    color: var(--tx-bui-ink-3, #9a9da3);
    cursor: pointer;
    transition: background-color 0.1s ease, color 0.1s ease;

    &:hover {
      background: color-mix(in oklab, var(--tx-bui-line, #ecedef) 70%, transparent);
      color: var(--tx-bui-ink, #1f2124);
    }
  }

  .tx-bui-prompt-bar__controls {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas: 'lead input trail';
    gap: 6px 4px;
    align-items: end;

    // Once the draft outgrows the inline row it takes a row of its own and the
    // controls drop beneath it.
    &.is-expanded {
      grid-template-areas:
        'input input input'
        'lead . trail';
    }

    &.is-leadless {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: 'input trail';

      &.is-expanded {
        grid-template-areas:
          'input input'
          '. trail';
      }
    }
  }

  .tx-bui-prompt-bar__lead {
    grid-area: lead;
    display: flex;
    justify-self: start;
  }

  .tx-bui-prompt-bar__trail {
    grid-area: trail;
    display: flex;
    align-items: flex-end;
    gap: 4px;
  }

  .tx-bui-prompt-bar__input {
    grid-area: input;
    min-width: 0;
    width: 100%;
    padding: 5px 4px;
    border: 0;
    background: transparent;
    color: var(--tx-bui-ink, #1f2124);
    font: inherit;
    font-size: 13px;
    line-height: 18px;
    resize: none;
    outline: none;
    overflow-wrap: anywhere;

    &::placeholder {
      color: var(--tx-bui-ink-3, #9a9da3);
    }
  }

  // Press feedback is written out rather than pulled from `bui-press-scale`:
  // that mixin carries its own `transition`, and these controls need a
  // multi-property one that would have to override it right back.
  .tx-bui-prompt-bar__control {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 28px;
    height: 28px;
    border-radius: var(--tx-bui-radius-control, 8px);
    color: var(--tx-bui-ink-3, #9a9da3);
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease,
      transform 0.15s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

    &:not(:disabled):active {
      transform: scale(0.94);
    }

    &:disabled {
      cursor: not-allowed;
    }
  }

  .tx-bui-prompt-bar__plus,
  .tx-bui-prompt-bar__dictate {
    &:not(:disabled):hover {
      background: var(--tx-bui-hover, #f4f5f6);
      color: var(--tx-bui-ink, #1f2124);
    }
  }

  .tx-bui-prompt-bar__plus.is-on {
    background: var(--tx-bui-hover, #f4f5f6);
    color: var(--tx-bui-ink, #1f2124);
  }

  .tx-bui-prompt-bar__dictate.is-on {
    background: var(--tx-bui-accent-tint, #e9f3ff);
    color: var(--tx-bui-accent-ink, #0170dd);

    &:hover {
      background: var(--tx-bui-accent-tint, #e9f3ff);
      color: var(--tx-bui-accent-ink, #0170dd);
    }
  }

  // Ink, not accent: the primary action carrying the palette's darkest neutral
  // is this family's signature, and the accent is spent on live state instead.
  .tx-bui-prompt-bar__send {
    background: var(--tx-bui-line-strong, #e0e2e5);
    color: var(--tx-bui-ink-2, #62656b);

    &.is-ready {
      background: var(--tx-bui-ink, #1f2124);
      color: var(--tx-bui-surface, #fff);
    }
  }

  .tx-bui-prompt-bar__model {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: none;
    height: 28px;
    padding: 0 6px;
    border-radius: var(--tx-bui-radius-control, 8px);
    color: var(--tx-bui-ink-2, #62656b);
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease,
      transform 0.15s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

    &:not(:disabled):hover {
      background: var(--tx-bui-hover, #f4f5f6);
      color: var(--tx-bui-ink, #1f2124);
    }

    &:not(:disabled):active {
      transform: scale(0.94);
    }

    &:disabled {
      cursor: not-allowed;
    }
  }

  .tx-bui-prompt-bar__model-chevron {
    display: flex;
    color: var(--tx-bui-ink-3, #9a9da3);
  }

  // Dictation equaliser: three bars on the same cycle, staggered so the group
  // reads as one moving shape.
  .tx-bui-prompt-bar__bars {
    display: flex;
    align-items: center;
    gap: 2.5px;
    height: 14px;
  }

  .tx-bui-prompt-bar__bar {
    width: 2.5px;
    height: 100%;
    border-radius: 999px;
    background: currentcolor;
    transform-origin: center;
    animation: tx-bui-eq-bounce 900ms ease-in-out infinite;

    &:nth-child(2) {
      animation-delay: 150ms;
    }

    &:nth-child(3) {
      animation-delay: 300ms;
    }
  }

  // Menu row content — owned here because the menu shell is generic.
  .tx-bui-prompt-bar__row-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 22px;
    height: 22px;
    color: var(--tx-bui-ink-2, #62656b);
  }

  .tx-bui-prompt-bar__row-name {
    flex: none;
    color: var(--tx-bui-ink, #1f2124);
    font-size: 12.5px;
    font-weight: 500;

    &.is-grow {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .tx-bui-prompt-bar__row-desc {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--tx-bui-ink-3, #9a9da3);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-bui-prompt-bar__row-tag {
    flex: none;
    color: var(--tx-bui-ink-3, #9a9da3);
    font-size: 11px;
  }

  .tx-bui-prompt-bar__row-connect {
    flex: none;
    color: var(--tx-bui-accent-ink, #0170dd);
    font-size: 12px;
    font-weight: 500;

    &.is-connected {
      color: var(--tx-bui-green, #189a4d);
    }
  }

  .tx-bui-prompt-bar__row-check {
    display: flex;
    flex: none;
    color: var(--tx-bui-ink, #1f2124);
    visibility: hidden;

    &.is-on {
      visibility: visible;
    }
  }

  &.is-disabled .tx-bui-prompt-bar__composer {
    opacity: 0.65;
  }

  // Pill: every corner goes round, and the shell relaxes to a softer radius the
  // moment it stops being a single line.
  &.is-pill {
    .tx-bui-prompt-bar__composer {
      border-radius: 999px;

      &.is-relaxed {
        border-radius: 24px;
      }
    }

    .tx-bui-prompt-bar__attachments {
      padding-inline: 4px;
    }

    .tx-bui-prompt-bar__attachment,
    .tx-bui-prompt-bar__attachment-remove,
    .tx-bui-prompt-bar__control,
    .tx-bui-prompt-bar__model {
      border-radius: 999px;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-bui-prompt-bar {
    .tx-bui-prompt-bar__composer,
    .tx-bui-prompt-bar__attachment-remove,
    .tx-bui-prompt-bar__control,
    .tx-bui-prompt-bar__model {
      transition: none;
    }

    .tx-bui-prompt-bar__control:active,
    .tx-bui-prompt-bar__model:active {
      transform: none;
    }

    // The equaliser is the only signal that dictation is live, so it holds its
    // shape rather than disappearing.
    .tx-bui-prompt-bar__bar {
      animation: none;
      transform: scaleY(0.7);
    }
  }
}
</style>
