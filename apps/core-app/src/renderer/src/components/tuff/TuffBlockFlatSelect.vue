<script lang="ts" name="TuffBlockFlatSelect" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import type { TxFlatSelectValue } from '@talex-touch/tuffex'
import { TxFlatSelect } from '@talex-touch/tuffex'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'
import type { WritableComputedRef } from 'vue'
import { computed } from 'vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'

const props = withDefaults(
  defineProps<{
    title: string
    description: string
    modelValue: string | number
    defaultIcon?: string | ITuffIcon
    activeIcon?: string | ITuffIcon
    disabled?: boolean
  }>(),
  {
    disabled: false
  }
)

const emits = defineEmits<{
  (e: 'update:modelValue', value: string | number): void
  (e: 'change', value: string | number): void
}>()

const value = useModelWrapper(props, emits) as unknown as WritableComputedRef<TxFlatSelectValue>
const isActive = computed(
  () => value.value !== undefined && value.value !== null && value.value !== ''
)

function handleChange(val: TxFlatSelectValue) {
  emits('change', val)
}
</script>

<template>
  <TuffBlockSlot
    :title="title"
    :description="description"
    :default-icon="defaultIcon"
    :active-icon="activeIcon"
    :active="isActive"
    :disabled="disabled"
  >
    <template #tags>
      <slot name="tags" />
    </template>
    <template #default>
      <div class="TuffBlockFlatSelect-Control">
        <TxFlatSelect
          v-model="value"
          class="TuffBlockFlatSelect-Select"
          :disabled="disabled"
          :class="disabled ? 'pointer-events-none opacity-70' : ''"
          @change="handleChange"
        >
          <slot />
        </TxFlatSelect>
      </div>
    </template>
  </TuffBlockSlot>
</template>

<style lang="scss" scoped>
.TuffBlockFlatSelect-Control {
  width: 180px;
  max-width: 100%;
  min-width: 120px;
  margin-left: auto;
  flex-shrink: 0;
}

.TuffBlockFlatSelect-Select {
  width: 100%;
}
</style>
