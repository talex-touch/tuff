<script setup lang="ts">
import type { AiAttachmentFile } from '@talex-touch/tuffex/ai-elements'
import type { PromptBarCommand, PromptBarModel, PromptBarSource } from '@talex-touch/tuffex/prompt-bar'
import type { TxAiComposerProps } from '../../types'
import { TxAttachmentTray } from '@talex-touch/tuffex/attachment-tray'
import { TxBorderBeam } from '@talex-touch/tuffex/border-beam'
import { useTokenMenu } from '@talex-touch/tuffex/prompt-bar'
import { TxVoiceBeam } from '@talex-touch/tuffex/voice-beam'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { animateComposerBoxMorph, animateComposerLaunch, measureElementSize } from '../../utils/composer-motion'
import { deriveAiSendState, normalizeComposerAttachments } from '../../utils/composer-state'
import TxAiComposerControl from './TxAiComposerControl.vue'
import TxAiComposerMic from './TxAiComposerMic.vue'
import TxAiComposerSendIsland from './TxAiComposerSendIsland.vue'
import TxAiContextMeter from './TxAiContextMeter.vue'
import TxAiRunStatus from './TxAiRunStatus.vue'
import TxAiTokenMenu, { type TxAiTokenMenuRow } from './TxAiTokenMenu.vue'
import TxAiVoiceDraft from './TxAiVoiceDraft.vue'

defineOptions({
  name: 'TxAiComposer',
})

