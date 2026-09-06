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
import { useZIndexAllocator } from '../../../../utils/z-index-manager'
import { TxButton } from '../../button'

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
})

const isClosing = ref(false)
const renderComp = ref<Component | null>(null)
const dialogWrapper = ref<HTMLElement | null>(null)
const zIndex = ref(zIndexAllocator.get())
// Instance-scoped ids (mirroring Bottom/TouchTip) so the dialog announces both its
// title and its message, and stacked dialogs never collide on a hard-coded id.
const titleId = useId()
const contentId = useId()
let previouslyFocusedElement: HTMLElement | null = null
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
  previouslyFocusedElement = document.activeElement as HTMLElement

  if (props.render) {
    renderComp.value = defineComponent({
      render: props.render,
    })
  }

  applyBackgroundBlur(true)
  setFocusToDialog()
})

onUnmounted(() => {
  restoreFocus()
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

/**
 * Restores focus to the previously focused element.
 */
function restoreFocus(): void {
  if (previouslyFocusedElement) {
    previouslyFocusedElement.focus()
  }
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
 * Destroys the dialog with animation.
 */
async function destroy(): Promise<void> {
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
    <div
      ref="dialogWrapper"
      class="tx-blow-dialog"
      :class="{ 'tx-blow-dialog--closing': isClosing }"
      :style="{ zIndex }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="title ? titleId : undefined"
      :aria-describedby="(message || messageHtml) ? contentId : undefined"
      @keydown.esc="destroy"
    >
      <div class="tx-blow-dialog__container">
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
  </teleport>
</template>

<style lang="scss">
@keyframes tx-blow-dialog-fade-in {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@keyframes tx-blow-dialog-scale {
  0% {
    transform: scale(0);
  }
  100% {
    transform: scale(1);
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
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(5px);
  transition: opacity 0.5s;
  animation: tx-blow-dialog-fade-in 0.5s;

  &--closing {
    opacity: 0;

    .tx-blow-dialog__container {
      opacity: 0;
      transform: scale(0);
    }
  }

  /**
   * The card. A rimmed overlay surface, not a page-coloured slab: on a dark
   * page the old `0 8px 32px` black shadow was a smudge around a box the same
   * colour as the backdrop, and a 200px floor with the button pinned to the
   * bottom left it hanging 60px under a one-line message. Now the content sets
   * the height, the rim (border-light, as on every panel) draws the edge, the
   * highlight catches the top, and the shadow is long, low and ink-tinted so
   * it reads as depth rather than dirt. 18px radius matches the menu panels.
   */
  &__container {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(360px, 100%);
    max-height: 100%;
    /* The height comes from the spacing rhythm, not a floor: a floor left a hole between the message and the action. */
    padding: 32px 24px 24px;
    border-radius: 18px;
    border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
    background: var(--tx-bg-color-overlay, #fff);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, var(--tx-color-white, #fff) 10%, transparent),
      0 24px 64px -20px rgba(15, 23, 42, 0.45),
      0 2px 8px rgba(15, 23, 42, 0.08);
    box-sizing: border-box;
    transition: transform 0.5s, opacity 0.5s;
    animation: tx-blow-dialog-scale 0.5s;
  }

  /* Title / message / action: three steps, each one clearly under the last. */
  &__title {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: -0.01em;
    text-align: center;
    color: var(--tx-text-color-primary, #303133);
  }

  &__content {
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
</style>
