<script setup lang="ts">
import type { TransferEmits, TransferItem, TransferProps } from './types'
import { computed, ref, watch } from 'vue'
import { TxButton } from '../../button'
import { TxCheckbox } from '../../checkbox'
import { TxInput } from '../../input'

defineOptions({ name: 'TxTransfer' })

const props = withDefaults(defineProps<TransferProps>(), {
  modelValue: () => [],
  data: () => [],
  titles: () => ['Source', 'Target'],
  filterable: false,
  filterPlaceholder: '',
  emptyText: 'No data',
  addAriaLabel: 'Move selected items to target',
  removeAriaLabel: 'Move selected items to source',
  targetOrder: 'original',
})

const emit = defineEmits<TransferEmits>()

const leftFilter = ref('')
const rightFilter = ref('')
const leftChecked = ref<Array<string | number>>([])
const rightChecked = ref<Array<string | number>>([])

const selectedSet = computed(() => new Set(props.modelValue ?? []))

const dataMap = computed(() => {
  return new Map((props.data ?? []).map(item => [item.key, item]))
})

const sourceItems = computed(() => {
  return (props.data ?? []).filter(item => !selectedSet.value.has(item.key))
})

const targetItems = computed(() => {
  if (props.targetOrder === 'original') {
    return (props.data ?? []).filter(item => selectedSet.value.has(item.key))
  }
  const ordered: TransferItem[] = []
  for (const key of props.modelValue ?? []) {
    const item = dataMap.value.get(key)
    if (item)
      ordered.push(item)
  }
  return ordered
})

function filterItems(list: TransferItem[], query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized)
    return list
  return list.filter(item => (item.label || '').toLowerCase().includes(normalized))
}

const filteredSource = computed(() => filterItems(sourceItems.value, leftFilter.value))
const filteredTarget = computed(() => filterItems(targetItems.value, rightFilter.value))

function normalizeChecked() {
  const sourceKeys = new Set(sourceItems.value.map(item => item.key))
  const targetKeys = new Set(targetItems.value.map(item => item.key))
  leftChecked.value = leftChecked.value.filter(key => sourceKeys.has(key))
  rightChecked.value = rightChecked.value.filter(key => targetKeys.has(key))
}

watch(
  () => [props.modelValue, props.data],
  () => normalizeChecked(),
  { deep: true }
)

function updateChecked(list: Array<string | number>, key: string | number, checked: boolean) {
  const next = new Set(list)
  if (checked)
    next.add(key)
  else
    next.delete(key)
  return Array.from(next)
}

function resolveOrder(keys: Array<string | number>) {
  if (props.targetOrder !== 'original')
    return keys
  const order = (props.data ?? []).map(item => item.key)
  const set = new Set(keys)
  return order.filter(key => set.has(key))
}

function emitChange(next: Array<string | number>) {
  emit('update:modelValue', next)
  emit('change', next)
}

function handleAdd() {
  const nextKeys = new Set(props.modelValue ?? [])
  leftChecked.value.forEach((key) => {
    const item = dataMap.value.get(key)
    if (item && !item.disabled)
      nextKeys.add(key)
  })
  emitChange(resolveOrder(Array.from(nextKeys)))
  leftChecked.value = []
}

function handleRemove() {
  const nextKeys = (props.modelValue ?? []).filter(key => !rightChecked.value.includes(key))
  emitChange(resolveOrder(nextKeys))
  rightChecked.value = []
}
</script>

<template>
  <div class="tx-transfer">
    <div class="tx-transfer__panel">
      <div class="tx-transfer__panel-header">
        <span class="tx-transfer__title">{{ titles?.[0] ?? '' }}</span>
        <span class="tx-transfer__count">{{ sourceItems.length }}</span>
      </div>
      <div v-if="filterable" class="tx-transfer__filter">
        <TxInput v-model="leftFilter" :placeholder="filterPlaceholder" />
      </div>
      <div class="tx-transfer__list">
        <div v-if="filteredSource.length === 0" class="tx-transfer__empty">
          {{ emptyText }}
        </div>
        <label
          v-for="item in filteredSource"
          :key="item.key"
          class="tx-transfer__item"
          :class="{ 'is-disabled': item.disabled }"
        >
          <TxCheckbox
            :model-value="leftChecked.includes(item.key)"
            :disabled="item.disabled"
            @update:model-value="(checked) => (leftChecked = updateChecked(leftChecked, item.key, checked))"
          />
          <span class="tx-transfer__label">{{ item.label }}</span>
        </label>
      </div>
    </div>

    <div class="tx-transfer__actions">
      <TxButton
        variant="ghost"
        size="sm"
        :disabled="leftChecked.length === 0"
        :aria-label="addAriaLabel"
        @click="handleAdd"
      >
        <span class="i-carbon-chevron-right" />
      </TxButton>
      <TxButton
        variant="ghost"
        size="sm"
        :disabled="rightChecked.length === 0"
        :aria-label="removeAriaLabel"
        @click="handleRemove"
      >
        <span class="i-carbon-chevron-left" />
      </TxButton>
    </div>

    <div class="tx-transfer__panel">
      <div class="tx-transfer__panel-header">
        <span class="tx-transfer__title">{{ titles?.[1] ?? '' }}</span>
        <span class="tx-transfer__count">{{ targetItems.length }}</span>
      </div>
      <div v-if="filterable" class="tx-transfer__filter">
        <TxInput v-model="rightFilter" :placeholder="filterPlaceholder" />
      </div>
      <div class="tx-transfer__list">
        <div v-if="filteredTarget.length === 0" class="tx-transfer__empty">
          {{ emptyText }}
        </div>
        <label
          v-for="item in filteredTarget"
          :key="item.key"
          class="tx-transfer__item"
          :class="{ 'is-disabled': item.disabled }"
        >
          <TxCheckbox
            :model-value="rightChecked.includes(item.key)"
            :disabled="item.disabled"
            @update:model-value="(checked) => (rightChecked = updateChecked(rightChecked, item.key, checked))"
          />
          <span class="tx-transfer__label">{{ item.label }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-transfer {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.tx-transfer__panel {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  border-radius: 12px;
  background: var(--tx-fill-color-blank, #ffffff);
  display: flex;
  flex-direction: column;
  min-height: 240px;
  overflow: hidden;
}

.tx-transfer__panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

.tx-transfer__filter {
  padding: 8px 12px;
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
}

.tx-transfer__list {
  flex: 1;
  overflow: auto;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tx-transfer__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--tx-text-color-regular, #606266);
  transition: background 0.2s ease;
}

.tx-transfer__item:hover:not(.is-disabled) {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.tx-transfer__item.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tx-transfer__label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  word-break: break-all;
}

.tx-transfer__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tx-transfer__empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
