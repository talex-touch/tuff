<script lang="ts" name="ComposerChip" setup>
import { TxTextTransformer } from '@talex-touch/tuffex/text-transformer'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  animateElement,
  COMPOSER_MOTION,
  EASE_OUT_STRONG,
  prefersReducedMotion,
  readPx
} from './composer-motion'
import { useComposerPress } from './useComposerPress'

/**
 * The toolbar's tonal chip: the permission pill and the model pill are both this. A shell-token
 * port of TxModeChip's measured motion (`09-23-composer-motion-reference` › Motion 3) at the
 * toolbar's 32px: the icon blur-replaces first, the label crossfades out of a blur 50ms behind it,
 * the chip FLIPs its own width, and fill / ink ease only while `.is-morphing` is on.
 *
 * `prefix` stays put (「权限 ·」), `label` is the value that changes, `suffix` rides after it in the
 * lighter ink (the model pill's reasoning level). An icon comes as a class (`icon`) or through the
 * `icon` slot keyed by `iconKey`; `trailing` holds a chevron.
 */
const props = withDefaults(
  defineProps<{
    label: string
    prefix?: string
    suffix?: string
    tone?: 'muted' | 'info' | 'danger'
    icon?: string
    iconKey?: string
    disabled?: boolean
    /** Folds to a 32px icon key once the toolbar is narrower than 520px. */
    collapsible?: boolean
  }>(),
  {
    prefix: '',
    suffix: '',
    tone: 'muted',
    icon: '',
    iconKey: '',
    disabled: false,
    collapsible: false
  }
)

const emit = defineEmits<{ (event: 'click', payload: MouseEvent): void }>()

const { chip, tone: toneScore } = COMPOSER_MOTION
// `.is-morphing` has to outlast every leg: the label's delay plus the longer of fade and width.
const MORPH_MS = chip.labelDelayMs + Math.max(chip.labelFadeMs, chip.widthMs)

const rootRef = ref<HTMLButtonElement | null>(null)
// Trail `label` / `suffix` by `labelDelayMs` during a morph, so the icon visibly leads the text.
const displayLabel = ref(props.label)
const displaySuffix = ref(props.suffix)
const morphing = ref(false)
const resizing = ref(false)
const iconIdentity = computed(() => props.iconKey || props.icon)

let labelTimer: ReturnType<typeof setTimeout> | null = null
let settleTimer: ReturnType<typeof setTimeout> | null = null
let widthAnimation: Animation | null = null

useComposerPress(rootRef, { disabled: () => props.disabled })

/** The box a `width` keyframe means: a scaled ancestor inflates the visual rect. */
function layoutWidth(el: HTMLElement): number {
  return readPx(getComputedStyle(el).width, el.getBoundingClientRect().width)
}

function stopWidth(): void {
  const running = widthAnimation
  widthAnimation = null
  running?.cancel()
  resizing.value = false
}

/** FLIPs the width across one DOM change; `first` is read before the change renders. */
async function flipWidth(apply?: () => void): Promise<void> {
  const el = rootRef.value
  if (!el) {
    apply?.()
    return
  }
  const first = layoutWidth(el)
  stopWidth()
  apply?.()
  await nextTick()
  if (rootRef.value !== el) return
  const last = layoutWidth(el)
  if (Math.abs(last - first) < 0.5) return
  const animation = animateElement(el, [{ width: `${first}px` }, { width: `${last}px` }], {
    duration: chip.widthMs,
    easing: EASE_OUT_STRONG
  })
  if (!animation) return
  widthAnimation = animation
  resizing.value = true
  animation.onfinish = () => {
    if (widthAnimation !== animation) return
    widthAnimation = null
    resizing.value = false
  }
}

function clearTimers(): void {
  if (labelTimer !== null) clearTimeout(labelTimer)
  if (settleTimer !== null) clearTimeout(settleTimer)
  labelTimer = null
  settleTimer = null
}

