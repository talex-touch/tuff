<script setup lang="ts">
import type { PropType } from 'vue'
import type {
  ChatComposerAttachment,
  ChatComposerEmits,
  ChatComposerProps,
  ChatComposerTrayPlacement,
} from './types'
import { computed, onBeforeUnmount, onBeforeUpdate, onUpdated, ref, useSlots } from 'vue'

defineOptions({
  name: 'TxChatComposer',
})

// A runtime props object, not `defineProps<ChatComposerProps>()`. The SFC compiler
// resolves an imported props interface once, and the Vite and Nuxt dev servers do
// not recompile this file when `types.ts` gains a field — a new prop then arrives
// as an unknown attribute and reads as its default, while vitest (a cold compile)
// passes. `satisfies` keeps this list and the exported interface in step.
const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Message…' },
  ariaLabel: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
  allowAttachmentWhileSubmitting: { type: Boolean, default: false },
  minRows: { type: Number, default: 3 },
  maxRows: { type: Number, default: 6 },
  sendOnEnter: { type: Boolean, default: true },
  sendOnMetaEnter: { type: Boolean, default: true },
  allowEmptySend: { type: Boolean, default: false },
  sendButtonText: { type: String, default: 'Send' },
  showAttachmentButton: { type: Boolean, default: false },
  attachmentButtonText: { type: String, default: 'Attach' },
  attachments: { type: Array as PropType<ChatComposerAttachment[]>, default: () => [] },
  trayPlacement: { type: String as PropType<ChatComposerTrayPlacement>, default: 'bottom' },
  trayLabel: { type: String, default: undefined },
} satisfies Record<keyof ChatComposerProps, unknown>)

const emit = defineEmits<ChatComposerEmits>()
const slots = useSlots()

const value = computed({
  get: () => props.modelValue ?? '',
  set: (v: string) => emit('update:modelValue', v),
})

// `maxRows` caps how tall the textarea can grow; expose it as a CSS var so the
// style block (which owns the 1.6 line-height) turns it into a max-height. Floor it at
// `minRows` so a smaller maxRows can't clamp the box below its resting height.
const cappedMaxRows = computed(() => Math.max(props.maxRows ?? 6, props.minRows ?? 3))

const attachmentItems = computed<ChatComposerAttachment[]>(() => {
  return Array.isArray(props.attachments) ? props.attachments : []
})
const hasCustomToolbar = computed(() => Boolean(slots.toolbar))
const canAttach = computed(() => {
  if (props.disabled) {
    return false
  }
  if (props.submitting && !props.allowAttachmentWhileSubmitting) {
    return false
  }
  return true
})
const canSend = computed(() => {
  if (props.disabled || props.submitting) {
    return false
  }
  const text = (value.value ?? '').trim()
  if (text) {
    return true
  }
  return Boolean(props.allowEmptySend && attachmentItems.value.length > 0)
})

const textareaRef = ref<HTMLTextAreaElement | null>(null)

// ---------------------------------------------------------------------------
// Attachment intake: paste and drag-and-drop both funnel into `attachmentAdd`.
// The composer only surfaces the File objects — uploading is the consumer's.
// ---------------------------------------------------------------------------

function onPaste(event: ClipboardEvent): void {
  // The raw event keeps flowing for existing consumers.
  emit('paste', event)

  if (!canAttach.value)
    return

  const items = event.clipboardData?.items
  if (!items)
    return

  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind !== 'file')
      continue
    const file = item.getAsFile()
    if (file)
      files.push(file)
  }

  if (files.length === 0)
    return

  // Stops platform side text like a Finder-copied file's name from landing in
  // the textarea; plain text pastes carry no file items and never reach here.
  event.preventDefault()
  emit('attachmentAdd', files)
}

/**
 * Enter/leave events fire per descendant; the pair count is the only reliable
 * "still inside" signal, so the highlight doesn't flicker crossing children.
 */
const dragDepth = ref(0)
const isDragover = computed(() => dragDepth.value > 0)

function dragHasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function onDragEnter(event: DragEvent): void {
  if (!canAttach.value || !dragHasFiles(event))
    return
  event.preventDefault()
  dragDepth.value += 1
}

