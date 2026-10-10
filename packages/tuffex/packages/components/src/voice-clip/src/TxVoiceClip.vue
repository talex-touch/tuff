<script setup lang="ts">
import type { VoiceClipExpose, VoiceClipProps } from './types'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { barCountFor, CLIP_CHROME_WIDTH, clipWidthFor, formatClipTime, remainingSeconds, wholeSeconds } from './layout'
import { fillPeaks, loadPeaks, resamplePeaks } from './peaks'
import { claimPlayback, releasePlayback } from './playback'

defineOptions({ name: 'TxVoiceClip' })

const props = withDefaults(defineProps<VoiceClipProps>(), {
  src: '',
  durationMs: undefined,
  peaks: undefined,
  disabled: false,
  playLabel: 'Play voice message',
  pauseLabel: 'Pause voice message',
  seekLabel: 'Playback position',
  unavailableLabel: 'Recording unavailable',
})

const emit = defineEmits<{
  play: []
  pause: []
  ended: []
  error: [error: unknown]
}>()

const rootRef = ref<HTMLElement | null>(null)
const waveRef = ref<HTMLElement | null>(null)
const audioRef = ref<HTMLAudioElement | null>(null)

const playing = ref(false)
const mediaFailed = ref(false)
/** The file's own length in seconds, once the element has read it. */
const mediaDuration = ref<number | null>(null)
/**
 * Where playback stands, in seconds. Written when the countdown's text or the slider's whole
 * second changes, not on every frame: the frame loop moves the played layer through a custom
 * property instead, so a playing clip does not re-render its bars sixty times a second.
 */
const position = ref(0)
const decodedPeaks = shallowRef<number[] | null>(null)
const waveWidth = ref(0)

const unavailable = computed(() => !props.src || mediaFailed.value)
const inert = computed(() => unavailable.value || props.disabled)

const knownDurationMs = computed(() =>
  typeof props.durationMs === 'number' && props.durationMs > 0 ? props.durationMs : undefined,
)

const durationSeconds = computed(() => {
  if (mediaDuration.value !== null)
    return mediaDuration.value
  return knownDurationMs.value !== undefined ? knownDurationMs.value / 1000 : 0
})

// The width follows the host's figure when it gave one, so the bubble does not shift by a few
// pixels when the element's own reading lands a moment later.
const width = computed(() =>
  clipWidthFor(knownDurationMs.value ?? (mediaDuration.value !== null ? mediaDuration.value * 1000 : undefined)),
)

const barCount = computed(() =>
  barCountFor(waveWidth.value > 0 ? waveWidth.value : width.value - CLIP_CHROME_WIDTH),
)

const sourcePeaks = computed(() => props.peaks ?? decodedPeaks.value)
// The host's peaks are drawn at the scale it gave; decoded ones are scaled so the loudest bar
// fills the height, as a voice message's waveform is.
const bars = computed(() => {
  if (props.peaks)
    return resamplePeaks(props.peaks, barCount.value)
  if (decodedPeaks.value)
    return fillPeaks(resamplePeaks(decodedPeaks.value, barCount.value))
  return Array.from({ length: barCount.value }, () => 0)
})

const started = computed(() => playing.value || position.value > 0)
const timeText = computed(() => {
  const total = durationSeconds.value
  if (!(total > 0))
    return ''
  return formatClipTime(started.value ? remainingSeconds(total, position.value) : wholeSeconds(total))
})
const valueText = computed(() =>
  `${formatClipTime(position.value)} / ${formatClipTime(wholeSeconds(durationSeconds.value))}`,
)
// Tenths, not whole seconds: the slider's maximum must not round below a position it can reach.
const tenths = (seconds: number) => Math.round(seconds * 10) / 10

const owner = { pause: () => audioRef.value?.pause() }

// ── Progress ────────────────────────────────────────────────────────────────

let frame = 0

function writeProgress(ratio: number): void {
  const value = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0
  rootRef.value?.style.setProperty('--tx-voice-clip-progress', String(value))
}

function syncPosition(force: boolean): void {
  const element = audioRef.value
  if (!element)
    return
  const total = durationSeconds.value
  const now = Number.isFinite(element.currentTime) ? element.currentTime : 0
  writeProgress(total > 0 ? now / total : 0)
  // Everything shown — the countdown, the slider's value text — moves in whole seconds.
  if (force || Math.floor(now) !== Math.floor(position.value))
    position.value = now
}

