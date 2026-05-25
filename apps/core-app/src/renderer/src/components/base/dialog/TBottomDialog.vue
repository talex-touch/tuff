<script lang="ts" name="TBottomDialog" setup>
import type { TxButtonProps } from '@talex-touch/tuffex'
import { TxButton } from '@talex-touch/tuffex'
import { sleep } from '@talex-touch/utils/common/utils'
import { onMounted, onUnmounted, ref, watchEffect } from 'vue'

/**
 * Button interface for defining button properties
 */
interface Button {
  /** Button text content */
  content: string
  /** Button type for styling */
  type?: 'info' | 'warning' | 'error' | 'success'
  /** Auto-click timer in seconds */
  time?: number
  /** Click handler function */
  onClick: () => Promise<boolean> | boolean
  /** Loading callback function */
  loading?: (done: () => void) => void
}

/**
 * Button state interface for internal button management
 */
interface ButtonState {
  /** Button text content */
  content: string
  /** Button type for styling */
  type?: 'info' | 'warning' | 'error' | 'success'
  /** Auto-click timer in seconds */
  time?: number
  /** Click handler function */
  onClick: () => Promise<boolean> | boolean
  /** Loading state */
  loading?: boolean
}

/**
 * Component props interface
 */
interface Props {
  /** Dialog title */
  title?: string
  /** Dialog message */
  message?: string
  /** Stay time in milliseconds */
  stay?: number
  /** Close callback function */
  close: () => void
  /** Array of buttons */
  btns?: Button[]
  /** Icon name */
  icon?: string
  /** Z-index value */
  index?: number
}

/**
 * Component props with default values
 */
const props = withDefaults(defineProps<Props>(), {
  title: '',
  message: '',
  stay: 0,
  btns: () => [],
  icon: '',
  index: 0
})

// Refs
const wholeDom = ref<HTMLElement | null>(null)
const btnArray = ref<Array<{ value: ButtonState }>>([])

function getButtonType(type?: ButtonState['type']): TxButtonProps['type'] {
  if (type === 'error') return 'danger'
  return type || 'info'
}

// Store previously focused element for focus restoration
let previouslyFocusedElement: HTMLElement | null = null

/**
 * Handle button click event
 * @param btn Button object
 */
async function clickBtn(btn: { value: ButtonState }): Promise<void> {
  // Set loading state
  btn.value.loading = true

  await sleep(200)

  // Call onClick handler
  if (await btn.value.onClick()) {
    await forClose()
  }

  // Reset loading state
  btn.value.loading = false
}

/**
 * Watch for button changes and initialize button states
 */
watchEffect(() => {
  const array: Array<{ value: ButtonState }> = []

  ;[...props.btns].forEach((btn) => {
    // Create button state object
    const buttonState: ButtonState = {
      content: btn.content,
      type: btn.type,
      time: btn.time,
      onClick: btn.onClick,
      loading: false // Initialize loading as false
    }

    // Create reactive object
    const obj = {
      value: buttonState
    }

    // Handle loading callback
    if (btn.loading) {
      obj.value.loading = true

      btn.loading(() => {
        obj.value.loading = false
      })
    }

    // Handle auto-click timer
    if (btn.time && btn.time > 0) {
      const _clickBtn = clickBtn

      /**
       * Refresh timer function
       */
      function refresh(): void {
        setTimeout(() => {
          if (obj.value.time && obj.value.time > 0) {
            obj.value.time -= 1

            if (obj.value.time <= 0) {
              _clickBtn(obj)
              return
            }

            refresh()
          }
        }, 1000)
      }

      refresh()
    }

    array.push(obj)
  })

  btnArray.value = array
})

/**
 * Scroll listener to prevent scrolling when dialog is open
 */
function listener(): void {
  window.scrollTo({
    top: 0
  })
}

/**
 * Lifecycle hook when component is mounted
 */
onMounted(() => {
  // Save the currently focused element
  previouslyFocusedElement = document.activeElement as HTMLElement

  // Set focus to the dialog
  if (wholeDom.value) {
    wholeDom.value.focus()
  }

  window.addEventListener('scroll', listener)
})

/**
 * Lifecycle hook when component is unmounted
 */
