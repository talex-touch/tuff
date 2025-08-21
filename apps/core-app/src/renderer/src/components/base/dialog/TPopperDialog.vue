<!--
  TPopperDialog Component

  A popper dialog component with customizable content and animations.
-->
<template>
  <!-- Dialog wrapper with dynamic closing class -->
  <div
    :class="{ close: isClosing }"
    class="TPopperDialog-Wrapper"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="title ? 'dialog-title' : undefined"
    :aria-describedby="message ? 'dialog-content' : undefined"
  >
    <!-- Dialog container with background effect -->
    <div class="TPopperDialog-Container fake-background">
      <!-- Render custom component from render function -->
      <component :is="renderComp" v-if="renderComp" />
      <!-- Render provided component -->
      <component :is="comp" v-else-if="comp" />
      <!-- Default content -->
      <template v-else>
        <!-- Dialog title -->
        <p v-if="title" id="dialog-title">{{ title }}</p>
        <!-- Dialog content -->
        <div id="dialog-content" class="TPopperDialog-Content">
          <span style="position: relative; height: 100%" v-html="message"></span>
        </div>
        <!-- Confirm button with wave effect -->
        <div
          v-wave
          class="TPopperDialog-Confirm"
          role="button"
          tabindex="0"
          aria-label="Confirm and close dialog"
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

<!--
  TPopperDialog Component Script

  Handles the logic for the popper dialog including positioning, rendering, and lifecycle management.
-->
<script lang="ts" name="TPopperDialog" setup>
import { defineComponent, type Component, onMounted, provide, ref } from 'vue'
import { sleep } from '@talex-touch/utils/common'

/**
 * Component props interface
 * Defines the structure and types of props that can be passed to the component
 */
interface Props {
  /**
   * Close callback function
   * Called when the dialog is closed/destroyed
   * @type {Function}
   */
  close: () => void

  /**
   * Dialog title
   * Optional title displayed at the top of the dialog
   * @type {String}
   * @default ''
   */
  title?: string

  /**
   * Dialog message
   * Optional message content displayed in the dialog
   * @type {String}
   * @default ''
   */
  message?: string

  /**
   * Component to render
   * Optional Vue component to render inside the dialog
   * @type {Component}
   * @default undefined
   */
  comp?: Component

  /**
   * Render function
   * Optional function that returns JSX or VNode to render inside the dialog
   * @type {Function}
   * @default undefined
   */
  render?: () => any
}

/**
 * Component props with default values
 * Uses Vue's withDefaults to provide default values for optional props
 */
const props = withDefaults(defineProps<Props>(), {
  title: '',
  message: '',
  comp: undefined,
  render: undefined
})

// Reactive references
/**
 * Controls the closing animation state
 * @type {Ref<boolean>}
 */
const isClosing = ref(false)

/**
 * Holds the dynamically created component from render function
 * @type {Ref<Component | null>}
 */
const renderComp = ref<Component | null>(null)

/**
 * Lifecycle hook when component is mounted
 * Initializes the component by creating a component from the render function if provided
 */
onMounted(() => {
  // If a render function is provided, create a component from it
  if (props.render) {
    renderComp.value = defineComponent({
      render: props.render
    })
  }
})

/**
 * Destroy dialog function
 * Handles the closing animation and cleanup before removing the dialog
 * @async
 * @returns {Promise<void>}
 */
async function destroy(): Promise<void> {
  // Set closing state to trigger animation
  isClosing.value = true

  // Wait for animation to complete (550ms)
  await sleep(550)

  // Call close callback to notify parent component
  props.close()
}

/**
 * Provide destroy function to child components
 * Makes the destroy function available to nested components via provide/inject
 */
provide('destroy', destroy)
</script>

<!--
  TPopperDialog Component Styles

  SCSS styles for the popper dialog including animations, layout, and visual design.
