<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { TxTextTransformer } from '../../text-transformer'

defineOptions({
  name: 'TxCopyButton',
})

const props = withDefaults(
  defineProps<{
    text?: string
    copyLabel?: string
    copiedLabel?: string
    /**
     * Label while a failed copy is reported. Unset, the label stays on
     * `copyLabel` and the failure shows in the icon and tone alone, so a wrapper
     * that never passes it cannot surface an untranslated string.
     */
    failedLabel?: string
    disabled?: boolean
    timeout?: number
    size?: 'sm' | 'md'
    /**
     * Icon only at rest. The label grows out of the button while it reports a
     * copy (or a failure, when `failedLabel` is set) and folds back after.
     */
    iconOnly?: boolean
  }>(),
  {
    text: '',
    copyLabel: 'Copy',
    copiedLabel: 'Copied',
    failedLabel: undefined,
    disabled: false,
    timeout: 1400,
    size: 'sm',
    iconOnly: false,
  },
)

const emit = defineEmits<{
  copy: [text: string]
  error: [error: unknown]
}>()

type CopyState = 'idle' | 'copied' | 'failed'

/** How long a state change may ease colour; the longest leg below is the 300ms label. */
const MORPH_MS = 420
/** The icon-only button's width tween, TxModeChip's numbers. */
const WIDTH_MS = 300
const EASE_OUT_STRONG = 'cubic-bezier(0.23, 1, 0.32, 1)'

const rootRef = ref<HTMLButtonElement | null>(null)
const state = ref<CopyState>('idle')
const copying = ref(false)
const morphing = ref(false)
const resizing = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | undefined
let morphTimer: ReturnType<typeof setTimeout> | undefined
let widthAnimation: Animation | null = null

const copied = computed(() => state.value === 'copied')
const failed = computed(() => state.value === 'failed')

const buttonLabel = computed(() => {
  if (copied.value)
    return props.copiedLabel
  if (failed.value)
    return props.failedLabel ?? props.copyLabel
  return props.copyLabel
})

const shownLabel = computed(() => {
  if (!props.iconOnly)
    return buttonLabel.value
  if (copied.value)
    return props.copiedLabel
  return failed.value ? props.failedLabel ?? '' : ''
})

// Announced, never shown: the live region needs words even when the visible
// label stays put on a failure.
const announcement = computed(() => {
  if (copied.value)
    return props.copiedLabel
  return failed.value ? props.failedLabel ?? 'Copy failed' : ''
})

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function layoutWidth(el: HTMLElement): number {
  const width = Number.parseFloat(getComputedStyle(el).width)
  return Number.isNaN(width) ? el.getBoundingClientRect().width : width
}

function stopWidth() {
  const running = widthAnimation
  widthAnimation = null
  running?.cancel()
  resizing.value = false
}

/**
 * FLIPs the button's width across one state change. The text-morph engine
 * tweens its own width between two labels, but not to or from an empty one,
 * which is every change of the icon-only button: without this it would jump.
 * `first` is read before the change renders, a tween cut short included.
 */
async function flipWidth(apply: () => void) {
  const el = rootRef.value
  if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) {
    apply()
    return
  }
  const first = layoutWidth(el)
  stopWidth()
  apply()
  await nextTick()
  if (rootRef.value !== el)
    return
  const last = layoutWidth(el)
  if (Math.abs(last - first) < 0.5)
    return
  const animation = el.animate(
    [{ width: `${first}px` }, { width: `${last}px` }],
    { duration: WIDTH_MS, easing: EASE_OUT_STRONG },
  )
  widthAnimation = animation
  resizing.value = true
  animation.onfinish = () => {
    if (widthAnimation !== animation)
      return
    widthAnimation = null
    resizing.value = false
  }
}

