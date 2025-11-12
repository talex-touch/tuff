<script lang="ts" name="TuffBlockInput" setup>
import { computed, ref } from 'vue'
import type { ITuffIcon } from '@talex-touch/utils'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'
import FlatInput from '@comp/base/input/FlatInput.vue'
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

const value = useModelWrapper(props, emits)
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
        <FlatInput
          v-model="value"
          :placeholder="placeholder"
          :non-win="true"
          @focusin="handleFocus"
          @focusout="handleBlur"
        />
      </slot>
    </template>
  </TuffBlockSlot>
</template>
