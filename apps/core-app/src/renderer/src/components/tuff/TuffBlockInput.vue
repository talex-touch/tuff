<script lang="ts" name="TuffBlockInput" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import { TxInput } from '@talex-touch/tuffex'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'
import type { WritableComputedRef } from 'vue'
import { computed, ref } from 'vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    modelValue: string | number
    defaultIcon?: string | ITuffIcon
    activeIcon?: string | ITuffIcon
    disabled?: boolean
    placeholder?: string
    clearable?: boolean
  }>(),
  {
    description: '',
    disabled: false,
    placeholder: '',
    clearable: false
  }
)

const emits = defineEmits<{
  (e: 'update:modelValue', value: string | number): void
  (e: 'focus'): void
  (e: 'blur'): void
}>()

const value = useModelWrapper(props, emits) as unknown as WritableComputedRef<string | number>
const inputValue = computed<string>({
  get: () => (value.value ?? '').toString(),
  set: (next) => {
    value.value = next
  }
})
const primitiveValue = computed(() => value.value as string | number)
const focused = ref(false)

const hasContent = computed(() => {
  if (value.value === null || value.value === undefined) return false
  return String(value.value).trim().length > 0
})

const isActive = computed(() => focused.value || hasContent.value)

function handleFocus() {
  focused.value = true
  emits('focus')
}

function handleBlur() {
  focused.value = false
  emits('blur')
}

function updateValue(val: string | number) {
  value.value = val
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
      <slot
        name="control"
        :model-value="primitiveValue"
        :value="primitiveValue"
        :model-ref="value"
        :update="updateValue"
        :focus="handleFocus"
        :blur="handleBlur"
        :disabled="disabled"
      >
        <div class="TuffBlockInput-Control">
          <TxInput
            v-model="inputValue"
            :placeholder="placeholder"
            @focus="handleFocus"
            @blur="handleBlur"
          />
        </div>
      </slot>
    </template>
  </TuffBlockSlot>
</template>

<style lang="scss" scoped>
.TuffBlockInput-Control {
  width: 180px;
  max-width: 100%;
  min-width: 120px;
  margin-left: auto;
  flex-shrink: 0;
}
</style>