watch([() => props.label, () => props.suffix, iconIdentity, () => props.tone], () => {
  clearTimers()

  // Everything lands at once: nothing waits on a timer and nothing tweens.
  if (prefersReducedMotion()) {
    stopWidth()
    morphing.value = false
    displayLabel.value = props.label
    displaySuffix.value = props.suffix
    return
  }

  morphing.value = true
  // An icon arriving or leaving changes the width now, not at the label swap. Pre-flush, so
  // `first` is still the box from before the render.
  void flipWidth()

  if (displayLabel.value !== props.label || displaySuffix.value !== props.suffix) {
    labelTimer = setTimeout(() => {
      labelTimer = null
      void flipWidth(() => {
        displayLabel.value = props.label
        displaySuffix.value = props.suffix
      })
    }, chip.labelDelayMs)
  }

  settleTimer = setTimeout(() => {
    settleTimer = null
    morphing.value = false
  }, MORPH_MS)
})

function onClick(event: MouseEvent): void {
  if (props.disabled) {
    event.preventDefault()
    return
  }
  emit('click', event)
}

onBeforeUnmount(() => {
  clearTimers()
  stopWidth()
})
</script>

<template>
  <button
    ref="rootRef"
    type="button"
    class="ComposerChip"
    :class="[
      `is-${tone}`,
      {
        'has-icon': !!icon || !!$slots.icon,
        'has-trailing': !!$slots.trailing,
        'is-morphing': morphing,
        'is-resizing': resizing,
        'is-collapsible': collapsible
      }
    ]"
    :style="{ '--composer-tone-ms': `${toneScore.chipMs}ms` }"
    :aria-disabled="disabled || undefined"
    @click="onClick"
  >
    <span v-if="icon || $slots.icon" class="ComposerChip-Icon" aria-hidden="true">
      <Transition name="composer-chip-icon">
        <span :key="iconIdentity" class="ComposerChip-Glyph">
          <slot name="icon"><span :class="icon" /></slot>
        </span>
      </Transition>
    </span>
    <span class="ComposerChip-Text">
      <span v-if="prefix" class="ComposerChip-Prefix">{{ prefix }}</span>
      <TxTextTransformer
        class="ComposerChip-Label"
        mode="fade"
        :text="displayLabel"
        :duration-ms="chip.labelFadeMs"
        :blur-px="chip.labelBlurPx"
      />
      <TxTextTransformer
        v-if="displaySuffix"
        class="ComposerChip-Suffix"
        mode="fade"
        :text="displaySuffix"
        :duration-ms="chip.labelFadeMs"
        :blur-px="chip.labelBlurPx"
      />
    </span>
    <slot name="trailing" />
  </button>
</template>

<style lang="scss" scoped>
/*
 * Ink on fill, WCAG 2 contrast, resting / hovered, light / dark — computed from the shell tokens
 * (script: research `current-toolbar.md` §11, `/tmp/composer-controls-probe/contrast.mjs`; hover
 * fills estimated at twice the soft alpha, which the mixes below stay under):
 *
 *   muted   label regular on surface-2               7.95 / 7.08   9.16 / 7.68
 *           suffix secondary×regular on surface-2    5.89 / 5.25   7.65 / 6.41
 *   info    primary 75% → text-primary on soft       5.17 / 4.55   6.60 / 5.01
 *   danger  danger 75% → text-primary on soft        6.66 / 5.90   6.04 / 4.73
 *
 * The plain secondary grey measured 4.42 on surface-2, under the 4.5 that 13px text needs, so the
 * suffix mixes it half-way to the regular ink instead. Re-measure when a shell token moves.
 */
