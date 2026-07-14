<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { TxIconSource } from '../../icon'
import type { TreeEmits, TreeKey, TreeNode, TreeProps, TreeValue } from './types'
import { computed, nextTick, ref, watch } from 'vue'
import { TxCheckbox } from '../../checkbox'
import { TxIcon } from '../../icon'

defineOptions({ name: 'TxTree' })

const props = withDefaults(defineProps<TreeProps>(), {
  nodes: () => [],
  multiple: false,
  selectable: true,
  checkable: false,
  disabled: false,
  defaultExpandedKeys: () => [],
  indent: 16,
})

const emit = defineEmits<TreeEmits>()

const internalExpanded = ref(new Set<TreeKey>(props.defaultExpandedKeys ?? []))

watch(
  () => props.defaultExpandedKeys,
  (next) => {
    if (props.expandedKeys !== undefined)
      return
    internalExpanded.value = new Set(next ?? [])
  },
)

const expandedSet = computed(() => {
  if (props.expandedKeys !== undefined)
    return new Set(props.expandedKeys)
  return internalExpanded.value
})

const selectedSet = computed(() => {
  const v = props.modelValue
  if (props.multiple) {
    const list = Array.isArray(v) ? v : []
    return new Set(list)
  }
  if (typeof v === 'string' || typeof v === 'number')
    return new Set([v])
  return new Set<TreeKey>()
})

function resolveIcon(icon?: TreeNode['icon']): TxIconSource | undefined {
  if (!icon)
    return undefined
  if (typeof icon === 'string') {
    return { type: 'class', value: icon }
  }
  return icon
}

function setExpanded(next: Set<TreeKey>) {
  if (props.expandedKeys === undefined)
    internalExpanded.value = next
  emit('update:expandedKeys', Array.from(next))
}

function toggleExpand(node: TreeNode) {
  const hasChildren = node.leaf === false || !!node.children?.length
  if (!hasChildren)
    return
  const next = new Set(expandedSet.value)
  const isExpanded = next.has(node.key)
  if (isExpanded)
    next.delete(node.key)
  else next.add(node.key)
  setExpanded(next)
  emit('toggle', { key: node.key, expanded: !isExpanded })
}

function emitSelection(value: TreeValue, node: TreeNode) {
  emit('update:modelValue', value)
  emit('select', { key: node.key, node })
}

function toggleSelect(node: TreeNode) {
  if (!props.selectable || props.disabled || node.disabled)
    return
  if (props.multiple) {
    const next = new Set(selectedSet.value)
    if (next.has(node.key))
      next.delete(node.key)
    else next.add(node.key)
    emitSelection(Array.from(next), node)
    return
  }
  emitSelection(node.key, node)
}

function filterTree(nodes: TreeNode[], rawQuery: string): { nodes: TreeNode[], expandKeys: Set<TreeKey> } {
  const query = rawQuery.trim()
  if (!query)
    return { nodes, expandKeys: new Set() }
  const lowered = query.toLowerCase()
  const expandKeys = new Set<TreeKey>()
  const match = props.filterMethod
  const defaultMatch = (node: TreeNode, q: string) => (node.label ?? '').toLowerCase().includes(q)

  const loop = (list: TreeNode[], ancestors: TreeKey[]): TreeNode[] => {
    const out: TreeNode[] = []
    for (const node of list) {
      const selfMatch = match ? match(node, query) : defaultMatch(node, lowered)
      const children = node.children?.length ? loop(node.children, [...ancestors, node.key]) : []
      const hit = selfMatch || children.length > 0
      if (!hit)
        continue
      if (ancestors.length)
        ancestors.forEach(k => expandKeys.add(k))
      if (children.length)
        expandKeys.add(node.key)
      out.push({ ...node, children: children.length ? children : node.children })
    }
    return out
  }

  return { nodes: loop(nodes, []), expandKeys }
}

const filtered = computed(() => filterTree(props.nodes, props.filterText ?? ''))