function setState(next: CopyState) {
  if (props.iconOnly) {
    void flipWidth(() => {
      state.value = next
    })
  }
  else {
    state.value = next
  }
  // Colour eases only across this window, so hover keeps switching at once.
  morphing.value = true
  if (morphTimer)
    clearTimeout(morphTimer)
  morphTimer = setTimeout(() => {
    morphing.value = false
  }, MORPH_MS)
  if (resetTimer)
    clearTimeout(resetTimer)
  if (next !== 'idle')
    resetTimer = setTimeout(() => setState('idle'), props.timeout)
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)
  try {
    textarea.select()
    const ok = document.execCommand('copy')
    if (!ok)
      throw new Error('Copy command failed')
  }
  finally {
    // Always detach the hidden textarea — even if select()/execCommand throws — so
    // a failed copy never orphans a node on <body>.
    document.body.removeChild(textarea)
  }
}

async function handleCopy() {
  if (props.disabled || copying.value)
    return

  copying.value = true
  try {
    await writeClipboard(props.text)
    setState('copied')
    emit('copy', props.text)
  }
  catch (error) {
    setState('failed')
    emit('error', error)
  }
  finally {
    copying.value = false
  }
}

onBeforeUnmount(() => {
  if (resetTimer)
    clearTimeout(resetTimer)
  if (morphTimer)
    clearTimeout(morphTimer)
  stopWidth()
})
</script>

<template>
  <button
    ref="rootRef"
    type="button"
    class="tx-copy-button"
    :class="[
      `tx-copy-button--${size}`,
      {
        'is-copied': copied,
        'is-failed': failed,
        'is-copying': copying,
        'is-morphing': morphing,
        'is-icon-only': iconOnly,
        'is-resizing': resizing,
        'has-label': shownLabel !== '',
      },
    ]"
    :disabled="disabled || copying"
    :aria-label="buttonLabel"
    @click="handleCopy"
  >
    <!-- One svg holding all three glyphs, so `.tx-copy-button__icon svg` still
         sizes the whole icon for hosts that restyle it (TxCodeStream). -->
    <span class="tx-copy-button__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <g class="tx-copy-button__glyph tx-copy-button__glyph--copy">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </g>
        <path class="tx-copy-button__glyph tx-copy-button__glyph--check" d="M4 12l5 5L20 6" pathLength="1" />
        <g class="tx-copy-button__glyph tx-copy-button__glyph--failed">
          <path d="M18 6 6 18" pathLength="1" />
          <path d="m6 6 12 12" pathLength="1" />
        </g>
      </svg>
    </span>
    <span class="tx-copy-button__label">
      <slot :copied="copied" :copying="copying" :failed="failed">
        <!-- Between two labels the morph keeps the shared characters and tweens
             its own width; to and from nothing it has neither, so the icon-only
             button crossfades with a blur and FLIPs its width instead. -->
        <TxTextTransformer :text="shownLabel" :mode="iconOnly ? 'fade' : 'morph'" :duration-ms="300" :blur-px="4" />
      </slot>
    </span>
    <!-- A polite live region so screen-reader users hear the outcome; swapping
         the visible label / aria-label alone is never re-announced. -->
    <span class="tx-copy-button__status" role="status" aria-live="polite">{{ announcement }}</span>
  </button>
</template>

<!-- Unscoped: the BEM prefix already isolates it, and the data-v attribute on
     every selector cost the button sheet half a kilobyte. -->
