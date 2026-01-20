<script lang="ts" name="TSelectField" setup>
import { TxButton } from '@talex-touch/tuffex'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null
    placeholder?: string
    options?: Array<{ label: string; value: string | number }>
    disabled?: boolean
    clearable?: boolean
  }>(),
  {
    placeholder: '',
    options: () => [],
    disabled: false,
    clearable: false
  }
)

const emits = defineEmits<{
  (e: 'update:modelValue', value: string | number | null): void
  (e: 'change', value: string | number | null): void
}>()

const value = useModelWrapper(props, emits)

function handleChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const raw = target.value
  if (raw === '') {
    value.value = null
    emits('update:modelValue', null)
    emits('change', null)
    return
  }

  const matched = props.options.find((option) => String(option.value) === raw)
  const result = matched ? matched.value : raw
  emits('update:modelValue', result)
  emits('change', result)
}

function clearValue() {
  if (!props.clearable) return
  value.value = null
  emits('update:modelValue', null)
  emits('change', null)
}
</script>

<template>
  <div class="TSelectField" :class="{ disabled }">
    <select
      :value="value === null || value === undefined ? '' : String(value)"
      :disabled="disabled"
      class="select-element"
      @change="handleChange"
    >
      <option value="">
        {{ placeholder }}
      </option>
      <option v-for="option in options" :key="option.value" :value="String(option.value)">
        {{ option.label }}
      </option>
    </select>
    <TxButton
      v-if="clearable && value !== null && value !== undefined && value !== ''"
      variant="bare"
      native-type="button"
      class="clear-btn"
      @click="clearValue"
    >
      <i class="i-carbon-close" />
    </TxButton>
    <span class="chevron i-carbon-chevron-down" />
  </div>
</template>

<style scoped lang="scss">
.TSelectField {
  position: relative;
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color);
  padding: 0 12px;
  height: 40px;
  display: flex;
  align-items: center;
  transition: border-color 0.2s ease;

  &:focus-within {
    border-color: var(--el-color-primary);
  }

  &.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .select-element {
    width: 100%;
    border: none;
    background: transparent;
    outline: none;
    appearance: none;
    font-size: 14px;
    color: var(--el-text-color-primary);
  }

  .chevron {
    position: absolute;
    right: 12px;
    color: var(--el-text-color-secondary);
    pointer-events: none;
  }

  .clear-btn {
    border: none;
    background: transparent;
    color: var(--el-text-color-secondary);
    cursor: pointer;
    margin-right: 24px;
    font-size: 16px;

    &:hover {
      color: var(--el-text-color-primary);
    }
  }
}
</style>
