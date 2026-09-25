<script setup lang="ts">
import type { PropType } from 'vue'
import type { StatusTone } from '../../status-badge/src/types'
import type { ModeChipProps } from './types'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import TxTextTransformer from '../../text-transformer/src/TxTextTransformer.vue'

defineOptions({ name: 'TxModeChip' })

// A runtime object rather than `defineProps<ModeChipProps>()`: a type-only declaration is
// resolved from `types.ts` when this file compiles, and the dev server does not recompile
// it when that file changes, so a new prop ships as an unknown attribute while vitest (a
// cold compile) passes — see TxFilterChips. `satisfies` keeps the two from drifting; its
// contextual type is `unknown`, so `required` needs `as const` or it widens to `boolean`
// and Vue types `label` as optional.
const props = defineProps({
  label: { type: String, required: true as const },
  icon: { type: String, default: '' },
  tone: { type: String as PropType<StatusTone>, default: 'muted' },
  disabled: { type: Boolean, default: false },
} satisfies Record<keyof ModeChipProps, unknown>)

// Timings follow the measured reference, `.trellis/tasks/09-23-composer-motion-reference/
// research/reference-motion.md` › Motion 3: the icon swaps first, the old label is gone in
// ~80ms (the `__layer--prev` rule below), and the new one sharpens over ~280ms, ~370ms in all.
const LABEL_DELAY_MS = 50
const LABEL_FADE_MS = 280
const LABEL_BLUR_PX = 6
const WIDTH_MS = 300
// `.is-morphing` is what lets fill and ink transition, so it has to outlast every leg.
const MORPH_MS = LABEL_DELAY_MS + Math.max(LABEL_FADE_MS, WIDTH_MS)
// `--tx-ease-out-strong`, written out because WAAPI cannot read a custom property.
const EASE_OUT_STRONG = 'cubic-bezier(0.23, 1, 0.32, 1)'

const rootRef = ref<HTMLButtonElement | null>(null)
// Trails `label` by LABEL_DELAY_MS during a morph, so the icon visibly leads the text.
const displayLabel = ref(props.label)
const morphing = ref(false)
const resizing = ref(false)

let labelTimer: ReturnType<typeof setTimeout> | null = null
let settleTimer: ReturnType<typeof setTimeout> | null = null
let widthAnimation: Animation | null = null

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// The box a `width` keyframe means. `getBoundingClientRect` is the visual box, which a
// scaled ancestor inflates, and the tween would write that inflated number straight back.
function layoutWidth(el: HTMLElement): number {
  const width = Number.parseFloat(getComputedStyle(el).width)
  return Number.isNaN(width) ? el.getBoundingClientRect().width : width
}

function stopWidth(): void {
  const running = widthAnimation
  widthAnimation = null
  running?.cancel()
  resizing.value = false
}

/**
 * FLIPs the chip's width across one DOM change. `first` is read before the change renders,
 * so it is where the chip visibly is — a tween cut short by the previous morph included.
 */
