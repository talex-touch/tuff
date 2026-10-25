<script lang="ts" setup>
import type { CSSProperties } from 'vue'
import type { BaseSurfaceMode } from '../../base-surface/src/types'
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import { createFocusReturn, markDialogLeaving, trapTab } from '../../../../utils/focus-trap'
import { useGuardedClose } from '../../../../utils/guarded-close'
import { isTopmostModalDialog, useZIndexAllocator } from '../../../../utils/z-index-manager'
import TxBaseSurface from '../../base-surface/src/TxBaseSurface.vue'

// Resolved in setup: inject is only valid here, while allocation happens later.
const zIndexAllocator = useZIndexAllocator()

defineOptions({
  name: 'TxModal',
})

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    width?: string
    /**
     * Fill the viewport instead of centring a fixed-width panel. Used by
     * fullscreen surfaces (TxImageGallery's preview) where the content owns the
     * whole screen. `width` is ignored while set.
     */
    fullscreen?: boolean
    /** Accessible label for the header's close button. @default 'Close' */
    closeLabel?: string
    /** Material of the panel. @default 'refraction' */
    surface?: BaseSurfaceMode
    /** Colour laid under the material; follows the theme by default. */
    surfaceColor?: string
    /** Opacity of that colour (0–1): 0.96 under `mask`, 0.5 under the other materials. */
    surfaceOpacity?: number
    /**
     * Asked before the user closes the dialog: Escape, a click on the mask,
     * the close button. Return `false`, or a promise of it, to keep it open.
     * Setting `modelValue` to `false` is not asked.
     */
    beforeClose?: (reason: 'escape' | 'mask' | 'close') => boolean | void | Promise<boolean | void>
  }>(),
  {
    title: '',
    width: '480px',
    fullscreen: false,
    closeLabel: 'Close',
    surface: 'refraction',
    surfaceColor: '',
  },
)

const SURFACE_MODES: readonly string[] = ['pure', 'mask', 'blur', 'glass', 'refraction', 'acrylic', 'mica', 'flat', 'plain']

const surfaceMode = computed<BaseSurfaceMode>(() =>
  SURFACE_MODES.includes(props.surface) ? props.surface : 'refraction',
)

const surfaceColor = computed(() => props.surfaceColor || 'var(--tx-bg-color-overlay, var(--tx-bg-color, #fff))')

// As on TxFlipOverlay: mask keeps a near-opaque fill, and the other materials sit over the
// colour at half strength, so text stays legible and the page still shows through to be
// blurred and refracted.
const surfaceOpacity = computed(() => {
  const fallback = surfaceMode.value === 'mask' ? 0.96 : 0.5
  const value = typeof props.surfaceOpacity === 'number' ? props.surfaceOpacity : fallback
  if (!Number.isFinite(value))
    return fallback
  return Math.max(0, Math.min(1, value))
})

// Fullscreen is sized by the overlay (`position: fixed; inset: 0`) through
// `align-items: stretch`, so the inline width must not be bound at all — an
// inline `width` outranks the stylesheet.
const contentStyle = computed<CSSProperties | undefined>(() =>
  props.fullscreen ? undefined : { width: props.width },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'close': []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const zIndex = ref(zIndexAllocator.get())
const overlayRef = ref<HTMLElement | null>(null)
const titleId = useId()
const focusReturn = createFocusReturn()

watch(
  visible,
  (v) => {
    if (v) {
      zIndex.value = zIndexAllocator.next()
      focusReturn.save()
      nextTick(() => {
        overlayRef.value?.focus()
      })
    }
    else {
      focusReturn.restore()
    }
  },
  // `immediate` so a modal mounted already open (`modelValue: true`) still
  // focuses the overlay and records the previously focused element — otherwise
  // Escape (bound on the overlay) and focus restoration never engage.
  { immediate: true, flush: 'sync' },
)

function close() {
  visible.value = false
  emit('close')
}

const requestClose = useGuardedClose(() => props.beforeClose, () => visible.value, close)

function handleKeydown(event: KeyboardEvent) {
  if (!visible.value || event.defaultPrevented || (event.key !== 'Tab' && event.key !== 'Escape'))
    return
  if (!isTopmostModalDialog(overlayRef.value))
    return
  if (event.key === 'Tab') {
    // aria-modal="true" promises the background is inert, so Tab cycles within the dialog.
    if (overlayRef.value)
      trapTab(event, overlayRef.value)
    return
  }
  event.preventDefault()
  requestClose('escape')
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  focusReturn.restore()
})
</script>

