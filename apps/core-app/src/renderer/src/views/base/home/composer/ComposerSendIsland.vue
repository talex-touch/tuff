<script lang="ts" name="ComposerSendIsland" setup>
import type { SendState } from './send-state'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import MetaHintBadge from '~/components/shell/MetaHintBadge.vue'
import {
  animateElement,
  COMPOSER_MOTION,
  EASE_IN,
  EASE_OUT_STRONG,
  entryFrame,
  exitFrame,
  morphCurve,
  prefersReducedMotion,
  readFrame,
  readPx,
  readScale,
  releaseCurve
} from './composer-motion'
import { isCapsuleSendState } from './send-state'
import { useComposerPress } from './useComposerPress'

/**
 * The send key as one resident island (task `09-26-composer-controls-redesign` §2): a 32px circle
 * while there is something to send, a 72px ink 「■ 停止」 capsule while a reply runs.
 *
 * Geometry is the whole contract. The row holds a fixed 32×32 slot; this button sits in it
 * absolutely at `right: 0` and is the only box whose width changes, so growing left over the
 * microphone's slot never moves a neighbour. Skin, glyphs and ring are layers inside it, each with
 * its own clock: the press owns the button's `scale`, the shape its `width`, the skin its colour.
 *
 * The launch (`launch()`) runs at the press, before the reply exists: the arrow rides up with the
 * lifted message, the microphone yields, then — once the turn has started — the key grows, turns to
 * ink and blooms 「■ 停止」 at 120ms. A turn that ends inside that window never shows the stop label
 * (T7). Every beat is a timer plus a WAAPI curve; resting styles are the end states, so reduced
 * motion simply lands on them.
 */
const props = defineProps<{
  state: SendState
  /** Accessible name while the key sends — 「发送」, or 「结束听写并发送」 during dictation. */
  sendLabel: string
  /** Accessible name while the key stops; contains `stopText` (label in name). */
  stopLabel: string
  /** The capsule's visible word. */
  stopText: string
}>()

const emit = defineEmits<{
  (event: 'send'): void
  (event: 'stop'): void
  /** The microphone should give its slot up to the capsule (`true`) or take it back. */
  (event: 'yield', yielded: boolean): void
}>()

type Shape = 'circle' | 'capsule'
type Tone = 'neutral' | 'primary' | 'ink'

const {
  capsule,
  stopBloom,
  stopFold,
  glyphOut,
  glyphIn,
  micYield,
  tone: toneScore,
  wake,
  settle,
  firstTokenTick,
  press: pressScore,
  ring,
  launchSettleMs
} = COMPOSER_MOTION

const CIRCLE_PX = 32
/** A state change this soon after `launch()` belongs to that launch. */
const LAUNCH_WINDOW_MS = 100

function toneOf(state: SendState): Tone {
  if (isCapsuleSendState(state)) return 'ink'
  return state === 'ready' ? 'primary' : 'neutral'
}

const initialCapsule = isCapsuleSendState(props.state)
const shape = ref<Shape>(initialCapsule ? 'capsule' : 'circle')
const tone = ref<Tone>(toneOf(props.state))
const arrowHidden = ref(initialCapsule)
const bloomed = ref(initialCapsule)
const morphing = ref(false)
const toneMs = ref<number>(toneScore.circleMs)

const capsuleState = computed(() => isCapsuleSendState(props.state))

const rootRef = ref<HTMLButtonElement | null>(null)
const skinRef = ref<HTMLElement | null>(null)
const arrowRef = ref<HTMLElement | null>(null)
const stopRef = ref<HTMLElement | null>(null)
const squareRef = ref<HTMLElement | null>(null)
const ringPulseRef = ref<HTMLElement | null>(null)

const press = useComposerPress(rootRef, {
  scale: () => (shape.value === 'capsule' ? pressScore.capsuleScale : pressScore.islandScale),
  disabled: () => props.state === 'empty'
})

