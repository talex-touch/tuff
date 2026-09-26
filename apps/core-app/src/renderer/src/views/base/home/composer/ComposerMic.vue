<script lang="ts" name="ComposerMic" setup>
import type { DictationOutcome, DictationState } from './useComposerDictation'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  animateElement,
  COMPOSER_MOTION,
  EASE_IN,
  EASE_OUT_STRONG,
  entryFrame,
  exitFrame,
  morphCurve,
  prefersReducedMotion,
  readPx,
  releaseCurve
} from './composer-motion'
import { useComposerPress } from './useComposerPress'

/**
 * The composer's microphone. At rest a quiet 32px key; while dictating it grows left into the
 * dictation capsule — waveform and timer — over the model pill (D10-f), the same island language as
 * the stop capsule and built the same way: the row holds a fixed 32×32 slot, this button sits in it
 * absolutely at `right: 0`, and only its own width changes, so no neighbour moves. The model pill
 * yields while it is covered (`cover`), and the whole key yields its slot to the stop capsule while a
 * reply runs (`yielded`).
 *
 * Presentation only: the session is `useComposerDictation`'s.
 */
const props = withDefaults(
  defineProps<{
    state: DictationState
    /** Normalized level history, oldest first (`useComposerDictation().levels`). */
    levels: readonly number[]
    elapsedMs: number
    /** The stop capsule is covering the slot: hidden, inert, out of the tab order. */
    yielded?: boolean
    /** Width that covers the model pill, measured by the toolbar at the press; 0 until then. */
    coverWidth?: number
    /** How the last session ended, for the status line. */
    outcome?: DictationOutcome | null
  }>(),
  { yielded: false, coverWidth: 0, outcome: null }
)

const emit = defineEmits<{
  (event: 'toggle'): void
  /** The capsule covers the model pill (`true`), or has retracted past it. */
  (event: 'cover', covering: boolean): void
}>()

const { t } = useI18n()
const {
  mic,
  capsule,
  glyphIn,
  glyphOut,
  micYield,
  press: pressScore,
  tone: toneScore
} = COMPOSER_MOTION

const CIRCLE_PX = 32
/** The capsule's padding (12 each side) plus the gap between waveform and timer. */
const CAPSULE_CHROME_PX = 32
/** The least the content needs: three bars beside the timer. */
const CONTENT_MIN_PX = Math.ceil(CAPSULE_CHROME_PX + mic.timerPx + 3 * mic.barStride)

const open = computed(() => props.state !== 'idle' && !props.yielded)
/**
 * Measured, the capsule spans exactly the model pill and the gap it covers — never further left,
 * so however narrow the toolbar it cannot reach the permission chip (the shortest model pill is
 * still wider than the content minimum). Unmeasured, it falls back to `capsuleMinPx`.
 */
const capsuleWidth = computed(() => {
  const cover = Math.round(props.coverWidth)
  return cover > 0 ? Math.max(cover, CONTENT_MIN_PX) : mic.capsuleMinPx
})

/** As many bars as the capsule has room for, newest on the right. */
const bars = computed<number[]>(() => {
  const room = capsuleWidth.value - CAPSULE_CHROME_PX - mic.timerPx
  const count = Math.max(3, Math.min(mic.levelHistory, Math.floor(room / mic.barStride)))
  const tail = props.levels.slice(-count)
  return [...new Array<number>(Math.max(0, count - tail.length)).fill(0), ...tail]
})

