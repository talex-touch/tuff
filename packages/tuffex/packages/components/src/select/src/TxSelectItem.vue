<script lang="ts" setup>
import { computed, inject, onMounted, useSlots, watch } from 'vue'
import TxCardItem from '../../card-item/src/TxCardItem.vue'
import { SELECT_KEY } from './types'

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
  },
)

const txSelect = inject(SELECT_KEY)
const slots = useSlots()

function resolveChildrenText(children: unknown): string {
  if (children == null || typeof children === 'boolean')
    return ''

  if (typeof children === 'string' || typeof children === 'number')
    return String(children)

  if (Array.isArray(children))
    return children.map(item => resolveChildrenText(item)).join('')

  if (typeof children === 'object') {
    const maybeSlot = (children as Record<string, unknown>).default
    if (typeof maybeSlot === 'function') {
      return resolveChildrenText((maybeSlot as () => unknown)())
    }
    if ('children' in (children as Record<string, unknown>)) {
      return resolveChildrenText((children as { children?: unknown }).children)
    }
  }

  return ''
}

const resolvedLabel = computed(() => {
  if (props.label)
    return props.label

  const slotContent = slots.default?.()
  const extracted = resolveChildrenText(slotContent).replace(/\s+/g, ' ').trim()
  if (extracted)
    return extracted

  return String(props.value)
})

function registerCurrentOption() {
  txSelect?.registerOption(props.value, resolvedLabel.value)
}

onMounted(() => {
  registerCurrentOption()
})

watch(
  () => resolvedLabel.value,
  () => {
    registerCurrentOption()
  },
)

const isSelected = computed(() => {
  return txSelect?.currentValue.value === props.value
})

const visible = computed(() => {
  const q = (txSelect?.searchQuery?.value ?? '').trim().toLowerCase()
  if (!q)
    return true
  const label = resolvedLabel.value.toLowerCase()
  return label.includes(q)
})

function handleClick() {
  if (props.disabled)
    return
  txSelect?.handleSelect(props.value, resolvedLabel.value)
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
      <slot>{{ resolvedLabel }}</slot>
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