const islandStyle = computed(() => ({
  '--composer-tone-ms': `${toneMs.value}ms`,
  '--composer-ring-turn': `${ring.turnMs}ms`,
  '--composer-ring-breathe': `${ring.breatheMs}ms`,
  '--composer-ring-settle': `${ring.settleMs}ms`
}))

// ---------------------------------------------------------------------------
// Beats and running animations
// ---------------------------------------------------------------------------

const beats = new Set<ReturnType<typeof setTimeout>>()
let morphTimer: ReturnType<typeof setTimeout> | null = null
let widthAnimation: Animation | null = null
let skinAnimation: Animation | null = null
let tickAnimation: Animation | null = null
let breathAnimation: Animation | null = null
let arrowAnimations: Animation[] = []
let stopAnimations: Animation[] = []
let launchedAt = Number.NEGATIVE_INFINITY
let launchPending = false
let yielded = initialCapsule

/** Runs `fn` after `ms`, or now when the beat is already due. Cleared by the next transition. */
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

function cancelAnimations(): void {
  widthAnimation?.cancel()
  skinAnimation?.cancel()
  tickAnimation?.cancel()
  breathAnimation?.cancel()
  cancelAll(arrowAnimations)
  cancelAll(stopAnimations)
  widthAnimation = null
  skinAnimation = null
  tickAnimation = null
  breathAnimation = null
  arrowAnimations = []
  stopAnimations = []
}

function setYield(next: boolean): void {
  if (yielded === next) return
  yielded = next
  emit('yield', next)
}

// ---------------------------------------------------------------------------
// Legs: each owns one layer's property
// ---------------------------------------------------------------------------

/** Fill and ink ease only while `.is-morphing` is on, for exactly this recolour. */
function setTone(next: Tone, ms: number): void {
  if (tone.value === next) return
  tone.value = next
  toneMs.value = ms
  morphing.value = true
  if (morphTimer !== null) clearTimeout(morphTimer)
  morphTimer = setTimeout(() => {
    morphTimer = null
    morphing.value = false
  }, ms + 40)
}

/** Width, from where the key visibly is — a growth cut short included — to the shape's rest. */
function morphWidth(next: Shape): void {
  const el = rootRef.value
  const fallback = shape.value === 'capsule' ? capsule.width : CIRCLE_PX
  const from = el ? readPx(getComputedStyle(el).width, fallback) : fallback
  widthAnimation?.cancel()
  widthAnimation = null
  shape.value = next
  const to = next === 'capsule' ? capsule.width : CIRCLE_PX
  if (!el || Math.abs(from - to) < 0.5) return
  const curve = morphCurve()
  widthAnimation = animateElement(el, [{ width: `${from}px` }, { width: `${to}px` }], {
    duration: curve.duration,
    easing: curve.easing
  })
}

/**
 * T3 ②: up and out with the lifted message — not blurred, because the bubble is not. From where the
 * arrow is: a re-arm cut short leaves from its own frame.
 */
function hideArrow(): void {
  if (arrowHidden.value) return
  const from = exitFrame(arrowRef.value, { opacity: 1, translate: '0 0' }, ['opacity', 'translate'])
  arrowHidden.value = true
  cancelAll(arrowAnimations)
  arrowAnimations = running([
    animateElement(arrowRef.value, [from, { opacity: 0, translate: `0 -${glyphOut.risePx}px` }], {
      duration: glyphOut.ms,
      easing: glyphOut.easing
    })
  ])
}

/**
 * T5 ②: re-armed from below on the morph spring. An arrow caught still leaving (T7, a turn that
 * ended inside the launch) turns back from where it is, at once, rather than vanishing to re-arm.
 */
