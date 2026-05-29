<script setup lang="ts">
import type { PropType } from 'vue'
import type { TouchTipButton } from './types'
import { onMounted, onUnmounted, ref, useId, watchEffect } from 'vue'
import { getZIndex, nextZIndex } from '../../../../utils/z-index-manager'
import { TxButton } from '../../button'

defineOptions({
  name: 'TxTouchTip',
})

const props = defineProps({
  title: {
    type: String,
    default: '',
  },
  message: {
    type: String,
    default: '',
  },
  messageHtml: {
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

interface ButtonState {
  content: string
  type?: 'info' | 'warning' | 'error' | 'success'
  onClick: () => Promise<boolean> | boolean
  loading?: boolean
}

const btnArray = ref<Array<{ value: ButtonState }>>([])
const wholeDom = ref<HTMLElement | null>(null)
const zIndex = ref(getZIndex())
const titleId = useId()
const messageId = useId()
let previouslyFocusedElement: HTMLElement | null = null

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function resolveButtonType(type?: ButtonState['type']): 'info' | 'warning' | 'danger' | 'success' {
  return type === 'error' ? 'danger' : type || 'info'
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
  if (!el)
    return

  const style = el.style

  await sleep(60)

  style.transform = 'translate(-50%, -50%) scale(1.08)'
  style.opacity = '0'

  await sleep(220)

  props.close()
}

onMounted(() => {
  zIndex.value = nextZIndex()
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
    <div class="tx-touch-tip" :style="{ zIndex }">
      <div
        ref="wholeDom"
        class="tx-touch-tip__container fake-background"
        :class="{ 'tx-touch-tip__container--loading': false }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? titleId : undefined"
        :aria-describedby="message || messageHtml ? messageId : undefined"
        @keydown.esc="forClose"
      >
        <h1 v-if="title" :id="titleId" class="tx-touch-tip__title" v-text="title" />

        <span
          v-if="messageHtml"
          :id="messageId"
          class="tx-touch-tip__content"
          v-html="messageHtml"
        />
        <span
          v-else-if="message"
          :id="messageId"
          class="tx-touch-tip__content"
        >
          {{ message }}
        </span>

        <div class="tx-touch-tip__btns">
          <TxButton
            v-for="(btn, index) in btnArray"
            :key="index"
            class="tx-touch-tip__btn"
            :type="resolveButtonType(btn.value?.type)"
            :loading="btn.value.loading"
            block
            native-type="button"
            @click="clickBtn(btn)"
          >
            {{ btn.value.content }}
          </TxButton>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss" scoped>
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

.tx-touch-tip {
  position: fixed;
  inset: 0;

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
    white-space: pre-line;
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
  }
}
</style>
