<script lang="ts" name="TouchTip" setup>
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
  /** Array of buttons */
  buttons: Button[]
  /** Close callback function */
  close: () => void
}

/**
 * Component props with default values
 */
const props = withDefaults(defineProps<Props>(), {
  title: '',
  message: '',
  buttons: () => []
})

// Refs
const btnArray = ref<Array<{ value: ButtonState }>>([])
// Store previously focused element for focus restoration
let previouslyFocusedElement: HTMLElement | null = null

const wholeDom = ref<HTMLElement | null>(null)

/**
 * Watch for button changes and initialize button states
 */
watchEffect(() => {
  const array: Array<{ value: ButtonState }> = []

  ;[...props.buttons].forEach((btn) => {
    // Create button state object
    const buttonState: ButtonState = {
      content: btn.content,
      type: btn.type,
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

    array.push(obj)
  })

  btnArray.value = array
})

/**
 * Handle button click event
 * @param btn Button object
 */
const clickBtn = async (btn: { value: ButtonState }): Promise<void> => {
  btn.value.loading = true

  await sleep(200)

  if (await btn.value.onClick()) await forClose()

  btn.value.loading = false
}

/**
 * Scroll listener to prevent scrolling when dialog is open
 */
function listener(): void {
  window.scrollTo({
    top: 0
  })
}

/**
 * Close dialog function
 */
const forClose = async (): Promise<void> => {
  const el = wholeDom.value
  if (!el) return

  const style = el.style

  await sleep(100)

  style.transform = 'translate(-50%, -50%) scale(1.125)'
  style.opacity = '0'

  if (el.parentNode) {
    const parent = el.parentNode as HTMLElement
    parent.style.opacity = '0'
  }

  await sleep(400)

  props.close()
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
</script>

<!--
  TouchTip Component

  A touch-friendly dialog component with customizable buttons and loading state.
-->
<template>
  <!-- Dialog wrapper with transition effect -->
  <div class="TouchTip-Wrapper transition-cubic">
    <!-- Dialog container with background effect -->
    <div
      ref="wholeDom"
      class="TouchTip-Container fake-background"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="title ? 'dialog-title' : undefined"
      :aria-describedby="message ? 'dialog-message' : undefined"
      @keydown.esc="forClose"
    >
      <!-- Dialog title -->
      <h1 id="dialog-title" v-text="title" />

      <!-- Dialog message content with line breaks -->
      <span
        id="dialog-message"
        class="TDialogTip-Content"
        v-html="message.replace('\n', '<br /><br />')"
      />

      <!-- Dialog buttons container -->
      <div class="TDialogTip-Btn">
        <!-- Render each button -->
        <div
          v-for="(btn, index) in btnArray"
          :key="index"
          v-wave
          :class="{
            'info-tip': btn.value?.type === 'info',
            'warn-tip': btn.value?.type === 'warning',
            'error-tip': btn.value?.type === 'error',
            'success-tip': btn.value?.type === 'success',
            'loading-tip': btn.value.loading
          }"
          class="TDialogTip-Btn-Item"
          role="button"
          tabindex="0"
          @click="clickBtn(btn)"
          @keydown.enter="clickBtn(btn)"
          @keydown.space="clickBtn(btn)"
        >
          <!-- Button loading indicator -->
          <span class="TDialogTip-Btn-Item-Loading">
            <Loading />
          </span>
          <!-- Button text -->
          <span class="TDialogTip-Container-Btn-Item-Text">{{ btn.value.content }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// SCSS variables
$dialog-border-radius: 8px;
$dialog-min-width: 420px;
$dialog-min-height: 260px;
$dialog-transition-duration: 0.35s;
$dialog-transition-easing: cubic-bezier(0.25, 0.8, 0.25, 1);
$icon-size: 16px;
$icon-top: -10px;
$btn-height: 28px;
$btn-padding: -8px;
$btn-width: 80%;
$btn-bottom: 1rem;
$content-width: 80%;
$content-height: calc(100% - 30px);
$fake-opacity: 0.75;
$fake-inner-opacity: 0.75;

// Animation keyframes
@keyframes enter {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.25);
  }

  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 0.35;
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
.TouchTip-Wrapper {
  z-index: 1000;
  position: absolute;

  width: 100%;
  height: 100%;

  top: 0;
  left: 0;

  &:before {
    z-index: -1;
    content: '';
    position: absolute;

    left: 0;
    top: 0;

    width: 100%;
    height: 100%;

    background-color: var(--el-overlay-color);
    opacity: 0.35;
    animation: fadeIn 0.5s;
  }
}

// Dialog container styles
.TouchTip-Container {
  position: absolute;
  display: flex;

  flex-direction: column;

  justify-content: center;
  align-items: center;

  left: 50%;
  top: 50%;

  min-width: $dialog-min-width;
  min-height: $dialog-min-height;

  color: var(--theme-color, var(--el-text-color-primary));
  box-shadow: var(--el-box-shadow-lighter);
  border-radius: $dialog-border-radius;

  --fake-opacity: $fake-opacity;
  --fake-inner-opacity: $fake-inner-opacity;

  -webkit-app-region: no-drag;
  transform: translate(-50%, -50%);
  transition: $dialog-transition-duration $dialog-transition-easing;
  animation: enter 0.35s ease-in-out;
  backdrop-filter: blur(16px) saturate(150%) brightness(1.5);

  // Dialog title styles
  h1 {
    position: absolute;

    top: 1rem;

    width: max-content;
    height: 32px;
    line-height: 32px;

    color: var(--theme-color, var(--el-text-color-primary));
    font-size: 18px;
    font-weight: bold;
  }

  // Loading indicator styles
  .TDialogTip-Btn-Item-Loading {
    position: relative;
    display: inline-block;
    margin: $btn-padding;

    top: $icon-top;
    left: 50%;

    width: $icon-size;
    height: $icon-size;

    transform: scale(0) translateX(-50%);
    opacity: 0;
    --bg-color: var(--theme-color);
    transition: $dialog-transition-duration $dialog-transition-easing;
  }

  // Dialog buttons container styles
  .TDialogTip-Btn {
    position: absolute;
    display: flex;

    justify-content: space-around;
    align-items: center;

    bottom: $btn-bottom;

    width: $btn-width;
    height: $btn-height;

    text-align: center;
    user-select: none;
  }
}

// Dialog content styles
.TDialogTip-Content {
  position: relative;

  align-self: center;
  justify-self: center;
  text-align: center;

  width: $content-width;
  height: $content-height;
}

// Loading tip styles
.loading-tip {
  .TDialogTip-Btn-Item-Loading {
    opacity: 0.75 !important;

    transform: scale(0.5) translateX(-50%) !important;
  }

  .TDialogTip-Container-Btn-Item-Text {
    opacity: 0.25;

    transform: scale(0.65);
  }

  pointer-events: none;
}

// Button text styles
.TDialogTip-Container-Btn-Item-Text {
  position: relative;

  left: 0;
  top: 0;

  width: 320px;
  height: 180px;

  text-align: center;
  border-radius: $dialog-border-radius;

  cursor: pointer;

  color: var(--theme-color, var(--el-text-color-regular));
  transition: $dialog-transition-duration $dialog-transition-easing;
}
</style>