function tick(): void {
  syncPosition(false)
  frame = requestAnimationFrame(tick)
}

function startTicker(): void {
  if (frame || typeof requestAnimationFrame !== 'function')
    return
  frame = requestAnimationFrame(tick)
}

function stopTicker(): void {
  if (frame && typeof cancelAnimationFrame === 'function')
    cancelAnimationFrame(frame)
  frame = 0
}

function resetPlayback(): void {
  stopTicker()
  playing.value = false
  releasePlayback(owner)
  position.value = 0
  writeProgress(0)
}

// ── Media element ──────────────────────────────────────────────────────────

function onDurationKnown(): void {
  const duration = audioRef.value?.duration
  mediaDuration.value = typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : null
}

/**
 * The element's own ~4 Hz clock, beside the frame loop. A window the compositor throttles — an
 * occluded one, a background tab — runs frames at about 1 Hz or not at all, and the countdown
 * would stall while the recording keeps playing.
 */
function onTimeUpdate(): void {
  if (playing.value)
    syncPosition(false)
}

function onPlay(): void {
  playing.value = true
  claimPlayback(owner)
  startTicker()
  emit('play')
}

function onPause(): void {
  playing.value = false
  stopTicker()
  syncPosition(true)
  releasePlayback(owner)
  emit('pause')
}

function onEnded(): void {
  const element = audioRef.value
  if (element) {
    try {
      element.currentTime = 0
    }
    catch {
      // Not seekable yet: the next play starts from the top regardless (see `play`).
    }
  }
  resetPlayback()
  emit('ended')
}

function onError(): void {
  mediaFailed.value = true
  resetPlayback()
  emit('error', audioRef.value?.error ?? new Error('TX_VOICE_CLIP_MEDIA_ERROR'))
}

// ── Public controls ────────────────────────────────────────────────────────

async function play(): Promise<void> {
  const element = audioRef.value
  if (!element || inert.value)
    return
  const total = durationSeconds.value
  if (element.ended || (total > 0 && element.currentTime >= total - 0.05)) {
    try {
      element.currentTime = 0
    }
    catch {
      // Same as onEnded.
    }
  }
  try {
    await element.play()
  }
  catch (error) {
    // A pause, a new source or an unmount interrupted the start; nothing failed.
    if (error instanceof DOMException && error.name === 'AbortError')
      return
    emit('error', error)
  }
}

function pause(): void {
  audioRef.value?.pause()
}

function toggle(): void {
  if (playing.value)
    pause()
  else
    void play()
}

// ── Seeking ────────────────────────────────────────────────────────────────

function seekTo(seconds: number): void {
  const element = audioRef.value
  const total = durationSeconds.value
  if (!element || inert.value || !(total > 0))
    return
  const target = Math.min(Math.max(seconds, 0), total)
  try {
    element.currentTime = target
  }
  catch {
    return
  }
  position.value = target
  writeProgress(target / total)
}

function ratioAt(clientX: number): number {
  const rect = waveRef.value?.getBoundingClientRect()
  if (!rect || !(rect.width > 0))
    return 0
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
}

let dragging = false

function onWavePointerDown(event: PointerEvent): void {
  if (inert.value || event.button !== 0)
    return
  dragging = true
  // Cancelling the pointerdown also cancels the mousedown that would have focused the slider,
  // so focus goes there by hand: arrow keys work right after a click.
  event.preventDefault()
  waveRef.value?.focus({ preventScroll: true })
  waveRef.value?.setPointerCapture?.(event.pointerId)
  seekTo(ratioAt(event.clientX) * durationSeconds.value)
}

function onWavePointerMove(event: PointerEvent): void {
  if (dragging)
    seekTo(ratioAt(event.clientX) * durationSeconds.value)
}

function onWavePointerEnd(event: PointerEvent): void {
  if (!dragging)
    return
  dragging = false
  if (waveRef.value?.hasPointerCapture?.(event.pointerId))
    waveRef.value.releasePointerCapture(event.pointerId)
}

function onWaveKeydown(event: KeyboardEvent): void {
  const total = durationSeconds.value
  if (inert.value || !(total > 0))
    return
  const current = audioRef.value?.currentTime ?? position.value
  const page = Math.max(1, total / 10)
  let next: number
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      next = current + 1
      break
    case 'ArrowLeft':
    case 'ArrowDown':
      next = current - 1
      break
    case 'PageUp':
      next = current + page
      break
    case 'PageDown':
      next = current - page
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = total
      break
    default:
      return
  }
  event.preventDefault()
  seekTo(next)
}