const effectiveExpanded = computed(() => {
  if (!props.filterText?.trim())
    return expandedSet.value
  const next = new Set(expandedSet.value)
  filtered.value.expandKeys.forEach(k => next.add(k))
  return next
})

interface FlatItem {
  node: TreeNode
  level: number
  hasChildren: boolean
  expanded: boolean
}

function flatten(nodes: TreeNode[], level: number, out: FlatItem[]) {
  for (const node of nodes) {
    const hasChildren = node.leaf === false || !!node.children?.length
    const expanded = hasChildren && effectiveExpanded.value.has(node.key)
    out.push({ node, level, hasChildren, expanded })
    if (hasChildren && expanded)
      flatten(node.children ?? [], level + 1, out)
  }
}

const flatItems = computed(() => {
  const out: FlatItem[] = []
  flatten(filtered.value.nodes, 0, out)
  return out
})

const empty = computed(() => flatItems.value.length === 0)
const focusedKey = ref<TreeKey | null>(null)
const itemRefs = new Map<TreeKey, HTMLElement>()

function isItemDisabled(item: FlatItem): boolean {
  return props.disabled || !!item.node.disabled
}

const keyboardItems = computed(() => flatItems.value.filter(item => !isItemDisabled(item)))

const tabStopKey = computed<TreeKey | null>(() => {
  if (focusedKey.value !== null && keyboardItems.value.some(item => item.node.key === focusedKey.value))
    return focusedKey.value

  const selectedItem = keyboardItems.value.find(item => selectedSet.value.has(item.node.key))
  return selectedItem?.node.key ?? keyboardItems.value[0]?.node.key ?? null
})

function setItemRef(key: TreeKey, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLElement)
    itemRefs.set(key, element)
  else
    itemRefs.delete(key)
}

function handleItemFocus(item: FlatItem): void {
  if (!isItemDisabled(item))
    focusedKey.value = item.node.key
}

function handleItemClick(item: FlatItem): void {
  if (isItemDisabled(item))
    return
  focusedKey.value = item.node.key
  toggleSelect(item.node)
}

async function focusItem(item: FlatItem | undefined): Promise<void> {
  if (!item || isItemDisabled(item))
    return
  focusedKey.value = item.node.key
  await nextTick()
  itemRefs.get(item.node.key)?.focus()
}

function findChildItem(item: FlatItem, index: number): FlatItem | undefined {
  for (let current = index + 1; current < flatItems.value.length; current += 1) {
    const candidate = flatItems.value[current]
    if (!candidate || candidate.level <= item.level)
      return undefined
    if (!isItemDisabled(candidate))
      return candidate
  }
  return undefined
}

function findParentItem(item: FlatItem, index: number): FlatItem | undefined {
  for (let current = index - 1; current >= 0; current -= 1) {
    const candidate = flatItems.value[current]
    if (candidate && candidate.level < item.level && !isItemDisabled(candidate))
      return candidate
  }
  return undefined
}

async function handleItemKeydown(event: KeyboardEvent, item: FlatItem): Promise<void> {
  if (event.target !== event.currentTarget || isItemDisabled(item))
    return

  const keyboardIndex = keyboardItems.value.findIndex(candidate => candidate.node.key === item.node.key)
  const flatIndex = flatItems.value.findIndex(candidate => candidate.node.key === item.node.key)

  switch (event.key) {
    case 'Enter':
    case ' ':
      if (!props.selectable)
        return
      event.preventDefault()
      toggleSelect(item.node)
      return
    case 'ArrowDown':
      event.preventDefault()
      await focusItem(keyboardItems.value[keyboardIndex + 1])
      return
    case 'ArrowUp':
      event.preventDefault()
      await focusItem(keyboardItems.value[keyboardIndex - 1])
      return
    case 'Home':
      event.preventDefault()
      await focusItem(keyboardItems.value[0])
      return
    case 'End':
      event.preventDefault()
      await focusItem(keyboardItems.value.at(-1))
      return
    case 'ArrowRight':
      event.preventDefault()
      if (!item.hasChildren)
        return
      if (!item.expanded) {
        toggleExpand(item.node)
        return
      }
      await focusItem(findChildItem(item, flatIndex))
      return
    case 'ArrowLeft':
      event.preventDefault()
      if (item.hasChildren && item.expanded) {
        toggleExpand(item.node)
        return
      }
      await focusItem(findParentItem(item, flatIndex))
  }
}