function onDragOver(event: DragEvent): void {
  if (!isDragover.value)
    return
  // Required — without it the browser refuses the drop.
  event.preventDefault()
}

function onDragLeave(): void {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function onDrop(event: DragEvent): void {
  if (!isDragover.value)
    return
  event.preventDefault()
  dragDepth.value = 0

  const files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length > 0)
    emit('attachmentAdd', files)
}

function trySend(): void {
  if (!canSend.value)
    return
  const text = (value.value ?? '').trim()
  emit('send', { text })
}

function onAttachmentClick(): void {
  if (!canAttach.value)
    return
  emit('attachmentClick')
}

function onKeydown(e: KeyboardEvent): void {
  // Enter during IME composition confirms the candidate, never sends.
  if (e.isComposing)
    return
  if (!props.sendOnEnter)
    return
  if (e.key !== 'Enter')
    return

  const metaLike = e.metaKey || e.ctrlKey

  if (props.sendOnMetaEnter) {
    if (!metaLike)
      return
    e.preventDefault()
    trySend()
    return
  }

  if (metaLike)
    return
  if (e.shiftKey)
    return

  e.preventDefault()
  trySend()
}

// ---------------------------------------------------------------------------
// Tray choreography. Timings are measured off the reference clip — see
// research/reference-motion.md in the `09-23-composer-motion-reference` Trellis
// task. The leaving tray fades and blurs out over ~200ms (the CSS leave class
// below); ~70ms in, the card slides one tray row across, with no overshoot, on
// the least-squares fit to the sampled card edge (0.87 video px RMS). The
// arriving tray is never faded in: it sits under the card and is uncovered by
// the slide, the card acting as the mask.
// ---------------------------------------------------------------------------

const TRAY_SLIDE_DELAY_MS = 70
const TRAY_SLIDE_DURATION_MS = 450
const TRAY_SLIDE_EASING = 'cubic-bezier(0.65, 0.16, 0.1, 0.88)'

type TrayLayout = 'none' | ChatComposerTrayPlacement

const shellRef = ref<HTMLElement | null>(null)
const cardRef = ref<HTMLElement | null>(null)
const topTrayRef = ref<HTMLElement | null>(null)
const bottomTrayRef = ref<HTMLElement | null>(null)

/**
 * Slots are not reactive — a computed over `slots.tray` would keep its first
 * answer in production builds — so the template and the update hooks call this
 * on every render instead.
 */
function trayLayout(): TrayLayout {
  if (!slots.tray)
    return 'none'
  return props.trayPlacement === 'top' ? 'top' : 'bottom'
}

/** Off when the leaving tray must go at once (reduced motion, or no WAAPI to slide with). */
const trayMotion = ref(true)
/**
 * True only while the shell's height animates. It also keeps `has-tray` on
 * through a removal's shrink, so the tray fill leaves with the tray, not before it.
 */
const isResizing = ref(false)

let renderedLayout: TrayLayout = trayLayout()
let slide: Animation | null = null
let resize: Animation | null = null
let pendingFlip: { top: number, height: number, refocus: boolean, animate: boolean } | null = null

