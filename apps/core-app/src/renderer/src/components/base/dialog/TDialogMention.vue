<script lang="ts" setup>
import Loading from '@comp/icon/LoadingIcon.vue'
import { onMounted, onUnmounted, ref, watchEffect } from 'vue'
import { sleep } from '@talex-touch/utils/common/utils'
import PluginIcon from '@comp/plugin/PluginIcon.vue'
import RemixIcon from '@comp/icon/RemixIcon.vue'

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
  /** Stay time in milliseconds */
  stay?: number
  /** Close callback function */
  close: () => void
  /** Array of buttons */
  btns: Button[]
  /** Icon name or object */
  icon?: string | object
  /** Loading state */
  loading?: boolean
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
  loading: false
})

// Refs
const btnArray = ref<Array<{ value: ButtonState }>>([])
const wholeDom = ref<HTMLElement | null>(null)

// Store previously focused element for focus restoration
let previouslyFocusedElement: HTMLElement | null = null

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

    // style.animation = 'enter .2s ease-adopters-out reverse'

    style.transform = 'translate(-50%, -50%) scale(1.15)'

    await sleep(100)

    style.transform = 'translate(-50%, -50%) scale(.35)'
    style.opacity = '0'

    await sleep(200)

    props.close()
  }
}

/**
 * Handle button click event
 * @param btn Button object
 */
const clickBtn = async (btn: { value: ButtonState }): Promise<void> => {
  btn.value.loading = true

  await sleep(200)

  if (await btn.value.onClick()) forClose()

  btn.value.loading = false
}
</script>

<!--
  TDialogMention Component

  A dialog component with customizable buttons, loading state, and icon support.
-->
<template>
  <!-- Dialog wrapper -->
  <div class="TDialogTip-Wrapper">
    <!-- Dialog container with dynamic loading class -->
    <div
      ref="wholeDom"
      class="TDialogTip-Container"
      :class="{ 'loading-tip': loading }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="title ? 'dialog-title' : undefined"
      :aria-describedby="message ? 'dialog-message' : undefined"
      @keydown.esc="forClose"
    >
      <!-- Main content wrapper -->
      <div class="TDialogTip-Main-Wrapper">
        <!-- Dialog title -->
        <h1 id="dialog-title" v-text="title" />
        <!-- Dialog message content with line breaks -->
        <span id="dialog-message" class="TDialogTip-Content" v-html="message.replace('\n', '<br /><br />')" />

        <!-- Loading indicator wrapper -->
        <div class="TDialogTip-Loading-Wrapper">
          <Loading v-if="loading" />
        </div>
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

      <!-- Dialog icon display -->
      <div class="TDialogTip-Icon">
        <PluginIcon v-if="icon instanceof Object" :icon="icon" />
        <RemixIcon v-else-if="icon && icon.at(0) === '#'" :name="icon.substring(1)" />
        <img v-else-if="icon" :src="icon" :alt="title" />
        <span v-else class="tip-icon" v-text="`Tip`" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// SCSS variables
$dialog-border-radius: 4px;
$dialog-min-width: 380px;
$dialog-min-height: 240px;
$dialog-transition-duration: 0.3s;
$dialog-transition-easing: cubic-bezier(0.25, 0.8, 0.25, 1);
$icon-size: 72px;
$plugin-icon-size: 48px;
$loading-icon-size: 16px;
$loading-icon-top: -10px;
$btn-height: 28px;
$btn-padding: 8px 0;
$btn-width: 80%;
$btn-bottom: 5%;
$content-width: 80%;
$content-height: calc(100% - 30px);