// ── Peaks and size ─────────────────────────────────────────────────────────

let peaksRequest = 0
let mounted = false

function refreshPeaks(): void {
  peaksRequest += 1
  decodedPeaks.value = null
  if (!mounted || props.peaks || !props.src)
    return
  const request = peaksRequest
  void loadPeaks(props.src).then((result) => {
    if (request === peaksRequest)
      decodedPeaks.value = result
  })
}

let observer: ResizeObserver | null = null

function observeWave(element: HTMLElement | null): void {
  observer?.disconnect()
  if (!element || typeof ResizeObserver === 'undefined')
    return
  observer ??= new ResizeObserver((entries) => {
    const box = entries[entries.length - 1]?.contentRect
    if (box)
      waveWidth.value = box.width
  })
  observer.observe(element)
}

watch(() => props.src, () => {
  mediaFailed.value = false
  mediaDuration.value = null
  resetPlayback()
  refreshPeaks()
})

watch(() => props.peaks, () => refreshPeaks())

watch(() => props.disabled, (disabled) => {
  if (disabled)
    pause()
})

watch(waveRef, element => observeWave(element))

onMounted(() => {
  mounted = true
  writeProgress(0)
  refreshPeaks()
  observeWave(waveRef.value)
})

onBeforeUnmount(() => {
  mounted = false
  peaksRequest += 1
  observer?.disconnect()
  observer = null
  stopTicker()
  releasePlayback(owner)
  audioRef.value?.pause()
})

defineExpose({ play, pause, toggle } satisfies VoiceClipExpose)
</script>

<template>
  <div
    ref="rootRef"
    class="tx-voice-clip"
    :class="{
      'is-playing': playing,
      'is-unavailable': unavailable,
      'is-disabled': disabled,
      'is-flat': !sourcePeaks,
    }"
    :style="unavailable ? { minWidth: `${width}px` } : { width: `${width}px` }"
  >
    <button
      type="button"
      class="tx-voice-clip__toggle"
      :aria-label="playing ? pauseLabel : playLabel"
      :disabled="inert"
      @click="toggle"
    >
      <svg v-if="playing" class="tx-voice-clip__glyph" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="4" y="3" width="2.75" height="10" rx="1" />
        <rect x="9.25" y="3" width="2.75" height="10" rx="1" />
      </svg>
      <svg v-else class="tx-voice-clip__glyph" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M5.25 3.47v9.06a.9.9 0 0 0 1.37.77l7.18-4.53a.9.9 0 0 0 0-1.54L6.62 2.7a.9.9 0 0 0-1.37.77Z" />
      </svg>
    </button>

    <span v-if="unavailable" class="tx-voice-clip__note">{{ unavailableLabel }}</span>
    <div
      v-else
      ref="waveRef"
      class="tx-voice-clip__wave"
      role="slider"
      :tabindex="inert ? -1 : 0"
      :aria-label="seekLabel"
      aria-valuemin="0"
      :aria-valuemax="tenths(durationSeconds)"
      :aria-valuenow="tenths(position)"
      :aria-valuetext="valueText"
      :aria-disabled="inert || undefined"
      @pointerdown="onWavePointerDown"
      @pointermove="onWavePointerMove"
      @pointerup="onWavePointerEnd"
      @pointercancel="onWavePointerEnd"
      @keydown="onWaveKeydown"
    >
      <span class="tx-voice-clip__bars" aria-hidden="true">
        <span
          v-for="(level, index) in bars"
          :key="index"
          class="tx-voice-clip__bar"
          :style="{ '--tx-voice-clip-level': level }"
        />
      </span>
      <span class="tx-voice-clip__bars tx-voice-clip__bars--played" aria-hidden="true">
        <span
          v-for="(level, index) in bars"
          :key="index"
          class="tx-voice-clip__bar"
          :style="{ '--tx-voice-clip-level': level }"
        />
      </span>
    </div>

    <span class="tx-voice-clip__time" aria-hidden="true">{{ timeText }}</span>

    <audio
      ref="audioRef"
      class="tx-voice-clip__media"
      :src="src || undefined"
      preload="metadata"
      hidden
      @loadedmetadata="onDurationKnown"
      @durationchange="onDurationKnown"
      @timeupdate="onTimeUpdate"
      @play="onPlay"
      @pause="onPause"
      @ended="onEnded"
      @error="onError"
    />
  </div>
