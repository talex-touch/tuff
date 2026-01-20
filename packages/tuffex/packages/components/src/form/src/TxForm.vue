<script setup lang="ts">
import type { FormItemContext } from './context'
import type { FormEmits, FormProps } from './types'
import { computed, provide, ref } from 'vue'
import { TX_FORM_CONTEXT_KEY } from './context'

defineOptions({ name: 'TxForm' })

const props = withDefaults(defineProps<FormProps>(), {
  labelPosition: 'left',
  size: 'medium',
  disabled: false,
})

const emit = defineEmits<FormEmits>()

const items = ref(new Set<FormItemContext>())

const labelPosition = computed(() => props.labelPosition ?? 'left')
const labelWidth = computed(() => props.labelWidth)
const size = computed(() => props.size ?? 'medium')
const disabled = computed(() => !!props.disabled)

function registerItem(item: FormItemContext) {
  items.value.add(item)
}

function unregisterItem(item: FormItemContext) {
  items.value.delete(item)
}

async function validate(): Promise<boolean> {
  const results = await Promise.all(Array.from(items.value).map(item => item.validate()))
  const valid = results.every(Boolean)
  emit('validate', valid)
  return valid
}

function resetFields() {
  for (const item of items.value)
    item.reset()
}

function clearValidate() {
  for (const item of items.value)
    item.clearValidate()
}

provide(TX_FORM_CONTEXT_KEY, {
  model: props.model,
  rules: props.rules,
  labelPosition,
  labelWidth,
  size,
  disabled,
  registerItem,
  unregisterItem,
})

defineExpose({ validate, resetFields, clearValidate })
</script>

<template>
  <form class="tx-form" :class="`tx-form--label-${labelPosition}`" @submit.prevent>
    <slot />
  </form>
</template>

<style scoped lang="scss">
.tx-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tx-form--label-top {
  align-items: stretch;
}
</style>
