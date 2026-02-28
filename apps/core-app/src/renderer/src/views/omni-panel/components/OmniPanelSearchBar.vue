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
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.6);
    color: #e2e8f0;
    font-size: 13px;
  }
}
</style>