function showArrow(delay: number): void {
  if (!arrowHidden.value) return
  const rearm = { opacity: 0, translate: `0 ${glyphIn.fromPx}px` }
  const from = entryFrame(arrowRef.value, rearm, ['opacity', 'translate'])
  // Only a real re-arm waits for the fold; an arrow turning back does so at once.
  const start = from === rearm ? delay : 0
  arrowHidden.value = false
  cancelAll(arrowAnimations)
  const curve = morphCurve()
  arrowAnimations = running([
    animateElement(arrowRef.value, [{ translate: from.translate }, { translate: '0 0' }], {
      duration: curve.duration,
      easing: curve.easing,
      delay: start,
      fill: 'backwards'
    }),
    animateElement(arrowRef.value, [{ opacity: from.opacity }, { opacity: 1 }], {
      duration: glyphIn.fadeMs,
      easing: EASE_OUT_STRONG,
      delay: start,
      fill: 'backwards'
    })
  ])
}

/** T3 ⑥: 「■ 停止」 opens out of the grown key — or, caught folding, turns back from there. */
function bloom(): void {
  if (bloomed.value) return
  const from = entryFrame(stopRef.value, { opacity: 0, scale: stopBloom.fromScale })
  bloomed.value = true
  cancelAll(stopAnimations)
  const curve = morphCurve()
  stopAnimations = running([
    animateElement(stopRef.value, [{ scale: from.scale }, { scale: 1 }], {
      duration: curve.duration,
      easing: curve.easing
    }),
    animateElement(stopRef.value, [{ opacity: from.opacity }, { opacity: 1 }], {
      duration: stopBloom.fadeMs,
      easing: EASE_OUT_STRONG
    }),
    animateElement(
      squareRef.value,
      [{ borderRadius: `${stopBloom.radiusFrom}px` }, { borderRadius: `${stopBloom.radiusTo}px` }],
      { duration: stopBloom.fadeMs, easing: EASE_OUT_STRONG }
    )
  ])
}

/**
 * T5 ①: 「■ 停止」 folds away before the key does, from where it is: a bloom cut short (a turn that
 * failed a moment after it opened) folds from its half-open frame instead of flashing full first.
 */
function fold(): void {
  if (!bloomed.value) return
  const from = exitFrame(stopRef.value, { opacity: 1, scale: 1 })
  bloomed.value = false
  cancelAll(stopAnimations)
  stopAnimations = running([
    animateElement(stopRef.value, [from, { opacity: 0, scale: stopFold.toScale }], {
      duration: stopFold.ms,
      easing: EASE_IN
    })
  ])
}

/** T1 wake / T5 settle: the skin springs back to rest from a small squeeze. */
function springSkin(fromScale: number): void {
  skinAnimation?.cancel()
  const curve = releaseCurve()
  skinAnimation = animateElement(skinRef.value, [{ scale: fromScale }, { scale: 1 }], {
    duration: curve.duration,
    easing: curve.easing
  })
}

