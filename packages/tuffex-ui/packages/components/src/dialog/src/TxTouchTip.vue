<script setup lang="ts">
import { onMounted, onUnmounted, ref, watchEffect, type PropType } from 'vue'
import type { TouchTipButton } from './types'

defineOptions({
  name: 'TxTouchTip',
})

interface ButtonState {
  content: string
  type?: 'info' | 'warning' | 'error' | 'success'
  onClick: () => Promise<boolean> | boolean
  loading?: boolean
}

const props = defineProps({
  title: {
    type: String,
    default: '',
  },
  message: {
    type: String,
    default: '',
  },
  buttons: {
    type: Array as PropType<TouchTipButton[]>,
    default: () => [],
  },
  close: {
    type: Function as PropType<() => void>,
    required: true,
  },
})

const btnArray = ref<Array<{ value: ButtonState }>>([])
const wholeDom = ref<HTMLElement | null>(null)
let previouslyFocusedElement: HTMLElement | null = null

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

watchEffect(() => {
  const array: Array<{ value: ButtonState }> = []

  ;[...props.buttons].forEach((btn: TouchTipButton) => {
    const buttonState: ButtonState = {
      content: btn.content,
      type: btn.type,
      onClick: btn.onClick,
      loading: false,
    }

    const obj = {
      value: buttonState,
    }

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

async function clickBtn(btn: { value: ButtonState }): Promise<void> {
  btn.value.loading = true
  await sleep(120)

  if (await btn.value.onClick()) {
    await forClose()
  }

  btn.value.loading = false
}

function scrollListener(): void {
  window.scrollTo({ top: 0 })
}

async function forClose(): Promise<void> {
  const el = wholeDom.value
  if (!el) return

  const style = el.style

  await sleep(60)

  style.transform = 'translate(-50%, -50%) scale(1.08)'
  style.opacity = '0'

  await sleep(220)

  props.close()
}

onMounted(() => {
  previouslyFocusedElement = document.activeElement as HTMLElement

  if (wholeDom.value) {
    wholeDom.value.setAttribute('tabindex', '-1')
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
</script>

<template>
  <teleport to="body">
    <div class="tx-touch-tip" role="dialog" aria-modal="true">
      <div
        ref="wholeDom"
        class="tx-touch-tip__container fake-background"
        :class="{ 'tx-touch-tip__container--loading': false }"
        :aria-labelledby="title ? 'tx-touch-tip-title' : undefined"
        :aria-describedby="message ? 'tx-touch-tip-message' : undefined"
        @keydown.esc="forClose"
      >
        <h1 v-if="title" id="tx-touch-tip-title" class="tx-touch-tip__title" v-text="title" />

        <span
          v-if="message"
          id="tx-touch-tip-message"
          class="tx-touch-tip__content"
          v-html="message.replace('\n', '<br /><br />')"
        />

        <div class="tx-touch-tip__btns">
          <button
            v-for="(btn, index) in btnArray"
            :key="index"
            type="button"
            class="tx-touch-tip__btn"
            :class="[
              {
                'tx-touch-tip__btn--info': btn.value?.type === 'info',
                'tx-touch-tip__btn--warning': btn.value?.type === 'warning',
                'tx-touch-tip__btn--error': btn.value?.type === 'error',
                'tx-touch-tip__btn--success': btn.value?.type === 'success',
                'tx-touch-tip__btn--loading': btn.value.loading,
              },
            ]"
            @click="clickBtn(btn)"
          >
            <span v-if="btn.value.loading" class="tx-touch-tip__spinner">
              <svg class="tx-spinner" viewBox="0 0 24 24" width="16" height="16">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="31.416" stroke-dashoffset="31.416" />
              </svg>
            </span>
            <span v-else class="tx-touch-tip__btn-text">{{ btn.value.content }}</span>
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss">
@keyframes tx-touch-tip-enter {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.1);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes tx-spinner-rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes tx-spinner-dash {
  0% {
    stroke-dashoffset: 31.416;
  }
  50% {
    stroke-dashoffset: 0;
  }
  100% {
    stroke-dashoffset: -31.416;
  }
}

.tx-spinner {
  animation: tx-spinner-rotate 1s linear infinite;

  circle {
    animation: tx-spinner-dash 1.5s ease-in-out infinite;
  }
}

.tx-touch-tip {
  position: fixed;
  inset: 0;
  z-index: 10000;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
  }

  &__container {
    position: absolute;
    left: 50%;
    top: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 420px;
    min-height: 260px;
    width: min(420px, 88vw);
    color: var(--tx-text-color-primary, #303133);
    border-radius: 12px;
    box-shadow: 0 18px 65px rgba(0, 0, 0, 0.25);
    transform: translate(-50%, -50%);
    animation: tx-touch-tip-enter 0.25s ease;
    backdrop-filter: blur(16px) saturate(150%) brightness(1.2);

    --fake-opacity: 0.75;
    --fake-inner-opacity: 0.75;
    --fake-radius: 12px;
  }

  &__title {
    position: absolute;
    top: 16px;
    margin: 0;
    height: 32px;
    line-height: 32px;
    font-size: 18px;
    font-weight: 600;
  }

  &__content {
    position: relative;
    width: 80%;
    height: calc(100% - 30px);
    text-align: center;
    color: var(--tx-text-color-secondary, #909399);
  }

  &__btns {
    position: absolute;
    display: flex;
    gap: 12px;
    justify-content: center;
    align-items: center;
    bottom: 16px;
    width: 80%;
    user-select: none;
  }

  &__btn {
    flex: 1;
    height: 32px;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    user-select: none;
    color: #fff;
    background: var(--tx-tip-btn-color, var(--tx-color-primary, #409eff));
    transition: all 0.2s ease;

    &:hover {
      filter: brightness(1.05);
    }

    &:active {
      transform: scale(0.98);
    }

    &:focus-visible {
      outline: 2px solid var(--tx-color-primary, #409eff);
      outline-offset: 2px;
    }

    &--info {
      --tx-tip-btn-color: var(--tx-color-primary, #409eff);
    }

    &--warning {
      --tx-tip-btn-color: var(--tx-color-warning, #e6a23c);
    }

    &--error {
      --tx-tip-btn-color: var(--tx-color-danger, #f56c6c);
    }

    &--success {
      --tx-tip-btn-color: var(--tx-color-success, #67c23a);
    }

    &--loading {
      pointer-events: none;
      opacity: 0.7;
    }
  }

  &__spinner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