.ComposerChip {
  --composer-chip-fill: var(--shell-surface-2);
  --composer-chip-fill-hover: color-mix(
    in srgb,
    var(--shell-text-primary) 6%,
    var(--shell-surface-2)
  );
  --composer-chip-ink: var(--shell-text-regular);
  --composer-chip-ring: transparent;

  display: inline-flex;
  flex: none;
  position: relative;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  max-width: 100%;
  height: 32px;
  margin: 0;
  // 7px above and below an 18px line; 12px sideways keeps the inset ~0.6x.
  padding: 0 12px;
  overflow: hidden;
  border: 0;
  border-radius: var(--shell-radius-full);
  background-color: var(--composer-chip-fill);
  // A ring, not a border: the chip stays exactly 32px next to its untinted neighbours.
  box-shadow: inset 0 0 0 1px var(--composer-chip-ring);
  color: var(--composer-chip-ink);
  font: inherit;
  font-size: var(--shell-fs-body);
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
  appearance: none;

  // The glyph carries its own side bearings, so the icon side sits tighter.
  &.has-icon {
    padding-left: 10px;
  }

  &.has-trailing {
    padding-right: 8px;
  }

  // Immediate: outside a morph the chip has no colour transition to run.
  &:hover:not([aria-disabled='true']) {
    background-color: var(--composer-chip-fill-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 2px;
  }

  &[aria-disabled='true'] {
    cursor: not-allowed;
    opacity: 0.5;
  }

  // The only place fill, ink and ring may transition: the class lives exactly as long as a
  // label / icon / tone change, so a hover never eases.
  &.is-morphing {
    @media (prefers-reduced-motion: no-preference) {
      transition:
        background-color var(--composer-tone-ms)
          var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
        color var(--composer-tone-ms) var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
        box-shadow var(--composer-tone-ms) var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
    }
  }

  // 「自动审阅」: an ordinary enabled state, so it carries the accent.
  &.is-info {
    --composer-chip-fill: var(--shell-primary-soft);
    --composer-chip-fill-hover: color-mix(
      in srgb,
      var(--shell-primary-soft),
      var(--shell-primary) 10%
    );
    --composer-chip-ink: color-mix(in srgb, var(--shell-primary) 75%, var(--shell-text-primary));
    --composer-chip-ring: var(--shell-primary-border);
  }

  // 「完全允许」 must stay visible as a state: every tool call runs unasked while it is on.
  &.is-danger {
    --composer-chip-fill: var(--shell-danger-soft);
    --composer-chip-fill-hover: color-mix(
      in srgb,
      var(--shell-danger-soft),
      var(--shell-danger) 8%
    );
    --composer-chip-ink: color-mix(in srgb, var(--shell-danger) 75%, var(--shell-text-primary));
    --composer-chip-ring: var(--shell-danger-border);
  }
}

// A fixed square: the glyphs swap inside it, so an icon change never moves the label.
.ComposerChip-Icon {
  display: inline-flex;
  position: relative;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
}

.ComposerChip-Glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 14px;
  line-height: 1;
}

.ComposerChip-Text {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.ComposerChip-Prefix {
  font-weight: 400;
}

.ComposerChip-Suffix {
  color: color-mix(in srgb, var(--shell-text-secondary) 50%, var(--shell-text-regular));
  font-weight: 400;
}

.ComposerChip-Label,
.ComposerChip-Suffix {
  // While the width tweens up the chip is narrower than the new text; shrinking would ellipsise it
  // for the length of the tween, so the chip clips it instead.
  .ComposerChip.is-resizing & {
    flex-shrink: 0;
    max-width: none;
  }

  @media (prefers-reduced-motion: no-preference) {
    // The layers carry their own `color` tween, which an inherited ink change would ease.
    :deep(.tx-text-transformer__layer) {
      transition-property: opacity, filter;
    }

    // The outgoing label is gone in ~80ms; the incoming one takes the full fade.
    :deep(.tx-text-transformer__layer--prev) {
      transition-duration: 80ms;
    }
  }
}

// Out of flow, so the incoming glyph owns the box from its first frame.
.composer-chip-icon-leave-active {
  position: absolute;
  inset: 0;
}

@media (prefers-reduced-motion: no-preference) {
  .composer-chip-icon-enter-active {
    transition:
      scale 240ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      opacity 240ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      filter 240ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
  }

  .composer-chip-icon-leave-active {
    transition:
      scale 160ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      opacity 160ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      filter 160ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
  }

  // Blur-replace: shrink to half, blur and fade out; the new glyph comes the other way.
  .composer-chip-icon-enter-from,
  .composer-chip-icon-leave-to {
    opacity: 0;
    scale: 0.5;
    filter: blur(2px);
  }
}

@media (prefers-reduced-motion: reduce) {
  // Vue holds the leaving glyph for two frames before it finds no transition; hide it at once.
  .composer-chip-icon-leave-active {
    opacity: 0;
  }
}

// The right panel or a narrow window reduces the composer itself, so the query is the toolbar's
// real width, not the viewport's. The label stays in the accessible name.
@container home-composer-tools (max-width: 520px) {
  .ComposerChip.is-collapsible {
    justify-content: center;
    width: 32px;
    padding-inline: 0;
  }

  .ComposerChip.is-collapsible .ComposerChip-Text {
    display: none;
  }
}
</style>
