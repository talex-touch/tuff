<script setup lang="ts">
import type { PropType } from 'vue'
import type { ResolvedTransition } from '../../liquid/src/spring'
import type { StatusTone } from '../../status-badge/src/types'
import type { StatusHintProps, StatusHintSize } from './types'
import { computed, onMounted, shallowRef, watch } from 'vue'
import { TxIcon } from '../../icon'
import { resolveTransition } from '../../liquid/src/spring'
import TxTextTransformer from '../../text-transformer/src/TxTextTransformer.vue'

defineOptions({ name: 'TxStatusHint' })

// A runtime object rather than `defineProps<StatusHintProps>()`, as in TxModeChip: the dev
// server does not recompile this file when `types.ts` changes, so a type-only declaration would
// ship a new prop as an unknown attribute. `satisfies` keeps the two in step; `required` needs
// `as const`, or it widens to `boolean` and Vue types `text` as optional.
const props = defineProps({
  text: { type: [String, Number] as PropType<string | number>, required: true as const },
  tone: { type: String as PropType<StatusTone>, default: 'success' },
  size: { type: String as PropType<StatusHintSize>, default: 'md' },
  pulseKey: { type: [String, Number] as PropType<string | number>, default: undefined },
  animated: { type: Boolean, default: true },
  live: { type: Boolean, default: true },
} satisfies Record<keyof StatusHintProps, unknown>)

defineSlots<{
  /** Replaces the tone's glyph. Drawn in the tone's colour, hidden from assistive tech. */
  icon?: () => any
}>()

// TxIcon's built-in ring glyphs, as TxAlert draws them: Nexus cannot resolve `i-ri-*`.
// `muted` has none, so it reserves no icon box unless the slot brings one.
const GLYPHS: Partial<Record<StatusTone, string>> = {
  success: 'check-circle',
  warning: 'alert-triangle',
  danger: 'x-circle',
  info: 'info',
}
const glyph = computed(() => GLYPHS[props.tone] ?? '')

const TEXT_MORPH_MS = 380

// Which replay is showing: 0 until the first change after mount (the entrance plays then),
// then 1 and 2 in turn. The two classes name two identical keyframe sets, so switching
// between them restarts the CSS animations without forcing a reflow. One watcher over both
// sources, so a message that changes text and key in one update replays once.
const pulse = shallowRef<0 | 1 | 2>(0)
watch([() => props.text, () => props.pulseKey], () => {
  if (props.animated)
    pulse.value = pulse.value === 1 ? 2 : 1
})

// The entrance spring, compiled by the library's one spring compiler. It is resolved after
// mount because the result depends on `CSS.supports` (a `linear()` curve in the browser, a
// cubic-bezier on the server), and resolving it during setup would put a different style
// attribute in the server markup than in the first client render. The stylesheet's fallbacks
// cover the frames before it lands. Nothing else writes these two properties.
const spring = shallowRef<ResolvedTransition | null>(null)
onMounted(() => {
  spring.value = resolveTransition('bouncy')
})
const rootStyle = computed(() => spring.value
  ? {
      '--tx-status-hint-spring': spring.value.easing,
      '--tx-status-hint-spring-duration': `${spring.value.duration}ms`,
    }
  : undefined)
</script>

<template>
  <div
    class="tx-status-hint"
    :class="[
      `tx-status-hint--${size}`,
      `is-${tone}`,
      { 'is-animated': animated, 'is-pulse-a': pulse === 1, 'is-pulse-b': pulse === 2 },
    ]"
    :style="rootStyle"
  >
    <span class="tx-status-hint__wash" aria-hidden="true" />
    <span v-if="$slots.icon || glyph" class="tx-status-hint__icon" aria-hidden="true">
      <slot name="icon">
        <TxIcon :name="glyph" />
      </slot>
    </span>
    <!-- `aria-live` falls through onto the transformer's root and overrides the `polite` it
         hard-codes there (fallthrough attributes are merged last), so `live=false` leaves no
         live region anywhere inside. -->
    <TxTextTransformer
      v-if="animated"
      class="tx-status-hint__text"
      :text="text"
      :duration-ms="TEXT_MORPH_MS"
      :role="live ? 'status' : undefined"
      :aria-live="live ? 'polite' : 'off'"
    />
    <span
      v-else
      class="tx-status-hint__text"
      :role="live ? 'status' : undefined"
      :aria-live="live ? 'polite' : 'off'"
    >{{ text }}</span>
  </div>
</template>