/** T4: the first token lands and the square ticks once, from wherever its breath had it. */
function tick(): void {
  const from = squareRef.value ? readScale(squareRef.value) : 1
  tickAnimation?.cancel()
  tickAnimation = animateElement(
    squareRef.value,
    [
      { scale: from, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
      { scale: firstTokenTick.scale, offset: 0.35, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
      { scale: 1 }
    ],
    { duration: firstTokenTick.ms }
  )
}

/**
 * T4 (and a stop before the first token): the ring's waiting breath lets go to full over
 * `ring.settleMs` from the value it had reached. Removing the CSS animation alone would snap it —
 * a transition never starts from an animated value. `blocked` is left to its own CSS transition.
 */
function releaseBreath(): void {
  const el = ringPulseRef.value
  const from = readFrame(el, ['opacity']).opacity
  breathAnimation?.cancel()
  breathAnimation =
    from === undefined
      ? null
      : animateElement(el, [{ opacity: from }, { opacity: 1 }], {
          duration: ring.settleMs,
          easing: 'ease'
        })
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/** Reduced motion, or a state that must hold at once: every layer on its end state. */
function land(state: SendState): void {
  clearBeats()
  cancelAnimations()
  launchPending = false
  const capsuleNow = isCapsuleSendState(state)
  shape.value = capsuleNow ? 'capsule' : 'circle'
  tone.value = toneOf(state)
  morphing.value = false
  arrowHidden.value = capsuleNow
  bloomed.value = capsuleNow
  setYield(capsuleNow)
}

/** T3: grow, ink, bloom — timed from the launch when there was one, from now otherwise. */
function enterCapsule(): void {
  clearBeats()
  const now = performance.now()
  const fromLaunch = launchPending && now - launchedAt < LAUNCH_WINDOW_MS
  launchPending = false
  if (!fromLaunch) {
    // A turn started without a press (a form answer, a retry): the arrow still leaves first.
    hideArrow()
    setYield(true)
  }
  const since = fromLaunch ? now - launchedAt : 0
  beat(() => morphWidth('capsule'), capsule.growDelayMs - since)
  beat(() => setTone('ink', toneScore.islandMs), capsule.toneDelayMs - since)
  beat(bloom, stopBloom.delayMs - since)
}

/** T5 / T6 / T7: fold the label, retract from wherever the width got, re-arm the arrow. */
function leaveCapsule(next: SendState): void {
  clearBeats()
  launchPending = false
  const wasBloomed = bloomed.value
  fold()
  beat(
    () => {
      if (shape.value === 'capsule' || widthAnimation) morphWidth('circle')
      showArrow(wasBloomed ? 0 : glyphIn.delayMs)
      setTone(toneOf(next), toneScore.islandMs)
      springSkin(settle.fromScale)
    },
    wasBloomed ? capsule.retractDelayMs : 0
  )
  beat(() => setYield(false), micYield.backDelayMs)
}

function applyState(next: SendState, previous: SendState): void {
  if (prefersReducedMotion()) {
    land(next)
    return
  }
  // Read before this flush re-renders `data-state`: the breath is still on screen.
  if (previous === 'waiting' && next !== 'blocked') releaseBreath()
  const toCapsule = isCapsuleSendState(next)
  const fromCapsule = isCapsuleSendState(previous)
  if (toCapsule && !fromCapsule) {
    enterCapsule()
    return
  }
  if (fromCapsule && !toCapsule) {
    leaveCapsule(next)
    return
  }
  if (toCapsule) {
    if (previous === 'waiting' && next === 'streaming' && bloomed.value) tick()
    return
  }
  // Circle to circle. A launch owns the key until its turn starts: the draft clears a flush before
  // the reply exists, and that `ready → empty` must not grey the key on its way to ink.
  if (launchPending) return
  const nextTone = toneOf(next)
  const woke = nextTone === 'primary' && tone.value === 'neutral'
  setTone(nextTone, toneScore.circleMs)
  if (woke) springSkin(wake.fromScale)
}

watch(
  () => props.state,
  (next, previous) => applyState(next, previous)
)

/** The launch's ending when no turn followed: the arrow back, the slot back. */
function settleLaunch(): void {
  if (!launchPending) return
  launchPending = false
  showArrow(0)
  setTone(toneOf(props.state), toneScore.circleMs)
  setYield(false)
}

/**
 * T3 ①–③, at the press. Called by the page from `submit()` right after its guard, so a click, Enter
 * and the send shortcut all launch alike. A pointer that just pressed already told the press story;
 * a keyboard send gets a programmatic one.
 */
function launch(): void {
  if (prefersReducedMotion() || isCapsuleSendState(props.state)) return
  clearBeats()
  launchedAt = performance.now()
  launchPending = true
  if (!press.pressedRecently()) press.pulse()
  hideArrow()
  setYield(true)
  beat(settleLaunch, launchSettleMs)
}

function onClick(event: MouseEvent): void {
  if (isCapsuleSendState(props.state)) {
    emit('stop')
    return
  }
  if (props.state === 'ready') {
    emit('send')
    return
  }
  event.preventDefault()
}

onBeforeUnmount(() => {
  clearBeats()
  cancelAnimations()
  if (morphTimer !== null) clearTimeout(morphTimer)
  morphTimer = null
})

defineExpose({ launch })
</script>

<template>
  <button
    ref="rootRef"
    class="ComposerSendIsland"
    type="button"
    :class="{ 'is-morphing': morphing, 'is-arrow-hidden': arrowHidden, 'is-bloomed': bloomed }"
    :data-state="state"
    :data-shape="shape"
    :data-tone="tone"
    :style="islandStyle"
    :aria-label="capsuleState ? stopLabel : sendLabel"
    :aria-disabled="state === 'empty' || undefined"
    @click="onClick"
  >
    <!-- The TuffIntelligence ring: a 1.5px band plus a blurred copy, gated by the composer's own
         `--home-glow-on`, so it fades in and out with the composer's live light. -->
    <span class="ComposerSendIsland-Ring" aria-hidden="true">
      <span ref="ringPulseRef" class="ComposerSendIsland-RingPulse">
        <span class="ComposerSendIsland-RingHalo">
          <span class="ComposerSendIsland-RingBand">
            <span class="ComposerSendIsland-RingConic" />
          </span>
        </span>
        <span class="ComposerSendIsland-RingBand">
          <span class="ComposerSendIsland-RingConic" />
        </span>
      </span>
    </span>
    <span ref="skinRef" class="ComposerSendIsland-Skin" aria-hidden="true">
      <span ref="arrowRef" class="ComposerSendIsland-Arrow i-ri-arrow-up-line" />
      <span ref="stopRef" class="ComposerSendIsland-Stop">
        <span ref="squareRef" class="ComposerSendIsland-Square" />
        <span class="ComposerSendIsland-StopText">{{ stopText }}</span>
      </span>
    </span>
    <MetaHintBadge :command="capsuleState ? 'stop' : 'send'" placement="above" />
  </button>
</template>

<style lang="scss" scoped>
/*
 * Ink on fill, WCAG 2 contrast (research `current-toolbar.md` §11), light / dark:
 *   ready    on-primary on primary          4.09 / 5.24  (a glyph: 3:1)
 *   empty    muted on surface-2             2.99 / 4.05  (the disabled key; its state is also
 *                                                         carried by aria-disabled)
 *   capsule  bg on text-primary             16.8 / 16.9
 */
.ComposerSendIsland {
  --composer-island-fill: var(--shell-surface-2);
  --composer-island-ink: var(--shell-text-muted);
  --composer-island-highlight: 0;
  --composer-island-shadow: 0 0 0 transparent;

  position: absolute;
  top: 0;
  right: 0;
  display: block;
  box-sizing: border-box;
  // The resting width is the shape's end state; WAAPI plays the way between (`morphWidth`).
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  // Concentric with the composer's 24px corner at the 8px inset; the focus ring follows it.
  border-radius: 16px;
  background: none;
  color: var(--composer-island-ink);
  font: inherit;
  cursor: pointer;
  appearance: none;

  &[data-shape='capsule'] {
    width: 72px;
  }

  &[data-tone='primary'] {
    --composer-island-fill: var(--shell-primary);
    --composer-island-ink: var(--shell-on-primary);
    --composer-island-highlight: 1;
    // One light source, top-left: x:y = 1:2.
    --composer-island-shadow: 1px 2px 6px color-mix(in srgb, var(--shell-primary) 28%, transparent);
  }

  // The island: near-black on light, near-white on dark.
  &[data-tone='ink'] {
    --composer-island-fill: var(--shell-text-primary);
    --composer-island-ink: var(--shell-bg);
  }

  // Hover deepens at once and never scales (D13).
  &[data-tone='primary']:hover {
    --composer-island-fill: color-mix(in srgb, var(--shell-primary) 88%, var(--shell-text-primary));
  }

  &[data-tone='ink']:hover {
    --composer-island-fill: color-mix(in srgb, var(--shell-text-primary) 86%, var(--shell-bg));
  }

  &[aria-disabled='true'] {
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 2px;
  }

  &.is-morphing {
    @media (prefers-reduced-motion: no-preference) {
      transition: color var(--composer-tone-ms)
        var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
    }
  }
}

.ComposerSendIsland-Skin {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  background-color: var(--composer-island-fill);
  box-shadow: var(--composer-island-shadow);

  // The top-left sheen of the primary key, as a layer so the fill underneath can ease.
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: linear-gradient(
      135deg,
      color-mix(in srgb, white 18%, transparent),
      transparent 65%
    );
    opacity: var(--composer-island-highlight);
    pointer-events: none;
  }

  .ComposerSendIsland.is-morphing & {
    @media (prefers-reduced-motion: no-preference) {
      transition:
        background-color var(--composer-tone-ms)
          var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
        box-shadow var(--composer-tone-ms) var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
    }
  }

  .ComposerSendIsland.is-morphing &::before {
    @media (prefers-reduced-motion: no-preference) {
      transition: opacity var(--composer-tone-ms)
        var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
    }
  }
}

// In the right-hand 32px square: the capsule grows left of it.
.ComposerSendIsland-Arrow {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 16px;
  height: 16px;
  font-size: 16px;

  .ComposerSendIsland.is-arrow-hidden & {
    opacity: 0;
    translate: 0 -8px;
  }
}

// Laid out at the full capsule width and anchored right, so the growing skin reveals it in place.
.ComposerSendIsland-Stop {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 72px;
  height: 32px;
  padding: 0 12px;
  font-size: var(--shell-fs-body);
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
  opacity: 0;

  .ComposerSendIsland.is-bloomed & {
    opacity: 1;
  }
}

.ComposerSendIsland-Square {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 2.5px;
  background: currentColor;
}

// The ring hugs the key 3px out: 19px keeps it concentric with the 16px radius.
.ComposerSendIsland-Ring {
  position: absolute;
  inset: -3px;
  border-radius: 19px;
  pointer-events: none;
  opacity: var(--home-glow-on, 0);
}

.ComposerSendIsland-RingPulse {
  position: absolute;
  inset: 0;
  border-radius: inherit;

  // Waiting on the user's tool approval: the light holds still at half.
  .ComposerSendIsland[data-state='blocked'] & {
    opacity: 0.5;
  }
}

.ComposerSendIsland-RingBand {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.5px;
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}

// Blurred after the mask, so the band bleeds a soft 3px halo instead of a cut edge.
.ComposerSendIsland-RingHalo {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  filter: blur(3px);
  opacity: 0.6;
}

// A square wheel larger than the capsule's diagonal, turned on the compositor inside the band.
.ComposerSendIsland-RingConic {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 128px;
  height: 128px;
  margin: -64px 0 0 -64px;
  background: conic-gradient(
    in oklch,
    var(--home-live-stops, #0894ff, #c959dd 27%, #ff2e54 52%, #ff9004 74%, #0894ff)
  );
}

@media (prefers-reduced-motion: no-preference) {
  // Paused rather than removed outside the running states: a removed spin would snap the wheel
  // back to 0° in the middle of the fade-out.
  .ComposerSendIsland-RingConic {
    animation: composer-ring-spin var(--composer-ring-turn) linear infinite;
    animation-play-state: paused;
  }

  .ComposerSendIsland[data-state='waiting'] .ComposerSendIsland-RingConic,
  .ComposerSendIsland[data-state='streaming'] .ComposerSendIsland-RingConic {
    animation-play-state: running;
  }

  .ComposerSendIsland-RingPulse {
    transition: opacity var(--composer-ring-settle) ease;
  }

  .ComposerSendIsland[data-state='waiting'] .ComposerSendIsland-RingPulse {
    animation: composer-ring-breathe var(--composer-ring-breathe) ease-in-out infinite;
  }

  .ComposerSendIsland[data-state='waiting'].is-bloomed .ComposerSendIsland-Square {
    animation: composer-square-breathe var(--composer-ring-breathe) ease-in-out infinite;
  }
}

@keyframes composer-ring-spin {
  to {
    rotate: 360deg;
  }
}

@keyframes composer-ring-breathe {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }
}

@keyframes composer-square-breathe {
  0%,
  100% {
    scale: 1;
  }

  50% {
    scale: 0.92;
  }
}
</style>