<style>
.tx-copy-button {
  /* Ring, not border: the box keeps its fixed height through every state. */
  --tx-copy-button-ring: var(--tx-border-color, #dcdfe6);
  --tx-copy-button-ease: var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px 0 9px;
  border: 0;
  border-radius: 8px;
  background: var(--tx-bg-color, #ffffff);
  box-shadow: inset 0 0 0 1px var(--tx-copy-button-ring);
  /* 13px resting ink is `regular`; hover darkens it (design rules). */
  color: var(--tx-text-color-regular, #606266);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.tx-copy-button:hover:not(:disabled) {
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-primary, #303133);
}

.tx-copy-button:active:not(:disabled) {
  transform: scale(0.97);
}

.tx-copy-button:focus-visible {
  outline: 2px solid var(--tx-color-primary-light-5, #a0cfff);
  outline-offset: 2px;
}

.tx-copy-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tx-copy-button--md {
  height: 34px;
  padding: 0 12px 0 11px;
  font-size: 14px;
}

/* Square at rest: the padding frames the 16px glyph exactly. */
.tx-copy-button.is-icon-only {
  padding: 0 7px;
}

.tx-copy-button--md.is-icon-only {
  padding: 0 9px;
}

.tx-copy-button.is-icon-only:not(.has-label) {
  gap: 0;
}

/* A reported outcome outranks hover — the pointer is still on the button when
   it lands — by matching the hover rule's weight and coming after it; anything
   heavier would also beat the hosts that restyle it (TxCodeStream). Ink is the
   hue mixed toward the primary text colour (45% success, 55% danger), the
   design rules' recipe for text that clears 4.5:1 in every theme. */
.tx-copy-button.is-copied {
  --tx-copy-button-tone: var(--tx-color-success, #67c23a);
  --tx-copy-button-ink-mix: 45%;
}

.tx-copy-button.is-failed {
  --tx-copy-button-tone: var(--tx-color-danger, #f56c6c);
  --tx-copy-button-ink-mix: 55%;
}

.tx-copy-button:is(.is-copied, .is-failed):not(:disabled) {
  --tx-copy-button-ring: color-mix(in srgb, var(--tx-copy-button-tone) 38%, transparent);
  background: color-mix(in srgb, var(--tx-copy-button-tone) 12%, var(--tx-bg-color, #ffffff));
  color: color-mix(in srgb, var(--tx-copy-button-tone) var(--tx-copy-button-ink-mix), var(--tx-text-color-primary, #303133));
}

.tx-copy-button__icon,
.tx-copy-button__label {
  display: inline-flex;
  align-items: center;
}

/* While the width tweens the button is narrower than its new label; it clips
   the label instead of squeezing it. */
.tx-copy-button.is-resizing {
  overflow: hidden;
}

.tx-copy-button.is-resizing .tx-copy-button__label {
  flex-shrink: 0;
}


.tx-copy-button__icon svg {
  display: block;
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tx-copy-button__glyph--copy {
  transform-box: fill-box;
  transform-origin: center;
}

.tx-copy-button.is-copied .tx-copy-button__glyph--copy,
.tx-copy-button.is-failed .tx-copy-button__glyph--copy {
  opacity: 0;
  transform: scale(0.6);
}

/* The check and the cross draw themselves: unit pathLength, dash 1. */
.tx-copy-button__glyph--check,
.tx-copy-button__glyph--failed path {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
}

.tx-copy-button.is-copied .tx-copy-button__glyph--check,
.tx-copy-button.is-failed .tx-copy-button__glyph--failed path {
  stroke-dashoffset: 0;
}

/* Motion is declared only for those who have not asked for less of it, so
   reduced motion simply lands every state as its final frame. */
@media (prefers-reduced-motion: no-preference) {
  .tx-copy-button {
    transition: transform 0.12s var(--tx-copy-button-ease);
  }

  /* The transformer's layers tween `color` and the label inherits the button's
     ink, so without this every hover would ease the label. The crossfade is
     opacity and blur alone (TxModeChip does the same); under reduced motion the
     transformer drops its own transitions. */
  .tx-copy-button__label .tx-text-transformer__layer {
    transition-property: opacity, filter;
  }

  .tx-copy-button.is-morphing {
    transition:
      transform 0.12s var(--tx-copy-button-ease),
      background-color 0.24s var(--tx-copy-button-ease),
      color 0.24s var(--tx-copy-button-ease),
      box-shadow 0.24s var(--tx-copy-button-ease),
      gap 0.3s var(--tx-copy-button-ease);
  }

  .tx-copy-button__glyph--copy {
    transition: opacity 0.12s ease-out, transform 0.16s var(--tx-copy-button-ease);
  }

  .tx-copy-button.is-copied .tx-copy-button__glyph--check {
    transition: stroke-dashoffset 0.3s var(--tx-copy-button-ease) 0.06s;
  }

  .tx-copy-button.is-failed .tx-copy-button__glyph--failed path {
    transition: stroke-dashoffset 0.2s var(--tx-copy-button-ease) 0.06s;
  }

  .tx-copy-button.is-failed .tx-copy-button__glyph--failed path + path {
    transition-delay: 0.14s;
  }
}

.tx-copy-button__status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
