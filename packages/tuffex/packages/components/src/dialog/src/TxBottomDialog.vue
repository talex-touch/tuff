<script setup lang="ts">
import type { BottomDialogProps, DialogButton } from './types'
/**
 * TxBottomDialog Component
 *
 * A bottom-positioned dialog with customizable buttons and auto-close functionality.
 * Features smooth animations, loading states, and countdown timers.
 *
 * @example
 * ```vue
 * <TxBottomDialog
 *   title="Confirm Action"
 *   message="Are you sure you want to proceed?"
 *   :btns="[
 *     { content: 'Cancel', type: 'info', onClick: () => true },
 *     { content: 'Confirm', type: 'success', onClick: handleConfirm }
 *   ]"
 *   :close="closeDialog"
 * />
 * ```
 *
 * @component
 */
import { computed, onMounted, onUnmounted, ref, useId, watchEffect } from 'vue'
import { lockBodyScroll, unlockBodyScroll } from '../../../../utils/body-scroll-lock'
import { createFocusReturn, trapTab } from '../../../../utils/focus-trap'
import { useZIndexAllocator } from '../../../../utils/z-index-manager'
import TxBaseSurface from '../../base-surface/src/TxBaseSurface.vue'
import { TxSpinner } from '../../spinner'
import { useDialogSurface } from './dialog-surface'

// Resolved in setup: inject is only valid here, while allocation happens later.
const zIndexAllocator = useZIndexAllocator()

defineOptions({
  name: 'TxBottomDialog',
})

const props = withDefaults(defineProps<BottomDialogProps>(), {
  title: '',
  message: '',
  stay: 0,
  btns: () => [],
  icon: '',
  index: 0,
  closeLabel: 'Close',
  surface: 'refraction',
  surfaceColor: '',
})

const { surfaceMode, surfaceColor, surfaceOpacity } = useDialogSurface(props)

/**
 * Internal button state interface.
 */
interface ButtonState {
  content: string
  type?: 'info' | 'warning' | 'error' | 'success'
  icon?: string
  time?: number
  onClick: () => Promise<boolean> | boolean
  loading?: boolean
}

const wholeDom = ref<HTMLElement | null>(null)
// The two phases the parts fade in (see the styles): the entrance, until it has played, and the close.
const entering = ref(true)
const closing = ref(false)
const btnArray = ref<Array<{ value: ButtonState }>>([])
const baseZIndex = ref(zIndexAllocator.get())
const zIndex = computed(() => baseZIndex.value + (props.index ?? 0))
const titleId = useId()
const messageId = useId()
const focusReturn = createFocusReturn()

/**
 * Pending auto-click countdown timers, tracked so they can be cancelled
 * when the buttons change or the dialog unmounts.
 */
const countdownTimers: Array<ReturnType<typeof setTimeout>> = []

/**
 * Cancels all pending button countdown timers.
 */
function clearCountdownTimers(): void {
  countdownTimers.forEach(timer => clearTimeout(timer))
  countdownTimers.length = 0
}

/**
 * Utility function to sleep for a specified duration.
 * @param ms - Duration in milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * The action rows are neutral; only `error` is destructive. The sheet renders
 * one red row per destructive choice, so a caller's `success` / `warning` no
 * longer paints a coloured button — the lift the old button row gave a
 * "Confirm" is now carried by position and wording alone.
 */
function isDestructive(type?: ButtonState['type']): boolean {
  return type === 'error'
}

/**
 * Handles button click with loading state management.
 * @param btn - The button state object
 * @param btn.value - The underlying button state
 */
async function clickBtn(btn: { value: ButtonState }): Promise<void> {
  btn.value.loading = true
  await sleep(200)

  if (await btn.value.onClick()) {
    await forClose()
  }

  btn.value.loading = false
}

/**
 * Watches for button prop changes and initializes button states.
 */