function motionAllowed(el: HTMLElement): boolean {
  if (typeof el.animate !== 'function')
    return false
  return typeof window.matchMedia !== 'function'
    || !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function stopTrayMotion(): void {
  // Detached first, so a cancel event — whenever it fires — never matches the current one.
  const running = [slide, resize]
  slide = null
  resize = null
  for (const animation of running)
    animation?.cancel()
}

function cardOffset(card: HTMLElement, shell: HTMLElement): number {
  return card.getBoundingClientRect().top - shell.getBoundingClientRect().top
}

// FIRST — the DOM still shows the previous layout. A rect read includes any running
// transform, so a change that interrupts a slide starts from where the card visibly is.
onBeforeUpdate(() => {
  const next = trayLayout()
  if (next === renderedLayout)
    return
  const previous = renderedLayout
  renderedLayout = next

  const shell = shellRef.value
  const card = cardRef.value
  if (!shell || !card)
    return

  const leaving = previous === 'top'
    ? topTrayRef.value
    : previous === 'bottom' ? bottomTrayRef.value : null
  const animate = motionAllowed(card)

  pendingFlip = {
    top: cardOffset(card, shell),
    height: shell.getBoundingClientRect().height,
    refocus: Boolean(leaving?.contains(document.activeElement)),
    animate,
  }
  trayMotion.value = animate
  stopTrayMotion()
})

// LAST — the new tray is in flow and the leaving one is already out of it (its
// leave-active class is applied during the patch), so this is the final layout.
onUpdated(() => {
  const flip = pendingFlip
  pendingFlip = null
  const shell = shellRef.value
  const card = cardRef.value
  if (!flip || !shell || !card)
    return

  // Focus inside a tray that is leaving would be stranded on a node about to go.
  if (flip.refocus)
    textareaRef.value?.focus({ preventScroll: true })

  if (!flip.animate) {
    isResizing.value = false
    return
  }

  const timing: KeyframeAnimationOptions = {
    duration: TRAY_SLIDE_DURATION_MS,
    delay: TRAY_SLIDE_DELAY_MS,
    easing: TRAY_SLIDE_EASING,
    // Holds the first frame through the delay, so nothing jumps before the slide.
    fill: 'backwards',
  }

  const dy = flip.top - cardOffset(card, shell)
  if (Math.abs(dy) >= 0.5)
    slide = card.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], timing)

  const height = shell.getBoundingClientRect().height
  if (Math.abs(flip.height - height) < 0.5) {
    isResizing.value = false
    return
  }

  const animation = shell.animate([{ height: `${flip.height}px` }, { height: `${height}px` }], timing)
  const settle = (): void => {
    if (resize !== animation)
      return
    resize = null
    isResizing.value = false
  }
  animation.onfinish = settle
  animation.oncancel = settle
  resize = animation
  isResizing.value = true
})

onBeforeUnmount(stopTrayMotion)
</script>

<template>
  <div
    ref="shellRef"
    class="tx-chat-composer"
    :class="{
      'is-disabled': disabled,
      'is-submitting': submitting,
      'is-dragover': isDragover,
      'has-tray': trayLayout() !== 'none' || isResizing,
      'is-tray-top': trayLayout() === 'top',
      'is-tray-bottom': trayLayout() === 'bottom',
      'is-resizing': isResizing,
    }"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <Transition name="tx-chat-composer-tray" :css="trayMotion">
      <div
        v-if="trayLayout() === 'top'"
        ref="topTrayRef"
        class="tx-chat-composer__tray is-top"
        :role="trayLabel ? 'group' : undefined"
        :aria-label="trayLabel || undefined"
      >
        <slot name="tray" />
      </div>
    </Transition>

    <div ref="cardRef" class="tx-chat-composer__card">
      <div v-if="attachmentItems.length > 0 || $slots.attachments" class="tx-chat-composer__attachments">
        <slot name="attachments" :attachments="attachmentItems">
          <span
            v-for="item in attachmentItems"
            :key="item.id"
            class="tx-chat-composer__attachment"
            :class="{ 'is-pending': item.pending }"
          >
            <span class="tx-chat-composer__attachment-label">{{ item.label }}</span>
            <span v-if="item.kind" class="tx-chat-composer__attachment-kind">{{ item.kind }}</span>
          </span>
        </slot>
      </div>

      <div class="tx-chat-composer__input">
        <textarea
          ref="textareaRef"
          v-model="value"
          class="tx-chat-composer__textarea"
          :style="{ '--tx-chat-composer-min-rows': minRows, '--tx-chat-composer-max-rows': cappedMaxRows }"
          :placeholder="placeholder"
          :aria-label="ariaLabel || placeholder"
          :disabled="disabled"
          :rows="minRows"
          @keydown="onKeydown"
          @paste="onPaste($event as ClipboardEvent)"
          @focus="emit('focus', $event)"
          @blur="emit('blur', $event)"
        />
      </div>

      <div v-if="hasCustomToolbar" class="tx-chat-composer__toolbar">
        <slot
          name="toolbar"
          :send="trySend"
          :disabled="disabled || submitting"
          :attachment-click="onAttachmentClick"
        />
      </div>

      <div v-else class="tx-chat-composer__actions">
        <div class="tx-chat-composer__actions-left">
          <button
            v-if="showAttachmentButton"
            type="button"
            class="tx-chat-composer__attach"
            :aria-label="attachmentButtonText"
            :disabled="!canAttach"
            @click="onAttachmentClick"
          >
            <svg class="tx-chat-composer__plus" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path
                d="M8 3.25v9.5M3.25 8h9.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
              />
            </svg>
          </button>
          <slot name="toolbar-left" :disabled="disabled || submitting" />
        </div>

        <div class="tx-chat-composer__actions-right">
          <slot name="actions" :send="trySend" :disabled="!canSend" />
          <button
            type="button"
            class="tx-chat-composer__send"
            :aria-label="sendButtonText"
            :disabled="!canSend"
            @click="trySend"
          >
            <svg class="tx-chat-composer__send-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path
                d="M8 12.75v-9.5M3.75 7.5 8 3.25l4.25 4.25"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <slot name="footer" />
    </div>

    <Transition name="tx-chat-composer-tray" :css="trayMotion">
      <div
        v-if="trayLayout() === 'bottom'"
        ref="bottomTrayRef"
        class="tx-chat-composer__tray is-bottom"
        :role="trayLabel ? 'group' : undefined"
        :aria-label="trayLabel || undefined"
      >
        <slot name="tray" />
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
// The root is the shell. It owns the fallthrough class and attributes, the drop
// target and — only while a tray shows — the flat tray fill. The surface is
// `__card`, stacked above either tray so a placement change can slide it across
// the tray like a mask.
.tx-chat-composer {
  position: relative;
  isolation: isolate;
  width: 100%;
  border-radius: var(--tx-chat-composer-radius, 18px);
}

