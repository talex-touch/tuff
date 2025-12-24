<script lang="ts" setup>
import { inject, computed, onMounted } from 'vue'

defineOptions({
  name: 'TuffSelectItem',
})

const props = withDefaults(
  defineProps<{
    value: string | number
    label?: string
    disabled?: boolean
  }>(),
  {
    disabled: false,
  }
)

const txSelect = inject<{
  currentValue: { value: string | number }
  handleSelect: (value: string | number, label: string) => void
  registerOption?: (value: string | number, label: string) => void
  searchQuery?: { value: string }
}>('tuffSelect')

onMounted(() => {
  const label = props.label || String(props.value)
  txSelect?.registerOption?.(props.value, label)
})

const isSelected = computed(() => {
  return txSelect?.currentValue.value === props.value
})

const visible = computed(() => {
  const q = (txSelect?.searchQuery?.value ?? '').trim().toLowerCase()
  if (!q) return true
  const label = (props.label || String(props.value)).toLowerCase()
  return label.includes(q)
})

function handleClick() {
  if (props.disabled) return
  txSelect?.handleSelect(props.value, props.label || String(props.value))
}
</script>

<template>
  <div
    v-show="visible"
    :class="[
      'tuff-select-item',
      {
        'is-selected': isSelected,
        'is-disabled': disabled,
      },
    ]"
    @click="handleClick"
  >
    <slot>{{ label || value }}</slot>
  </div>
</template>

<style lang="scss" scoped>
.tuff-select-item {
  padding: 8px 12px;
  font-size: 14px;
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover:not(.is-disabled) {
    background-color: var(--tx-fill-color-light, #f5f7fa);
  }

  &.is-selected {
    color: var(--tx-color-primary, #409eff);
    font-weight: 500;
  }

  &.is-disabled {
    color: var(--tx-disabled-text-color, #c0c4cc);
    cursor: not-allowed;
  }
}
</style>
