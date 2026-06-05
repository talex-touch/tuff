<script lang="ts" name="TPopperDialog" setup>
import type { Component, VNodeChild } from 'vue'
import { TxButton } from '@talex-touch/tuffex/button'
import { sleep } from '@talex-touch/utils/common'
import { defineComponent, onMounted, provide, ref } from 'vue'
import TouchScroll from '../TouchScroll.vue'

interface Props {
  close: () => void
  title?: string
  message?: string
  messageHtml?: string
  comp?: Component
  render?: () => VNodeChild
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  message: '',
  messageHtml: '',
  comp: undefined,
  render: undefined
})

const isClosing = ref(false)
const renderComp = ref<Component | null>(null)

onMounted(() => {
  if (props.render) {
    renderComp.value = defineComponent({
      render: props.render
    })
  }
})

async function destroy(): Promise<void> {
  isClosing.value = true
  await sleep(550)
  props.close()
}

provide('destroy', destroy)
</script>

<template>
  <div
    :class="{ close: isClosing }"
    class="TPopperDialog-Wrapper absolute left-0 top-0 w-full h-full flex justify-center items-center z-10000 bg-black/30"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="title ? 'dialog-title' : undefined"
    :aria-describedby="message || messageHtml ? 'dialog-content' : undefined"
  >
    <div
      class="TPopperDialog-Container fake-background relative p-4 w-360px max-w-80% max-h-80% rounded-2xl box-border overflow-hidden"
      style="backdrop-filter: blur(10px) saturate(180%) brightness(1.5)"
    >
      <component :is="renderComp" v-if="renderComp" />
      <component :is="comp" v-else-if="comp" />
      <template v-else>
        <p v-if="title" id="dialog-title" class="text-1.5rem font-600 text-center">
          {{ title }}
        </p>
        <TouchScroll
          id="dialog-content"
          native
          no-padding
          class="TPopperDialog-Content relative mb-60px top-0 left-0 right-0 h-full max-h-300px box-border"
        >
          <span
            v-if="messageHtml"
            class="w-full block text-center my-1rem leading-1.25rem"
            style="position: relative; height: 100%"
            v-html="messageHtml"
          />
          <span
            v-else
            class="w-full block text-center my-1rem leading-1.25rem"
            style="position: relative; height: 100%"
          >
            {{ message }}
          </span>
        </TouchScroll>
        <TxButton
          class="absolute w-[calc(100%-40px)] bottom-1.5rem"
          variant="flat"
          type="primary"
          block
          aria-label="Confirm and close dialog"
          @click="destroy"
        >
          Confirm
        </TxButton>
      </template>
    </div>
  </div>
</template>

<style lang="scss">
$dialog-animation-duration: 0.5s;
$dialog-animation-easing: cubic-bezier(0.785, 0.135, 0.15, 0.86);
$fade-in-duration: 0.55s;
$fade-in-easing: cubic-bezier(0.785, 0.135, 0.15, 0.86);

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

@keyframes fade-in {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

.Popper-outer {
  animation: Popper-outer $fade-in-duration forwards $fade-in-easing;
}

.Popper-outer-reverse {
  animation-direction: reverse;
}

.TPopperDialog-Wrapper {
  &.close {
    opacity: 0;
  }

  transition: $dialog-animation-easing $dialog-animation-duration;
  animation: $dialog-animation-easing $dialog-animation-duration;
}

.TPopperDialog-Container {
  --fake-radius: 8px;
  --fake-inner-opacity: 0.15;

  transition: $dialog-animation-duration $dialog-animation-easing;
  animation: Popper $dialog-animation-duration $dialog-animation-easing;

  .FlatMarkdown-Container {
    --fake-inner-opacity: 0;
  }

  .TPopperDialog-Content span {
    white-space: pre-line;
  }
}

.close .TPopperDialog-Container {
  opacity: 0;
  transform: scale(1.2);
}
</style>