const props = withDefaults(defineProps<TxAiComposerProps>(), {
  modelValue: '',
  variant: 'rounded',
  surface: 'solid',
  placeholder: 'Write a message…',
  disabled: false,
  submitting: false,
  busy: false,
  queuedCount: 0,
  attachments: () => [],
  allowAttachmentWhileSubmitting: true,
  minRows: 1,
  maxRows: 6,
  minHeight: 28,
  maxHeight: undefined,
  autoResize: true,
  sendOnEnter: true,
  sendOnMetaEnter: false,
  allowEmptySend: false,
  clearOnSend: true,
  sendButtonText: 'Send',
  stopButtonText: 'Stop',
  queueButtonText: 'Queue',
  showAttachmentButton: false,
  attachmentButtonText: 'Attach',
  sources: () => [],
  commands: () => [],
  models: () => [],
  dictatable: false,
  listening: false,
  dictationState: 'idle',
  dictationBlocked: false,
  dictationElapsedMs: 0,
  listeningPlaceholder: 'Listening…',
  voiceLevel: 0,
  voiceStream: null,
  beamActive: false,
  conversing: false,
  alertTone: 'warning',
  runStatus: null,
  contextMeter: null,
  labels: () => ({}),
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: [payload: { text: string }]
  stop: []
  queue: [payload: { text: string }]
  attachmentClick: []
  attachmentRemove: [id: string]
  attachmentCancel: [id: string]
  attachmentOpen: [attachment: AiAttachmentFile]
  attachmentAdd: [files: File[]]
  paste: [event: ClipboardEvent]
  focus: [event: FocusEvent]
  blur: [event: FocusEvent]
  'update:model': [key: string]
  sourceSelect: [source: PromptBarSource]
  commandSelect: [command: PromptBarCommand]
  mic: []
  dictateCancel: []
  runInspect: []
}>()

const boxRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const ghostRef = ref<HTMLElement | null>(null)
const modelPickerRef = ref<HTMLElement | null>(null)
const modelTriggerRef = ref<InstanceType<typeof TxAiComposerControl> | null>(null)

const internalDraft = ref(props.modelValue)
watch(
  () => props.modelValue,
  (next) => {
    if (next !== internalDraft.value) {
      internalDraft.value = next
      void nextTick(syncHeight)
    }
  },
)

const draft = computed({
  get: () => internalDraft.value,
  set: (value: string) => {
    internalDraft.value = value
    emit('update:modelValue', value)
  },
})

const focused = ref(false)
const dragDepth = ref(0)
const forcedAtOpen = ref(false)
const modelMenuOpen = ref(false)
let stopMorph: (() => void) | null = null
let stopLaunch: (() => void) | null = null

const isDictating = computed(() =>
  props.listening
  || props.dictationState === 'starting'
  || props.dictationState === 'listening'
  || props.dictationState === 'finishing',
)

const isSendingOrBusy = computed(() => props.submitting || props.busy)
const canModifyAttachments = computed(() =>
  !props.disabled && (!props.submitting || props.allowAttachmentWhileSubmitting),
)
const normalizedAttachments = computed(() => normalizeComposerAttachments(props.attachments))
const hasDraftOrAttachments = computed(() => draft.value.trim().length > 0 || normalizedAttachments.value.length > 0)

const resolvedSendState = computed(() => {
  if (props.sendState)
    return props.sendState
  if (props.disabled)
    return 'disabled'
  return deriveAiSendState({
    sending: props.submitting,
    busy: props.busy,
    hasDraft: hasDraftOrAttachments.value,
    allowEmptySend: props.allowEmptySend,
  })
})

const effectiveBeamActive = computed(() =>
  Boolean(props.beamActive || isSendingOrBusy.value || focused.value),
)

const resolvedLabels = computed(() => ({
  placeholder: props.placeholder || 'Write a message…',
  ariaLabel: props.ariaLabel || props.placeholder || 'Message composer',
  send: props.sendButtonText || 'Send',
  stop: props.stopButtonText || 'Stop',
  queue: props.queueButtonText || 'Queue',
  attach: props.attachmentButtonText || 'Attach',
  removeAttachment: 'Remove attachment',
  cancelAttachment: 'Cancel upload',
  previewTitle: 'Preview',
  sourcesHint: 'Sources & files',
  commandsHint: 'Commands',
  noMatches: 'No matches',
  connect: 'Connect',
  connected: 'Connected',
  modelLabel: 'Select model',
  dictateStart: 'Start dictation',
  dictateStop: 'Stop dictation',
  dictateCancel: 'Cancel dictation',
  dictatingStatus: props.dictationStatusText || props.listeningPlaceholder || 'Listening…',
  dictatingFinisher: 'Finishing dictation…',
  dictateEscHint: props.dictationEscHint || 'Esc to cancel',
  sendHint: props.sendOnMetaEnter ? '⌘/Ctrl + Enter to send' : 'Enter to send',
  newLineHint: 'Shift + Enter for new line',
  ...props.labels,
}))

const activeModel = computed<PromptBarModel | undefined>(() => {
  if (!props.models.length)
    return undefined
  return props.models.find(item => item.key === props.model) ?? props.models[0]
})

const tokenMenu = useTokenMenu<PromptBarSource, PromptBarCommand>({
  draft,
  sources: () => props.sources,
  commands: () => props.commands,
  forced: forcedAtOpen,
})

const effectiveTextareaMinHeight = computed(() => Math.max(props.minHeight, props.minRows * 22))
const effectiveTextareaMaxHeight = computed(() => {
  const limit = props.maxHeight ?? props.maxRows * 24
  return Math.max(effectiveTextareaMinHeight.value, limit)
})

function syncHeight() {
  const el = inputRef.value
  if (!el || !props.autoResize)
    return
  el.style.height = 'auto'
  const clamped = Math.min(
    effectiveTextareaMaxHeight.value,
    Math.max(effectiveTextareaMinHeight.value, el.scrollHeight || effectiveTextareaMinHeight.value),
  )
  el.style.height = `${clamped}px`
  el.style.overflowY = el.scrollHeight > effectiveTextareaMaxHeight.value ? 'auto' : 'hidden'
}

function resetHeight() {
  const el = inputRef.value
  if (!el)
    return
  el.style.height = `${effectiveTextareaMinHeight.value}px`
  el.style.overflowY = 'hidden'
}

function withBoxMorph(mutate: () => void) {
  const before = measureElementSize(boxRef.value)
  mutate()
  void nextTick(() => {
    const after = measureElementSize(boxRef.value)
    stopMorph?.()
    stopMorph = animateComposerBoxMorph(boxRef.value, before, after, () => {
      stopMorph = null
    })
  })
}

watch([() => normalizedAttachments.value.length, isDictating], () => {
  withBoxMorph(() => {})
})

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node | null
  if (modelMenuOpen.value && modelPickerRef.value && target && !modelPickerRef.value.contains(target))
    modelMenuOpen.value = false
}

