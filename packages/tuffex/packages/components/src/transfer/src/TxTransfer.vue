<script setup lang="ts">
import type { PropType } from 'vue'
import type { TransferEmits, TransferItem } from './types'
import { computed, ref, watch } from 'vue'
import { TxButton } from '../../button'
import { TxCheckbox } from '../../checkbox'
import { TxIcon } from '../../icon'
import { TxInput } from '../../input'

defineOptions({ name: 'TxTransfer' })

/**
 * Declared as a runtime object rather than `defineProps<TransferProps>()`. The
 * SFC compiler resolves a sibling `types.ts` once and does not redo it when
 * that file changes, so a prop added to the interface ships as an unknown
 * attribute — silently, with vitest and the built `dist` both still correct.
 * `TransferProps` stays the public type; this is the wiring.
 */
const props = defineProps({
  modelValue: { type: Array as PropType<Array<string | number>>, default: () => [] },
  data: { type: Array as PropType<TransferItem[]>, default: () => [] },
  // `ArrayConstructor` cannot be narrowed straight to a tuple — TS rejects the
  // cast because `any[]` may hold fewer than two entries — but the tuple is the
  // contract worth publishing, so it goes through `unknown`.
  titles: { type: Array as unknown as PropType<[string, string]>, default: () => ['Source', 'Target'] },
  filterable: { type: Boolean, default: false },
  filterPlaceholder: { type: String, default: '' },
  emptyText: { type: [String, Array] as PropType<string | [string, string]>, default: 'No data' },
  maxHeight: { type: [String, Number] as PropType<string | number>, default: undefined },
  minHeight: { type: [String, Number] as PropType<string | number>, default: undefined },
  addAriaLabel: { type: String, default: 'Move selected items to target' },
  removeAriaLabel: { type: String, default: 'Move selected items to source' },
  moveUpAriaLabel: { type: String, default: 'Move item up' },
  moveDownAriaLabel: { type: String, default: 'Move item down' },
  selectAllAriaLabel: { type: String, default: 'Select all' },
  targetOrder: { type: String as PropType<'original' | 'push'>, default: 'original' },
  orderable: { type: Boolean, default: false },
})

const emit = defineEmits<TransferEmits>()

const leftFilter = ref('')
const rightFilter = ref('')
const leftChecked = ref<Array<string | number>>([])
const rightChecked = ref<Array<string | number>>([])

const selectedSet = computed(() => new Set(props.modelValue ?? []))

function toCssUnit(value: string | number | undefined): string | undefined {
  if (value === undefined)
    return undefined
  return typeof value === 'number' ? `${value}px` : value
}

const rootStyle = computed(() => {
  const style: Record<string, string> = {}
  const maxHeight = toCssUnit(props.maxHeight)
  const minHeight = toCssUnit(props.minHeight)
  if (maxHeight)
    style['--tx-transfer-max-height'] = maxHeight
  if (minHeight)
    style['--tx-transfer-min-height'] = minHeight
  return Object.keys(style).length > 0 ? style : undefined
})

const sourceEmptyText = computed(() =>
  Array.isArray(props.emptyText) ? props.emptyText[0] : props.emptyText,
)
const targetEmptyText = computed(() =>
  Array.isArray(props.emptyText) ? props.emptyText[1] : props.emptyText,
)

const dataMap = computed(() => {
  return new Map((props.data ?? []).map(item => [item.key, item]))
})

const sourceItems = computed(() => {
  return (props.data ?? []).filter(item => !selectedSet.value.has(item.key))
})

