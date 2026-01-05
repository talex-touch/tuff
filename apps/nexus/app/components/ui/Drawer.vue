<script setup lang="ts">
import { TxDrawer } from '@talex-touch/tuffex'

const props = withDefaults(
  defineProps<{
    visible: boolean
    title?: string
    width?: string
    direction?: 'left' | 'right'
    showClose?: boolean
    closeOnClickMask?: boolean
    closeOnPressEscape?: boolean
    zIndex?: number
  }>(),
  {
    title: 'Drawer',
    width: '60%',
    direction: 'right',
    showClose: true,
    closeOnClickMask: true,
    closeOnPressEscape: true,
    zIndex: 1998,
  },
)

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'open'): void
  (e: 'close'): void
}>()
</script>

<template>
  <TxDrawer
    :visible="visible"
    :title="title"
    :width="width"
    :direction="direction"
    :show-close="showClose"
    :close-on-click-mask="closeOnClickMask"
    :close-on-press-escape="closeOnPressEscape"
    :z-index="zIndex"
    v-bind="$attrs"
    @update:visible="(v) => emit('update:visible', v)"
    @open="() => emit('open')"
    @close="() => emit('close')"
  >
    <slot />
    <template #footer>
      <slot name="footer" />
    </template>
  </TxDrawer>
</template>