const timerText = computed(() => {
  const seconds = Math.max(0, Math.floor(props.elapsedMs / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
})

const ariaLabel = computed(() =>
  props.state === 'idle' ? t('home.voice') : t('home.composer.dictationStop')
)

/** Read once per change; the partial text itself is never announced (the field is readable). */
const statusText = computed(() => {
  switch (props.state) {
    case 'starting':
      return t('assistant.voicePanel.voicePreparing')
    case 'listening':
      return t('home.composer.dictationListening')
    case 'finishing':
      return t('home.composer.dictationFinishing')
    default:
      return props.outcome === 'inserted' ? t('home.composer.dictationInserted') : ''
  }
})

const shape = ref<'circle' | 'capsule'>(open.value ? 'capsule' : 'circle')
const glyphHidden = ref(open.value)
const liveShown = ref(open.value)
const morphing = ref(false)

const rootRef = ref<HTMLButtonElement | null>(null)
const glyphRef = ref<HTMLElement | null>(null)
const liveRef = ref<HTMLElement | null>(null)

useComposerPress(rootRef, {
  scale: () => (shape.value === 'capsule' ? pressScore.capsuleScale : pressScore.scale),
  disabled: () => props.state === 'finishing' || props.yielded
})

const beats = new Set<ReturnType<typeof setTimeout>>()
let morphTimer: ReturnType<typeof setTimeout> | null = null
let widthAnimation: Animation | null = null
let yieldAnimations: Animation[] = []
let glyphAnimations: Animation[] = []
let liveAnimations: Animation[] = []
let covering = open.value

function beat(fn: () => void, ms: number): void {
  if (ms <= 0) {
    fn()
    return
  }
  const id = setTimeout(() => {
    beats.delete(id)
    fn()
  }, ms)
  beats.add(id)
}

function clearBeats(): void {
  for (const id of beats) clearTimeout(id)
  beats.clear()
}

function running(animations: (Animation | null)[]): Animation[] {
  return animations.filter((animation): animation is Animation => animation !== null)
}

function cancelAll(animations: Animation[]): void {
  for (const animation of animations) animation.cancel()
}

function setCover(next: boolean): void {
  if (covering === next) return
  covering = next
  emit('cover', next)
}

function startMorph(): void {
  morphing.value = true
  if (morphTimer !== null) clearTimeout(morphTimer)
  morphTimer = setTimeout(() => {
    morphTimer = null
    morphing.value = false
  }, toneScore.islandMs + 40)
}

function morphWidth(next: 'circle' | 'capsule'): void {
  const el = rootRef.value
  const target = (value: 'circle' | 'capsule'): number =>
    value === 'capsule' ? capsuleWidth.value : CIRCLE_PX
  const from = el ? readPx(getComputedStyle(el).width, target(shape.value)) : target(shape.value)
  widthAnimation?.cancel()
  widthAnimation = null
  shape.value = next
  const to = target(next)
  if (!el || Math.abs(from - to) < 0.5) return
  const curve = morphCurve()
  widthAnimation = animateElement(el, [{ width: `${from}px` }, { width: `${to}px` }], {
    duration: curve.duration,
    easing: curve.easing
  })
}

function landShape(isOpen: boolean): void {
  clearBeats()
  widthAnimation?.cancel()
  widthAnimation = null
  cancelAll(glyphAnimations)
  cancelAll(liveAnimations)
  shape.value = isOpen ? 'capsule' : 'circle'
  glyphHidden.value = isOpen
  liveShown.value = isOpen
  morphing.value = false
  setCover(isOpen)
}

/**
 * Grow: the glyph gives way, the capsule opens over the model pill, the waveform comes up. Every leg
 * starts from the frame on screen, so a capsule reopened while it was still closing turns back.
 */
function openCapsule(): void {
  clearBeats()
  startMorph()
  setCover(true)
  const glyphFrom = exitFrame(glyphRef.value, { opacity: 1, scale: 1 })
  glyphHidden.value = true
  cancelAll(glyphAnimations)
  glyphAnimations = running([
    animateElement(glyphRef.value, [glyphFrom, { opacity: 0, scale: 0.6 }], {
      duration: glyphOut.ms,
      easing: glyphOut.easing
    })
  ])
  beat(() => morphWidth('capsule'), capsule.growDelayMs)
  beat(() => {
    const from = entryFrame(liveRef.value, { opacity: 0, scale: 0.8 })
    liveShown.value = true
    cancelAll(liveAnimations)
    const curve = morphCurve()
    liveAnimations = running([
      animateElement(liveRef.value, [{ scale: from.scale }, { scale: 1 }], {
        duration: curve.duration,
        easing: curve.easing
      }),
      animateElement(liveRef.value, [{ opacity: from.opacity }, { opacity: 1 }], {
        duration: 180,
        easing: EASE_OUT_STRONG
      })
    ])
  }, mic.contentDelayMs)
}

/**
 * Retract: the waveform folds, the width follows, the glyph re-arms, the model pill comes back. A
 * session that ended a moment after it opened (an error at once) folds from its half-open frame
 * rather than flashing the waveform full first.
 */
function closeCapsule(): void {
  clearBeats()
  startMorph()
  const wasShown = liveShown.value
  if (wasShown) {
    const from = exitFrame(liveRef.value, { opacity: 1, scale: 1 })
    liveShown.value = false
    cancelAll(liveAnimations)
    liveAnimations = running([
      animateElement(liveRef.value, [from, { opacity: 0, scale: 0.8 }], {
        duration: 120,
        easing: EASE_IN
      })
    ])
  }
  beat(
    () => {
      if (shape.value === 'capsule' || widthAnimation) morphWidth('circle')
      if (!glyphHidden.value) return
      const from = entryFrame(glyphRef.value, { opacity: 0, translate: `0 ${glyphIn.fromPx}px` }, [
        'opacity',
        'scale',
        'translate'
      ])
      glyphHidden.value = false
      cancelAll(glyphAnimations)
      const curve = morphCurve()
      glyphAnimations = running([
        animateElement(
          glyphRef.value,
          [
            { translate: from.translate, scale: from.scale ?? 1 },
            { translate: '0 0', scale: 1 }
          ],
          { duration: curve.duration, easing: curve.easing }
        ),
        animateElement(glyphRef.value, [{ opacity: from.opacity }, { opacity: 1 }], {
          duration: glyphIn.fadeMs,
          easing: EASE_OUT_STRONG
        })
      ])
    },
    wasShown ? capsule.retractDelayMs : 0
  )
  beat(() => setCover(false), micYield.backDelayMs)
}

watch(open, (isOpen) => {
  if (prefersReducedMotion()) {
    landShape(isOpen)
    return
  }
  if (isOpen) openCapsule()
  else closeCapsule()
})

/** The width follows a remeasured cover while open (a model with a longer name was picked). */
watch(capsuleWidth, () => {
  if (shape.value === 'capsule' && !prefersReducedMotion()) morphWidth('capsule')
})

/**
 * T3 ③ / T5 ④: out under the stop capsule, back once the capsule has left the slot — each from the
 * frame on screen, so a yield reversed mid-way turns back instead of jumping.
 */
watch(
  () => props.yielded,
  (isYielded) => {
    const el = rootRef.value
    const reduced = prefersReducedMotion()
    const from = reduced
      ? null
      : isYielded
        ? exitFrame(el, { opacity: 1, scale: 1 })
        : entryFrame(el, { opacity: 0, scale: micYield.scale })
    cancelAll(yieldAnimations)
    yieldAnimations = []
    if (!from) return
    if (isYielded) {
      yieldAnimations = running([
        animateElement(el, [from, { opacity: 0, scale: micYield.scale }], {
          duration: micYield.outMs,
          easing: EASE_IN
        })
      ])
      return
    }
    const curve = releaseCurve()
    yieldAnimations = running([
      animateElement(el, [{ scale: from.scale }, { scale: 1 }], {
        duration: curve.duration,
        easing: curve.easing
      }),
      animateElement(el, [{ opacity: from.opacity }, { opacity: 1 }], {
        duration: micYield.backFadeMs,
        easing: EASE_OUT_STRONG
      })
    ])
  }
)

function onClick(event: MouseEvent): void {
  if (props.state === 'finishing' || props.yielded) {
    event.preventDefault()
    return
  }
  emit('toggle')
}

onBeforeUnmount(() => {
  clearBeats()
  if (morphTimer !== null) clearTimeout(morphTimer)
  morphTimer = null
  widthAnimation?.cancel()
  cancelAll(yieldAnimations)
  cancelAll(glyphAnimations)
  cancelAll(liveAnimations)
})
</script>

<template>
  <!-- `display: contents`: the button stays positioned against the toolbar's slot, and the status
       line is a sibling rather than part of the button's name. -->
  <span class="ComposerMic-Host">
    <button
      ref="rootRef"
      class="ComposerMic"
      type="button"
      :class="{
        'is-open': shape === 'capsule',
        'is-glyph-hidden': glyphHidden,
        'is-live-shown': liveShown,
        'is-morphing': morphing,
        'is-yielded': yielded
      }"
      :data-state="state"
      :style="{
        '--composer-mic-capsule': `${capsuleWidth}px`,
        '--composer-tone-ms': `${toneScore.islandMs}ms`
      }"
      :aria-label="ariaLabel"
      :aria-pressed="state !== 'idle'"
      :aria-busy="state === 'starting' || state === 'finishing' || undefined"
      :aria-disabled="state === 'finishing' || undefined"
      :aria-hidden="yielded || undefined"
      :inert="yielded || undefined"
      @click="onClick"
    >
      <span class="ComposerMic-Skin" aria-hidden="true">
        <span ref="glyphRef" class="ComposerMic-Glyph i-ri-mic-line" />
        <span ref="liveRef" class="ComposerMic-Live">
          <span class="ComposerMic-Meter">
            <span
              v-for="(level, index) in bars"
              :key="index"
              class="ComposerMic-Bar"
              :style="{ '--composer-mic-level': (0.18 + level * 0.82).toFixed(3) }"
            />
          </span>
          <span class="ComposerMic-Still i-ri-mic-fill" />
          <span class="ComposerMic-Dots">
            <span class="ComposerMic-Dot" />
            <span class="ComposerMic-Dot" />
            <span class="ComposerMic-Dot" />
          </span>
          <span class="ComposerMic-Timer">{{ timerText }}</span>
        </span>
      </span>
    </button>
    <span class="ComposerMic-Status" role="status" aria-live="polite">{{ statusText }}</span>
  </span>