const targetItems = computed(() => {
  // `orderable` means the target list *is* the ranking, so it always follows
  // modelValue — otherwise a reorder would be re-sorted away on the next render.
  if (props.targetOrder === 'original' && !props.orderable) {
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

/** Rank of each selected key, read from modelValue so a filter cannot shift it. */
const targetIndexMap = computed(() => {
  const map = new Map<string | number, number>()
  ;(props.modelValue ?? []).forEach((key, index) => map.set(key, index))
  return map
})

const targetCount = computed(() => (props.modelValue ?? []).length)

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
  // A ranked list carries its own order; re-deriving it from `data` would undo
  // every move the user just made.
  if (props.orderable || props.targetOrder !== 'original')
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

function moveTarget(key: string | number, direction: -1 | 1) {
  const keys = [...(props.modelValue ?? [])]
  const index = keys.indexOf(key)
  const nextIndex = index + direction
  if (index === -1 || nextIndex < 0 || nextIndex >= keys.length)
    return
  const [moved] = keys.splice(index, 1)
  if (moved === undefined)
    return
  keys.splice(nextIndex, 0, moved)
  emitChange(resolveOrder(keys))
}

/** Double-click moves one row on its own, without the check-then-press detour. */
function moveOne(item: TransferItem, direction: 'add' | 'remove') {
  if (item.disabled)
    return
  if (direction === 'add') {
    const nextKeys = new Set(props.modelValue ?? [])
    nextKeys.add(item.key)
    emitChange(resolveOrder(Array.from(nextKeys)))
    leftChecked.value = leftChecked.value.filter(key => key !== item.key)
    return
  }
  emitChange(resolveOrder((props.modelValue ?? []).filter(key => key !== item.key)))
  rightChecked.value = rightChecked.value.filter(key => key !== item.key)
}

// Select-all covers what the panel currently shows: with a filter applied it
// would otherwise check rows the user cannot see and did not ask for.
const sourceSelectableKeys = computed(() =>
  filteredSource.value.filter(item => !item.disabled).map(item => item.key),
)
const targetSelectableKeys = computed(() =>
  filteredTarget.value.filter(item => !item.disabled).map(item => item.key),
)

function selectionState(keys: Array<string | number>, checked: Array<string | number>) {
  if (keys.length === 0)
    return { all: false, some: false }
  const picked = keys.filter(key => checked.includes(key)).length
  return { all: picked === keys.length, some: picked > 0 && picked < keys.length }
}

const sourceSelection = computed(() => selectionState(sourceSelectableKeys.value, leftChecked.value))
const targetSelection = computed(() =>
  selectionState(targetSelectableKeys.value, rightChecked.value),
)

function toggleSelectAll(side: 'source' | 'target', checked: boolean) {
  const keys = side === 'source' ? sourceSelectableKeys.value : targetSelectableKeys.value
  const current = side === 'source' ? leftChecked.value : rightChecked.value
  const next = checked
    ? Array.from(new Set([...current, ...keys]))
    : current.filter(key => !keys.includes(key))
  if (side === 'source')
    leftChecked.value = next
  else
    rightChecked.value = next
}
</script>

<template>
  <div class="tx-transfer" :style="rootStyle">
    <div class="tx-transfer__panel">
      <div class="tx-transfer__panel-header">
        <TxCheckbox
          class="tx-transfer__select-all"
          :model-value="sourceSelection.all"
          :indeterminate="sourceSelection.some"
          :disabled="sourceSelectableKeys.length === 0"
          :aria-label="`${selectAllAriaLabel}: ${titles?.[0] ?? ''}`"
          @update:model-value="(checked) => toggleSelectAll('source', checked)"
        />
        <span class="tx-transfer__title">{{ titles?.[0] ?? '' }}</span>
        <span class="tx-transfer__count">{{ sourceItems.length }}</span>
      </div>
      <div v-if="filterable" class="tx-transfer__filter">
        <TxInput v-model="leftFilter" :placeholder="filterPlaceholder" />
      </div>
      <div class="tx-transfer__list">
        <div v-if="filteredSource.length === 0" class="tx-transfer__empty">
          {{ sourceEmptyText }}
        </div>
        <label
          v-for="item in filteredSource"
          :key="item.key"
          class="tx-transfer__item"
          :class="{ 'is-disabled': item.disabled }"
          @dblclick="moveOne(item, 'add')"
        >
          <TxCheckbox
            :model-value="leftChecked.includes(item.key)"
            :disabled="item.disabled"
            :aria-label="item.label"
            @update:model-value="(checked) => (leftChecked = updateChecked(leftChecked, item.key, checked))"
          />
          <!-- The row text is exposed to AT through the checkbox's aria-label above;
               hide the visible copy so screen readers don't announce it twice. -->
          <span class="tx-transfer__label" aria-hidden="true">{{ item.label }}</span>
        </label>
      </div>
    </div>

    <div class="tx-transfer__actions">
      <TxButton
        size="sm"
        :variant="leftChecked.length > 0 ? 'primary' : 'secondary'"
        class="tx-transfer__action-btn"
        :class="{ 'is-armed': leftChecked.length > 0 }"
        :disabled="leftChecked.length === 0"
        :aria-label="addAriaLabel"
        @click="handleAdd"
      >
        <TxIcon class="tx-transfer__action-icon" name="chevron-right" :size="14" />
        <span v-if="leftChecked.length > 0" class="tx-transfer__action-count">{{
          leftChecked.length
        }}</span>
      </TxButton>
      <TxButton
        size="sm"
        :variant="rightChecked.length > 0 ? 'primary' : 'secondary'"
        class="tx-transfer__action-btn"
        :class="{ 'is-armed': rightChecked.length > 0 }"
        :disabled="rightChecked.length === 0"
        :aria-label="removeAriaLabel"
        @click="handleRemove"
      >
        <TxIcon class="tx-transfer__action-icon" name="chevron-left" :size="14" />
        <span v-if="rightChecked.length > 0" class="tx-transfer__action-count">{{
          rightChecked.length
        }}</span>
      </TxButton>
    </div>

    <div class="tx-transfer__panel">
      <div class="tx-transfer__panel-header">
        <TxCheckbox
          class="tx-transfer__select-all"
          :model-value="targetSelection.all"
          :indeterminate="targetSelection.some"
          :disabled="targetSelectableKeys.length === 0"
          :aria-label="`${selectAllAriaLabel}: ${titles?.[1] ?? ''}`"
          @update:model-value="(checked) => toggleSelectAll('target', checked)"
        />
        <span class="tx-transfer__title">{{ titles?.[1] ?? '' }}</span>
        <span class="tx-transfer__count">{{ targetItems.length }}</span>
      </div>
      <div v-if="filterable" class="tx-transfer__filter">
        <TxInput v-model="rightFilter" :placeholder="filterPlaceholder" />
      </div>
      <div class="tx-transfer__list">
        <div v-if="filteredTarget.length === 0" class="tx-transfer__empty">
          {{ targetEmptyText }}
        </div>
        <div v-for="item in filteredTarget" :key="item.key" class="tx-transfer__row">
          <label
            class="tx-transfer__item"
            :class="{ 'is-disabled': item.disabled }"
            @dblclick="moveOne(item, 'remove')"
          >
            <TxCheckbox
              :model-value="rightChecked.includes(item.key)"
              :disabled="item.disabled"
              :aria-label="item.label"
              @update:model-value="(checked) => (rightChecked = updateChecked(rightChecked, item.key, checked))"
            />
            <span v-if="orderable" class="tx-transfer__order" aria-hidden="true">
              {{ (targetIndexMap.get(item.key) ?? 0) + 1 }}
            </span>
            <!-- The row text is exposed to AT through the checkbox's aria-label above;
                 hide the visible copy so screen readers don't announce it twice. -->
            <span class="tx-transfer__label" aria-hidden="true">{{ item.label }}</span>
          </label>
          <div v-if="orderable" class="tx-transfer__row-actions">
            <TxButton
              variant="ghost"
              size="sm"
              :disabled="targetIndexMap.get(item.key) === 0"
              :aria-label="`${moveUpAriaLabel}: ${item.label}`"
              @click="moveTarget(item.key, -1)"
            >
              <TxIcon name="arrow-up" />
            </TxButton>
            <TxButton
              variant="ghost"
              size="sm"
              :disabled="targetIndexMap.get(item.key) === targetCount - 1"
              :aria-label="`${moveDownAriaLabel}: ${item.label}`"
              @click="moveTarget(item.key, 1)"
            >
              <TxIcon name="arrow-down" />
            </TxButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-transfer {
  display: flex;
  align-items: stretch;
  gap: 10px;
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
  /* A floor, so a filterable panel with two rows in it is still a panel — but a
     settable one. Hardcoded, it beat the host's own box: a transfer dropped into
     a 190px cell still laid out at 240px and spilled 50px past it. */
  min-height: var(--tx-transfer-min-height, 240px);
  /* Without a cap the panel grows with its content, the list never scrolls, and
     the surrounding page or dialog becomes the scroll container instead. */
  max-height: var(--tx-transfer-max-height, 320px);
  overflow: hidden;
}

.tx-transfer__panel-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
  font-size: 13px;
  font-weight: var(--tx-font-weight-semibold, 600);
  color: var(--tx-text-color-primary, #303133);
}

.tx-transfer__select-all {
  flex: none;
}

.tx-transfer__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-transfer__count {
  flex: none;
  font-size: 12px;
  font-weight: var(--tx-font-weight-medium, 500);
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-transfer__filter {
  flex: none;
  padding: 8px 12px;
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
}

.tx-transfer__list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tx-transfer__row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tx-transfer__row .tx-transfer__item {
  flex: 1;
  min-width: 0;
}

.tx-transfer__row-actions {
  flex: none;
  display: flex;
  gap: 2px;
}

.tx-transfer__order {
  flex: none;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--tx-fill-color-light, #f5f7fa);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: var(--tx-font-weight-semibold, 600);
  color: var(--tx-text-color-secondary, #909399);
}

.tx-transfer__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--tx-text-color-regular, #606266);
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
  /* `break-all` split at whatever character ran out of room — "Quick actions"
     wrapped as "Quick actio / ns". `anywhere` takes the space first and only
     breaks inside a word when a single word genuinely cannot fit. */
  overflow-wrap: anywhere;
}

.tx-transfer__actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

/* Drive TxButton through its own surface tokens (`--fake-color` / `--fake-opacity` /
   `--tx-button-border-color`): painting `background` directly on a `.fake-background`
   button sits underneath the 75% `::before` veil, washing solid primary blue into pale
   tint under white ink. */
.tx-transfer__action-btn {
  --tx-button-height: 30px;
  --tx-button-radius: 8px;
  --fake-radius: 8px;
  --fake-opacity: 1;
  --fake-index: -1;
  --fake-color: var(--tx-fill-color-blank, #ffffff);
  --tx-button-border-color: var(--tx-border-color-lighter, #ebeef5);
  --tx-button-bg-color-hover: transparent;
  min-width: 34px;
  height: 30px;
  padding: 0 8px;
  border-radius: 8px;
  background-color: transparent;
  color: var(--tx-text-color-secondary, #909399);
  transition:
    border-color 0.16s ease,
    color 0.16s ease,
    opacity 0.16s ease;

  :deep(.tx-button__inner) {
    --tx-button-gap: 3px;
    gap: 3px;
  }

  &:hover:not(:disabled) {
    --fake-color: var(--tx-fill-color-light, #f5f7fa);
    --tx-button-border-color: var(--tx-border-color, #dcdfe6);
    background-color: transparent;
    color: var(--tx-text-color-primary, #303133);
  }

  &.is-armed {
    --fake-color: var(--tx-color-primary-light-9, #ecf5ff);
    --tx-button-border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 48%, transparent);
    --tx-button-bg-color-hover: transparent;
    background-color: transparent;
    color: var(--tx-color-primary, #409eff);

    &:hover:not(:disabled) {
      --fake-color: var(--tx-color-primary-light-8, #d9ecff);
      --tx-button-border-color: var(--tx-color-primary, #409eff);
      background-color: transparent;
      color: var(--tx-color-primary, #409eff);
    }

    &:active:not(:disabled) {
      --fake-color: var(--tx-color-primary-light-7, #c6e2ff);
    }
  }

  &:disabled {
    opacity: 0.55;
    --fake-opacity: 1;
    --fake-index: -1;
  }
}

.tx-transfer__action-icon {
  flex: none;
}

.tx-transfer__action-count {
  font-size: 12px;
  font-weight: var(--tx-font-weight-semibold, 600);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.tx-transfer__empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

@media (max-width: 640px) {
  .tx-transfer {
    flex-direction: column;
    align-items: stretch;
  }

  .tx-transfer__actions {
    flex-direction: row;
    justify-content: center;
  }

  .tx-transfer__action-icon {
    transform: rotate(90deg);
  }
}
</style>