onUnmounted(() => {
  window.removeEventListener('scroll', listener)

  // Restore focus to the previously focused element
  if (previouslyFocusedElement) {
    previouslyFocusedElement.focus()
  }
})

/**
 * Close dialog function
 */
async function forClose(): Promise<void> {
  if (wholeDom.value) {
    const style = wholeDom.value.style

    style.transform = 'translate(-50%, 0) scale(.8) translateY(100%)'

    await sleep(50)

    style.opacity = '0'

    await sleep(100)

    props.close()
  }
}
</script>

<!--
  TBottomDialog Component

  A bottom-aligned dialog component with customizable buttons and auto-close functionality.
-->
<template>
  <teleport to="body">
    <!-- Dialog wrapper with dynamic z-index -->
    <div
      ref="wholeDom"
      class="TBottomDialog-Wrapper fake-background"
      :style="`z-index: ${index + 10000}`"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="title ? 'dialog-title' : undefined"
      :aria-describedby="message ? 'dialog-message' : undefined"
      @keydown.esc="forClose"
    >
      <div class="TBottomDialog-Container">
        <!-- Dialog title -->
        <p id="dialog-title" class="dialog-title" v-text="title" />
        <!-- Dialog message content -->
        <div id="dialog-message" class="dialog-content" v-text="message" />

        <!-- Dialog buttons container -->
        <div class="dialog-btns">
          <!-- Render each button -->
          <TxButton
            v-for="(btn, i) in btnArray"
            :key="i"
            variant="flat"
            :type="getButtonType(btn.value?.type)"
            :loading="btn.value.loading"
            block
            @click="clickBtn(btn)"
          >
            {{ btn.value.content
            }}<template v-if="btn.value.time"> ({{ btn.value.time }}s)</template>
          </TxButton>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss" scoped>
// SCSS variables
$dialog-border-radius: 8px;
$dialog-transition-duration: 0.25s;

// Animation keyframes
@keyframes enter {
  0% {
    opacity: 0;
    transform: scale(0.8) translateX(-50%) translateY(100%);
  }

  100% {
    opacity: 1;
    transform: scale(1) translateX(-50%) translateY(0);
  }
}

// Dialog wrapper styles
.TBottomDialog-Wrapper {
  z-index: 10000;
  position: absolute;

  left: 50%;
  bottom: 2%;

  width: 35%;
  height: auto;
  min-height: 260px;

  --fake-opacity: 0.25;
  --fake-color: var(--tx-fill-color-light);

  border-radius: $dialog-border-radius;
  box-shadow: var(--tx-box-shadow-light);
  //background-color: var(--tx-fill-color-light);
  backdrop-filter: blur(18px) saturate(180%) brightness(1.8);
  transform: translateX(-50%);
  animation: enter 0.2s ease-in-out;
  overflow: hidden;
  transition: $dialog-transition-duration;
}

// Dialog container styles
.TBottomDialog-Container {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;

  width: 100%;
  height: 100%;

  transition: $dialog-transition-duration;

  // Dialog title styles
  .dialog-title {
    font-weight: 600;
    font-size: 20px;
  }

  // Dialog content styles
  .dialog-content {
    position: relative;
    display: flex;
    padding: 4px 8px;

    align-items: center;

    width: max-content;

    border-radius: $dialog-border-radius;
    box-sizing: border-box;
    //background-color: var(--tx-fill-color-light);
  }

  // Dialog buttons container styles
  .dialog-btns {
    position: absolute;
    display: flex;

    flex-direction: column;

    bottom: 5%;

    gap: 8px;
    width: 80%;
  }

  // Background effect styles
  &:before {
    content: '';
    position: absolute;
    top: 60%;
    left: 15%;

    width: 30%;
    height: 30%;

    border-radius: $dialog-border-radius;
    background-color: var(--tx-color-primary-light-3);
    opacity: 0.125;
    transform: scale(2);
    filter: saturate(180%) blur(20px);
  }

  &:after {
    content: '';
    position: absolute;
    top: 10%;
    left: 65%;

    width: 30%;
    height: 30%;

    border-radius: $dialog-border-radius;
    background-color: var(--tx-color-warning-light-3);
    opacity: 0.125;
    transform: scale(2);
    filter: saturate(180%) blur(20px);
  }
}
</style>
