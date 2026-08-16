<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { SelectionActionItem, SelectionActionsEmits, SelectionActionsProps } from './types'
import { computed, markRaw, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import TxBaseAnchor from '../../base-anchor/src/TxBaseAnchor.vue'

defineOptions({ name: 'TxSelectionActions' })

const props = withDefaults(defineProps<SelectionActionsProps>(), {
  selection: null,
  state: 'idle',
  actions: () => [
    { id: 'explain', label: 'Explain', busyLabel: 'Explaining' },
    { id: 'improve', label: 'Improve', busyLabel: 'Improving' },
    { id: 'shorten', label: 'Shorten', more: true, busyLabel: 'Shortening' },
    { id: 'tone', label: 'Tone', more: true, busyLabel: 'Changing tone' },
    { id: 'grammar', label: 'Grammar', more: true, busyLabel: 'Fixing grammar' },
  ],
  activeActionId: undefined,
  expanded: undefined,
  prompt: undefined,
  hidePrompt: false,
  placeholder: 'Describe edits',
  ariaLabel: 'Selection actions',
  keepLabel: 'Keep',
  discardLabel: 'Discard',
  retryLabel: 'Try again',
  sendLabel: 'Send edit instruction',
  expandLabel: 'Show more actions',
  collapseLabel: 'Show fewer actions',
  busyLabel: 'Editing',
  offset: 8,
})

const emit = defineEmits<SelectionActionsEmits>()

defineSlots<{
  /** Replaces the built-in glyph for an action. */
  'action-icon'?: (props: { action: SelectionActionItem }) => any
  /** Replaces the busy readout. */
  'busy'?: (props: { label: string }) => any
  /** Replaces the Keep / Discard / retry cluster. */
  'result'?: () => any
}>()

const anchorRef = ref<{ updatePosition: () => void } | null>(null)
const barRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

const internalExpanded = ref(false)
const internalPrompt = ref('')

const isExpanded = computed(() => props.expanded ?? internalExpanded.value)
const promptText = computed(() => props.prompt ?? internalPrompt.value)
const hasPrompt = computed(() => promptText.value.trim().length > 0)

const isVisible = computed(() => Boolean(props.selection))
const isBusy = computed(() => props.state === 'thinking' || props.state === 'streaming')
const isResult = computed(() => props.state === 'result')
const isIdle = computed(() => props.state === 'idle')

const inlineActions = computed(() => props.actions.filter(action => !action.more))
const foldedActions = computed(() => props.actions.filter(action => action.more))

const runningLabel = computed(() => {
  const active = props.actions.find(action => action.id === props.activeActionId)
  return `${active?.busyLabel ?? props.busyLabel}…`
})

/**
 * Centred on the whole selection horizontally, collapsed onto the bottom of its
 * last line vertically — so a selection spanning three lines still puts the bar
 * directly under where the reader stopped, not under the block's midpoint.
 */
const virtualReference = markRaw({
  getBoundingClientRect: () => {
    const rects = props.selection?.rects ?? []
    const last = rects.at(-1)
    if (!last)
      return { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 } as DOMRect

    const left = Math.min(...rects.map(rect => rect.left))
    const right = Math.max(...rects.map(rect => rect.right))
    return {
      x: left,
      y: last.bottom,
      width: right - left,
      height: 0,
      top: last.bottom,
      bottom: last.bottom,
      left,
      right,
    } as DOMRect
  },
})

/* ─── width morph ─── */

let widthAnimation: Animation | null = null
let lastWidth = 0

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * The bar is intrinsically sized, so swapping its whole contents between idle,
 * busy and result would snap the width. Measure both ends and tween between
 * them instead.
 *
 * This runs through the Web Animations API, which CSS media queries cannot
 * reach — the reduced-motion check has to happen here in script.
 */
function morphWidth(): void {
  const bar = barRef.value
  const content = contentRef.value
  if (!bar || !content || typeof bar.animate !== 'function')
    return

  const nextWidth = Math.ceil(content.getBoundingClientRect().width) + 8
  const previousWidth = lastWidth || Math.ceil(bar.getBoundingClientRect().width)
  lastWidth = nextWidth

  if (prefersReducedMotion() || Math.abs(nextWidth - previousWidth) <= 1)
    return

  widthAnimation?.cancel()
  widthAnimation = bar.animate(
    [{ width: `${previousWidth}px` }, { width: `${nextWidth}px` }],
    { duration: 320, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
  )
  widthAnimation.onfinish = () => {
    widthAnimation = null
  }
}

watch(() => props.state, async () => {
  await nextTick()
  morphWidth()
})

onBeforeUnmount(() => {
  widthAnimation?.cancel()
  widthAnimation = null
})

/* ─── interactions ─── */

function setExpanded(next: boolean): void {
  internalExpanded.value = next
  emit('update:expanded', next)
}

function setPrompt(next: string): void {
  internalPrompt.value = next
  emit('update:prompt', next)
}

function run(action: SelectionActionItem): void {
  if (!props.selection)
    return

  setExpanded(false)
  emit('action', { id: action.id, action, selection: props.selection })
}

function submit(): void {
  if (!props.selection || !hasPrompt.value)
    return

  emit('submit', { prompt: promptText.value.trim(), selection: props.selection })
}

function onInput(event: Event): void {
  setPrompt((event.target as HTMLInputElement).value)
}

function updatePosition(): void {
  anchorRef.value?.updatePosition()
}

defineExpose({
  /**
   * Reposition against the current selection rects. A streaming host must call
   * this as text reflows: an anchor built from a virtual reference has nothing
   * to observe, so it cannot follow the text on its own.
   */
  updatePosition,
  focusInput: () => inputRef.value?.focus(),
})
</script>

<template>
  <TxBaseAnchor
    ref="anchorRef"
    :model-value="isVisible"
    :virtual-reference="virtualReference"
    placement="bottom"
    :offset="offset"
    disable-flip
    :use-card="false"
    :panel-padding="0"
    panel-shadow="none"
    panel-variant="plain"
    :max-width="720"
    :animation="{ type: 'none' }"
    :close-on-click-outside="false"
    :close-on-esc="false"
    :toggle-on-reference-click="false"
    class="tx-bui-selection-actions__anchor"
  >
    <!--
      Pointer-down is swallowed on the bar so pressing a control never moves
      focus out of the document: that would collapse the very selection the
      action is about to operate on. The text field re-enables it below.
    -->
    <div
      ref="barRef"
      class="tx-bui-selection-actions"
      role="group"
      :aria-label="ariaLabel"
      @pointerdown.prevent
    >
      <div ref="contentRef" class="tx-bui-selection-actions__content">
        <template v-if="isBusy">
          <span class="tx-bui-selection-actions__busy">
            <span class="tx-bui-selection-actions__spinner" aria-hidden="true" />
            <slot name="busy" :label="runningLabel">
              <span
                class="tx-bui-selection-actions__busy-label"
                :class="{ 'is-shimmering': state === 'thinking' }"
                aria-live="polite"
              >{{ runningLabel }}</span>
            </slot>
          </span>
        </template>

        <template v-else-if="isResult">
          <slot name="result">
            <button type="button" class="tx-bui-selection-actions__primary" @click="emit('keep')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {{ keepLabel }}
            </button>
            <button type="button" class="tx-bui-selection-actions__control" @click="emit('discard')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              {{ discardLabel }}
            </button>
            <span class="tx-bui-selection-actions__divider" aria-hidden="true" />
            <button
              type="button"
              class="tx-bui-selection-actions__icon-button"
              :aria-label="retryLabel"
              @click="emit('retry')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
              </svg>
            </button>
          </slot>
        </template>

        <template v-else-if="isIdle">
          <div
            v-if="!hidePrompt"
            class="tx-bui-selection-actions__group is-prompt"
            :class="{ 'is-shown': !isExpanded }"
          >
            <form class="tx-bui-selection-actions__form" @submit.prevent="submit">
              <input
                ref="inputRef"
                class="tx-bui-selection-actions__input"
                :value="promptText"
                :placeholder="placeholder"
                :aria-label="placeholder"
                @input="onInput"
                @pointerdown.stop
              >
            </form>
          </div>

          <div
            class="tx-bui-selection-actions__group is-actions"
            :class="{ 'is-shown': !hasPrompt }"
          >
            <span class="tx-bui-selection-actions__group-inner">
              <span v-if="!isExpanded && !hidePrompt" class="tx-bui-selection-actions__divider is-strong" aria-hidden="true" />

              <button
                v-for="action in inlineActions"
                :key="action.id"
                type="button"
                class="tx-bui-selection-actions__control"
                @click="run(action)"
              >
                <slot name="action-icon" :action="action">
                  <svg v-if="action.id === 'explain'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M9.6 9.5a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.8.7-.8 1.2v.4" />
                    <path d="M12 16.7h.01" />
                  </svg>
                  <svg v-else-if="action.id === 'improve'" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
                  </svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M4 7V5h16v2M9 19h6M12 5v14" />
                  </svg>
                </slot>
                {{ action.label }}
              </button>

              <span
                v-if="foldedActions.length > 0"
                class="tx-bui-selection-actions__group is-folded"
                :class="{ 'is-shown': isExpanded }"
              >
                <span class="tx-bui-selection-actions__group-inner">
                  <button
                    v-for="action in foldedActions"
                    :key="action.id"
                    type="button"
                    class="tx-bui-selection-actions__control"
                    :tabindex="isExpanded ? undefined : -1"
                    @click="run(action)"
                  >
                    <slot name="action-icon" :action="action">
                      <svg v-if="action.id === 'shorten'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="6" cy="6" r="2.6" />
                        <circle cx="6" cy="18" r="2.6" />
                        <path d="M8.2 7.6L20 18M8.2 16.4L20 6" />
                      </svg>
                      <svg v-else-if="action.id === 'tone'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M8.5 14.2a4.5 4.5 0 0 0 7 0" />
                        <path d="M9 9.5h.01M15 9.5h.01" />
                      </svg>
                      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <path d="M7 9h10M7 13h6" />
                      </svg>
                    </slot>
                    {{ action.label }}
                  </button>
                </span>
              </span>

              <template v-if="foldedActions.length > 0">
                <span class="tx-bui-selection-actions__divider" aria-hidden="true" />
                <button
                  type="button"
                  class="tx-bui-selection-actions__icon-button"
                  :aria-label="isExpanded ? collapseLabel : expandLabel"
                  :aria-expanded="isExpanded"
                  @click="setExpanded(!isExpanded)"
                >
                  <svg
                    class="tx-bui-selection-actions__chevron"
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </template>
            </span>
          </div>

          <div
            v-if="!hidePrompt"
            class="tx-bui-selection-actions__group is-send"
            :class="{ 'is-shown': hasPrompt }"
          >
            <button
              type="button"
              class="tx-bui-selection-actions__send"
              :aria-label="sendLabel"
              :tabindex="hasPrompt ? undefined : -1"
              @click="submit"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </template>
      </div>
    </div>
  </TxBaseAnchor>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

@include bui-keyframes-pop-in;
@include bui-keyframes-spin;
@include bui-keyframes-shimmer-text;

.tx-bui-selection-actions {
  @include bui-scope;
  @include bui-pop-in(220ms);

  display: flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  max-width: calc(100vw - 48px);
  height: 36px;
  overflow: hidden;
  // A 36px pill wraps 28px controls at a 4px inset, so the controls resolve to
  // a 14px radius and the curves stay concentric.
  padding: 4px;
  color: var(--tx-bui-ink, #1f2124);
  background: var(--tx-bui-surface, #fff);
  border-radius: 999px;
  box-shadow: var(--tx-bui-shadow-overlay, 0 0 0 1px #ecedef, 0 8px 28px #0001);

  .tx-bui-selection-actions__content {
    display: flex;
    gap: 2px;
    align-items: center;
    justify-content: center;
    width: fit-content;
    flex: none;
  }

  /* ─── controls ─── */

  .tx-bui-selection-actions__control,
  .tx-bui-selection-actions__primary {
    display: inline-flex;
    flex: none;
    gap: 4px;
    align-items: center;
    height: 28px;
    padding: 0 10px;
    white-space: nowrap;
    cursor: pointer;
    border-radius: 999px;
  }

  .tx-bui-selection-actions__control {
    font-size: 12px;
    color: var(--tx-bui-ink, #1f2124);
    transition: background-color 0.15s ease, color 0.15s ease, transform 0.15s ease;

    &:hover {
      background: var(--tx-bui-hover, #f4f5f6);
    }

    &:active {
      transform: scale(0.96);
    }
  }

  .tx-bui-selection-actions__primary {
    font-size: 12.5px;
    color: var(--tx-bui-canvas, #f1f2f3);
    background: var(--tx-bui-ink, #1f2124);
    box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
    transition: opacity 0.15s ease, transform 0.15s ease;

    &:hover {
      opacity: 0.9;
    }

    &:active {
      transform: scale(0.96);
    }
  }

  .tx-bui-selection-actions__icon-button {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--tx-bui-ink, #1f2124);
    cursor: pointer;
    border-radius: 999px;
    transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;

    &:hover {
      background: var(--tx-bui-hover, #f4f5f6);
    }

    &:active {
      transform: scale(0.96);
    }
  }

  .tx-bui-selection-actions__chevron {
    transition: transform 0.4s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
  }

  .tx-bui-selection-actions__icon-button[aria-expanded='true'] .tx-bui-selection-actions__chevron {
    transform: rotate(180deg);
  }

  .tx-bui-selection-actions__send {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--tx-bui-surface, #fff);
    cursor: pointer;
    background: var(--tx-bui-ink, #1f2124);
    border-radius: 999px;
    transition: opacity 0.2s ease, transform 0.2s ease;

    &:active {
      transform: scale(0.94);
    }
  }

  .tx-bui-selection-actions__divider {
    flex: none;
    width: 1px;
    height: 16px;
    margin-inline: 2px;
    background: var(--tx-bui-line, #ecedef);

    &.is-strong {
      margin-inline: 4px;
      background: var(--tx-bui-line-strong, #e0e2e5);
    }
  }

  /* ─── busy ─── */

  .tx-bui-selection-actions__busy {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    height: 28px;
    padding: 0 10px;
    font-size: 12.5px;
    color: var(--tx-bui-ink-2, #62656b);
    white-space: nowrap;
  }

  .tx-bui-selection-actions__spinner {
    flex: none;
    width: 12px;
    height: 12px;
    border: 1.5px solid var(--tx-bui-line-strong, #e0e2e5);
    border-top-color: var(--tx-bui-ink-2, #62656b);
    border-radius: 999px;
    animation: tx-bui-spin 700ms linear infinite;
  }

  .tx-bui-selection-actions__busy-label.is-shimmering {
    @include bui-shimmer-text(1.4s);
  }

  /* ─── idle groups ─── */

  // Horizontal twin of the 0fr↔1fr disclosure: the group collapses to nothing
  // and grows back to its intrinsic width without anyone measuring it. Upstream
  // hand-tuned pixel maxima (145 / 224 / 262 / 462 / 30) for Inter at 13px;
  // those would be wrong at any other face, so they are not carried over.
  .tx-bui-selection-actions__group {
    display: grid;
    grid-template-columns: 0fr;
    min-width: 0;
    opacity: 0;
    transform: translateX(-8px);
    transition:
      grid-template-columns 0.4s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      opacity 0.4s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      transform 0.4s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

    > * {
      min-width: 0;
      overflow: hidden;
    }

    &.is-shown {
      grid-template-columns: 1fr;
      opacity: 1;
      transform: translateX(0);
    }

    &.is-send:not(.is-shown) {
      transform: scale(0.88);
    }
  }

  .tx-bui-selection-actions__group-inner {
    display: inline-flex;
    gap: 2px;
    align-items: center;
    white-space: nowrap;
  }

  .tx-bui-selection-actions__form {
    display: flex;
    align-items: center;
    height: 28px;
  }

  .tx-bui-selection-actions__input {
    width: 145px;
    max-width: 100%;
    height: 28px;
    padding: 0 10px 0 12px;
    font: inherit;
    font-size: 12.5px;
    color: var(--tx-bui-ink, #1f2124);
    background: transparent;
    border: 0;
    outline: none;

    &::placeholder {
      color: var(--tx-bui-ink-3, #9a9da3);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tx-bui-selection-actions__control,
    .tx-bui-selection-actions__primary,
    .tx-bui-selection-actions__icon-button,
    .tx-bui-selection-actions__send,
    .tx-bui-selection-actions__chevron,
    .tx-bui-selection-actions__group {
      transition: none;
    }

    .tx-bui-selection-actions__control:active,
    .tx-bui-selection-actions__primary:active,
    .tx-bui-selection-actions__icon-button:active,
    .tx-bui-selection-actions__send:active {
      transform: none;
    }

    // The state machine keeps running; only its spinner stops turning.
    .tx-bui-selection-actions__spinner {
      animation: none;
    }
  }
}
</style>