async function flipWidth(apply?: () => void): Promise<void> {
  const el = rootRef.value
  if (!el || typeof el.animate !== 'function') {
    apply?.()
    return
  }

  const first = layoutWidth(el)
  stopWidth()
  apply?.()
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

function clearTimers(): void {
  if (labelTimer != null)
    clearTimeout(labelTimer)
  if (settleTimer != null)
    clearTimeout(settleTimer)
  labelTimer = null
  settleTimer = null
}

watch(
  [() => props.label, () => props.icon, () => props.tone],
  () => {
    clearTimers()

    // Everything lands at once. The transformer's and the icon's CSS drop their tweens under
    // the same query, and nothing here waits on a timer or starts a WAAPI tween.
    if (prefersReducedMotion()) {
      stopWidth()
      morphing.value = false
      displayLabel.value = props.label
      return
    }

    morphing.value = true
    // An icon appearing or leaving changes the width now, not at the label swap. This is a
    // pre-flush watcher, so `first` is still the box from before the render.
    void flipWidth()

    if (displayLabel.value !== props.label) {
      labelTimer = setTimeout(() => {
        labelTimer = null
        void flipWidth(() => {
          displayLabel.value = props.label
        })
      }, LABEL_DELAY_MS)
    }

    settleTimer = setTimeout(() => {
      settleTimer = null
      morphing.value = false
    }, MORPH_MS)
  },
)

onBeforeUnmount(() => {
  clearTimers()
  stopWidth()
})
</script>

<template>
  <button
    ref="rootRef"
    type="button"
    class="tx-mode-chip"
    :class="[`is-${tone}`, { 'has-icon': !!icon, 'is-morphing': morphing, 'is-resizing': resizing }]"
    :disabled="disabled"
  >
    <span v-if="icon" class="tx-mode-chip__icon" aria-hidden="true">
      <Transition name="tx-mode-chip-icon">
        <i :key="icon" class="tx-mode-chip__glyph" :class="icon" />
      </Transition>
    </span>
    <TxTextTransformer
      class="tx-mode-chip__label"
      mode="fade"
      :text="displayLabel"
      :duration-ms="LABEL_FADE_MS"
      :blur-px="LABEL_BLUR_PX"
    />
  </button>
</template>

<style lang="scss" scoped>
// Ink on fill, WCAG 2 contrast, resting / hover. Each cell is the worse of the page
// (--tx-bg-color) and the composer tray (--tx-fill-color-light) under the chip. Columns
// are the theme blocks of style/variables.scss, named by the selector that turns them on;
// html.contrast and html.dark.contrast carry the two high-contrast mixins. Measured
// 2026-09-24, after the dark -light-8/9 change landed (the .dark block's success, warning
// and info tints now mix toward --tx-bg-color).
//
//             :root          .dark          html.contrast  html.dark.contrast
//   success   5.18 / 4.79    10.52 / 8.25   10.38 / 9.12   14.84 / 11.09
//   warning   5.11 / 4.74    10.72 / 8.32   9.52 / 8.48    14.40 / 10.99
//   danger    5.07 / 4.58    6.95 / 7.03    9.41 / 8.18    12.77 / 10.05
//   info      5.32 / 4.83    8.82 / 7.42    9.99 / 8.02    11.53 / 10.35
//   muted     5.69 / 12.13   9.99 / 12.41   13.34 / 16.12  16.12 / 17.74
//
// Worst case per tone, all in :root: success 4.79, warning 4.74, danger 4.58 and info 4.83
// on hover; muted 5.69 at rest on the tray. Plain same-hue ink was rejected: 2.03–2.61:1 at
// rest in :root. Each coloured ink is instead its hue mixed toward --tx-text-color-primary
// (darker in the light themes, lighter in the dark ones), at the largest 5% share that
// clears 4.5:1 in all four blocks. Muted rests on --tx-text-color-regular: the secondary
// grey measured 2.87 on the tray.
.tx-mode-chip {
  --tx-mode-chip-ink: var(--tx-text-color-regular, #606266);
  --tx-mode-chip-fill: transparent;
  --tx-mode-chip-fill-hover: transparent;

  display: inline-flex;
  position: relative;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  max-width: 100%;
  height: 28px;
  margin: 0;
  // The fixed height leaves 5px above and below an 18px line, so 8px sideways keeps the
  // inset ~0.6x — equal numbers read bottom-heavy. The icon side is tighter still: the
  // glyph carries its own side bearings.
  padding: 0 8px;
  overflow: hidden;
  border: 0;
  border-radius: 8px;
  background-color: var(--tx-mode-chip-fill, transparent);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  color: var(--tx-mode-chip-ink, #606266);
  white-space: nowrap;
  cursor: pointer;
  appearance: none;

  // Immediate: outside a morph the chip has no colour transition to run. A tone keeps
  // its ink and deepens its fill; only muted sets a hover ink of its own.
  &:hover:not(:disabled) {
    background-color: var(--tx-mode-chip-fill-hover, transparent);
    color: var(--tx-mode-chip-ink-hover, var(--tx-mode-chip-ink, #606266));
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &.has-icon {
    padding-left: 6px;
  }

  // The only place fill and ink may transition. The class lives exactly as long as a
  // label/icon/tone change, so a hover never eases.
  &.is-morphing {
    transition:
      background-color 240ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      color 240ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }

  // Muted has no fill to deepen, so its hover darkens the ink instead.
  &.is-muted {
    --tx-mode-chip-ink-hover: var(--tx-text-color-primary, #303133);
  }

  // Tinted fill under an ink of the same hue; the fill deepens on hover and the ink holds.
  &.is-success {
    --tx-mode-chip-ink: color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, var(--tx-text-color-primary, #303133));
    --tx-mode-chip-fill: var(--tx-color-success-light-9, #f0f9eb);
    --tx-mode-chip-fill-hover: color-mix(in srgb, var(--tx-color-success, #67c23a) 20%, var(--tx-bg-color, #fff));
  }

  &.is-warning {
    --tx-mode-chip-ink: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 45%, var(--tx-text-color-primary, #303133));
    --tx-mode-chip-fill: var(--tx-color-warning-light-9, #fdf6ec);
    --tx-mode-chip-fill-hover: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 20%, var(--tx-bg-color, #fff));
  }

  &.is-danger {
    --tx-mode-chip-ink: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 55%, var(--tx-text-color-primary, #303133));
    --tx-mode-chip-fill: var(--tx-color-danger-light-9, #fef0f0);
    --tx-mode-chip-fill-hover: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 20%, var(--tx-bg-color, #fff));
  }

  // Primary, not --tx-color-info (a grey that would read as muted), as in TxStatusBadge.
  &.is-info {
    --tx-mode-chip-ink: color-mix(in srgb, var(--tx-color-primary, #409eff) 50%, var(--tx-text-color-primary, #303133));
    --tx-mode-chip-fill: var(--tx-color-primary-light-9, #ecf5ff);
    --tx-mode-chip-fill-hover: color-mix(in srgb, var(--tx-color-primary, #409eff) 20%, var(--tx-bg-color, #fff));
  }
}

// A fixed square: the glyphs swap inside it, so an icon change never moves the label.
.tx-mode-chip__icon {
  display: inline-flex;
  position: relative;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
}

.tx-mode-chip__glyph {
  display: block;
  width: 14px;
  height: 14px;
  font-size: 14px;
  line-height: 1;
}

// The label is a TxTextTransformer; its layers are its own elements, reached with :deep().
.tx-mode-chip__label {
  // The layers carry their own `color` tween. A hover changes the chip's ink, the layers
  // inherit it, and that tween would ease the label on every hover. Opacity and blur are
  // the whole crossfade; during a morph the label follows the chip's colour by inheritance.
  :deep(.tx-text-transformer__layer) {
    transition-property: opacity, filter;
  }

  // The outgoing label is gone in ~80ms in the reference; the incoming one takes the full fade.
  :deep(.tx-text-transformer__layer--prev) {
    transition-duration: 80ms;
  }

  // While the width tweens up the chip is narrower than the new label. Shrinking would
  // ellipsise it for the length of the tween; the chip clips it instead.
  .tx-mode-chip.is-resizing & {
    flex-shrink: 0;
    max-width: none;
  }
}

.tx-mode-chip-icon-enter-active {
  transition:
    transform 240ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    opacity 240ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

// Out of flow, so the incoming glyph owns the box from its first frame.
.tx-mode-chip-icon-leave-active {
  position: absolute;
  inset: 0;
  transition:
    transform 160ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    opacity 160ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.tx-mode-chip-icon-enter-from,
.tx-mode-chip-icon-leave-to {
  opacity: 0;
  transform: scale(0.5);
}

@media (prefers-reduced-motion: reduce) {
  .tx-mode-chip-icon-enter-active,
  .tx-mode-chip-icon-leave-active,
  .tx-mode-chip__label :deep(.tx-text-transformer__layer) {
    transition: none;
  }

  // Vue holds these classes for two frames before it looks for a transition, so without
  // the overrides the swap would still show the old glyph over a blank box for that long.
  .tx-mode-chip-icon-enter-from {
    opacity: 1;
    transform: none;
  }

  .tx-mode-chip-icon-leave-active {
    opacity: 0;
  }
}
</style>
