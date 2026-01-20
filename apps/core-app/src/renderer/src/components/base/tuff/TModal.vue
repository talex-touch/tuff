<script lang="ts" name="TModal" setup>
import { TxButton } from '@talex-touch/tuffex'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    width?: string
  }>(),
  {
    title: '',
    width: '480px'
  }
)

const emits = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'close'): void
}>()

const visible = useModelWrapper(props, emits)

function close() {
  visible.value = false
  emits('close')
}
</script>

<template>
  <Teleport to="body">
    <transition name="modal-fade">
      <div v-if="visible" class="TModal-Overlay" @click.self="close">
        <div class="TModal-Content" :style="{ width }">
          <header v-if="title || $slots.header" class="TModal-Header">
            <slot name="header">
              <h3>{{ title }}</h3>
            </slot>
            <TxButton variant="bare" native-type="button" class="close-btn" @click="close">
              <i class="i-carbon-close" />
            </TxButton>
          </header>
          <section class="TModal-Body">
            <slot />
          </section>
          <footer v-if="$slots.footer" class="TModal-Footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped lang="scss">
.TModal-Overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.TModal-Content {
  background: var(--el-bg-color);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 18px 65px rgba(0, 0, 0, 0.25);
  width: min(90vw, 560px);
}

.TModal-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

  h3 {
    margin: 0;
    font-size: 18px;
  }

  .close-btn {
    border: none;
    background: transparent;
    font-size: 18px;
    cursor: pointer;
    color: var(--el-text-color-secondary);
  }
}

.TModal-Body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.TModal-Footer {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
