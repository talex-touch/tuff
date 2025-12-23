<script lang="ts" setup>
import { computed } from 'vue'

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
  close: []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

function close() {
  visible.value = false
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <transition name="tx-modal-fade">
      <div v-if="visible" class="tx-modal__overlay" role="dialog" aria-modal="true" @click.self="close">
        <div class="tx-modal__content" :style="{ width }">
          <header v-if="title || $slots.header" class="tx-modal__header">
            <slot name="header">
              <h3 class="tx-modal__title">{{ title }}</h3>
            </slot>
            <button type="button" class="tx-modal__close" @click="close">
              <i class="i-carbon-close" />
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
    </transition>
  </Teleport>
</template>

<style scoped lang="scss">
.tx-modal__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.tx-modal__content {
  background: var(--tx-bg-color, #fff);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 18px 65px rgba(0, 0, 0, 0.25);
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
}

.tx-modal__close {
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  color: var(--tx-text-color-secondary, #909399);
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

.tx-modal-fade-enter-active,
.tx-modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.tx-modal-fade-enter-from,
.tx-modal-fade-leave-to {
  opacity: 0;
}
</style>
