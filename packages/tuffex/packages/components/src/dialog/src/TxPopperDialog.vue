<script setup lang="ts">
import {
  defineComponent,
  onMounted,
  onUnmounted,
  provide,
  ref,
  type Component,
  type PropType,
  type VNode,
} from 'vue'

defineOptions({
  name: 'TxPopperDialog',
})

const props = defineProps({
  close: {
    type: Function as PropType<() => void>,
    required: true,
  },
  title: {
    type: String,
    default: '',
  },
  message: {
    type: String,
    default: '',
  },
  comp: {
    type: Object as PropType<Component>,
    default: undefined,
  },
  render: {
    type: Function as PropType<() => VNode>,
    default: undefined,
  },
})

const isClosing = ref(false)
const renderComp = ref<Component | null>(null)
const dialogWrapper = ref<HTMLElement | null>(null)
let previouslyFocusedElement: HTMLElement | null = null

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

onMounted(() => {
  previouslyFocusedElement = document.activeElement as HTMLElement

  if (props.render) {
    renderComp.value = defineComponent({
      render: props.render as unknown as () => VNode,
    })
  }

  if (dialogWrapper.value) {
    dialogWrapper.value.setAttribute('tabindex', '-1')
    dialogWrapper.value.focus()
  }
})

onUnmounted(() => {
  if (previouslyFocusedElement) {
    previouslyFocusedElement.focus()
  }
})

async function destroy(): Promise<void> {
  isClosing.value = true
  await sleep(250)
  props.close()
}

provide('destroy', destroy)
</script>

<template>
  <teleport to="body">
    <div
      ref="dialogWrapper"
      class="tx-popper-dialog"
      :class="{ 'tx-popper-dialog--closing': isClosing }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="title ? 'tx-popper-dialog-title' : undefined"
      :aria-describedby="message ? 'tx-popper-dialog-content' : undefined"
      @keydown.esc="destroy"
    >
      <div
        class="tx-popper-dialog__container fake-background"
        style="backdrop-filter: blur(10px) saturate(180%) brightness(1.2)"
      >
        <component :is="renderComp" v-if="renderComp" />
        <component :is="comp" v-else-if="comp" />
        <template v-else>
          <p v-if="title" id="tx-popper-dialog-title" class="tx-popper-dialog__title">
            {{ title }}
          </p>

          <div
            v-if="message"
            id="tx-popper-dialog-content"
            class="tx-popper-dialog__content"
          >
            <span v-html="message" />
          </div>

          <button
            type="button"
            class="tx-popper-dialog__confirm"
            @click="destroy"
          >
            Confirm
          </button>
        </template>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss">
@keyframes tx-popper-dialog-enter {
  0% {
    opacity: 0;
    transform: scale(1.1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.tx-popper-dialog {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.3);
  transition: opacity 0.25s ease;

  &--closing {
    opacity: 0;

    .tx-popper-dialog__container {
      opacity: 0;
      transform: scale(1.05);
    }
  }

  &__container {
    position: relative;
    padding: 16px;
    width: min(360px, 80vw);
    max-height: 80vh;
    border-radius: 16px;
    box-sizing: border-box;
    overflow: hidden;
    transition: all 0.25s ease;
    animation: tx-popper-dialog-enter 0.25s ease;

    --fake-radius: 16px;
    --fake-inner-opacity: 0.12;
  }

  &__title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    text-align: center;
    color: var(--tx-text-color-primary, #303133);
  }

  &__content {
    position: relative;
    margin-top: 12px;
    margin-bottom: 60px;
    max-height: 300px;
    overflow-y: auto;

    span {
      display: block;
      width: 100%;
      text-align: center;
      line-height: 1.4;
      color: var(--tx-text-color-secondary, #909399);
    }
  }

  &__confirm {
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 16px;
    height: 32px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    user-select: none;
    color: #fff;
    background: linear-gradient(
      to right,
      var(--tx-color-primary-light-3, #79bbff),
      var(--tx-color-primary-light-5, #a0cfff),
      var(--tx-color-primary-light-3, #79bbff)
    );
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
  }
}
</style>