onMounted(() => {
  void nextTick(syncHeight)
  document.addEventListener('pointerdown', handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  stopMorph?.()
  stopLaunch?.()
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})

function closeModelMenu(restoreFocus = false) {
  if (!modelMenuOpen.value)
    return
  modelMenuOpen.value = false
  if (restoreFocus)
    void nextTick(() => modelTriggerRef.value?.focus())
}

function closeMenus() {
  forcedAtOpen.value = false
  modelMenuOpen.value = false
  tokenMenu.dismiss()
}

function focus() {
  inputRef.value?.focus()
}

function blur() {
  inputRef.value?.blur()
}

function launch() {
  stopLaunch?.()
  stopLaunch = animateComposerLaunch(boxRef.value, ghostRef.value)
}

function submitDraft(mode?: 'send' | 'queue') {
  const actionState = resolvedSendState.value
  if (props.disabled || (actionState !== 'send' && actionState !== 'queue'))
    return
  const resolvedMode = mode ?? (actionState === 'queue' ? 'queue' : 'send')
  const text = draft.value
  const trimmed = text.trim()
  const canSend = trimmed.length > 0 || normalizedAttachments.value.length > 0 || props.allowEmptySend
  if (!canSend)
    return

  launch()
  if (resolvedMode === 'queue') {
    emit('queue', { text })
  }
  else {
    emit('send', { text })
  }

  if (props.clearOnSend) {
    draft.value = ''
    void nextTick(resetHeight)
  }
  closeMenus()
}

function handleAttachOrSources() {
  if (!canModifyAttachments.value)
    return
  if (props.sources.length > 0 && !props.showAttachmentButton) {
    forcedAtOpen.value = !forcedAtOpen.value
    if (forcedAtOpen.value)
      tokenMenu.resume()
    return
  }
  emit('attachmentClick')
}

function handleTokenSelect(row: TxAiTokenMenuRow) {
  if (tokenMenu.menu.value === 'at') {
    const source = row as PromptBarSource
    if (source.attach) {
      forcedAtOpen.value = false
      tokenMenu.dismiss()
      emit('attachmentClick')
      return
    }
    draft.value = tokenMenu.insert(`@${source.name}`)
    forcedAtOpen.value = false
    emit('sourceSelect', source)
    void nextTick(() => {
      syncHeight()
      focus()
    })
    return
  }

  const command = row as PromptBarCommand
  draft.value = tokenMenu.insert(command.name)
  emit('commandSelect', command)
  void nextTick(() => {
    syncHeight()
    focus()
  })
}

function selectModel(model: PromptBarModel) {
  closeModelMenu(true)
  emit('update:model', model.key)
}

function handleInput(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value
  draft.value = value
  forcedAtOpen.value = false
  tokenMenu.resume()
  void nextTick(syncHeight)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229)
    return

  if (event.key === 'Escape') {
    if (tokenMenu.menu.value || modelMenuOpen.value) {
      event.preventDefault()
      closeMenus()
      return
    }
    if (isDictating.value) {
      event.preventDefault()
      emit('dictateCancel')
      return
    }
  }

  if (tokenMenu.menu.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      tokenMenu.move(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      tokenMenu.move(-1)
      return
    }
    if ((event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) && tokenMenu.activeRow.value) {
      event.preventDefault()
      handleTokenSelect(tokenMenu.activeRow.value)
      return
    }
  }

  if (props.sendOnMetaEnter) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      if (resolvedSendState.value === 'send' || resolvedSendState.value === 'queue')
        submitDraft(resolvedSendState.value === 'queue' ? 'queue' : 'send')
    }
    return
  }

  if (props.sendOnEnter && event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault()
    if (resolvedSendState.value === 'send' || resolvedSendState.value === 'queue')
      submitDraft(resolvedSendState.value === 'queue' ? 'queue' : 'send')
  }
}

function handleFocus(event: FocusEvent) {
  focused.value = true
  emit('focus', event)
}

function handleBlur(event: FocusEvent) {
  focused.value = false
  emit('blur', event)
}

