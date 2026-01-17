<script setup lang="ts">
import type { Component, PropType, VNode } from 'vue'
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
 *   message="<strong>Hello!</strong> Welcome to our app."
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

} from 'vue'

defineOptions({
  name: 'TxBlowDialog',
})

const props = defineProps({
  close: {
    type: Function as PropType<() => void>,
    required: true,
  },
  title: {
    type: String,
    default: '',
  },
  message: {
    type: String,
    default: '',
  },
  comp: {
    type: Object as PropType<Component>,
    default: undefined,
  },
  render: {
    type: Function as PropType<() => VNode>,
    default: undefined,
  },
})

const isClosing = ref(false)
const renderComp = ref<Component | null>(null)
const dialogWrapper = ref<HTMLElement | null>(null)
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
  const confirmButton = dialogWrapper.value?.querySelector('.tx-blow-dialog__confirm')
  if (confirmButton instanceof HTMLElement) {
    confirmButton.focus()
  }
  else if (dialogWrapper.value) {
    dialogWrapper.value.setAttribute('tabindex', '-1')
    dialogWrapper.value.focus()
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
      role="dialog"
      aria-modal="true"
      :aria-labelledby="title ? 'tx-blow-dialog-title' : undefined"
      @keydown.esc="destroy"
    >
      <div class="tx-blow-dialog__container">
        <component :is="renderComp" v-if="renderComp" />
        <component :is="comp" v-else-if="comp" />
        <template v-else>
          <p v-if="title" id="tx-blow-dialog-title" class="tx-blow-dialog__title">
            {{ title }}
          </p>
          <div class="tx-blow-dialog__content">
            <span v-html="message" />
          </div>
          <button
            type="button"
            class="tx-blow-dialog__confirm"
            @click="destroy"
          >
            Confirm
          </button>
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
  z-index: 10000;
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

  &__container {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 20px 24px;
    min-width: 320px;
    min-height: 200px;
    max-height: 80%;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    background: var(--tx-bg-color, #fff);
    box-sizing: border-box;
    transition: all 0.5s;
    animation: tx-blow-dialog-scale 0.5s;
  }

  &__title {
    margin: 0 0 16px;
    font-size: 1.5rem;
    font-weight: 600;
    text-align: center;
    color: var(--tx-text-color-primary, #303133);
  }

  &__content {
    flex: 1;
    margin-bottom: 60px;
    max-height: 300px;
    overflow-y: auto;

    span {
      display: block;
      width: 100%;
      text-align: center;
      color: var(--tx-text-color-secondary, #909399);
    }
  }

  &__confirm {
    position: absolute;
    bottom: 20px;
    left: 24px;
    right: 24px;
    padding: 12px 16px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #fff;
    background: linear-gradient(
      to right,
      var(--tx-color-primary-light-3, #79bbff),
      var(--tx-color-primary-light-5, #a0cfff),
      var(--tx-color-primary-light-3, #79bbff)
    );
    cursor: pointer;
    user-select: none;
    transition: all 0.25s;

    &:hover {
      filter: brightness(1.1);
    }

    &:active {
      transform: scale(0.98);
    }

    &:focus-visible {
      outline: 2px solid var(--tx-color-primary);
      outline-offset: 2px;
    }
  }
}
</style>
