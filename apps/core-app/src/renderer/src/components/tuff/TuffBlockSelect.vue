<script lang="ts" name="TuffBlockSelect" setup>
import { computed } from 'vue'
import type { ITuffIcon } from '@talex-touch/utils'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'
import TSelect from '~/components/base/select/TSelect.vue'
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
  (e: 'change', value: string | number, event?: Event): void
}>()

const value = useModelWrapper(props, emits)
const isActive = computed(() => value.value !== undefined && value.value !== null)

function handleChange(val: string | number, evt?: Event) {
  emits('change', val, evt)
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
        <TSelect v-model="value" :class="disabled ? 'pointer-events-none opacity-70' : ''" @change="handleChange">
          <slot />
        </TSelect>
      </div>
    </template>
  </TuffBlockSlot>
</template>
