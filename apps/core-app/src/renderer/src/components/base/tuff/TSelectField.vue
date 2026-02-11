<script lang="ts" name="TSelectField" setup>
import { TxButton } from '@talex-touch/tuffex'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'
import { computed } from 'vue'

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
  (e: 'update:modelValue', value: string | number | null | undefined): void
  (e: 'change', value: string | number | null | undefined): void
}>()

const value = useModelWrapper(props, emits)
const selectedValue = computed(() =>
  value.value === null || value.value === undefined ? '' : String(value.value)
)
const hasValue = computed(
  () => value.value !== null && value.value !== undefined && value.value !== ''
)

function handleChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const raw = target.value
  if (raw === '') {
    value.value = null
    emits('change', null)
    return
  }

  const matched = props.options.find((option) => String(option.value) === raw)
  const result = matched ? matched.value : raw
  value.value = result
  emits('change', result)
}

function clearValue() {
  if (!props.clearable) return
  value.value = null
  emits('change', null)
}
</script>

<template>
  <div class="TSelectField" :class="{ disabled }">
    <select
      :value="selectedValue"
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
      v-if="clearable && hasValue"
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
  transition:
    border-color 0.25s ease,
    box-shadow 0.25s ease;

  &:focus-within {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-primary) 12%, transparent);

    .chevron {
      color: var(--el-color-primary);
      transform: rotate(180deg);
    }
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
    transition:
      transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
      color 0.25s ease;
  }

  .clear-btn {
    border: none;
    background: transparent;
    color: var(--el-text-color-secondary);
    cursor: pointer;
    margin-right: 24px;
    font-size: 16px;
    opacity: 0;
    transform: scale(0.8);
    transition:
      opacity 0.2s ease,
      transform 0.2s ease,
      color 0.15s ease;

    &:hover {
      color: var(--el-text-color-primary);
    }
  }

  &:hover .clear-btn,
  &:focus-within .clear-btn {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
