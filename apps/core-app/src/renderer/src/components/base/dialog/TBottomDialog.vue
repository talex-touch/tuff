<script lang="ts" name="TBottomDialog" setup>
import Loading from '@comp/icon/LoadingIcon.vue'
import { onMounted, onUnmounted, ref, watchEffect } from 'vue'
import { sleep } from '@talex-touch/utils/common/utils'

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
const forClose = async (): Promise<void> => {
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
          <span
            v-for="(btn, i) in btnArray"
            :key="i"
            :class="{
              'info-tip': btn.value?.type === 'info',
              'warn-tip': btn.value?.type === 'warning',
              'error-tip': btn.value?.type === 'error',
              'success-tip': btn.value?.type === 'success',
              'loading-tip': btn.value.loading
            }"
            class="btn-item"
            role="button"
            tabindex="0"
            @click="clickBtn(btn)"
            @keydown.enter="clickBtn(btn)"
            @keydown.space="clickBtn(btn)"
          >
            <!-- Loading indicator -->
            <span class="TDialogTip-Btn-Item-Loading">
              <Loading />
            </span>
            <!-- Button text with optional timer -->
            <span v-if="btn.value.time" class="TDialogTip-Container-Btn-Item-Text"
              >{{ btn.value.content }} ({{ btn.value.time }}s)</span
            >
            <span v-else class="TDialogTip-Container-Btn-Item-Text">{{ btn.value.content }}</span>
          </span>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss" scoped>
// SCSS variables
$dialog-border-radius: 8px;
$dialog-transition-duration: 0.25s;
$btn-margin: 8px 0;
$btn-padding: 8px 4px;
$btn-width: 80%;
$btn-left: 10%;
$loading-icon-size: 16px;
$loading-icon-top: -10px;

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

// Theme color variables
.success-tip {
  --theme-color: var(--el-color-success);
}

.info-tip {
  --theme-color: var(--el-color-primary);
}

.warn-tip {
  --theme-color: var(--el-color-warning);
}

.error-tip {
  --theme-color: var(--el-color-danger);
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
  --fake-color: var(--el-fill-color-light);

  border-radius: $dialog-border-radius;
  box-shadow: var(--el-box-shadow-light);
  //background-color: var(--el-fill-color-light);
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
    //background-color: var(--el-fill-color-light);
  }

  // Dialog buttons container styles
  .dialog-btns {
    position: absolute;
    display: flex;

    flex-direction: column;

    bottom: 5%;

    width: 80%;

    // Individual button styles
    .btn-item {
      z-index: 10;
      position: relative;
      margin: $btn-margin;
      padding: $btn-padding;

      text-align: center;
      left: $btn-left;
      width: $btn-width;

      color: #eee;
      border-radius: $dialog-border-radius;
      box-sizing: border-box;
      transition: $dialog-transition-duration;
      user-select: none;

      // Button hover styles
      &:hover {
        cursor: pointer;

        &:before {
          opacity: 0.75;
        }
      }

      // Button background styles
      &:before {
        z-index: -1;
        content: '';
        position: absolute;
        top: 0;
        left: 0;

        width: 100%;
        height: 100%;

        border-radius: $dialog-border-radius;
        opacity: 0.5;
        background-color: var(--theme-color, var(--el-color-info));
      }

      // Loading icon styles
      .TDialogTip-Btn-Item-Loading {
        position: absolute;
        display: inline-block;
        top: $loading-icon-top;
        left: 50%;

        width: $loading-icon-size;
        height: $loading-icon-size;

        transform: scale(0) translateX(-50%);
        opacity: 0;
        --bg-color: var(--theme-color);
      }
    }
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
    background-color: var(--el-color-primary-light-3);
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
    background-color: var(--el-color-warning-light-3);
    opacity: 0.125;
    transform: scale(2);
    filter: saturate(180%) blur(20px);
  }
}
</style>
