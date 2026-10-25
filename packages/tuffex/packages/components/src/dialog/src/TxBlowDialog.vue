<script setup lang="ts">
import type { Component } from 'vue'
import type { BlowDialogProps } from './types'
/**
 * TxBlowDialog Component
 *
 * A centered dialog with a dramatic "blow" animation effect.
 * Supports custom components, render functions, or simple message content.
 *
 * @example
 * ```vue
 * <TxBlowDialog
 *   title="Welcome"
 *   message="Hello! Welcome to our app."
 *   :close="closeDialog"
 * />
 * ```
 *
 * @component
 */
import {

  defineComponent,
  onMounted,
  onUnmounted,

  provide,
  ref,
  useId,

} from 'vue'
import { createFocusReturn, trapTab } from '../../../../utils/focus-trap'
import { useZIndexAllocator } from '../../../../utils/z-index-manager'
import TxBaseSurface from '../../base-surface/src/TxBaseSurface.vue'
import { TxButton } from '../../button'
import { useDialogSurface } from './dialog-surface'

// Resolved in setup: inject is only valid here, while allocation happens later.
const zIndexAllocator = useZIndexAllocator()

defineOptions({
  name: 'TxBlowDialog',
})

const props = withDefaults(defineProps<BlowDialogProps>(), {
  title: '',
  message: '',
  messageHtml: '',
  confirmText: 'Confirm',
  comp: undefined,
  render: undefined,
  surface: 'refraction',
  surfaceColor: '',
})

const { surfaceMode, surfaceColor, surfaceOpacity } = useDialogSurface(props)

// The two phases the parts fade in (see the styles): the entrance, until it has played, and the close.
const isEntering = ref(true)
const isClosing = ref(false)
const renderComp = ref<Component | null>(null)
const dialogWrapper = ref<HTMLElement | null>(null)
const zIndex = ref(zIndexAllocator.get())
// Instance-scoped ids (mirroring Bottom/TouchTip) so the dialog announces both its
// title and its message, and stacked dialogs never collide on a hard-coded id.
const titleId = useId()
const contentId = useId()
const focusReturn = createFocusReturn()
let didApplyBackgroundBlur = false

/**
 * Utility function to sleep for a specified duration.
 * @param ms - Duration in milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

onMounted(() => {
  zIndex.value = zIndexAllocator.next()
  focusReturn.save()

  if (props.render) {
    renderComp.value = defineComponent({
      render: props.render,
    })
  }

  applyBackgroundBlur(true)
  setFocusToDialog()
})

onUnmounted(() => {
  focusReturn.restore()
})

/**
 * Sets focus to the dialog or its confirm button.
 */
function setFocusToDialog(): void {
  if (dialogWrapper.value) {
    dialogWrapper.value.setAttribute('tabindex', '-1')
    dialogWrapper.value.focus({ preventScroll: true })
  }
}

/** aria-modal="true" promises the page behind is inert, so Tab stays inside. */
function keepTab(event: KeyboardEvent): void {
  if (dialogWrapper.value)
    trapTab(event, dialogWrapper.value)
}

/**
 * Applies or removes background blur effect on the app container.
 * @param apply - Whether to apply the blur effect
 */
function applyBackgroundBlur(apply: boolean): void {
  const isVitePress = !!document.querySelector('.VPApp')
  if (isVitePress)
    return

  const app = document.getElementById('app')
  if (!app)
    return

  if (apply) {
    Object.assign(app.style, {
      transition: '.75s',
      transform: 'scale(1.25)',
      opacity: '.75',
    })
    didApplyBackgroundBlur = true
  }
  else {
    Object.assign(app.style, {
      transform: 'scale(1)',
      opacity: '1',
    })
  }
}

/**
 * Destroys the dialog with animation. It is gone for the keys and the pointer at once: focus goes
 * back, the dialog is inert while it leaves, and a second Escape reaches what is under it.
 */