watch(canModifyAttachments, (allowed) => {
  if (!allowed)
    dragDepth.value = 0
})

function handlePaste(event: ClipboardEvent) {
  emit('paste', event)
  if (!canModifyAttachments.value)
    return
  const files = Array.from(event.clipboardData?.files ?? [])
  if (files.length)
    emit('attachmentAdd', files)
}

function handleDragEnter(event: DragEvent) {
  if (!canModifyAttachments.value)
    return
  if (event.dataTransfer?.types?.includes('Files'))
    dragDepth.value += 1
}

function handleDragOver(event: DragEvent) {
  if (!canModifyAttachments.value)
    return
  if (event.dataTransfer?.types?.includes('Files'))
    event.preventDefault()
}

function handleDragLeave() {
  if (dragDepth.value > 0)
    dragDepth.value -= 1
}

function handleDrop(event: DragEvent) {
  dragDepth.value = 0
  if (!canModifyAttachments.value)
    return
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length) {
    event.preventDefault()
    emit('attachmentAdd', files)
  }
}

defineExpose({
  box: boxRef,
  input: inputRef,
  ghost: ghostRef,
  focus,
  blur,
  launch,
  closeMenus,
  resetHeight,
})
</script>

<template>
  <section
    class="tx-ai-composer"
    :class="[
      `tx-ai-composer--${variant}`,
      `tx-ai-composer--surface-${surface}`,
      {
        'is-focused': focused,
        'is-listening': isDictating,
        'is-conversing': conversing,
        'is-dragging': dragDepth > 0,
        'is-disabled': disabled,
      },
    ]"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div v-if="$slots.above" class="tx-ai-composer__above">
      <slot name="above" />
    </div>

    <div
      v-if="$slots['run-dock'] || runStatus || contextMeter"
      class="tx-ai-composer__run-dock"
    >
      <slot name="run-dock">
        <TxAiRunStatus
          v-if="runStatus"
          v-bind="runStatus"
          @inspect="emit('runInspect')"
        />
        <TxAiContextMeter
          v-if="contextMeter"
          v-bind="contextMeter"
          class="tx-ai-composer__context"
        />
      </slot>
    </div>

    <div v-if="$slots.alert || alertText" class="tx-ai-composer__alert" :class="`is-${alertTone}`" role="status">
      <slot name="alert">
        {{ alertText }}
      </slot>
    </div>

    <div v-if="$slots.queue" class="tx-ai-composer__queue">
      <slot name="queue" />
    </div>

    <div class="tx-ai-composer__frame">
      <TxAiTokenMenu
        :menu="tokenMenu.menu.value"
        :rows="tokenMenu.rows.value"
        :active-index="tokenMenu.activeIndex.value"
        :engaged="tokenMenu.engaged.value"
        :textarea="inputRef"
        :sources-hint="resolvedLabels.sourcesHint"
        :commands-hint="resolvedLabels.commandsHint"
        :no-matches="resolvedLabels.noMatches"
        :connect-label="resolvedLabels.connect"
        :connected-label="resolvedLabels.connected"
        @engage="tokenMenu.engage($event)"
        @select="handleTokenSelect"
      />

      <TxBorderBeam
        theme="auto"
        size="md"
        :duration="2.6"
        :active="effectiveBeamActive"
        :strength="effectiveBeamActive ? 0.85 : 0"
        :border-radius="variant === 'pill' ? 24 : 18"
      >
        <div ref="boxRef" class="tx-ai-composer__shell">
          <div v-if="isDictating" class="tx-ai-composer__voice-beam" aria-hidden="true">
            <TxVoiceBeam
              type="default"
              theme="auto"
              :active="isDictating"
              :level="voiceLevel"
              :stream="voiceStream"
            />
          </div>

          <div
            v-if="$slots.attachments || normalizedAttachments.length"
            class="tx-ai-composer__attachments"
          >
            <slot name="attachments" :attachments="normalizedAttachments">
              <TxAttachmentTray
                :attachments="normalizedAttachments"
                :removable="canModifyAttachments"
                :remove-label="resolvedLabels.removeAttachment"
                :cancel-label="resolvedLabels.cancelAttachment"
                :preview-title="resolvedLabels.previewTitle"
                @remove="emit('attachmentRemove', $event)"
                @cancel="emit('attachmentCancel', $event)"
                @open="emit('attachmentOpen', $event)"
              />
            </slot>
          </div>

          <div class="tx-ai-composer__editor">
            <textarea
              ref="inputRef"
              class="tx-ai-composer__input"
              :value="draft"
              :rows="minRows"
              :placeholder="isDictating ? resolvedLabels.dictatingStatus : resolvedLabels.placeholder"
              :aria-label="resolvedLabels.ariaLabel"
              :disabled="disabled"
              :readonly="isDictating"
              @input="handleInput"
              @keydown="handleKeydown"
              @focus="handleFocus"
              @blur="handleBlur"
              @paste="handlePaste"
            />
            <div ref="ghostRef" class="tx-ai-composer__ghost" aria-hidden="true">
              {{ draft }}
            </div>
          </div>

          <slot name="voice-draft" :listening="isDictating" :state="dictationState">
            <TxAiVoiceDraft
              v-if="isDictating"
              :active="isDictating"
              :state="dictationState"
              :elapsed-ms="dictationElapsedMs"
              :status-text="dictationState === 'finishing' ? resolvedLabels.dictatingFinisher : resolvedLabels.dictatingStatus"
              :esc-hint="resolvedLabels.dictateEscHint"
              :cancel-label="resolvedLabels.dictateCancel"
              :level="voiceLevel"
              @cancel="emit('dictateCancel')"
            />
          </slot>

          <slot name="toolbar" :submit="() => submitDraft()" :stop="() => emit('stop')">
            <div class="tx-ai-composer__toolbar">
              <div class="tx-ai-composer__toolbar-left">
                <TxAiComposerControl
                  v-if="showAttachmentButton || sources.length > 0"
                  circle
                  :label="resolvedLabels.attach"
                  :disabled="!canModifyAttachments"
                  :active="forcedAtOpen"
                  @click="handleAttachOrSources"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                  </svg>
                </TxAiComposerControl>

                <slot name="toolbar-left" />
                <slot name="mode" />

                <slot name="model" :model="activeModel" :models="models">
                  <div
                    v-if="models.length"
                    ref="modelPickerRef"
                    class="tx-ai-composer__model-picker"
                    @keydown.escape.stop="closeModelMenu(true)"
                  >
                    <TxAiComposerControl
                      ref="modelTriggerRef"
                      size="sm"
                      :label="activeModel?.name || resolvedLabels.modelLabel"
                      :active="modelMenuOpen"
                      :disabled="disabled"
                      aria-haspopup="listbox"
                      :aria-expanded="modelMenuOpen ? 'true' : 'false'"
                      @click="modelMenuOpen = !modelMenuOpen"
                    >
                      <span>{{ activeModel?.name }}</span>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    </TxAiComposerControl>
                    <div
                      v-if="modelMenuOpen"
                      class="tx-ai-composer__model-menu"
                      role="listbox"
                      :aria-label="resolvedLabels.modelLabel"
                    >
                      <button
                        v-for="item in models"
                        :key="item.key"
                        type="button"
                        role="option"
                        class="tx-ai-composer__model-option"
                        :class="{ 'is-selected': item.key === activeModel?.key }"
                        :aria-selected="item.key === activeModel?.key ? 'true' : 'false'"
                        @click="selectModel(item)"
                      >
                        <span>{{ item.name }}</span>
                        <span v-if="item.tag" class="tx-ai-composer__model-tag">{{ item.tag }}</span>
                      </button>
                    </div>
                  </div>
                </slot>
              </div>

              <div class="tx-ai-composer__toolbar-right">
                <slot name="actions" />

                <TxAiComposerMic
                  v-if="dictatable"
                  :state="dictationState"
                  :listening="listening"
                  :blocked="dictationBlocked"
                  :disabled="disabled"
                  :hidden="resolvedSendState === 'stop'"
                  :start-label="resolvedLabels.dictateStart"
                  :stop-label="resolvedLabels.dictateStop"
                  @toggle="emit('mic')"
                />

                <TxAiComposerSendIsland
                  :state="resolvedSendState"
                  :disabled="disabled"
                  :queued-count="queuedCount"
                  :send-label="resolvedLabels.send"
                  :stop-label="resolvedLabels.stop"
                  :queue-label="resolvedLabels.queue"
                  @send="submitDraft('send')"
                  @queue="submitDraft('queue')"
                  @stop="emit('stop')"
                />
              </div>
            </div>
          </slot>
        </div>
      </TxBorderBeam>
    </div>

    <div v-if="$slots.footer || $slots['send-hint'] || $slots['token-row']" class="tx-ai-composer__footer">
      <slot name="footer">
        <slot name="token-row" />
        <slot name="send-hint">
          <span class="tx-ai-composer__hint">
            {{ resolvedLabels.sendHint }} · {{ resolvedLabels.newLineHint }}
          </span>
        </slot>
      </slot>
    </div>
  </section>
