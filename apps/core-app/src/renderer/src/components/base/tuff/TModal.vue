<script lang="ts" name="TModal" setup>
// Legacy adaptor: new CoreApp code should import TxModal from @talex-touch/tuffex/modal.
import { computed } from 'vue'
import { TxModal } from '@talex-touch/tuffex/modal'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    width?: string
    height?: string
    maxHeight?: string
  }>(),
  {
    title: '',
    width: '480px',
    height: undefined,
    maxHeight: 'calc(100vh - 40px)'
  }
)

const emits = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'close'): void
}>()

const visible = useModelWrapper(props, emits)
const contentStyle = computed(() => ({
  height: props.height,
  maxHeight: props.maxHeight
}))

function handleClose() {
  emits('close')
}
</script>

<template>
  <TxModal v-model="visible" :title="title" :width="width" v-bind="$attrs" @close="handleClose">
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>

    <div class="TModal-Body" :style="contentStyle">
      <slot />
    </div>

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </TxModal>
</template>

<style scoped lang="scss">
.TModal-Body {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
}
</style>
