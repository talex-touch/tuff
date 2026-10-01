<script lang="ts" setup>
import type { CSSProperties } from 'vue'
import { computed, nextTick, onUnmounted, ref, useId, watch } from 'vue'
import { hasDocument } from '../../../../utils/env'
import { useZIndexAllocator } from '../../../../utils/z-index-manager'

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
  }>(),
  {
    title: '',
    width: '480px',
    fullscreen: false,
  },
)

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
let previouslyFocusedElement: HTMLElement | null = null

watch(
  visible,
  (v) => {
    if (v) {
      zIndex.value = zIndexAllocator.next()
      if (hasDocument())
        previouslyFocusedElement = document.activeElement as HTMLElement
      nextTick(() => {
        overlayRef.value?.focus()
      })
    }
    else if (previouslyFocusedElement) {
      previouslyFocusedElement.focus()
      previouslyFocusedElement = null
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

// Focus trap: aria-modal="true" promises the background is inert, so Tab must cycle
// within the dialog instead of walking into the page behind it.
function trapFocus(event: KeyboardEvent) {
  const root = overlayRef.value
  if (!root)
    return
  const focusable = Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) {
    // Nothing tabbable inside — keep focus on the dialog itself.
    event.preventDefault()
    root.focus()
    return
  }
  const active = hasDocument() ? document.activeElement : null
  if (event.shiftKey) {
    if (active === first || active === root) {
      event.preventDefault()
      last.focus()
    }
  }
  else if (active === last) {
    event.preventDefault()
    first.focus()
  }
}

onUnmounted(() => {
  if (previouslyFocusedElement) {
    previouslyFocusedElement.focus()
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="tx-modal">
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
        @click.self="close"
        @keydown.esc="close"
        @keydown.tab="trapFocus"
      >
        <div class="tx-modal__content" :class="{ 'tx-modal__content--fullscreen': fullscreen }" :style="contentStyle">
          <header v-if="title || $slots.header" class="tx-modal__header">
            <slot name="header">
              <h3 :id="titleId" class="tx-modal__title">
                {{ title }}
              </h3>
            </slot>
            <button type="button" class="tx-modal__close" aria-label="Close" @click="close">
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
.tx-modal__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.tx-modal__content {
  background: var(--tx-bg-color, #fff);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 12px 24px 80px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  width: min(90vw, 560px);
  color: var(--tx-text-color-primary, #303133);
}

// Fullscreen: the overlay's own inset already spans the viewport, so the panel
// stretches to it instead of being sized. `stretch` (not `height: 100%`) keeps
// the panel free of the overlay's padding — a percentage height would resolve
// against the padded box and overflow past the bottom edge.
.tx-modal__overlay--fullscreen {
  align-items: stretch;
  padding: 0;
  // The panel is opaque and exactly viewport-sized, so the blur has nothing to
  // show through while costing a full-screen compositing pass every frame.
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  // The panel cannot be taller than the viewport, so the overlay must never
  // gain its own scrollbar on a small screen.
  overflow: hidden;
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
  box-shadow: none;
  padding: 16px;
  display: flex;
  flex-direction: column;
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
  font-weight: 600;
  letter-spacing: -0.01em;
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
  transition: background-color 0.2s, color 0.2s, transform 0.15s;

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

// Overlay fade
.tx-modal-enter-active {
  transition: opacity 0.25s ease;
}

.tx-modal-leave-active {
  transition: opacity 0.2s ease;
}

.tx-modal-enter-from,
.tx-modal-leave-to {
  opacity: 0;
}

// Content panel animation
.tx-modal-enter-active .tx-modal__content {
  animation: tx-modal-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.tx-modal-leave-active .tx-modal__content {
  animation: tx-modal-leave 0.2s ease forwards;
}

@keyframes tx-modal-enter {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes tx-modal-leave {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.97) translateY(4px);
  }
}
</style>