async function destroy(): Promise<void> {
  if (isClosing.value)
    return
  focusReturn.restore()
  applyBackgroundBlur(false)
  isClosing.value = true
  await sleep(550)

  if (didApplyBackgroundBlur) {
    const app = document.getElementById('app')
    if (app) {
      app.style.cssText = ''
    }
  }

  props.close()
}

provide('destroy', destroy)
</script>

<template>
  <teleport to="body">
    <!-- Neither the overlay nor the card fades as a whole (see the styles), so the entrance's length
         is given here. `tx-blow-dialog-moving` marks both phases, and the styles key the parts' fades
         on it. -->
    <Transition appear name="tx-blow-dialog" :duration="500" @after-appear="isEntering = false">
      <div
        ref="dialogWrapper"
        class="tx-blow-dialog"
        :class="{ 'tx-blow-dialog-moving': isEntering || isClosing, 'tx-blow-dialog--closing': isClosing }"
        :style="{ zIndex }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? titleId : undefined"
        :aria-describedby="(message || messageHtml) ? contentId : undefined"
        :inert="isClosing || undefined"
        @keydown.esc.prevent="destroy"
        @keydown.tab="keepTab"
      >
        <div class="tx-blow-dialog__container">
          <TxBaseSurface
            class="tx-blow-dialog__surface"
            preset="card"
            fake
            :mode="surfaceMode"
            :color="surfaceColor"
            :opacity="surfaceOpacity"
          />
          <component :is="renderComp" v-if="renderComp" />
          <component :is="comp" v-else-if="comp" />
          <template v-else>
            <p v-if="title" :id="titleId" class="tx-blow-dialog__title">
              {{ title }}
            </p>
            <div v-if="message || messageHtml" :id="contentId" class="tx-blow-dialog__content">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <span v-if="messageHtml" v-html="messageHtml" />
              <span v-else>{{ message }}</span>
            </div>
            <TxButton
              class="tx-blow-dialog__confirm"
              type="primary"
              native-type="button"
              block
              @click="destroy"
            >
              {{ confirmText }}
            </TxButton>
          </template>
        </div>
      </div>
    </Transition>
  </teleport>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;

// Each fade gives only its far end, so a part fades from, or to, the opacity it rests at.
@keyframes tx-blow-dialog-fade-in {
  from {
    opacity: 0;
  }
}

@keyframes tx-blow-dialog-fade-out {
  to {
    opacity: 0;
  }
}

@keyframes tx-blow-dialog-scale {
  from {
    transform: scale(0);
  }
}