</template>

<style lang="scss">
// Not scoped, as in TxStatusHint: every selector carries the `tx-voice-clip` prefix, which keeps
// the sheet small and lets a host's single-class rule set the knobs regardless of load order.
//
// Colours read through `--tx-voice-clip-*` with the library token as the fallback and are never
// declared on the root, so a host can set them on the clip or on any ancestor — a chat bubble
// that recolours every clip inside it, for instance:
//   --tx-voice-clip-bg            capsule fill            (--tx-fill-color-light)
//   --tx-voice-clip-control-bg    play key fill           (--tx-bg-color)
//   --tx-voice-clip-control-ink   play key glyph          (--tx-text-color-primary)
//   --tx-voice-clip-accent        played bars             (--tx-color-primary)
//   --tx-voice-clip-track         bars not yet played     (primary ink at 28%)
//   --tx-voice-clip-ink           clock and note          (--tx-text-color-regular)
//   --tx-voice-clip-focus         focus rings             (--tx-color-primary)
//
// The clock and the note are 12px in the regular ink, the weight a metadata line takes; the
// glyph on the play key is the primary ink on the page colour, well clear of 3:1 in every theme.
// The bars carry no state on colour alone: the slider's value text and the countdown say where
// playback is.
//
// Motion has one form: transitions are declared only inside `prefers-reduced-motion:
// no-preference`, and every resting style is the end frame. Progress is not motion — it keeps
// updating under reduced motion.

.tx-voice-clip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  max-width: 100%;
  height: 36px;
  padding: 0 12px 0 4px;
  // Laid out left to right on every page, as a media control is; an RTL page does not mirror
  // the waveform or the direction it fills in.
  direction: ltr;
  border-radius: 999px;
  background: var(--tx-voice-clip-bg, var(--tx-fill-color-light, #f5f7fa));
  color: var(--tx-voice-clip-ink, var(--tx-text-color-regular, #606266));
  vertical-align: middle;
}

.tx-voice-clip__toggle {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--tx-voice-clip-control-bg, var(--tx-bg-color, #fff));
  box-shadow: 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-voice-clip-control-ink, var(--tx-text-color-primary, #303133));
  cursor: pointer;
  appearance: none;

  &:focus-visible {
    outline: 2px solid var(--tx-voice-clip-focus, var(--tx-color-primary, #409eff));
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.tx-voice-clip__glyph {
  width: 14px;
  height: 14px;
  fill: currentColor;
}

.tx-voice-clip__wave {
  position: relative;
  flex: 1 1 auto;
  align-self: stretch;
  min-width: 0;
  border-radius: 6px;
  cursor: pointer;
  touch-action: none;

  &:focus-visible {
    outline: 2px solid var(--tx-voice-clip-focus, var(--tx-color-primary, #409eff));
    outline-offset: 1px;
  }

  &[aria-disabled='true'] {
    cursor: not-allowed;
  }
}

.tx-voice-clip__bars {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
}

.tx-voice-clip__bars--played {
  clip-path: inset(0 calc((1 - var(--tx-voice-clip-progress, 0)) * 100%) 0 0);

  .tx-voice-clip__bar {
    background: var(--tx-voice-clip-accent, var(--tx-color-primary, #409eff));
  }
}

.tx-voice-clip__bar {
  flex: none;
  width: 3px;
  height: calc(3px + var(--tx-voice-clip-level, 0) * 15px);
  border-radius: 999px;
  background: var(--tx-voice-clip-track, color-mix(in srgb, var(--tx-text-color-primary, #303133) 28%, transparent));
}

.tx-voice-clip__note {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tx-voice-clip__time {
  flex: none;
  min-width: 30px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 16px;
  text-align: end;
  white-space: nowrap;
}

.tx-voice-clip.is-disabled .tx-voice-clip__wave {
  opacity: 0.5;
}

@media (prefers-reduced-motion: no-preference) {
  .tx-voice-clip__toggle {
    transition: scale 120ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

    &:active:not(:disabled) {
      scale: 0.92;
    }
  }

  // Bars grow out of the flat track when the decoded peaks land.
  .tx-voice-clip__bar {
    transition: height 240ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
  }
}
</style>
