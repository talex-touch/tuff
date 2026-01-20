<script setup lang="ts">
import type { FormItemEmits, FormItemProps, FormRule } from './types'
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { TX_FORM_CONTEXT_KEY } from './context'

defineOptions({ name: 'TxFormItem' })

const props = withDefaults(defineProps<FormItemProps>(), {
  label: '',
  required: false,
  showMessage: true,
  inline: false,
})

const emit = defineEmits<FormItemEmits>()

const form = inject(TX_FORM_CONTEXT_KEY, null)
const errorMessage = ref('')
const initialValue = ref<any>(undefined)

const fieldValue = computed(() => {
  if (!form?.model || !props.prop)
    return undefined
  return form.model[props.prop]
})

const resolvedRules = computed<FormRule[]>(() => {
  const local = props.rules
  const fromForm = props.prop ? form?.rules?.[props.prop] : undefined
  const merged = local ?? fromForm
  if (!merged)
    return []
  return Array.isArray(merged) ? merged : [merged]
})

const isRequired = computed(() => {
  if (props.required)
    return true
  return resolvedRules.value.some(rule => rule.required)
})

const labelText = computed(() => props.label || props.prop || '')

function isEmpty(value: any): boolean {
  if (value === null || value === undefined || value === '')
    return true
  if (Array.isArray(value))
    return value.length === 0
  return false
}

async function runRule(rule: FormRule): Promise<string | null> {
  const value = fieldValue.value
  const message = rule.message || `${labelText.value || 'Field'} is invalid`

  if (rule.required || props.required) {
    if (isEmpty(value))
      return rule.message || `${labelText.value || 'Field'} is required`
  }

  if (rule.validator) {
    const result = await rule.validator(value, rule, form?.model ?? {})
    if (result === false)
      return message
    if (typeof result === 'string')
      return result
  }

  return null
}

async function validate(): Promise<boolean> {
  for (const rule of resolvedRules.value) {
    const message = await runRule(rule)
    if (message) {
      errorMessage.value = message
      emit('validate', false)
      return false
    }
  }
  errorMessage.value = ''
  emit('validate', true)
  return true
}

function clearValidate() {
  errorMessage.value = ''
}

function reset() {
  if (form?.model && props.prop)
    form.model[props.prop] = initialValue.value
  clearValidate()
}

const itemContext = { prop: props.prop, validate, reset, clearValidate }

const labelStyle = computed(() => {
  if (form?.labelPosition.value === 'top')
    return {}
  const width = form?.labelWidth.value
  if (!width)
    return {}
  return {
    width: typeof width === 'number' ? `${width}px` : width,
  }
})

onMounted(() => {
  if (form?.model && props.prop)
    initialValue.value = form.model[props.prop]
  form?.registerItem(itemContext)
})

onBeforeUnmount(() => {
  form?.unregisterItem(itemContext)
})
</script>

<template>
  <div
    class="tx-form-item"
    :class="[
      `tx-form-item--label-${form?.labelPosition.value ?? 'left'}`,
      { 'is-error': !!errorMessage, 'is-required': isRequired, 'is-inline': inline },
    ]"
  >
    <label v-if="labelText" class="tx-form-item__label" :style="labelStyle">
      {{ labelText }}
    </label>
    <div class="tx-form-item__content">
      <slot />
      <div v-if="showMessage && errorMessage" class="tx-form-item__error">
        {{ errorMessage }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-form-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;

  &--label-top {
    flex-direction: column;
    gap: 6px;
  }

  &.is-inline {
    align-items: center;
  }
}

.tx-form-item__label {
  font-size: 13px;
  color: var(--tx-text-color-regular, #606266);
  min-width: 0;
  padding-top: 6px;
}

.tx-form-item--label-top .tx-form-item__label {
  padding-top: 0;
}

.tx-form-item__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tx-form-item__error {
  font-size: 12px;
  color: var(--tx-color-danger, #f56c6c);
}

.tx-form-item.is-error .tx-form-item__label {
  color: var(--tx-color-danger, #f56c6c);
}

.tx-form-item.is-required .tx-form-item__label::after {
  content: '*';
  margin-left: 4px;
  color: var(--tx-color-danger, #f56c6c);
}
</style>