.tx-chat-composer.has-tray {
  background: var(--tx-fill-color-light, #f5f7fa);
}

// Only while the shell's height animates, so the card's elevation shadow is not
// clipped the rest of the time.
.tx-chat-composer.is-resizing {
  overflow: hidden;
}

.tx-chat-composer.is-disabled {
  opacity: 0.75;
}

.tx-chat-composer__card {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 8px;
  // 16px keeps the text clear of the 18px corner; the icon buttons sit 12px in
  // from the right and bottom edges.
  padding: 14px 12px 12px 16px;
  border-radius: inherit;
  // `--tx-fill-color-blank` is `transparent` in the dark theme, and the card must
  // hide the tray it slides over, so an opaque page colour sits underneath.
  background-color: var(--tx-bg-color, #fff);
  background-image: linear-gradient(var(--tx-fill-color-blank, #fff) 0 0);
  // Ring, not border: a border and a drop shadow on one element fight at the corner.
  box-shadow:
    inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5),
    var(--tx-elevation-1, 1px 2px 4px rgba(0, 0, 0, 0.04));
}

.tx-chat-composer__card:focus-within {
  box-shadow:
    inset 0 0 0 1px var(--tx-border-color, #dcdfe6),
    var(--tx-elevation-1, 1px 2px 4px rgba(0, 0, 0, 0.04));
}

.tx-chat-composer.is-dragover .tx-chat-composer__card {
  background-image: linear-gradient(var(--tx-color-primary-light-9, #ecf5ff) 0 0);
  box-shadow:
    inset 0 0 0 1.5px var(--tx-color-primary, #409eff),
    var(--tx-elevation-1, 1px 2px 4px rgba(0, 0, 0, 0.04));
}

.tx-chat-composer__attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tx-chat-composer__attachment {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tx-color-primary, #409eff) 28%, transparent);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 10%, transparent);
  color: var(--tx-text-color-primary, #111827);
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1;
}

.tx-chat-composer__attachment.is-pending {
  border-color: color-mix(in srgb, #f59e0b 32%, transparent);
  background: color-mix(in srgb, #f59e0b 14%, transparent);
}

.tx-chat-composer__attachment-label {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-chat-composer__attachment-kind {
  color: var(--tx-text-color-secondary, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.tx-chat-composer__input {
  width: 100%;
  min-width: 0;
}

.tx-chat-composer__textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  // Grows with its content from `minRows` to `maxRows` lines (1.6em mirrors the
  // line-height below) and scrolls past the cap. Where `field-sizing` is not
  // supported the box stays at `rows=minRows` and scrolls.
  min-height: calc(var(--tx-chat-composer-min-rows, 3) * 1.6em);
  max-height: calc(var(--tx-chat-composer-max-rows, 6) * 1.6em);
  field-sizing: content;
  margin: 0;
  padding: 0 4px 0 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: var(--tx-text-color-primary, #303133);
  // A textarea does not inherit the page font; the UA's monospace face was
  // showing through the placeholder.
  font: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  overflow-y: auto;
  outline: none;
}

.tx-chat-composer__textarea::placeholder {
  color: var(--tx-text-color-placeholder, #a8abb2);
  opacity: 1;
}

.tx-chat-composer__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tx-chat-composer__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tx-chat-composer__actions-left,
.tx-chat-composer__actions-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

// Icon buttons reset from the native control. Hover changes ink only, and at once
// (design rules › Motion): the press scale is the only transition here.
.tx-chat-composer__attach,
.tx-chat-composer__send {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  font: inherit;
  cursor: pointer;
  transition: transform 120ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.tx-chat-composer__attach:focus-visible,
.tx-chat-composer__send:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 2px;
}

.tx-chat-composer__attach:active:not(:disabled),
.tx-chat-composer__send:active:not(:disabled) {
  transform: scale(0.96);
}

.tx-chat-composer__attach:disabled,
.tx-chat-composer__send:disabled {
  cursor: not-allowed;
}

.tx-chat-composer__attach {
  width: 28px;
  height: 28px;
  // Puts the glyph on the text's left edge; with no plate there is no box to misalign.
  margin-left: -6px;
  background: transparent;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-chat-composer__attach:hover:not(:disabled) {
  color: var(--tx-text-color-primary, #303133);
}

.tx-chat-composer__attach:disabled {
  color: var(--tx-text-color-disabled, #c0c4cc);
}

.tx-chat-composer__plus,
.tx-chat-composer__send-icon {
  display: block;
  width: 16px;
  height: 16px;
}

// The fill is the ink colour and the arrow the page colour: `--tx-bg-color` on
// `--tx-text-color-primary` measures 13.02:1 light (#fff on #303133), 15.26:1 dark
// (#141414 on #e5eaf3), 17.74:1 high-contrast light, 20.14:1 high-contrast dark.
.tx-chat-composer__send {
  width: 32px;
  height: 32px;
  background: var(--tx-text-color-primary, #303133);
  color: var(--tx-bg-color, #fff);
}

.tx-chat-composer__send:disabled {
  background: var(--tx-fill-color, #f0f2f5);
  color: var(--tx-text-color-placeholder, #a8abb2);
}

// Regular ink, not secondary: on the tray fill secondary measures 2.87:1 in light
// (#909399 on #f5f7fa), under AA for 13px text. Regular measures 5.69:1 light,
// 9.99:1 dark, 13.34:1 high-contrast light, 16.12:1 high-contrast dark.
.tx-chat-composer__tray {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 16px;
  color: var(--tx-text-color-regular, #606266);
  font-size: 13px;
  line-height: 1.4;
}

// The leaving tray is lifted out of flow and pinned to its own side, so it holds no
// space and stays put while the card slides over it.
.tx-chat-composer-tray-leave-active {
  position: absolute;
  inset-inline: 0;
  pointer-events: none;
  transition:
    opacity 200ms ease-out,
    filter 200ms ease-out;
}

.tx-chat-composer-tray-leave-active.is-top {
  top: 0;
}

.tx-chat-composer-tray-leave-active.is-bottom {
  bottom: 0;
}

.tx-chat-composer-tray-leave-to {
  opacity: 0;
  filter: blur(2px);
}

@media (prefers-reduced-motion: reduce) {
  .tx-chat-composer-tray-leave-active,
  .tx-chat-composer__attach,
  .tx-chat-composer__send {
    transition: none;
  }
}
</style>
