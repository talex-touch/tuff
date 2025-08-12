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
        <p v-if="title" id="dialog-title">{{ title }}</p>
        <div class="TBlowDialog-Content">
          <span style="position: relative; height: 100%" v-html="message"></span>
        </div>
        <div
          v-wave
          class="TBlowDialog-Confirm"
          role="button"
          tabindex="0"
          @click="destroy"
          @keydown.enter="destroy"
          @keydown.space="destroy"
        >
          Confirm
        </div>
      </template>
    </div>
  </div>
</template>

<script lang="ts" name="TBlowDialog" setup>
import { type Component, VNode } from 'vue'
import { sleep } from '@talex-touch/utils/common'

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
  comp: undefined,
  render: undefined
})

/** Reactive reference to control dialog closing state */
const isClosing = ref(false)

/** Reactive reference for the render component */
const renderComp = ref<Component | null>(null)

/** Reference to the dialog wrapper element */
const dialogWrapper = ref<HTMLElement | null>(null)

/** Reference to the previously focused element */
let previouslyFocusedElement: HTMLElement | null = null

/**
 * Lifecycle hook when component is mounted
 * - Creates component if render function is provided
 * - Applies background blur effect
 * - Sets focus to dialog
 */
onMounted(() => {
  // Save the currently focused element
  previouslyFocusedElement = document.activeElement as HTMLElement

  if (props.render) {
    renderComp.value = defineComponent({
      render: props.render
    })
  }

  // Apply background blur effect
  applyBackgroundBlur(true)

  // Set focus to dialog
  setFocusToDialog()
})

/**
 * Lifecycle hook when component is unmounted
 * - Restores focus to the previously focused element
 */
onUnmounted(() => {
  restoreFocus()
})

/**
 * Sets focus to the dialog
 */
function setFocusToDialog(): void {
  // If there is a confirm button, focus on it
  const confirmButton = dialogWrapper.value?.querySelector('.TBlowDialog-Confirm')
  if (confirmButton instanceof HTMLElement) {
    confirmButton.focus()
  } else if (dialogWrapper.value) {
    // Otherwise, focus on the dialog wrapper
    dialogWrapper.value.setAttribute('tabindex', '-1')
    dialogWrapper.value.focus()
  }
}

/**
 * Restores focus to the previously focused element
 */
function restoreFocus(): void {
  if (previouslyFocusedElement) {
    previouslyFocusedElement.focus()
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

<style lang="scss">
// SCSS variables
$dialog-transition-duration: 0.5s;
$dialog-border-radius: 8px;
$confirm-button-height: 30px;
$confirm-button-border-radius: 5px;
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
  box-shadow: var(--el-box-shadow);
  box-sizing: border-box;
  background-color: var(--el-fill-color-light);
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

  .TBlowDialog-Confirm {
    position: absolute;
    width: calc(100% - (#{$container-padding} * 2));
    height: $confirm-button-height;
    line-height: $confirm-button-height;
    bottom: 20px;
    cursor: pointer;
    user-select: none;
    text-align: center;
    border-radius: $confirm-button-border-radius;
    background: linear-gradient(
      to right,
      var(--el-color-primary-light-3),
      var(--el-color-primary-light-5),
      var(--el-color-primary-light-3)
    );
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
  }
}

.close .TBlowDialog-Container {
  opacity: 0;
  transform: scale(0);
}
</style>