watchEffect((onCleanup) => {
  onCleanup(clearCountdownTimers)

  const array: Array<{ value: ButtonState }> = []

  ;[...props.btns].forEach((btn: DialogButton) => {
    const buttonState: ButtonState = {
      content: btn.content,
      type: btn.type,
      icon: btn.icon,
      time: btn.time,
      onClick: btn.onClick,
      loading: false,
    }

    const obj = { value: buttonState }

    if (btn.loading) {
      obj.value.loading = true
      btn.loading(() => {
        obj.value.loading = false
      })
    }

    if (btn.time && btn.time > 0) {
      const _clickBtn = clickBtn

      function refresh(): void {
        const timer = setTimeout(() => {
          if (obj.value.time && obj.value.time > 0) {
            obj.value.time -= 1
            if (obj.value.time <= 0) {
              _clickBtn(obj)
              return
            }
            refresh()
          }
        }, 1000)
        countdownTimers.push(timer)
      }

      refresh()
    }

    array.push(obj)
  })

  btnArray.value = array
})

onMounted(() => {
  baseZIndex.value = zIndexAllocator.next()
  focusReturn.save()
  if (wholeDom.value) {
    wholeDom.value.focus()
  }
  // The page holds still while the dialog is open.
  lockBodyScroll()
})

onUnmounted(() => {
  unlockBodyScroll()
  clearCountdownTimers()
  focusReturn.restore()
})

/** aria-modal="true" promises the page behind is inert, so Tab stays inside. */
function keepTab(event: KeyboardEvent): void {
  if (wholeDom.value)
    trapTab(event, wholeDom.value)
}

/**
 * Closes the dialog with animation. It is gone for the keys and the pointer at once: focus goes
 * back, the sheet is inert while it drops, a second Escape reaches what is under it, and no
 * countdown fires.
 */
async function forClose(): Promise<void> {
  if (!wholeDom.value || closing.value)
    return
  clearCountdownTimers()
  focusReturn.restore()
  // The sheet drops at once and its parts fade from 50ms on (see `--closing`).
  closing.value = true
  await sleep(150)
  props.close()
}
</script>

<template>
  <teleport to="body">
    <!-- The sheet never fades as a whole (see the styles), so the entrance's length is given here.
         `tx-bottom-dialog-moving` marks both phases, and the styles key the parts' fades on it. -->
    <Transition appear name="tx-bottom-dialog" :duration="200" @after-appear="entering = false">
      <div
        ref="wholeDom"
        class="tx-bottom-dialog"
        :class="{ 'tx-bottom-dialog-moving': entering || closing, 'tx-bottom-dialog--closing': closing }"
        :style="{ zIndex }"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-labelledby="title ? titleId : undefined"
        :aria-describedby="message ? messageId : undefined"
        :inert="closing || undefined"
        @keydown.esc.prevent="forClose"
        @keydown.tab="keepTab"
      >
        <TxBaseSurface
          class="tx-bottom-dialog__surface"
          preset="card"
          fake
          :mode="surfaceMode"
          :color="surfaceColor"
          :opacity="surfaceOpacity"
        />
        <div class="tx-bottom-dialog__container">
          <header class="tx-bottom-dialog__header">
            <p v-if="title" :id="titleId" class="tx-bottom-dialog__title">
              {{ title }}
            </p>
            <button type="button" class="tx-bottom-dialog__close" :aria-label="closeLabel" @click="forClose">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div v-if="message" :id="messageId" class="tx-bottom-dialog__content">
            {{ message }}
          </div>

          <div v-if="btnArray.length" class="tx-bottom-dialog__rows">
            <button
              v-for="(btn, i) in btnArray"
              :key="i"
              type="button"
              class="tx-bottom-dialog__row"
              :class="{ 'is-danger': isDestructive(btn.value.type) }"
              :disabled="btn.value.loading"
              @click="clickBtn(btn)"
            >
              <i
                v-if="btn.value.icon"
                class="tx-bottom-dialog__row-icon"
                :class="btn.value.icon"
                aria-hidden="true"
              />
              <span class="tx-bottom-dialog__row-label">
                {{ btn.value.time ? `${btn.value.content} (${btn.value.time}s)` : btn.value.content }}
              </span>
              <TxSpinner v-if="btn.value.loading" :size="16" class="tx-bottom-dialog__row-spinner" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </teleport>
</template>

<style lang="scss" scoped>
@use '../../../style/mixins.scss' as *;

@keyframes tx-bottom-dialog-enter {
  0% {
    transform: scale(0.8) translateX(-50%) translateY(100%);
  }
  100% {
    transform: scale(1) translateX(-50%) translateY(0);
  }
}

