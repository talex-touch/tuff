<script setup lang="ts">
import { hasDocument } from '@talex-touch/utils/env'
import { ref } from 'vue'

interface Props {
  icon: string
  label: string
  title?: string
}

const props = defineProps<Props>()
const buttonRef = ref<HTMLButtonElement | null>(null)

defineExpose({
  focus: () => buttonRef.value?.focus(),
  isFocused: () => hasDocument() && Boolean(buttonRef.value) && document.activeElement === buttonRef.value,
})
</script>

<template>
  <button
    ref="buttonRef"
    type="button"
    class="HeaderIconBtn"
    :aria-label="props.label"
    :title="props.title ?? props.label"
  >
    <span :class="props.icon" class="HeaderIconBtn-Icon" aria-hidden="true" />
  </button>
</template>

<style scoped>
.HeaderIconBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 999px;
  background: transparent;
  color: rgba(20, 22, 24, 0.78);
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.HeaderIconBtn:hover,
.HeaderIconBtn:focus-visible {
  background: rgba(15, 23, 42, 0.06);
  border-color: rgba(15, 23, 42, 0.24);
  color: rgba(15, 23, 42, 0.96);
  outline: none;
}

.dark .HeaderIconBtn {
  border-color: rgba(255, 255, 255, 0.14);
  color: rgba(248, 250, 247, 0.8);
}

.dark .HeaderIconBtn:hover,
.dark .HeaderIconBtn:focus-visible {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.28);
  color: rgba(255, 255, 255, 0.98);
}

.HeaderIconBtn-Icon {
  font-size: 1rem;
  line-height: 1;
}
</style>