</template>

<style lang="scss" scoped>
.ComposerMic-Host {
  display: contents;
}

/*
 * Ink, WCAG 2 contrast (research `current-toolbar.md` §11), light / dark:
 *   idle glyph   secondary on the composer                          5.07 / 8.33 (a glyph: 3:1)
 *   timer        primary 75% → text-primary on primary-soft         5.17 / 6.60
 *   bars         primary on primary-soft                            graphics, above 3:1
 */
.ComposerMic {
  --composer-mic-fill: transparent;
  --composer-mic-ink: var(--shell-text-secondary);

  position: absolute;
  top: 0;
  right: 0;
  display: block;
  box-sizing: border-box;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 16px;
  background: none;
  color: var(--composer-mic-ink);
  font: inherit;
  cursor: pointer;
  appearance: none;

  &:hover:not([aria-disabled='true']) {
    --composer-mic-fill: var(--shell-surface-2);
    --composer-mic-ink: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 2px;
  }

  // The dictation capsule: the width that covers the model pill, in the primary's soft fill.
  &.is-open {
    --composer-mic-fill: var(--shell-primary-soft);
    --composer-mic-ink: color-mix(in srgb, var(--shell-primary) 75%, var(--shell-text-primary));

    width: var(--composer-mic-capsule);

    &:hover:not([aria-disabled='true']) {
      --composer-mic-fill: color-mix(in srgb, var(--shell-primary-soft), var(--shell-primary) 10%);
      --composer-mic-ink: color-mix(in srgb, var(--shell-primary) 75%, var(--shell-text-primary));
    }
  }

  &[aria-disabled='true'] {
    cursor: default;
  }

  // Under the stop capsule: gone from sight and from the pointer (`inert` removes it from focus).
  &.is-yielded {
    opacity: 0;
    scale: 0.85;
    pointer-events: none;
  }

  &.is-morphing {
    @media (prefers-reduced-motion: no-preference) {
      transition: color var(--composer-tone-ms)
        var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
    }
  }
}

