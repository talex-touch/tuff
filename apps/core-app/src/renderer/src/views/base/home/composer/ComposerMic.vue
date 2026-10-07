<script lang="ts" name="ComposerMic" setup>
import type { DictationState } from './useComposerDictation'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  animateElement,
  COMPOSER_MOTION,
  EASE_IN,
  EASE_OUT_STRONG,
  entryFrame,
  exitFrame,
  prefersReducedMotion,
  releaseCurve
} from './composer-motion'
import { useComposerPress } from './useComposerPress'

/**
 * The composer's microphone key. A quiet 32px key at rest; while a dictation session runs it is the
 * session's stop key — the square on the accent's soft fill — and while the last words are being
 * recognized it holds a spinner and takes no press. The session's level and status are drawn by the
 * composer (the voice glow and the toolbar's status line), so the key never grows: it keeps its
 * fixed slot, and only yields that slot to the stop capsule while a reply runs (`yielded`).
 *
 * Presentation only: the session is `useComposerDictation`'s.
 */
const props = withDefaults(
  defineProps<{
    state: DictationState
    /** The stop capsule is covering the slot: hidden, inert, out of the tab order. */
    yielded?: boolean
  }>(),
  { yielded: false }
)

const emit = defineEmits<{ (event: 'toggle'): void }>()

const { t } = useI18n()
const { micYield, press: pressScore } = COMPOSER_MOTION

const busy = computed(() => props.state === 'finishing')
const live = computed(() => props.state === 'starting' || props.state === 'listening')

const ariaLabel = computed(() =>
  props.state === 'idle' ? t('home.voice') : t('home.composer.dictationStop')
)

const rootRef = ref<HTMLButtonElement | null>(null)

useComposerPress(rootRef, {
  scale: () => pressScore.scale,
  disabled: () => busy.value || props.yielded
})

let yieldAnimations: Animation[] = []

function cancelYield(): void {
  for (const animation of yieldAnimations) animation.cancel()
  yieldAnimations = []
}

/**
 * Out under the stop capsule, back once the capsule has left the slot — each from the frame on
 * screen, so a yield reversed mid-way turns back instead of jumping.
 */
watch(
  () => props.yielded,
  (isYielded) => {
    const el = rootRef.value
    const from = prefersReducedMotion()
      ? null
      : isYielded
        ? exitFrame(el, { opacity: 1, scale: 1 })
        : entryFrame(el, { opacity: 0, scale: micYield.scale })
    cancelYield()
    if (!el || !from) return
    if (isYielded) {
      const out = animateElement(el, [from, { opacity: 0, scale: micYield.scale }], {
        duration: micYield.outMs,
        easing: EASE_IN
      })
      if (out) yieldAnimations.push(out)
      return
    }
    const curve = releaseCurve()
    for (const animation of [
      animateElement(el, [{ scale: from.scale }, { scale: 1 }], {
        duration: curve.duration,
        easing: curve.easing
      }),
      animateElement(el, [{ opacity: from.opacity }, { opacity: 1 }], {
        duration: micYield.backFadeMs,
        easing: EASE_OUT_STRONG
      })
    ]) {
      if (animation) yieldAnimations.push(animation)
    }
  }
)

function onClick(event: MouseEvent): void {
  if (busy.value || props.yielded) {
    event.preventDefault()
    return
  }
  emit('toggle')
}

onBeforeUnmount(cancelYield)
</script>

<template>
  <button
    ref="rootRef"
    class="ComposerMic"
    type="button"
    :class="{ 'is-live': live, 'is-busy': busy, 'is-yielded': yielded }"
    :data-state="state"
    :aria-label="ariaLabel"
    :aria-pressed="state !== 'idle'"
    :aria-busy="state === 'starting' || busy || undefined"
    :aria-disabled="busy || undefined"
    :aria-hidden="yielded || undefined"
    :inert="yielded || undefined"
    @click="onClick"
  >
    <span v-if="busy" class="ComposerMic-Spinner i-ri-loader-4-line" aria-hidden="true" />
    <span v-else-if="live" class="ComposerMic-Stop" aria-hidden="true" />
    <span v-else class="ComposerMic-Glyph i-ri-mic-line" aria-hidden="true" />
  </button>
</template>

<style lang="scss" scoped>
/*
 * Ink, WCAG 2 contrast: the idle glyph is the secondary grey on the composer (5.07 light / 8.33
 * dark, a glyph needs 3:1); the stop square is the accent on its soft fill (graphics, above 3:1),
 * and under high contrast the accent's own ink on the accent, as on the send key.
 */
.ComposerMic {
  position: absolute;
  top: 0;
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: var(--shell-text-secondary);
  font: inherit;
  cursor: pointer;
  appearance: none;

  // Immediate: a hover is a sub-100ms interaction and never eases.
  &:hover:not([aria-disabled='true']) {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 2px;
  }

  // A running session: the key stops it.
  &.is-live,
  &.is-busy {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }

  &.is-live:hover {
    background: color-mix(in srgb, var(--shell-primary-soft), var(--shell-primary) 12%);
    color: var(--shell-primary);
  }

  // Under dark high contrast the shell's soft accent re-points to a light tint, and the accent
  // square on it drops to about 1.3:1. Both contrast themes take the send key's pairing instead.
  html.contrast &.is-live,
  html.contrast &.is-live:hover,
  html.contrast &.is-busy {
    background: var(--shell-primary);
    color: var(--shell-on-primary);
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
}

.ComposerMic-Glyph {
  width: 16px;
  height: 16px;
  font-size: 16px;
}

.ComposerMic-Stop {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: currentColor;
}

.ComposerMic-Spinner {
  width: 15px;
  height: 15px;
  font-size: 15px;
}

@media (prefers-reduced-motion: no-preference) {
  .ComposerMic-Spinner {
    animation: composer-mic-spin 0.9s linear infinite;
  }
}

@keyframes composer-mic-spin {
  to {
    rotate: 360deg;
  }
}
</style>
