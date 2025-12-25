<script lang="ts" setup>
import TxCardItem from '../../card-item/src/TxCardItem.vue'
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
  <TxCardItem
    v-show="visible"
    class="tuff-select-item"
    :class="{ 'is-selected': isSelected, 'is-disabled': disabled }"
    :clickable="!disabled"
    :active="isSelected"
    :disabled="disabled"
    @click="handleClick"
  >
    <template #title>
      <slot>{{ label || value }}</slot>
    </template>
  </TxCardItem>
</template>

<style lang="scss" scoped>
.tuff-select-item {
  width: 100%;
}

.tuff-select-item :deep(.tx-card-item__title) {
  font-weight: 500;
  color: var(--tx-text-color-regular, #606266);
}

.tuff-select-item.is-selected :deep(.tx-card-item__title) {
  color: var(--tx-color-primary, #409eff);
}

.tuff-select-item.is-disabled :deep(.tx-card-item__title) {
  color: var(--tx-disabled-text-color, #c0c4cc);
}
</style>