<style lang="scss">
// Values calibrated on 2026-09-27 against a prototype of this DOM, in light and dark:
// `.trellis/tasks/09-27-corebox-action-feedback-hint/research/visual-calibration.md`.
//
// Not scoped, as in TxChoiceCard: every selector carries the `tx-status-hint` prefix, so
// nothing reaches past the component, and the scope attribute on each selector plus the
// suffix on each keyframe name cost about 0.5 KiB of a sheet the CSS size gate has no slack
// for. It also keeps the root rule at one class: a host rule with more weight than that (a
// scoped class, or two classes) sets the knobs below whatever order the sheets load in.
//
// The wash is the tone's colour behind a mask that is a gradient intersected with fractal
// noise, so the grain lives in the wash's own alpha: it shows only inside the tint and adds
// no grey veil to the surface underneath. (Grain blended over the tint, the way TxStatCard
// overlays its own, was tried first with `soft-light`: at this strength it moves the pixels
// by about 1% and is not visible even at 2x.) The noise alpha averages about 0.6, so the 0.26
// edge strength reads as roughly 16% in light themes; dark ones take 0.2, because the same
// tint reads louder on a dark page.
//
// Text contrast (WCAG 2) against the densest wash pixel, the edge strength of the accent
// over --tx-bg-color with the noise at full alpha, measured 2026-09-27 per theme block of
// style/variables.scss. The ink stays --tx-text-color-primary for every tone.
//
//                        success  warning  danger  info   muted   (bare page)
//   :root                10.63    10.72    9.96    10.13  10.13   13.02
//   .dark                 9.97     9.79   11.28    11.23  10.75   15.26
//   html.contrast        11.72    12.26   11.32    11.82  11.20   17.74
//   html.dark.contrast   13.03    13.46   14.18    14.07  13.17   20.14
//
// The glyph is decorative (aria-hidden) and always paired with the words, so the state is
// never carried by colour alone.
//
// Motion has one form, as in TxChoiceCard: every animation and transition is declared inside
// `prefers-reduced-motion: no-preference`, under `.is-animated`, and every resting style is
// the end frame. Reduced motion, or a host passing `animated=false`, therefore shows the
// hint in place with nothing to cancel. Only compositor properties move (`opacity`, `scale`,
// `rotate`), and no keyframe reads a custom property.

$grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='linear' slope='1.6' intercept='-0.2'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
$ease: var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
// Written on the root after mount from `resolveTransition('bouncy')`; the fallback is the
// curve that compiler emits where `linear()` is unsupported.
$spring: var(--tx-status-hint-spring-duration, 620ms) var(--tx-status-hint-spring, cubic-bezier(0.34, 1.56, 0.64, 1));

