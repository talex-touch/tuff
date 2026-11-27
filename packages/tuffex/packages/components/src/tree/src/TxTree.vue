<script setup lang="ts">
import type { ComponentPublicInstance, PropType } from 'vue'
import type { TxIconSource } from '../../icon'
import type { TreeFlatItem } from './context'
import type { TreeEmits, TreeKey, TreeNode, TreeValue } from './types'
import { computed, nextTick, provide, ref, watch } from 'vue'
import { useMorphWindow } from '../../../../utils/use-morph-window'
import { TREE_CONTEXT_KEY } from './context'
import TxTreeBranch from './TxTreeBranch.vue'

defineOptions({ name: 'TxTree' })

/**
 * Declared as a runtime object rather than `defineProps<TreeProps>()`. The SFC
 * compiler resolves the sibling `types.ts` once and does not redo it when that
 * file changes, so a prop added to the interface ships as an unknown attribute —
 * silently, with vitest and the built `dist` both still correct. `TreeProps`
 * stays the public type; this is the wiring.
 *
 * `modelValue` and `expandedKeys` default to `undefined` on purpose: that is how
 * the component tells "the host is driving this" from "nothing bound".
 */
const props = defineProps({
  nodes: { type: Array as PropType<TreeNode[]>, default: () => [] },
  modelValue: { type: [String, Number, Array] as PropType<TreeValue>, default: undefined },
  multiple: { type: Boolean, default: false },
  selectable: { type: Boolean, default: true },
  checkable: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  defaultExpandedKeys: { type: Array as PropType<TreeKey[]>, default: () => [] },
  defaultSelectedKeys: { type: Array as PropType<TreeKey[]>, default: undefined },
  expandedKeys: { type: Array as PropType<TreeKey[]>, default: undefined },
  indent: { type: Number, default: 16 },
  filterText: { type: String, default: undefined },
  filterMethod: { type: Function as PropType<(node: TreeNode, query: string) => boolean>, default: undefined },
  emptyText: { type: String, default: 'No results' },
  expandLabel: { type: String, default: 'Expand' },
  collapseLabel: { type: String, default: 'Collapse' },
  selectLabel: { type: String, default: 'Select' },
})

const emit = defineEmits<TreeEmits>()

const internalExpanded = ref(new Set<TreeKey>(props.defaultExpandedKeys ?? []))

watch(
  // Track the keys by value, not by array reference. Consumers routinely pass an
  // inline `:default-expanded-keys="[...]"` literal, so any unrelated parent
  // re-render produces a brand-new array; a reference watcher would then collapse
  // whatever the user had expanded. Same hazard TxDataTable guards for defaultSort.
  () => JSON.stringify(props.defaultExpandedKeys ?? []),
  () => {
    if (props.expandedKeys !== undefined)
      return
    internalExpanded.value = new Set(props.defaultExpandedKeys ?? [])
  },
)

const expandedSet = computed(() => {
  if (props.expandedKeys !== undefined)
    return new Set(props.expandedKeys)
  return internalExpanded.value
})

/**
 * Selection mirrors the expansion state above: the tree keeps its own unless the
 * host is driving it with `v-model`. Without this the set was derived purely
 * from `props.modelValue`, so a `<TxTree :nodes="…" />` with no binding emitted
 * `update:modelValue` into nothing and never showed a selection — the rows were
 * clickable and inert. `defaultSelectedKeys` seeds it, the way
 * `defaultExpandedKeys` seeds the other.
 */
const internalSelection = ref<TreeValue | undefined>(
  props.defaultSelectedKeys === undefined
    ? undefined
    : props.multiple
      ? [...props.defaultSelectedKeys]
      : props.defaultSelectedKeys[0],
)

watch(
  // Same array-identity hazard as `defaultExpandedKeys`: an inline literal is a
  // new array on every parent render, and a reference watcher would wipe the
  // user's selection on an unrelated re-render.
  () => JSON.stringify(props.defaultSelectedKeys ?? null),
  () => {
    if (props.modelValue !== undefined)
      return
    const seed = props.defaultSelectedKeys
    internalSelection.value = seed === undefined
      ? undefined
      : props.multiple
        ? [...seed]
        : seed[0]
  },
)

const selectedSet = computed(() => {
  const v = props.modelValue === undefined ? internalSelection.value : props.modelValue
  if (props.multiple) {
    const list = Array.isArray(v) ? v : []
    return new Set(list)
  }
  if (typeof v === 'string' || typeof v === 'number')
    return new Set([v])
  return new Set<TreeKey>()
})

// Selecting eases the row's tint; a hover repaints at once.
const morphing = useMorphWindow(() => [...selectedSet.value].join('\u0000'), 150)

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
  if (props.modelValue === undefined)
    internalSelection.value = value
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

function flatten(nodes: TreeNode[], level: number, out: TreeFlatItem[]) {
  // Each `nodes` array is one sibling group, so its length and index give the
  // aria-setsize / aria-posinset a screen reader needs to say "item N of M".
  const setSize = nodes.length
  nodes.forEach((node, index) => {
    const hasChildren = node.leaf === false || !!node.children?.length
    const expanded = hasChildren && effectiveExpanded.value.has(node.key)
    out.push({ node, level, hasChildren, expanded, posInSet: index + 1, setSize })
    if (hasChildren && expanded)
      flatten(node.children ?? [], level + 1, out)
  })
}

const flatItems = computed(() => {
  const out: TreeFlatItem[] = []
  flatten(filtered.value.nodes, 0, out)
  return out
})

