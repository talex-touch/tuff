<script setup lang="ts">
import { TxInput } from '@talex-touch/tuffex'
import { nextTick, ref } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder: string
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const inputRef = ref<InstanceType<typeof TxInput> | null>(null)

function focusInput(): void {
  void nextTick(() => {
    const native = (inputRef.value as unknown as { inputRef?: HTMLInputElement })?.inputRef
    if (native) {
      native.focus()
      native.select()
    }
  })
}

defineExpose({
  focusInput
})
</script>

<template>
  <div class="OmniPanelSearchBar">
    <TxInput
      ref="inputRef"
      :model-value="props.modelValue"
      clearable
      :placeholder="placeholder"
      @update:model-value="emit('update:modelValue', String($event || ''))"
    />
  </div>
</template>

<style scoped lang="scss">
.OmniPanelSearchBar {
  :deep(.tx-input) {
    width: 100%;
    border: 1px solid var(--tx-border-color);
    border-radius: 8px;
    background: var(--tx-fill-color-light);
    color: var(--tx-text-color-primary);
    font-size: 13px;
  }

  :deep(.tx-input__wrapper) {
    background: transparent;
  }
}
</style>