function itemPadding(level: number): string {
  return `${level * (props.indent ?? 16)}px`
}
</script>

<template>
  <div class="tx-tree" role="tree" :aria-multiselectable="multiple || undefined">
    <div v-if="empty" class="tx-tree__empty">
      <slot name="empty">
        No results
      </slot>
    </div>
    <div v-else class="tx-tree__list">
      <div
        v-for="item in flatItems"
        :key="item.node.key"
        :ref="element => setItemRef(item.node.key, element)"
        class="tx-tree__item"
        :style="{ paddingLeft: itemPadding(item.level) }"
        role="treeitem"
        :tabindex="isItemDisabled(item) ? -1 : (tabStopKey === item.node.key ? 0 : -1)"
        :aria-level="item.level + 1"
        :aria-expanded="item.hasChildren ? item.expanded : undefined"
        :aria-selected="selectable ? selectedSet.has(item.node.key) : undefined"
        :aria-disabled="isItemDisabled(item) || undefined"
        @focus="handleItemFocus(item)"
        @click="handleItemClick(item)"
        @keydown="handleItemKeydown($event, item)"
      >
        <slot
          name="item"
          :node="item.node"
          :level="item.level"
          :expanded="item.expanded"
          :has-children="item.hasChildren"
          :selected="selectedSet.has(item.node.key)"
          :toggle-expand="() => toggleExpand(item.node)"
          :toggle-select="() => toggleSelect(item.node)"
          :indent="props.indent ?? 16"
        >
          <div
            class="tx-tree__row"
            :class="{ 'is-selected': selectedSet.has(item.node.key), 'is-disabled': props.disabled || item.node.disabled }"
          >
            <button
              v-if="item.hasChildren"
              type="button"
              class="tx-tree__caret"
              tabindex="-1"
              :aria-label="item.expanded ? 'Collapse' : 'Expand'"
              @click.stop="toggleExpand(item.node)"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" :style="{ transform: item.expanded ? 'rotate(90deg)' : 'rotate(0deg)' }">
                <path fill="currentColor" d="M10 6l6 6-6 6" />
              </svg>
            </button>
            <span v-else class="tx-tree__caret-placeholder" aria-hidden="true" />

            <TxCheckbox
              v-if="checkable"
              :model-value="selectedSet.has(item.node.key)"
              :disabled="props.disabled || item.node.disabled"
              aria-label="Select"
              tabindex="-1"
              @click.stop
              @update:model-value="() => toggleSelect(item.node)"
            />

            <TxIcon v-if="item.node.icon" :icon="resolveIcon(item.node.icon)" :size="16" />

            <span class="tx-tree__label">{{ item.node.label }}</span>
          </div>
        </slot>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-tree {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.tx-tree__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tx-tree__item {
  width: 100%;
  border-radius: 10px;
  outline: none;
}

.tx-tree__item:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 24%, transparent);
}

.tx-tree__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--tx-text-color-primary, #303133);
  transition: background 150ms ease;
}

.tx-tree__row.is-selected {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
}

.tx-tree__row.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tx-tree__row:hover:not(.is-disabled) {
  background: color-mix(in srgb, var(--tx-fill-color, #f5f7fa) 70%, transparent);
}

.tx-tree__caret {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-tree__caret-placeholder {
  width: 18px;
  height: 18px;
}

.tx-tree__label {
  font-size: 14px;
}

.tx-tree__empty {
  padding: 10px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 13px;
}
</style>