const empty = computed(() => flatItems.value.length === 0)
const focusedKey = ref<TreeKey | null>(null)
const itemRefs = new Map<TreeKey, HTMLElement>()

function isItemDisabled(item: TreeFlatItem): boolean {
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

function handleItemFocus(item: TreeFlatItem): void {
  if (!isItemDisabled(item))
    focusedKey.value = item.node.key
}

function handleItemClick(item: TreeFlatItem): void {
  if (isItemDisabled(item))
    return
  focusedKey.value = item.node.key
  toggleSelect(item.node)
}

/** The tree's own scroller: the nearest ancestor that scrolls vertically, else the page. */
function scrollParent(element: HTMLElement): HTMLElement {
  for (let current = element.parentElement; current && current !== document.body && current !== document.documentElement; current = current.parentElement) {
    const { overflowY } = getComputedStyle(current)
    if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && current.scrollHeight > current.clientHeight)
      return current
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

/**
 * Brings a row into its scroller's view by the least distance. A plain
 * `focus()` or `scrollIntoView()` also scrolls every scroller around that one —
 * the page included — and centres the row rather than nudging it.
 */
function revealItem(element: HTMLElement): void {
  const scroller = scrollParent(element)
  const isPage = scroller === document.scrollingElement || scroller === document.documentElement
  const top = isPage ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop
  const bottom = top + (isPage ? document.documentElement.clientHeight : scroller.clientHeight)
  const row = element.getBoundingClientRect()
  if (row.top < top)
    scroller.scrollTop -= top - row.top
  else if (row.bottom > bottom)
    scroller.scrollTop += Math.min(row.bottom - bottom, row.top - top)
}

async function focusItem(item: TreeFlatItem | undefined): Promise<void> {
  if (!item || isItemDisabled(item))
    return
  focusedKey.value = item.node.key
  await nextTick()
  const element = itemRefs.get(item.node.key)
  if (!element)
    return
  element.focus({ preventScroll: true })
  revealItem(element)
}

/** A cut-off label shows its full text on hover; one that fits gets no tooltip. */
function syncLabelTitle(event: PointerEvent, label: string): void {
  const element = event.currentTarget as HTMLElement
  if (element.scrollWidth > element.clientWidth)
    element.title = label
  else
    element.removeAttribute('title')
}

function findChildItem(item: TreeFlatItem, index: number): TreeFlatItem | undefined {
  for (let current = index + 1; current < flatItems.value.length; current += 1) {
    const candidate = flatItems.value[current]
    if (!candidate || candidate.level <= item.level)
      return undefined
    if (!isItemDisabled(candidate))
      return candidate
  }
  return undefined
}

function findParentItem(item: TreeFlatItem, index: number): TreeFlatItem | undefined {
  for (let current = index - 1; current >= 0; current -= 1) {
    const candidate = flatItems.value[current]
    if (candidate && candidate.level < item.level && !isItemDisabled(candidate))
      return candidate
  }
  return undefined
}

async function handleItemKeydown(event: KeyboardEvent, item: TreeFlatItem): Promise<void> {
  if (event.target !== event.currentTarget || isItemDisabled(item))
    return

  const keyboardIndex = keyboardItems.value.findIndex(candidate => candidate.node.key === item.node.key)
  const flatIndex = flatItems.value.findIndex(candidate => candidate.node.key === item.node.key)

  switch (event.key) {
    case 'Enter':
    case ' ':
      // Space scrolls the page by default, so consume it whenever a treeitem holds
      // focus — even in a non-selectable tree. Enter has no scroll default and may
      // keep bubbling when selection is off.
      if (event.key === ' ')
        event.preventDefault()
      if (!props.selectable)
        return
      if (event.key === 'Enter')
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

provide(TREE_CONTEXT_KEY, {
  disabled: computed(() => props.disabled),
  selectable: computed(() => props.selectable),
  checkable: computed(() => props.checkable),
  indent: computed(() => props.indent ?? 16),
  expandLabel: computed(() => props.expandLabel),
  collapseLabel: computed(() => props.collapseLabel),
  selectLabel: computed(() => props.selectLabel),
  morphing,
  effectiveExpanded,
  selectedSet,
  tabStopKey,
  resolveIcon,
  setItemRef,
  handleItemFocus,
  handleItemClick,
  handleItemKeydown,
  toggleExpand,
  toggleSelect,
  syncLabelTitle,
})
</script>

<template>
  <div class="tx-tree" :class="{ 'is-morphing': morphing }" role="tree" :aria-multiselectable="multiple || undefined">
    <div v-if="empty" class="tx-tree__empty">
      <slot name="empty">
        {{ emptyText }}
      </slot>
    </div>
    <div v-else class="tx-tree__list" role="presentation">
      <TxTreeBranch
        v-for="(node, index) in filtered.nodes"
        :key="node.key"
        :node="node"
        :level="0"
        :pos-in-set="index + 1"
        :set-size="filtered.nodes.length"
      >
        <template v-if="$slots.item" #item="slotProps">
          <slot name="item" v-bind="slotProps" />
        </template>
      </TxTreeBranch>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* `min-width: 0` runs from the root down to the label: a long label is cut off
   with an ellipsis at the tree's edge instead of widening the tree past its
   container. The full text stays in the DOM for assistive technology. */
.tx-tree {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.tx-tree__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.tx-tree__empty {
  padding: 10px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 13px;
}
</style>