-->
<style lang="scss">
// SCSS variables for consistent styling
/** Dialog width */
$dialog-width: 480px;
/** Dialog maximum width as percentage */
$dialog-max-width: 80%;
/** Dialog maximum height as percentage */
$dialog-max-height: 80%;
/** Dialog border radius */
$dialog-border-radius: 8px;
/** Fake background effect radius */
$dialog-fake-radius: 8px;
/** Fake background inner opacity */
$dialog-fake-inner-opacity: 0.75;
/** Dialog padding */
$dialog-padding: 12px 20px;
/** Dialog animation duration */
$dialog-animation-duration: 0.5s;
/** Dialog animation easing function */
$dialog-animation-easing: cubic-bezier(0.785, 0.135, 0.15, 0.86);
/** Dialog transition duration */
$dialog-transition-duration: 0.5s;
/** Dialog transition easing function */
$dialog-transition-easing: cubic-bezier(0.785, 0.135, 0.15, 0.86);
/** Confirm button height */
$confirm-btn-height: 30px;
/** Confirm button bottom position */
$confirm-btn-bottom: 1.5rem;
/** Content margin bottom */
$content-margin-bottom: 60px;
/** Content maximum height */
$content-max-height: 300px;
/** Fade in animation duration */
$fade-in-duration: 0.55s;
/** Fade in animation easing function */
$fade-in-easing: cubic-bezier(0.785, 0.135, 0.15, 0.86);

// Animation keyframes for dialog entrance and exit
/** Popper outer animation keyframes */
@keyframes Popper-outer {
  from {
    opacity: 1;
    transform: scale(1);
  }

  to {
    opacity: 0.75;
    transform: scale(1.25);
  }
}

/** Popper animation keyframes */
@keyframes Popper {
  0% {
    opacity: 0;
    transform: scale(1.25);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

/** Fade in animation keyframes */
@keyframes fade-in {
  0% {
    opacity: 0;
  }

  100% {
    opacity: 1;
  }
}

// Popper outer styles
/** Popper outer container */
.Popper-outer {
  animation: Popper-outer $fade-in-duration forwards $fade-in-easing;
}

/** Popper outer reverse animation */
.Popper-outer-reverse {
  animation-direction: reverse;
}

// Dialog wrapper styles
/** Main dialog wrapper */
.TPopperDialog-Wrapper {
  /** Closing state styles */
  &.close {
    opacity: 0;
  }

  z-index: 10000;
  position: absolute;
  display: flex;

  justify-content: center;
  align-items: center;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;

  background-color: #00000055;
  //backdrop-filter: blur(5px);
  transition: $dialog-transition-easing $dialog-transition-duration;
  animation: $dialog-animation-easing $dialog-animation-duration;
}

// Dialog container styles
/** Dialog container with background effect */
.TPopperDialog-Container {
  position: relative;
  padding: $dialog-padding;

  width: $dialog-width;
  //min-width: 380px;
  max-width: $dialog-max-width;
  // min-height: 200px;
  max-height: $dialog-max-height;
  //height: 200px;

  --fake-radius: $dialog-fake-radius;
  --fake-inner-opacity: $dialog-fake-inner-opacity;
  border-radius: $dialog-border-radius;
  box-shadow: var(--el-box-shadow);
  box-sizing: border-box;
  //background-color: var(--el-fill-color-light);

  overflow: hidden;
  backdrop-filter: blur(10px) saturate(180%) brightness(1.5);

  transition: $dialog-transition-duration $dialog-transition-easing;
  animation: Popper $dialog-animation-duration $dialog-animation-easing;

  // Dialog content styles
  /** Dialog content area */
  .TPopperDialog-Content {
    position: relative;
    margin-bottom: $content-margin-bottom;

    top: 0;

    left: 0;
    right: 0;

    height: 100%;
    max-height: $content-max-height;

    overflow: hidden;
    overflow-y: auto;
    box-sizing: border-box;
  }

  // Dialog confirm button styles
  /** Confirm button with wave effect */
  .TPopperDialog-Confirm {
    position: absolute;

    width: calc(100% - 40px);

    height: $confirm-btn-height;
    line-height: $confirm-btn-height;
    bottom: $confirm-btn-bottom;

    cursor: pointer;
    user-select: none;
    text-align: center;

    border-radius: 5px;
    background: linear-gradient(
      to right,
      var(--el-color-primary-light-3),
      var(--el-color-primary-light-5),
      var(--el-color-primary-light-3)
    );
  }

  // Dialog title styles
  /** Dialog title */
  p {
    margin: 5px;

    font-size: 1.5rem;
    font-weight: 600;

    text-align: center;
  }

  // Dialog message styles
  /** Dialog message content */
  span {
    width: 100%;
    display: block;
    text-align: center;

    margin: 1rem 0;
    line-height: 1.25rem;
  }

  // Flat markdown container styles
  /** Flat markdown container */
  .FlatMarkdown-Container {
    --fake-inner-opacity: 0;
  }
}

// Closing dialog container styles
/** Closing state for dialog container */
.close .TPopperDialog-Container {
  opacity: 0;
  transform: scale(1.2);
}
</style>
