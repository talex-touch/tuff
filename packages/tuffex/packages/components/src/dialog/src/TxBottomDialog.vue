<script setup lang="ts">
import type { BottomDialogProps, DialogButton } from './types'
/**
 * TxBottomDialog Component
 *
 * A bottom-positioned dialog with customizable buttons and auto-close functionality.
 * Features smooth animations, loading states, and countdown timers.
 *
 * @example
 * ```vue
 * <TxBottomDialog
 *   title="Confirm Action"
 *   message="Are you sure you want to proceed?"
 *   :btns="[
 *     { content: 'Cancel', type: 'info', onClick: () => true },
 *     { content: 'Confirm', type: 'success', onClick: handleConfirm }
 *   ]"
 *   :close="closeDialog"
 * />
 * ```
 *
 * @component
 */
import { computed, onMounted, onUnmounted, ref, useId, watchEffect } from 'vue'
import { getZIndex, nextZIndex } from '../../../../utils/z-index-manager'
import { TxButton } from '../../button'

defineOptions({
  name: 'TxBottomDialog',
})

const props = withDefaults(defineProps<BottomDialogProps>(), {
  title: '',
  message: '',
  stay: 0,
  btns: () => [],
  icon: '',
  index: 0,
})

/**
 * Internal button state interface.
 */
interface ButtonState {
  content: string
  type?: 'info' | 'warning' | 'error' | 'success'
  time?: number
  onClick: () => Promise<boolean> | boolean
  loading?: boolean
}

const wholeDom = ref<HTMLElement | null>(null)
const btnArray = ref<Array<{ value: ButtonState }>>([])
const baseZIndex = ref(getZIndex())
const zIndex = computed(() => baseZIndex.value + (props.index ?? 0))
const titleId = useId()
const messageId = useId()
let previouslyFocusedElement: HTMLElement | null = null

/**
 * Utility function to sleep for a specified duration.
 * @param ms - Duration in milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function resolveButtonType(type?: ButtonState['type']): 'info' | 'warning' | 'danger' | 'success' {
  return type === 'error' ? 'danger' : type || 'info'
}

/**
 * Handles button click with loading state management.
 * @param btn - The button state object
 * @param btn.value - The underlying button state
 */
async function clickBtn(btn: { value: ButtonState }): Promise<void> {
  btn.value.loading = true
  await sleep(200)

  if (await btn.value.onClick()) {
    await forClose()
  }

  btn.value.loading = false
}

/**
 * Watches for button prop changes and initializes button states.
 */
watchEffect(() => {
  const array: Array<{ value: ButtonState }> = []

  ;[...props.btns].forEach((btn: DialogButton) => {
    const buttonState: ButtonState = {
      content: btn.content,
      type: btn.type,
      time: btn.time,
      onClick: btn.onClick,
      loading: false,
    }

    const obj = { value: buttonState }

    if (btn.loading) {
      obj.value.loading = true
      btn.loading(() => {
        obj.value.loading = false
      })
    }

    if (btn.time && btn.time > 0) {
      const _clickBtn = clickBtn

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
 * Prevents page scrolling while dialog is open.
 */
function scrollListener(): void {
  window.scrollTo({ top: 0 })
}

onMounted(() => {
  baseZIndex.value = nextZIndex()
  previouslyFocusedElement = document.activeElement as HTMLElement
  if (wholeDom.value) {
    wholeDom.value.focus()
  }
  window.addEventListener('scroll', scrollListener)
})

onUnmounted(() => {
  window.removeEventListener('scroll', scrollListener)
  if (previouslyFocusedElement) {
    previouslyFocusedElement.focus()
  }
})

/**
 * Closes the dialog with animation.
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

<template>
  <teleport to="body">
    <div
      ref="wholeDom"
      class="tx-bottom-dialog"
      :style="{ zIndex }"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      :aria-labelledby="title ? titleId : undefined"
      :aria-describedby="message ? messageId : undefined"
      @keydown.esc="forClose"
    >
      <div class="tx-bottom-dialog__container">
        <p v-if="title" :id="titleId" class="tx-bottom-dialog__title">
          {{ title }}
        </p>
        <div v-if="message" :id="messageId" class="tx-bottom-dialog__content">
          {{ message }}
        </div>

        <div class="tx-bottom-dialog__buttons">
          <TxButton
            v-for="(btn, i) in btnArray"
            :key="i"
            class="tx-bottom-dialog__btn"
            :type="resolveButtonType(btn.value?.type)"
            :loading="btn.value.loading"
            block
            size="lg"
            native-type="button"
            @click="clickBtn(btn)"
          >
            {{ btn.value.time ? `${btn.value.content} (${btn.value.time}s)` : btn.value.content }}
          </TxButton>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss" scoped>
@keyframes tx-bottom-dialog-enter {
  0% {
    opacity: 0;
    transform: scale(0.8) translateX(-50%) translateY(100%);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateX(-50%) translateY(0);
  }
}

.tx-bottom-dialog {
  position: fixed;
  left: 50%;
  bottom: 2%;
  width: 35%;
  min-width: 320px;
  max-width: 480px;
  min-height: 200px;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  background: var(--tx-bg-color, #fff);
  backdrop-filter: blur(18px) saturate(180%);
  transform: translateX(-50%);
  animation: tx-bottom-dialog-enter 0.2s ease-out;
  overflow: hidden;
  transition: transform 0.25s, opacity 0.25s;

  &__container {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
  }

  &__title {
    margin: 0 0 12px;
    font-weight: 600;
    font-size: 20px;
    color: var(--tx-text-color-primary, #303133);
  }

  &__content {
    margin-bottom: 24px;
    text-align: center;
    font-size: 14px;
    color: var(--tx-text-color-secondary, #909399);
  }

  &__buttons {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    margin-top: auto;
  }

}
</style>