.tx-status-hint {
  // Set on the component itself (a class or a style on it) to place it:
  //   --tx-status-hint-radius  corner radius (8px); a hint laid flush against an edge wants 0
  //   --tx-status-hint-pad-x   inline inset, and the width of the end fade (10px; sm 8px)
  --tx-status-hint-accent: var(--tx-color-success, #67c23a);
  --tx-status-hint-wash-strength: 0.26;
  --tx-status-hint-pad-x: 10px;
  --tx-status-hint-pad-y: 6px;
  --tx-status-hint-icon-size: 16px;

  position: relative;
  // The wash sits at z-index -1: isolation keeps it over the root's own background and
  // under the icon and text, never behind the host page.
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  max-width: 100%;
  padding: var(--tx-status-hint-pad-y, 6px) var(--tx-status-hint-pad-x, 10px);
  overflow: hidden;
  border-radius: var(--tx-status-hint-radius, 8px);
  // The end padding fades out. A value too long for the box dissolves into it instead of
  // being cut against a neighbour; one that fits only loses padding it never drew in.
  // Unprefixed only: an engine without it (Chromium before 120, Safari before 15.4) clips
  // the value at the padding edge instead, which is all the fade softens.
  mask-image: linear-gradient(to left, transparent, #000 var(--tx-status-hint-pad-x, 10px));
  color: var(--tx-text-color-primary, #303133);
  // An outcome phrase that stands alone on its line: the weight the CoreBox feedback it
  // replaces already used, and a step under the 700 the design rules forbid on prose.
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  white-space: nowrap;
}

.tx-status-hint--sm {
  --tx-status-hint-pad-x: 8px;
  --tx-status-hint-pad-y: 3px;
  --tx-status-hint-icon-size: 14px;

  gap: 5px;
  font-size: 12px;
  line-height: 16px;
}

:is([data-theme='dark'], .dark) .tx-status-hint {
  --tx-status-hint-wash-strength: 0.2;
}

.tx-status-hint.is-warning {
  --tx-status-hint-accent: var(--tx-color-warning, #e6a23c);
}

.tx-status-hint.is-danger {
  --tx-status-hint-accent: var(--tx-color-danger, #f56c6c);
}

// Primary, not --tx-color-info (a grey that would read as muted), as in TxStatusBadge.
.tx-status-hint.is-info {
  --tx-status-hint-accent: var(--tx-color-primary, #409eff);
}

.tx-status-hint.is-muted {
  --tx-status-hint-accent: var(--tx-text-color-secondary, #909399);
}

.tx-status-hint__wash {
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
  // It rises out of the leading edge.
  transform-origin: 0 50%;
}

// Without mask compositing the wash would paint as a solid block of the accent behind the
// text, so where it is missing there is no wash at all.
@supports (mask-composite: intersect) {
  .tx-status-hint__wash {
    background-color: var(--tx-status-hint-accent, #67c23a);
    // Full strength at the leading edge, 0.45 of it by 38%, gone at the far end.
    mask-image:
      linear-gradient(
        to right,
        rgb(0 0 0 / var(--tx-status-hint-wash-strength, 0.26)),
        rgb(0 0 0 / calc(var(--tx-status-hint-wash-strength, 0.26) * 0.45)) 38%,
        transparent
      ),
      $grain;
    mask-size: 100% 100%, 140px 140px;
    mask-repeat: no-repeat, repeat;
    mask-composite: intersect;
  }
}

// A box that sizes its glyph (TxIcon draws at 1em) and whatever the icon slot brings.
.tx-status-hint__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  color: var(--tx-status-hint-accent, #67c23a);
  font-size: var(--tx-status-hint-icon-size, 16px);
  line-height: 1;
}

// The transformer's root, or the plain span. Inline-flex matches what the transformer's own
// (scoped, so more specific) rule declares, so both text branches lay out the same; `scale`
// grows it from its leading edge, so the text lands towards the icon.
.tx-status-hint__text {
  display: inline-flex;
  min-width: 0;
  transform-origin: 0 50%;
}

// Entrance. Start frames only: the resting style is every end frame.
@keyframes tx-status-hint-wash-in {
  from {
    opacity: 0;
    scale: 0.3 1;
  }
}

@keyframes tx-status-hint-icon-in {
  from {
    scale: 0.4;
    rotate: -30deg;
  }
}

// Readable from the first frame: the text lands from a slight scale-up, never from
// transparent or blurred.
@keyframes tx-status-hint-text-in {
  from {
    scale: 1.18;
  }
}

// Replay, twice over with identical bodies. The 30% stop peaks and both ends are the
// resting style, so text and icon swell and settle while the wash blooms back out.
@each $replay in (a, b) {
  @keyframes tx-status-hint-wash-bloom-#{$replay} {
    from {
      opacity: 0.45;
      scale: 0.72 1;
    }
  }

  @keyframes tx-status-hint-icon-pulse-#{$replay} {
    30% {
      scale: 1.22;
    }
  }

  @keyframes tx-status-hint-text-pulse-#{$replay} {
    30% {
      scale: 1.12;
    }
  }
}

@media (prefers-reduced-motion: no-preference) {
  .tx-status-hint.is-animated {
    .tx-status-hint__wash {
      animation: tx-status-hint-wash-in 680ms $ease;
    }

    .tx-status-hint__icon {
      animation: tx-status-hint-icon-in $spring;
    }

    .tx-status-hint__text {
      animation: tx-status-hint-text-in $spring;
    }
  }

  // More specific than the entrance, so a replay takes over from a running entrance.
  @each $replay in (a, b) {
    .tx-status-hint.is-animated.is-pulse-#{$replay} {
      .tx-status-hint__wash {
        animation: tx-status-hint-wash-bloom-#{$replay} 560ms $ease;
      }

      .tx-status-hint__icon {
        animation: tx-status-hint-icon-pulse-#{$replay} 460ms $ease;
      }

      .tx-status-hint__text {
        animation: tx-status-hint-text-pulse-#{$replay} 460ms $ease;
      }
    }
  }

  // Leave, for a host that wraps the hint in `<Transition name="tx-status-hint">`: the words
  // go first and the wash fades out behind them. Opacity only; whether the leaving hint keeps
  // its place in the layout is the host's call.
  .tx-status-hint.is-animated.tx-status-hint-leave-active {
    transition: opacity 240ms $ease;

    .tx-status-hint__icon,
    .tx-status-hint__text {
      transition: opacity 120ms $ease;
    }
  }

  .tx-status-hint.is-animated.tx-status-hint-leave-to {
    &,
    .tx-status-hint__icon,
    .tx-status-hint__text {
      opacity: 0;
    }
  }
}
</style>
