<script setup lang="ts">
import type { DropdownMenuProps } from './types'
import { computed, provide } from 'vue'
import TxPopover from '../../popover/src/TxPopover.vue'

defineOptions({ name: 'TxDropdownMenu' })

const props = withDefaults(defineProps<DropdownMenuProps>(), {
  modelValue: false,
  placement: 'bottom-start',
  offset: 6,
  closeOnSelect: true,

  minWidth: 220,
  panelVariant: 'solid',
  panelBackground: 'glass',
  panelShadow: 'soft',
  panelRadius: 18,
  panelPadding: 8,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'open'): void
  (e: 'close'): void
}>()

const open = computed({
  get: () => !!props.modelValue,
  set: (v) => {
    emit('update:modelValue', v)
    if (v)
      emit('open')
    else
      emit('close')
  },
})

function close() {
  open.value = false
}

provide('txDropdownMenu', {
  close,
  closeOnSelect: props.closeOnSelect,
})
</script>

<template>
  <TxPopover
    v-model="open"
    class="tx-dropdown"
    :placement="placement"
    :offset="offset"
    :width="0"
    :min-width="minWidth"
    :max-width="360"
    :panel-variant="panelVariant"
    :panel-background="panelBackground"
    :panel-shadow="panelShadow"
    :panel-radius="panelRadius"
    :panel-padding="panelPadding"
  >
    <template #reference>
      <slot name="trigger" />
    </template>

    <div class="tx-dropdown__panel" role="menu">
      <slot />
    </div>
  </TxPopover>
</template>

<style lang="scss" scoped>
.tx-dropdown__panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px;
}
</style>
