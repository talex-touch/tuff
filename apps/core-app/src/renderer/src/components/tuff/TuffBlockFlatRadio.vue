<script lang="ts" name="TuffBlockFlatRadio" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import type { TxFlatRadioValue } from '@talex-touch/tuffex'
import { TxFlatRadio } from '@talex-touch/tuffex'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'
import type { WritableComputedRef } from 'vue'
import { computed } from 'vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'

const props = withDefaults(
  defineProps<{
    title: string
    description: string
    modelValue: string | number | (string | number)[]
    defaultIcon?: string | ITuffIcon
    activeIcon?: string | ITuffIcon
    disabled?: boolean
    multiple?: boolean
    radioSize?: 'sm' | 'md' | 'lg'
  }>(),
  {
    disabled: false,
    multiple: false,
    radioSize: 'sm'
  }
)

const emits = defineEmits<{
  (e: 'update:modelValue', value: string | number | (string | number)[]): void
  (e: 'change', value: string | number | (string | number)[]): void
}>()

const value = useModelWrapper(props, emits) as unknown as WritableComputedRef<
  TxFlatRadioValue | TxFlatRadioValue[]
>
const isActive = computed(() => {
  if (Array.isArray(value.value)) return value.value.length > 0
  return value.value !== undefined && value.value !== null
})

function handleChange(val: string | number | (string | number)[]) {
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
      <div class="flex items-center justify-end w-full">
        <TxFlatRadio
          v-model="value"
          :size="radioSize"
          :disabled="disabled"
          :multiple="multiple"
          :class="disabled ? 'pointer-events-none opacity-70' : ''"
          @change="handleChange"
        >
          <slot />
        </TxFlatRadio>
      </div>
    </template>
  </TuffBlockSlot>
</template>