.tx-blow-dialog {
  position: fixed;
  display: flex;
  justify-content: center;
  align-items: center;
  inset: 0;
  padding: 24px;
  box-sizing: border-box;

  // The dim and the frost are a layer under the card rather than the overlay's own paint and
  // opacity. An overlay with a backdrop filter, or one fading through opacity, would be the card's
  // backdrop root, and the card's material would sample only the overlay instead of the page.
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(5px);
    transition: opacity 0.5s;
  }

  // High contrast keeps the dimming and drops the frost.
  @include tx-when-high-contrast {
    &::before {
      backdrop-filter: none;
    }
  }

  &--closing {
    &::before {
      opacity: 0;
    }

    @media (prefers-reduced-motion: no-preference) {
      .tx-blow-dialog__container {
        transform: scale(0);
      }
    }
  }

  // The card. A rimmed overlay surface, not a page-coloured slab: on a dark
  // page the old `0 8px 32px` black shadow was a smudge around a box the same
  // colour as the backdrop, and a 200px floor with the button pinned to the
  // bottom left it hanging 60px under a one-line message. Now the content sets
  // the height, the rim (border-light, as on every panel) draws the edge, the
  // highlight catches the top, and the shadow is long, low and ink-tinted so
  // it reads as depth rather than dirt. 18px radius matches the menu panels.
  &__container {
    // Positioned and stacked, so the surface sits under the content without leaving the card.
    position: relative;
    z-index: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(360px, 100%);
    max-height: 100%;
    // The height comes from the spacing rhythm, not a floor: a floor left a hole between the message and the action.
    padding: 32px 24px 24px;
    box-sizing: border-box;
    transition: transform 0.5s;
    @include tx-squircle(18px);

    // The rim, the highlight and the shadow, on a layer of their own so they can fade while the
    // card does not (see the motion below). Above the surface, which would cover the rim.
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 1;
      border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
      border-radius: inherit;
      corner-shape: inherit;
      box-shadow:
        inset 0 1px 0 color-mix(in srgb, var(--tx-color-white, #fff) 10%, transparent),
        12px 24px 64px -20px rgba(15, 23, 42, 0.45),
        1px 2px 8px rgba(15, 23, 42, 0.08);
      box-sizing: border-box;
      pointer-events: none;
    }
  }

  &__surface {
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    corner-shape: inherit;
    pointer-events: none;
  }

  // Title / message / action: three steps, each one clearly under the last.
  &__title {
    margin: 0;
    font-size: 17px;
    font-weight: var(--tx-font-weight-semibold, 600);
    line-height: 1.3;
    letter-spacing: -0.01em;
    text-align: center;
    color: var(--tx-text-color-primary, #303133);
  }

  &__content {
    // A hash, an id or a URL has no break opportunity, so a vertical scroll
    // cannot save it: the token runs past the panel and the panel clips it.
    // `anywhere` also lets the token shrink the content's min-content width,
    // which `break-word` does not, so the panel stops being widened by it.
    overflow-wrap: anywhere;
    margin: 0;
    max-height: 300px;
    overflow-y: auto;
    font-size: 13px;
    line-height: 1.55;

    span {
      display: block;
      width: 100%;
      text-align: center;
      color: var(--tx-text-color-secondary, #909399);
      white-space: pre-line;
    }
  }

  &__confirm {
    margin-top: 14px;
  }
}

// Card motion. The card scales but never fades as a whole: an element whose opacity animates is
// the backdrop root of every backdrop filter inside it, so the material would sample nothing but
// the card. Each part fades on its own instead, and the material stays live from the first frame
// to the last: the content, the rim and shadow, and the surface. A surface with a backdrop filter
// fades layer by layer; one without fades whole, and so does every surface under high contrast,
// which drops the layers that blur. Each phase hands its fade down as `--tx-blow-dialog-fade`.
.tx-blow-dialog-enter-active {
  --tx-blow-dialog-fade: tx-blow-dialog-fade-in 0.5s;

  &::before {
    animation: tx-blow-dialog-fade-in 0.5s;
  }

  .tx-blow-dialog__container {
    animation: tx-blow-dialog-scale 0.5s;
  }
}

// After the entrance, so a card closed while it still enters fades out.
.tx-blow-dialog--closing {
  --tx-blow-dialog-fade: tx-blow-dialog-fade-out 0.5s forwards;
}

.tx-blow-dialog-moving {
  .tx-blow-dialog__container > :not(.tx-blow-dialog__surface),
  .tx-blow-dialog__container::after,
  .tx-blow-dialog__surface:not(.tx-base-surface--with-glass, .tx-base-surface--with-filter),
  .tx-blow-dialog__surface:is(.tx-base-surface--with-glass, .tx-base-surface--with-filter)::before,
  .tx-blow-dialog__surface:is(.tx-base-surface--with-glass, .tx-base-surface--with-filter) .tx-base-surface__layer {
    animation: var(--tx-blow-dialog-fade);
  }

  @include tx-when-high-contrast {
    .tx-blow-dialog__surface {
      animation: var(--tx-blow-dialog-fade);
    }
  }
}

// Reduced motion keeps the fades and drops the scale: the card fades in and out where it rests.
@media (prefers-reduced-motion: reduce) {
  .tx-blow-dialog-enter-active .tx-blow-dialog__container {
    animation: none;
  }
}
</style>
