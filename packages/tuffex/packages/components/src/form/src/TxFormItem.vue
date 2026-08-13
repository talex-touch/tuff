<script setup lang="ts">
import type { FormItemEmits, FormItemProps, FormRule } from './types'
import { computed, inject, onBeforeUnmount, onMounted, ref, useId } from 'vue'
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
const fieldId = useId()
const errorId = useId()

const fieldValue = computed(() => {
  const model = form?.model.value
  if (!model || !props.prop)
    return undefined
  return model[props.prop]
})

const resolvedRules = computed<FormRule[]>(() => {
  const local = props.rules
  const fromForm = props.prop ? form?.rules.value?.[props.prop] : undefined
  const merged = local ?? fromForm
  if (!merged)
    return []
  return Array.isArray(merged) ? merged : [merged]
})

/**
 * `required` is honoured inside runRule, but runRule is only reachable from the
 * rule loop — so an item declaring `required` with no rules had nothing to
 * iterate and validated as passing while still rendering the required marker.
 */
const effectiveRules = computed<FormRule[]>(() => {
  const rules = resolvedRules.value
  if (rules.length === 0 && props.required)
    return [{ required: true }]
  return rules
})

const isRequired = computed(() => {
  if (props.required)
    return true
  return resolvedRules.value.some(rule => rule.required)
})

const labelText = computed(() => props.label || props.prop || '')

// Exposed so a slotted control can wire full labelling:
//   <TxFormItem #default="{ id, ariaInvalid, ariaDescribedby }">
//     <input :id="id" :aria-invalid="ariaInvalid" :aria-describedby="ariaDescribedby">
const fieldSlotProps = computed(() => ({
  id: fieldId,
  ariaInvalid: errorMessage.value ? 'true' : undefined,
  ariaDescribedby: errorMessage.value ? errorId : undefined,
}))

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
    const result = await rule.validator(value, rule, form?.model.value ?? {})
    if (result === false)
      return message
    if (typeof result === 'string')
      return result
  }

  return null
}

async function validate(): Promise<boolean> {
  for (const rule of effectiveRules.value) {
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
  const model = form?.model.value
  if (model && props.prop)
    model[props.prop] = initialValue.value
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
  const model = form?.model.value
  if (model && props.prop)
    initialValue.value = model[props.prop]
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
    <label v-if="labelText" class="tx-form-item__label" :for="fieldId" :style="labelStyle">
      {{ labelText }}
    </label>
    <div class="tx-form-item__content">
      <slot v-bind="fieldSlotProps" />
      <div v-if="showMessage && errorMessage" :id="errorId" class="tx-form-item__error" role="alert">
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

  // Give the documented `labelPosition="right"` an actual effect; without this it
  // rendered identically to the default `left`.
  &--label-right .tx-form-item__label {
    text-align: right;
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
