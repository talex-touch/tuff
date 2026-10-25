<script setup lang="ts">
import type { Component, VNode } from 'vue'
import type { PopperDialogProps } from './types'
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
  name: 'TxPopperDialog',
})

const props = withDefaults(defineProps<PopperDialogProps>(), {
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

const titleId = useId()
const contentId = useId()

// The two phases the parts fade in (see the styles): the entrance, until it has played, and the close.
const isEntering = ref(true)
const isClosing = ref(false)
const renderComp = ref<Component | null>(null)
const dialogWrapper = ref<HTMLElement | null>(null)
const zIndex = ref(zIndexAllocator.get())
const focusReturn = createFocusReturn()

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

onMounted(() => {
  zIndex.value = zIndexAllocator.next()
  focusReturn.save()

  if (props.render) {
    renderComp.value = defineComponent({
      render: props.render as unknown as () => VNode,
    })
  }

  if (dialogWrapper.value) {
    dialogWrapper.value.setAttribute('tabindex', '-1')
    dialogWrapper.value.focus({ preventScroll: true })
  }
})

onUnmounted(() => {
  focusReturn.restore()
})

/** aria-modal="true" promises the page behind is inert, so Tab stays inside. */
function keepTab(event: KeyboardEvent): void {
  if (dialogWrapper.value)
    trapTab(event, dialogWrapper.value)
}

/**
 * Gone for the keys and the pointer at once: focus goes back, the dialog is inert while it leaves,
 * and a second Escape reaches what is under it.
 */
async function destroy(): Promise<void> {
  if (isClosing.value)
    return
  focusReturn.restore()
  isClosing.value = true
  await sleep(250)
  props.close()
}

provide('destroy', destroy)
</script>

<template>
  <teleport to="body">
    <!-- The panel never fades as a whole (see the styles), so the entrance's length is given here.
         `tx-popper-dialog-moving` marks both phases, and the styles key the parts' fades on it. -->
    <Transition appear name="tx-popper-dialog" :duration="250" @after-appear="isEntering = false">
      <div
        ref="dialogWrapper"
        class="tx-popper-dialog"
        :class="{ 'tx-popper-dialog-moving': isEntering || isClosing, 'tx-popper-dialog--closing': isClosing }"
        :style="{ zIndex }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? titleId : undefined"
        :aria-describedby="message || messageHtml ? contentId : undefined"
        :inert="isClosing || undefined"
        @keydown.esc.prevent="destroy"
        @keydown.tab="keepTab"
      >
        <div class="tx-popper-dialog__container">
          <TxBaseSurface
            class="tx-popper-dialog__surface"
            preset="card"
            fake
            :mode="surfaceMode"
            :color="surfaceColor"
            :opacity="surfaceOpacity"
          />
          <component :is="renderComp" v-if="renderComp" />
          <component :is="comp" v-else-if="comp" />
          <template v-else>
            <p v-if="title" :id="titleId" class="tx-popper-dialog__title">
              {{ title }}
            </p>

            <div
              v-if="message || messageHtml"
              :id="contentId"
              class="tx-popper-dialog__content"
            >
              <!-- eslint-disable-next-line vue/no-v-html -->
              <span v-if="messageHtml" v-html="messageHtml" />
              <span v-else>{{ message }}</span>
            </div>

            <TxButton
              class="tx-popper-dialog__confirm"
              type="primary"
              native-type="button"
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
@keyframes tx-popper-dialog-fade-in {
  from {
    opacity: 0;
  }
}

@keyframes tx-popper-dialog-fade-out {
  to {
    opacity: 0;
  }
}

@keyframes tx-popper-dialog-enter {
  from {
    transform: scale(1.1);
  }
}

.tx-popper-dialog {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  // The dim is a layer under the panel rather than the overlay's own paint: an overlay fading
  // through opacity would be the panel's backdrop root, and the panel's material would sample
  // only the dim instead of the page.
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    transition: opacity 0.25s ease;
  }

  &--closing {
    &::before {
      opacity: 0;
    }

    @media (prefers-reduced-motion: no-preference) {
      .tx-popper-dialog__container {
        transform: scale(1.05);
      }
    }
  }

  &__container {
    // Positioned and stacked, so the surface sits under the content without leaving the panel.
    position: relative;
    z-index: 0;
    padding: 16px;
    width: min(360px, 80vw);
    max-height: 80vh;
    box-sizing: border-box;
    overflow: hidden;
    transition: transform 0.25s ease;
    @include tx-squircle(16px);
  }

  &__surface {
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    corner-shape: inherit;
    pointer-events: none;
  }

  &__title {
    margin: 0;
    font-size: 18px;
    font-weight: var(--tx-font-weight-semibold, 600);
    text-align: center;
    color: var(--tx-text-color-primary, #303133);
  }

  &__content {
    // A hash, an id or a URL has no break opportunity, so a vertical scroll
    // cannot save it: the token runs past the panel and the panel clips it.
    // `anywhere` also lets the token shrink the content's min-content width,
    // which `break-word` does not, so the panel stops being widened by it.
    overflow-wrap: anywhere;
    position: relative;
    margin-top: 12px;
    margin-bottom: 60px;
    max-height: 300px;
    overflow-y: auto;

    span {
      display: block;
      width: 100%;
      text-align: center;
      line-height: 1.4;
      color: var(--tx-text-color-secondary, #909399);
      white-space: pre-line;
    }
  }

  &__confirm {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 16px;
    width: auto;
  }
}

// Panel motion. The panel scales but never fades as a whole: an element whose opacity animates is
// the backdrop root of every backdrop filter inside it, so the material would sample nothing but
// the panel. Each part fades on its own instead, and the material stays live from the first frame
// to the last: the content and the surface. A surface with a backdrop filter fades layer by layer;
// one without fades whole, and so does every surface under high contrast, which drops the layers
// that blur. Each phase hands its fade down as `--tx-popper-dialog-fade`.
.tx-popper-dialog-enter-active {
  --tx-popper-dialog-fade: tx-popper-dialog-fade-in 0.25s ease;

  .tx-popper-dialog__container {
    animation: tx-popper-dialog-enter 0.25s ease;
  }
}

// After the entrance, so a panel closed while it still enters fades out.
.tx-popper-dialog--closing {
  --tx-popper-dialog-fade: tx-popper-dialog-fade-out 0.25s ease forwards;
}

.tx-popper-dialog-moving {
  .tx-popper-dialog__container > :not(.tx-popper-dialog__surface),
  .tx-popper-dialog__surface:not(.tx-base-surface--with-glass, .tx-base-surface--with-filter),
  .tx-popper-dialog__surface:is(.tx-base-surface--with-glass, .tx-base-surface--with-filter)::before,
  .tx-popper-dialog__surface:is(.tx-base-surface--with-glass, .tx-base-surface--with-filter) .tx-base-surface__layer {
    animation: var(--tx-popper-dialog-fade);
  }

  @include tx-when-high-contrast {
    .tx-popper-dialog__surface {
      animation: var(--tx-popper-dialog-fade);
    }
  }
}

// Reduced motion keeps the fades and drops the scale: the panel fades in and out where it rests.
@media (prefers-reduced-motion: reduce) {
  .tx-popper-dialog-enter-active .tx-popper-dialog__container {
    animation: none;
  }
}
</style>
