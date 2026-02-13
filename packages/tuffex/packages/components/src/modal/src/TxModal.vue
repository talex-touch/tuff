<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { getZIndex, nextZIndex } from '../../../../utils/z-index-manager'

defineOptions({
  name: 'TxModal',
})

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    width?: string
  }>(),
  {
    title: '',
    width: '480px',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'close': []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const zIndex = ref(getZIndex())

watch(
  visible,
  (v) => {
    if (v)
      zIndex.value = nextZIndex()
  },
  { flush: 'sync' },
)

function close() {
  visible.value = false
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="tx-modal">
      <div v-if="visible" class="tx-modal__overlay" role="dialog" aria-modal="true" :style="{ zIndex }" @click.self="close">
        <div class="tx-modal__content" :style="{ width }">
          <header v-if="title || $slots.header" class="tx-modal__header">
            <slot name="header">
              <h3 class="tx-modal__title">
                {{ title }}
              </h3>
            </slot>
            <button type="button" class="tx-modal__close" aria-label="Close" @click="close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </header>
          <section class="tx-modal__body">
            <slot />
          </section>
          <footer v-if="$slots.footer" class="tx-modal__footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.tx-modal__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.tx-modal__content {
  background: var(--tx-bg-color, #fff);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  width: min(90vw, 560px);
  color: var(--tx-text-color-primary, #303133);
}

.tx-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.tx-modal__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.tx-modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--tx-text-color-secondary, #909399);
  transition: background-color 0.2s, color 0.2s, transform 0.15s;

  &:hover {
    background: var(--tx-fill-color-light, #f5f7fa);
    color: var(--tx-text-color-primary, #303133);
  }

  &:active {
    transform: scale(0.92);
  }
}

.tx-modal__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tx-modal__footer {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

// Overlay fade
.tx-modal-enter-active {
  transition: opacity 0.25s ease;
}

.tx-modal-leave-active {
  transition: opacity 0.2s ease;
}

.tx-modal-enter-from,
.tx-modal-leave-to {
  opacity: 0;
}

// Content panel animation
.tx-modal-enter-active .tx-modal__content {
  animation: tx-modal-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.tx-modal-leave-active .tx-modal__content {
  animation: tx-modal-leave 0.2s ease forwards;
}

@keyframes tx-modal-enter {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes tx-modal-leave {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.97) translateY(4px);
  }
}
</style>