// Animation keyframes
@keyframes out {
  0%,
  50% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

@keyframes slideIn {
  0% {
    opacity: 0;
    transform: translateY(-10px);
  }

  //50% {
  //  opacity: .75;
  //  transform: translateY(4px);
  //}

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes expand {
  0% {
    opacity: 0;
  }

  50% {
    opacity: 0;
  }

  100% {
    opacity: 1;
    background: none;
  }
}

@keyframes enter {
  0% {
    opacity: 1;
    clip-path: circle(0px at 50% 50%);
  }

  30% {
    opacity: 1;
    clip-path: circle(50px at 50% 50%);
  }

  50% {
    opacity: 1;
    clip-path: circle(50px at 50% 50%);
  }

  100% {
    opacity: 1;
    clip-path: circle(100% at 50% 50%);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 0.45;
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
.TDialogTip-Wrapper {
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
    opacity: 0.45;
    animation: fadeIn 0.5s;
  }
}

// Dialog container styles
.TDialogTip-Container {
  position: absolute;

  left: 50%;
  top: 50%;

  min-width: $dialog-min-width;
  min-height: $dialog-min-height;
  line-height: 30px;

  color: var(--theme-color, var(--el-text-color-primary));
  box-shadow: var(--el-box-shadow-light);
  border-radius: $dialog-border-radius;

  transform: translate(-50%, -50%);
  transition: $dialog-transition-duration $dialog-transition-easing;
  opacity: 0;
  clip-path: circle(50px at 50% 50%);
  animation: enter 1s ease-in-out forwards;
  overflow: hidden;

  -webkit-app-region: no-drag;
  backdrop-filter: blur(50px) saturate(180%) brightness(1.8);

  // Dialog title styles
  h1 {
    position: relative;

    width: max-content;
    height: 32px;
    line-height: 32px;

    color: var(--theme-color, var(--el-text-color-primary));
    font-size: 18px;
    font-weight: bold;
    opacity: 0;
    animation: slideIn 0.25s 1s forwards linear;
  }

  // Loading indicator styles
  .TDialogTip-Btn-Item-Loading {
    position: relative;
    display: inline-block;
    margin: -8px;

    top: $loading-icon-top;
    left: 50%;

    width: $loading-icon-size;
    height: $loading-icon-size;

    transform: scale(0) translateX(-50%);
    opacity: 0;
    --bg-color: var(--theme-color);
    transition: $dialog-transition-duration $dialog-transition-easing;
  }
}

// Main wrapper styles
.TDialogTip-Main-Wrapper {
  position: absolute;
  display: flex;

  flex-direction: column;

  justify-content: center;
  align-items: center;

  width: 100%;
  height: 100%;

  top: 50%;
  left: 50%;

  border-radius: 2px;
  background-image: radial-gradient(transparent 1px, var(--el-bg-color) 1px);
  transform: translate(-50%, -50%);
  animation: expand 1s ease-in-out forwards;
  overflow: hidden;
}

// Dialog content styles
.TDialogTip-Content {
  position: relative;
  display: flex;

  align-items: center;
  justify-content: center;

  width: $content-width;
  height: $content-height;

  opacity: 0;
  animation: slideIn 0.25s 1s forwards linear;
}

// Dialog buttons container styles
.TDialogTip-Btn {
  position: relative;
  display: flex;
  justify-content: space-around;
  padding: $btn-padding;

  bottom: $btn-bottom;

  width: $btn-width;
  height: $btn-height;

  text-align: center;
  user-select: none;
  opacity: 0;
  animation: slideIn 0.25s 1.1s forwards linear;
}

// Dialog icon styles
.TDialogTip-Icon {
  .tip-icon {
    position: absolute;
    display: flex;

    align-items: center;
    justify-content: center;

    top: 50%;
    left: 50%;

    width: $icon-size;
    height: $icon-size;
    //line-height: $icon-size;

    opacity: 0.45;

    color: #fff;
    text-align: center;
    font-size: 35px;

    background-color: var(--el-color-primary);
    border-radius: $dialog-border-radius;
    transform: translate(-50%, -50%) rotate(45deg);
  }

  img {
    position: absolute;

    top: 50%;
    left: 50%;

    width: $icon-size;
    height: $icon-size;

    transform: translate(-50%, -50%);
  }

  :deep(.PluginIcon-Container) {
    position: absolute;

    top: 50%;
    left: 50%;

    width: $plugin-icon-size;
    height: $plugin-icon-size;
    line-height: $plugin-icon-size;

    opacity: 0.45;

    color: #fff;
    text-align: center;
    font-size: 35px;

    background-color: var(--el-color-primary);
    border-radius: 8px;
    transform: translate(-50%, -50%);
  }

  animation: out 1s forwards;
}

// Loading tip styles
.loading-tip {
  .TDialogTip-Btn-Item-Loading {
    opacity: 1;

    transform: scale(0.5) translateX(-50%);
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
  padding: 8px 24px;

  left: 0;
  top: 0;

  width: 320px;
  height: 180px;

  text-align: center;
  border-radius: $dialog-border-radius;
  background-color: var(--el-color-primary-light-5);

  cursor: pointer;

  color: var(--theme-color, var(--el-text-color-regular));
  transition: $dialog-transition-duration $dialog-transition-easing;
}
</style>