.ComposerMic-Skin {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  background-color: var(--composer-mic-fill);

  .ComposerMic.is-morphing & {
    @media (prefers-reduced-motion: no-preference) {
      transition: background-color var(--composer-tone-ms)
        var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
    }
  }
}

.ComposerMic-Glyph {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 16px;
  height: 16px;
  font-size: 16px;

  .ComposerMic.is-glyph-hidden & {
    opacity: 0;
    scale: 0.6;
  }
}

// Laid out at the full capsule width and anchored right, so the growing skin reveals it in place.
.ComposerMic-Live {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: var(--composer-mic-capsule);
  height: 32px;
  padding: 0 12px;
  opacity: 0;

  .ComposerMic.is-live-shown & {
    opacity: 1;
  }
}

.ComposerMic-Meter {
  display: flex;
  gap: 2px;
  align-items: center;
  height: 14px;
}

// A level scales the bar about its centre: transform only, so a frame never lays anything out.
.ComposerMic-Bar {
  flex: none;
  width: 2.5px;
  height: 14px;
  border-radius: 1.25px;
  background: var(--shell-primary);
  scale: 1 var(--composer-mic-level, 0.18);
}

.ComposerMic-Still {
  display: none;
  flex: none;
  width: 14px;
  height: 14px;
  font-size: 14px;
  color: var(--shell-primary);
}

.ComposerMic-Dots {
  display: none;
  gap: 4px;
  align-items: center;
}

.ComposerMic-Dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--shell-primary);
}

.ComposerMic-Timer {
  flex: none;
  min-width: 26px;
  font-size: var(--shell-fs-sm);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  line-height: 16px;
  text-align: right;
}

// Recognizing after the stop: the bars settle into three still dots.
.ComposerMic[data-state='finishing'] {
  .ComposerMic-Meter {
    display: none;
  }

  .ComposerMic-Dots {
    display: flex;
  }
}

.ComposerMic-Status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

@media (prefers-reduced-motion: no-preference) {
  // 10 Hz frames, interpolated between: the waveform glides instead of stepping.
  .ComposerMic-Bar {
    transition: scale 100ms linear;
  }

  // Preparing: no level yet, so no fake one — the bars rest at their floor and breathe.
  .ComposerMic[data-state='starting'] .ComposerMic-Meter,
  .ComposerMic[data-state='finishing'] .ComposerMic-Dots {
    animation: composer-mic-breathe 1.2s ease-in-out infinite;
  }
}

// No moving waveform under reduced motion: a still microphone says "listening" with the fill.
@media (prefers-reduced-motion: reduce) {
  .ComposerMic-Meter {
    display: none;
  }

  .ComposerMic-Still {
    display: inline-flex;
  }

  .ComposerMic[data-state='finishing'] .ComposerMic-Still {
    display: none;
  }
}

@keyframes composer-mic-breathe {
  0%,
  100% {
    opacity: 0.45;
  }

  50% {
    opacity: 1;
  }
}
</style>