<template>
  <Teleport to="body">
    <!-- The overlay itself does not transition (see the styles), so the duration is given here:
         the panel's, which outlasts the dim's fade. Both phases also carry `tx-modal-moving`,
         which the styles key the parts' fades on. -->
    <Transition
      name="tx-modal"
      enter-active-class="tx-modal-enter-active tx-modal-moving"
      leave-active-class="tx-modal-leave-active tx-modal-moving"
      :duration="{ enter: 300, leave: 200 }"
      @before-leave="markDialogLeaving"
    >
      <div
        v-if="visible"
        ref="overlayRef"
        class="tx-modal__overlay"
        :class="{ 'tx-modal__overlay--fullscreen': fullscreen }"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-labelledby="title ? titleId : undefined"
        :style="{ zIndex }"
        @click.self="requestClose('mask')"
      >
        <div class="tx-modal__content" :class="{ 'tx-modal__content--fullscreen': fullscreen }" :style="contentStyle">
          <TxBaseSurface
            class="tx-modal__surface"
            preset="card"
            fake
            :mode="surfaceMode"
            :color="surfaceColor"
            :opacity="surfaceOpacity"
          />
          <header v-if="title || $slots.header" class="tx-modal__header">
            <slot name="header">
              <h3 :id="titleId" class="tx-modal__title">
                {{ title }}
              </h3>
            </slot>
            <button type="button" class="tx-modal__close" :aria-label="closeLabel" @click="requestClose('close')">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </header>
          <section class="tx-modal__body">
            <slot />
          </section>
          <footer v-if="$slots.footer" class="tx-modal__footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../../../style/mixins.scss' as *;

.tx-modal__overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;

  // The dim and the frost are a layer under the panel rather than the overlay's own paint and
  // opacity. An overlay with a backdrop filter, or one fading through opacity, would be the
  // panel's backdrop root, and the panel's material would sample only the overlay's dim
  // instead of the page.
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  // High contrast keeps the dimming and drops the frost.
  @include tx-when-high-contrast {
    &::before {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }
}

.tx-modal__content {
  // Positioned and stacked, so the surface sits under the header, body and footer without
  // leaving the panel.
  position: relative;
  z-index: 0;
  padding: 20px;
  width: min(90vw, 560px);
  color: var(--tx-text-color-primary, #303133);
  @include tx-squircle(16px);

  // The shadow and the inner hairline, on a layer of their own so they can fade while the panel
  // does not (see the panel motion below). Above the surface: as an inset shadow under it, the
  // hairline would be covered. It paints nothing over the content but that hairline.
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
    corner-shape: inherit;
    box-shadow: 12px 24px 80px rgba(0, 0, 0, 0.18);
    outline: 1px solid rgba(255, 255, 255, 0.05);
    outline-offset: -1px;
    pointer-events: none;
  }
}

.tx-modal__surface {
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  corner-shape: inherit;
  pointer-events: none;
}

// Fullscreen: the overlay's own inset already spans the viewport, so the panel
// stretches to it instead of being sized. `stretch` (not `height: 100%`) keeps
// the panel free of the overlay's padding — a percentage height would resolve
// against the padded box and overflow past the bottom edge.
.tx-modal__overlay--fullscreen {
  align-items: stretch;
  padding: 0;
  // The panel cannot be taller than the viewport, so the overlay must never
  // gain its own scrollbar on a small screen.
  overflow: hidden;
}

// The panel is exactly viewport-sized and blurs what it covers with its own
// material, so a blur under it would be a second full-screen compositing pass
// for a difference no one can see.
.tx-modal__overlay--fullscreen::before {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

// A fixed box is sized against the *layout* viewport, which on mobile keeps the
// height the URL bar is hidden at — the bottom of a `inset: 0` overlay sits
// under the browser chrome until the user scrolls. `dvh` tracks the visible
// area; with `top` plus an explicit `height`, the over-constrained `bottom` is
// dropped and the box stops at the visible edge.
@supports (height: 100dvh) {
  .tx-modal__overlay--fullscreen {
    bottom: auto;
    height: 100dvh;
  }
}

// fullscreen: the panel is a column of `header / body / footer`. `flex: none`
// keeps the bar chrome at its natural height and `flex: 1` + `min-height: 0`
// lets the body shrink below its content so a tall image scrolls inside it
// rather than pushing the footer off the bottom edge.
.tx-modal__content--fullscreen {
  width: 100%;
  height: 100%;
  border-radius: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;

  &::after {
    content: none;
  }
}

.tx-modal__content--fullscreen > .tx-modal__header,
.tx-modal__content--fullscreen > .tx-modal__footer {
  flex: none;
}

.tx-modal__content--fullscreen > .tx-modal__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  // A wheel gesture at the end of the body must not chain to the page behind
  // the dialog, which is still the document's scroll container.
  overscroll-behavior: contain;
}

