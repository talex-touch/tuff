<script lang="ts" name="TBlowDialog" setup>
import { defineComponent, onMounted, ref, type Component, type VNode } from 'vue'
import { TxButton } from '@talex-touch/tuffex/button'
import type { DialogMessageHtml } from '@talex-touch/tuffex/dialog'
import { sleep } from '@talex-touch/utils/common'
import { useDialogFocus } from './useDialogFocus'

/**
 * Props for the TBlowDialog component
 */
interface Props {
  /** Callback function to close the dialog */
  close: () => void
  /** Dialog title */
  title?: string
  /** Dialog message content */
  message?: string
  /** Trusted HTML dialog message content */
  messageHtml?: DialogMessageHtml
  /** Component to render */
  comp?: Component
  /** Render function */
  render?: () => VNode
}

/**
 * Component props with default values
 */
const props = withDefaults(defineProps<Props>(), {
  title: '',
  message: '',
  messageHtml: '',
  comp: undefined,
  render: undefined
})

/** Reactive reference to control dialog closing state */
const isClosing = ref(false)

/** Reactive reference for the render component */
const renderComp = ref<Component | null>(null)

/** Reference to the dialog wrapper element */
const dialogWrapper = ref<HTMLElement | null>(null)

if (props.render) {
  renderComp.value = defineComponent({
    render: props.render
  })
}

useDialogFocus({
  target: dialogWrapper,
  focus: setFocusToDialog,
  scrollLock: false
})

onMounted(() => {
  applyBackgroundBlur(true)
})

/**
 * Sets focus to the dialog
 */
function setFocusToDialog(): void {
  // If there is a confirm button, focus on it
  const confirmButton = dialogWrapper.value?.querySelector('.tx-button')
  if (confirmButton instanceof HTMLElement) {
    confirmButton.focus()
  } else if (dialogWrapper.value) {
    // Otherwise, focus on the dialog wrapper
    dialogWrapper.value.setAttribute('tabindex', '-1')
    dialogWrapper.value.focus()
  }
}

/**
 * Applies or removes background blur effect
 * @param apply Whether to apply background blur effect
 */
function applyBackgroundBlur(apply: boolean): void {
  const app = document.getElementById('app')
  if (!app) return

  if (apply) {
    Object.assign(app.style, {
      transition: '.75s',
      transform: 'scale(1.25)',
      opacity: '.75'
    })
  } else {
    Object.assign(app.style, {
      transform: 'scale(1)',
      opacity: '1'
    })
  }
}

/**
 * Destroys the dialog
 * - Removes background blur effect
 * - Sets closing state
 * - Clears styles after animation completes and calls close callback
 */
async function destroy(): Promise<void> {
  // Remove background blur effect
  applyBackgroundBlur(false)

  isClosing.value = true

  await sleep(550)

  // Clear applied styles
  const app = document.getElementById('app')
  if (app) {
    app.style.cssText = ''
  }

  props.close()
}

provide('destroy', destroy)
</script>

<template>
  <div
    ref="dialogWrapper"
    :class="{ close: isClosing }"
    class="TBlowDialog-Wrapper"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="title ? 'dialog-title' : undefined"
    @keydown.esc="destroy"
  >
    <div class="TBlowDialog-Container">
      <component :is="renderComp" v-if="renderComp" />
      <component :is="comp" v-else-if="comp" />
      <template v-else>
        <p v-if="title" id="dialog-title">
          {{ title }}
        </p>
        <div v-if="message || messageHtml" class="TBlowDialog-Content">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <span v-if="messageHtml" style="position: relative; height: 100%" v-html="messageHtml" />
          <span v-else style="position: relative; height: 100%">
            {{ message }}
          </span>
        </div>
        <TxButton variant="flat" type="primary" block @click="destroy"> Confirm </TxButton>
      </template>
    </div>
  </div>
</template>

<style lang="scss">
// SCSS variables
$dialog-transition-duration: 0.5s;
$dialog-border-radius: 8px;
$container-padding: 20px;
$container-padding-vertical: 8px;

// Animation definitions
@keyframes blow-outer {
  from {
    opacity: 1;
    transform: scale(1);
  }

  to {
    opacity: 0.75;
    transform: scale(1.25);
  }
}

@keyframes blow {
  0% {
    transform: scale(0);
  }

  100% {
    transform: scale(1);
  }
}

@keyframes fade-in {
  0% {
    opacity: 0;
  }

  100% {
    opacity: 1;
  }
}

// Style classes
.blow-outer {
  animation: blow-outer 0.55s forwards;
}

.blow-outer-reverse {
  animation-direction: reverse;
}

.TBlowDialog-Wrapper {
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  backdrop-filter: blur(5px);
  transition: $dialog-transition-duration;
  animation: fade-in $dialog-transition-duration;

  &.close {
    opacity: 0;
  }
}

.TBlowDialog-Container {
  position: relative;
  padding: $container-padding-vertical $container-padding;
  min-width: 320px;
  min-height: 200px;
  max-height: 80%;
  border-radius: $dialog-border-radius;
  box-shadow: var(--tx-box-shadow);
  box-sizing: border-box;
  background-color: var(--tx-fill-color-light);
  transition: $dialog-transition-duration;
  animation: blow $dialog-transition-duration;

  .TBlowDialog-Content {
    position: relative;
    margin-bottom: 60px;
    top: 0;
    left: 0;
    right: 0;
    height: 100%;
    max-height: 300px;
    overflow: hidden;
    overflow-y: auto;
    box-sizing: border-box;
  }

  > .tx-button {
    position: absolute;
    width: calc(100% - (#{$container-padding} * 2));
    bottom: 20px;
  }

  p {
    font-size: 1.5rem;
    font-weight: 600;
    text-align: center;
  }

  span {
    width: 100%;
    display: block;
    text-align: center;
    white-space: pre-line;
  }
}

.close .TBlowDialog-Container {
  opacity: 0;
  transform: scale(0);
}
</style>