</template>

<style scoped lang="scss">
.tx-ai-composer {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.tx-ai-composer__run-dock {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.tx-ai-composer__context {
  margin-left: auto;
}

.tx-ai-composer__alert {
  padding: 6px 12px;
  border-radius: 10px;
  background: var(--tx-color-warning-light-9, rgba(245, 158, 11, 0.1));
  color: var(--tx-color-warning, #d97706);
  font-size: 12px;

  &.is-danger {
    background: var(--tx-color-danger-light-9, rgba(239, 68, 68, 0.1));
    color: var(--tx-color-danger, #dc2626);
  }
}

.tx-ai-composer__frame {
  position: relative;
  width: 100%;
  min-width: 0;
}

.tx-ai-composer__shell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px 10px;
  border: 1px solid var(--tx-border-color-light, #e2e8f0);
  border-radius: 18px;
  background: var(--tx-bg-color, #ffffff);
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.05);
  box-sizing: border-box;
  overflow: visible;

  .tx-ai-composer--pill & {
    border-radius: 24px;
  }

  .tx-ai-composer--surface-refraction & {
    background: color-mix(in srgb, var(--tx-bg-color, #ffffff) 82%, transparent);
    backdrop-filter: blur(18px) saturate(160%);
  }

  .tx-ai-composer.is-focused & {
    border-color: var(--tx-color-primary-light-5, rgba(59, 130, 246, 0.45));
  }

  .tx-ai-composer.is-dragging & {
    border-color: var(--tx-color-primary, #3b82f6);
    border-style: dashed;
  }
}

.tx-ai-composer__voice-beam {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
  opacity: 0.72;
}

.tx-ai-composer__attachments {
  position: relative;
  z-index: 1;
}

.tx-ai-composer__editor {
  position: relative;
  z-index: 1;
  width: 100%;
  min-width: 0;
}

.tx-ai-composer__input {
  width: 100%;
  margin: 0;
  padding: 2px 2px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--tx-text-color-primary, #0f172a);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  box-sizing: border-box;

  &::placeholder {
    color: var(--tx-text-color-placeholder, #94a3b8);
  }

  &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
}

.tx-ai-composer__ghost {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 14px;
  line-height: 1.5;
}

.tx-ai-composer__toolbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
}

.tx-ai-composer__toolbar-left,
.tx-ai-composer__toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tx-ai-composer__model-picker {
  position: relative;
}

.tx-ai-composer__model-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  z-index: 35;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 180px;
  padding: 4px;
  border: 1px solid var(--tx-border-color-light, #e2e8f0);
  border-radius: 12px;
  background: var(--tx-bg-color-overlay, #ffffff);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.14);
}

.tx-ai-composer__model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--tx-text-color-primary, #0f172a);
  font-family: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;

  &:hover,
  &.is-selected {
    background: var(--tx-fill-color-light, rgba(148, 163, 184, 0.14));
  }

  &.is-selected {
    color: var(--tx-color-primary, #3b82f6);
    font-weight: 500;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #3b82f6);
    outline-offset: -2px;
  }
}

.tx-ai-composer__model-tag {
  color: var(--tx-text-color-secondary, #64748b);
  font-size: 11px;
}

.tx-ai-composer__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 4px;
}

.tx-ai-composer__hint {
  color: var(--tx-text-color-placeholder, #94a3b8);
  font-size: 11px;
}
</style>