// A long title must not push the close button past the right edge of the screen.
// `min-width: 0` is what actually lets the flex item shrink far enough to
// ellipsise — a flex item's automatic minimum size is its content.
.tx-modal__content--fullscreen > .tx-modal__header {
  gap: 12px;
}

.tx-modal__content--fullscreen > .tx-modal__header > .tx-modal__title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-modal__content--fullscreen > .tx-modal__footer {
  margin-top: 0;
  padding-top: 12px;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  // Keeps the base bar's `flex-end` row from hugging the right edge: a lone
  // child (one action) stays reachable, and a full-width row still spreads.
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

@media (max-width: 640px) {
  .tx-modal__content--fullscreen {
    padding: 12px;
  }
}

.tx-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.tx-modal__title {
  margin: 0;
  font-size: 18px;
  font-weight: var(--tx-font-weight-semibold, 600);
  letter-spacing: -0.01em;
  text-wrap: balance;
}

.tx-modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--tx-text-color-secondary, #909399);
  transition: transform 0.15s;

  &:hover {
    background: var(--tx-fill-color-light, #f5f7fa);
    color: var(--tx-text-color-primary, #303133);
  }

  &:active {
    transform: scale(0.92);
  }
}

.tx-modal__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tx-modal__footer {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

// Dim fade. The dim layer fades, not the overlay: see `.tx-modal__overlay::before`.
.tx-modal-enter-active::before {
  transition: opacity 0.25s ease;
}

.tx-modal-leave-active::before {
  transition: opacity 0.2s ease;
}

.tx-modal-enter-from::before,
.tx-modal-leave-to::before {
  opacity: 0;
}

// Panel motion. The panel scales and drifts but never fades as a whole: an element whose opacity
// animates is the backdrop root of every backdrop filter inside it, so the material would sample
// nothing but the panel and its frost would drop out for the whole transition. Each part fades on
// its own instead, and the material stays live from the first frame to the last: the header,
// body and footer, the shadow and hairline, and the surface. A surface with a backdrop filter
// fades layer by layer, as a backdrop filter can fade through its own opacity; one without fades
// whole, and so does every surface under high contrast, which drops the layers that blur.
// Each phase hands its fade down as `--tx-modal-fade`, so the parts are listed once.
.tx-modal-enter-active {
  --tx-modal-fade: tx-modal-fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;

  .tx-modal__content {
    animation: tx-modal-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
}

.tx-modal-leave-active {
  --tx-modal-fade: tx-modal-fade-out 0.2s ease forwards;

  .tx-modal__content {
    animation: tx-modal-leave 0.2s ease forwards;
  }
}

.tx-modal-moving {
  .tx-modal__header,
  .tx-modal__body,
  .tx-modal__footer,
  .tx-modal__content::after,
  .tx-modal__surface:not(.tx-base-surface--with-glass, .tx-base-surface--with-filter),
  .tx-modal__surface:is(.tx-base-surface--with-glass, .tx-base-surface--with-filter)::before,
  .tx-modal__surface:is(.tx-base-surface--with-glass, .tx-base-surface--with-filter) :deep(.tx-base-surface__layer) {
    animation: var(--tx-modal-fade);
  }

  @include tx-when-high-contrast {
    .tx-modal__surface {
      animation: var(--tx-modal-fade);
    }
  }

  // Reduced motion keeps the fades and drops the travel: the panel fades in place.
  @media (prefers-reduced-motion: reduce) {
    .tx-modal__content {
      animation: none;
    }
  }
}

@keyframes tx-modal-enter {
  from {
    transform: scale(0.96) translateY(8px);
  }
}

@keyframes tx-modal-leave {
  to {
    transform: scale(0.97) translateY(4px);
  }
}
</style>

<style lang="scss">
// Unscoped: the parts take these through `--tx-modal-fade`, and a scoped sheet renames its
// keyframes only where an `animation` declaration names them, never inside a custom property.
// Each gives only its far end, so a part fades from, or to, the opacity it rests at.
@keyframes tx-modal-fade-in {
  from {
    opacity: 0;
  }
}

@keyframes tx-modal-fade-out {
  to {
    opacity: 0;
  }
}
</style>