.tx-bottom-dialog {
  // Rows and the close control are the same raised surface; hover moves it
  // toward the ink, which darkens the light themes and lightens the dark one.
  --tx-bottom-dialog-surface: var(--tx-fill-color, #f0f2f5);
  --tx-bottom-dialog-surface-hover: color-mix(in srgb, var(--tx-bottom-dialog-surface) 86%, var(--tx-text-color-primary, #303133));
  --tx-bottom-dialog-focus-ring: color-mix(in srgb, var(--tx-color-primary, #409eff) 45%, transparent);
  // Destructive row: the danger tint as fill, with the danger hue mixed toward
  // the primary ink for the label (the `TxModeChip` recipe). Measured label
  // against fill: light `#fef0f0` 5.10:1, dark `#4f2020` 6.92:1, high-contrast
  // light 9.41:1, high-contrast dark 12.77:1 — every theme clears the 4.5:1
  // that 14px text needs. Re-measure if `--tx-color-danger-light-9` moves.
  --tx-bottom-dialog-danger-fill: var(--tx-color-danger-light-9, #fef0f0);
  --tx-bottom-dialog-danger-ink: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 55%, var(--tx-text-color-primary, #303133));

  position: fixed;
  left: 50%;
  bottom: 24px;
  width: min(420px, calc(100vw - 32px));
  // The sheet is anchored at the bottom, so a panel taller than the window
  // loses its header off the top edge. Cap it and let the two bodies give way.
  max-height: calc(100vh - 48px);
  display: flex;
  box-sizing: border-box;
  color: var(--tx-text-color-primary, #303133);

  // The sheet travels and never fades or clips: it would be the backdrop root of its own
  // material, or cut its own shadow. The container clips the content instead.
  transform: translateX(-50%);
  transition: transform 0.25s;
  @include tx-squircle(24px);

  // The shadow, on a layer of its own so it can fade while the sheet does not.
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
    corner-shape: inherit;
    box-shadow: var(--tx-box-shadow, 6px 12px 32px 4px rgba(0, 0, 0, 0.04));
    pointer-events: none;
  }

  &__surface {
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    corner-shape: inherit;
    pointer-events: none;
  }

  &__container {
    display: flex;
    flex-direction: column;
    gap: 16px;
    // Participates in the panel's height cap: a flex item refuses to shrink
    // below its content without `min-height: 0`, and the cap does nothing.
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    padding: 20px;
    box-sizing: border-box;
    overflow: hidden;
    border-radius: inherit;
    corner-shape: inherit;
  }

  &__header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 32px;
  }

  &__title {
    margin: 0;
    // Pushes the close control to the trailing edge, and keeps it there when
    // the dialog is rendered without a title.
    margin-right: auto;
    font-size: 18px;
    font-weight: var(--tx-font-weight-semibold, 600);
    letter-spacing: -0.01em;
    line-height: 1.2;
  }

  &__close {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--tx-border-radius-circle, 100%);
    background: var(--tx-bottom-dialog-surface);
    // Same measurement as the row glyphs: the X is an icon-only glyph on the
    // fill, where light-theme `secondary` is 2.75:1 and `regular` is 5.45:1.
    color: var(--tx-text-color-regular, #606266);
    cursor: pointer;

    &:hover {
      background: var(--tx-bottom-dialog-surface-hover);
      color: var(--tx-text-color-primary, #303133);
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px var(--tx-bottom-dialog-focus-ring);
    }
  }

  &__content {
    // A hash, an id or a URL has no break opportunity, so a vertical scroll
    // cannot save it: the token runs past the panel and the panel clips it.
    // `anywhere` also lets the token shrink the content's min-content width,
    // which `break-word` does not, so the panel stops being widened by it.
    overflow-wrap: anywhere;
    // The panel is overflow: hidden, so without a cap of its own a long body
    // was cut rather than scrolled. Matches Blow/Popper.
    max-height: 46vh;
    min-height: 0;
    overflow-y: auto;
    margin: -4px 0 0;
    font-size: 14px;
    line-height: 1.45;
    // `regular`, not `secondary`: this is body copy a reader has to read.
    color: var(--tx-text-color-regular, #606266);
    // Match Blow/Popper/TouchTip so plain `message` preserves line breaks (docs contract).
    white-space: pre-line;
  }

  &__rows {
    display: flex;
    flex-direction: column;
    gap: 12px;
    // Same reason as the message body: the panel clips, so the list scrolls.
    max-height: 46vh;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 48px;
    padding: 0 16px;
    box-sizing: border-box;

    border: none;
    border-radius: 14px;
    background: var(--tx-bottom-dialog-surface);
    color: var(--tx-text-color-primary, #303133);
    font-family: inherit;
    font-size: 14px;
    font-weight: var(--tx-font-weight-medium, 500);
    line-height: 1.2;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--tx-bottom-dialog-surface-hover);
    }

    &:focus-visible {
      outline: none;
      box-shadow: inset 0 0 0 1.5px var(--tx-bottom-dialog-focus-ring);
    }

    &:disabled {
      cursor: default;
      opacity: 0.6;
    }

    // Colour is additive: the row reads as destructive from its wording too.
    &.is-danger {
      background: var(--tx-bottom-dialog-danger-fill);
      color: var(--tx-bottom-dialog-danger-ink);

      &:hover {
        background: color-mix(in srgb, var(--tx-bottom-dialog-danger-fill) 88%, var(--tx-color-danger, #f56c6c));
      }

      .tx-bottom-dialog__row-icon {
        color: inherit;
      }
    }
  }

  &__row-icon {
    flex: 0 0 auto;
    // `regular`, not `secondary`: the glyph sits on the row fill, where light
    // theme secondary measures 2.75:1 — under the 3:1 an icon-only glyph needs.
    // Regular measures 5.45:1 light / 8.80:1 dark on the same fill.
    color: var(--tx-text-color-regular, #606266);
    font-size: 18px;
  }

  &__row-label {
    flex: 1;
    min-width: 0;
  }

  &__row-spinner {
    flex: 0 0 auto;
  }
}

// Sheet motion. The sheet slides and drops but never fades as a whole: an element whose opacity
// animates is the backdrop root of every backdrop filter inside it, so the material would sample
// nothing but the sheet. Each part fades on its own instead, and the material stays live from the
// first frame to the last: the content, the shadow, and the surface. A surface with a backdrop
// filter fades layer by layer; one without fades whole, and so does every surface under high
// contrast, which drops the layers that blur. Each phase hands its fade down as
// `--tx-bottom-dialog-fade`, so the parts are listed once.
.tx-bottom-dialog-enter-active {
  --tx-bottom-dialog-fade: tx-bottom-dialog-fade-in 0.2s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)) forwards;

  animation: tx-bottom-dialog-enter 0.2s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)) forwards;
}

// Closing: the sheet drops at once, and its parts fade from 50ms on.
.tx-bottom-dialog--closing {
  --tx-bottom-dialog-fade: tx-bottom-dialog-fade-out 0.25s ease 50ms forwards;

  @media (prefers-reduced-motion: no-preference) {
    transform: translate(-50%, 0) scale(0.8) translateY(100%);
  }
}

.tx-bottom-dialog-moving {
  > .tx-bottom-dialog__container,
  &::after,
  > .tx-bottom-dialog__surface:not(.tx-base-surface--with-glass, .tx-base-surface--with-filter),
  > .tx-bottom-dialog__surface:is(.tx-base-surface--with-glass, .tx-base-surface--with-filter)::before,
  > .tx-bottom-dialog__surface:is(.tx-base-surface--with-glass, .tx-base-surface--with-filter) :deep(.tx-base-surface__layer) {
    animation: var(--tx-bottom-dialog-fade);
  }

  @include tx-when-high-contrast {
    > .tx-bottom-dialog__surface {
      animation: var(--tx-bottom-dialog-fade);
    }
  }
}

// A sheet that slides in is motion, not meaning: reduced motion keeps the fades and drops the
// travel, so the sheet fades in and out in its resting frame.
@media (prefers-reduced-motion: reduce) {
  .tx-bottom-dialog-enter-active {
    animation: none;
  }
}
</style>

<style lang="scss">
// Unscoped: the parts take these through `--tx-bottom-dialog-fade`, and a scoped sheet renames its
// keyframes only where an `animation` declaration names them, never inside a custom property.
// Each gives only its far end, so a part fades from, or to, the opacity it rests at.
@keyframes tx-bottom-dialog-fade-in {
  from {
    opacity: 0;
  }
}

@keyframes tx-bottom-dialog-fade-out {
  to {
    opacity: 0;
  }
}
</style>
