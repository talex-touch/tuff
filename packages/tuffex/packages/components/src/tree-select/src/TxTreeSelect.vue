<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import TuffInput from '../../input/src/TxInput.vue'
import TxCheckbox from '../../checkbox/src/TxCheckbox.vue'
import TxTag from '../../tag/src/TxTag.vue'
import type { TreeSelectEmits, TreeSelectKey, TreeSelectNode, TreeSelectProps, TreeSelectValue } from './types'

defineOptions({ name: 'TxTreeSelect' })

const props = withDefaults(defineProps<TreeSelectProps>(), {
  nodes: () => [],
  multiple: false,
  disabled: false,
  placeholder: '请选择',
  searchable: true,
  clearable: true,
  placement: 'bottom-start',
  dropdownOffset: 6,
  dropdownWidth: 0,
  dropdownMaxWidth: 480,
  dropdownMaxHeight: 320,
  defaultExpandedKeys: () => [],
})

const emit = defineEmits<TreeSelectEmits>()

const open = ref(false)
const query = ref('')
const triggerRef = ref<HTMLElement | null>(null)

const expanded = ref<Set<TreeSelectKey>>(new Set(props.defaultExpandedKeys))

function walk(nodes: TreeSelectNode[], cb: (n: TreeSelectNode) => void) {
  for (const n of nodes) {
    cb(n)
    if (n.children?.length) walk(n.children, cb)
  }
}

const labelMap = computed(() => {
  const m = new Map<TreeSelectKey, string>()
  walk(props.nodes, (n) => {
    m.set(n.key, n.label)
  })
  return m
})

const selectedKeys = computed<Set<TreeSelectKey>>(() => {
  const v = props.modelValue
  if (props.multiple) {
    const arr = Array.isArray(v) ? v : []
    return new Set(arr)
  }
  return typeof v === 'string' || typeof v === 'number' ? new Set([v]) : new Set()
})

const selectedLabels = computed(() => {
  const labels: string[] = []
  for (const k of selectedKeys.value) {
    const l = labelMap.value.get(k)
    if (l) labels.push(l)
  }
  return labels
})

function setValue(v: TreeSelectValue) {
  emit('update:modelValue', v)
  emit('change', v)
}

function toggleKey(key: TreeSelectKey) {
  if (props.disabled) return

  if (props.multiple) {
    const next = new Set(selectedKeys.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setValue(Array.from(next))
    return
  }

  setValue(key)
  open.value = false
}

function clear() {
  if (props.disabled) return
  setValue(props.multiple ? [] : undefined)
}

function onClearClick() {
  clear()
  open.value = false
}

function isChecked(node: TreeSelectNode) {
  return selectedKeys.value.has(node.key)
}

function isExpanded(node: TreeSelectNode) {
  return expanded.value.has(node.key)
}

function toggleExpand(node: TreeSelectNode) {
  if (!node.children?.length) return
  const next = new Set(expanded.value)
  if (next.has(node.key)) next.delete(node.key)
  else next.add(node.key)
  expanded.value = next
}

type FilterResult = { nodes: TreeSelectNode[]; expandKeys: Set<TreeSelectKey> }

function filterTree(nodes: TreeSelectNode[], q: string): FilterResult {
  const query = q.trim().toLowerCase()
  if (!query) return { nodes, expandKeys: new Set() }

  const expandKeys = new Set<TreeSelectKey>()

  const loop = (list: TreeSelectNode[], ancestors: TreeSelectKey[]): TreeSelectNode[] => {
    const out: TreeSelectNode[] = []
    for (const n of list) {
      const label = (n.label ?? '').toLowerCase()
      const selfMatch = label.includes(query)
      const kids = n.children?.length ? loop(n.children, [...ancestors, n.key]) : []
      const hit = selfMatch || kids.length > 0
      if (!hit) continue

      if (ancestors.length) ancestors.forEach(k => expandKeys.add(k))
      if (kids.length) expandKeys.add(n.key)

      out.push({ ...n, children: kids.length ? kids : n.children })
    }
    return out
  }

  return { nodes: loop(nodes, []), expandKeys }
}

const filtered = computed(() => filterTree(props.nodes, query.value))

const effectiveExpanded = computed(() => {
  if (query.value.trim()) {
    const next = new Set(expanded.value)
    filtered.value.expandKeys.forEach(k => next.add(k))
    return next
  }
  return expanded.value
})

type FlatItem = { node: TreeSelectNode; level: number; hasChildren: boolean; expanded: boolean }

function flatten(nodes: TreeSelectNode[], level: number, out: FlatItem[]) {
  for (const n of nodes) {
    const hasChildren = !!n.children?.length
    const exp = hasChildren && effectiveExpanded.value.has(n.key)
    out.push({ node: n, level, hasChildren, expanded: exp })
    if (hasChildren && exp) flatten(n.children || [], level + 1, out)
  }
}

const flatItems = computed(() => {
  const out: FlatItem[] = []
  flatten(filtered.value.nodes, 0, out)
  return out
})

watch(
  open,
  async (v) => {
    emit(v ? 'open' : 'close')
    if (v && props.searchable) {
      await nextTick()
    }
    if (!v) query.value = ''
  },
  { flush: 'post' },
)

function onTriggerKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    open.value = !open.value
  }
  if (e.key === 'Escape') {
    open.value = false
  }
}

defineExpose({
  open: () => (open.value = true),
  close: () => (open.value = false),
  toggle: () => (open.value = !open.value),
  focus: () => triggerRef.value?.focus?.(),
  blur: () => (triggerRef.value as any)?.blur?.(),
  clear,
  setValue,
  getValue: () => props.modelValue,
  getCheckedKeys: () => Array.from(selectedKeys.value),
})
</script>

<template>
  <TxPopover
    v-model="open"
    :disabled="disabled"
    :placement="placement"
    :offset="dropdownOffset"
    :width="dropdownWidth"
    :max-width="dropdownMaxWidth"
    :reference-full-width="true"
  >
    <template #reference>
      <div
        ref="triggerRef"
        class="tx-tree-select"
        :class="{ 'is-open': open, 'is-disabled': disabled }"
        :tabindex="disabled ? -1 : 0"
        role="combobox"
        aria-haspopup="listbox"
        :aria-expanded="open"
        @keydown="onTriggerKeydown"
      >
        <div class="tx-tree-select__value">
          <template v-if="multiple">
            <div v-if="selectedLabels.length" class="tx-tree-select__tags">
              <TxTag v-for="(l, i) in selectedLabels" :key="`${l}-${i}`" :label="l" />
            </div>
            <span v-else class="tx-tree-select__placeholder">{{ placeholder }}</span>
          </template>
          <template v-else>
            <span v-if="selectedLabels[0]" class="tx-tree-select__text">{{ selectedLabels[0] }}</span>
            <span v-else class="tx-tree-select__placeholder">{{ placeholder }}</span>
          </template>
        </div>

        <button
          v-if="clearable && !disabled && selectedKeys.size"
          type="button"
          class="tx-tree-select__clear"
          aria-label="Clear"
          @click.stop="onClearClick"
        >
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path
              fill="currentColor"
              d="M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95 1.414-1.414z"
            />
          </svg>
        </button>

        <span class="tx-tree-select__arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              fill="currentColor"
              d="M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z"
            />
          </svg>
        </span>
      </div>
    </template>

    <div class="tx-tree-select__panel" role="listbox" :style="{ maxHeight: `${dropdownMaxHeight}px` }">
      <div v-if="searchable" class="tx-tree-select__search">
        <TuffInput v-model="query" placeholder="Search" clearable />
      </div>

      <div class="tx-tree-select__list">
        <div
          v-for="item in flatItems"
          :key="item.node.key"
          class="tx-tree-select__item"
          :class="{ 'is-disabled': item.node.disabled, 'is-selected': isChecked(item.node) }"
          :style="{ paddingLeft: `${10 + item.level * 16}px` }"
          @click="!item.node.disabled && toggleKey(item.node.key)"
        >
          <button
            v-if="item.hasChildren"
            type="button"
            class="tx-tree-select__caret"
            :aria-label="item.expanded ? 'Collapse' : 'Expand'"
            @click.stop="toggleExpand(item.node)"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" :style="{ transform: item.expanded ? 'rotate(90deg)' : 'rotate(0deg)' }">
              <path fill="currentColor" d="M10 6l6 6-6 6" />
            </svg>
          </button>
          <span v-else class="tx-tree-select__caret-placeholder" aria-hidden="true" />

          <TxCheckbox
            v-if="multiple"
            :model-value="isChecked(item.node)"
            :disabled="!!item.node.disabled"
            aria-label="Select"
            @click.stop
            @update:model-value="() => toggleKey(item.node.key)"
          />

          <slot
            name="node"
            :node="item.node"
            :level="item.level"
            :expanded="item.expanded"
            :selected="isChecked(item.node)"
          >
            <span class="tx-tree-select__label">{{ item.node.label }}</span>
          </slot>
        </div>

        <div v-if="!flatItems.length" class="tx-tree-select__empty">No results</div>
      </div>
    </div>
  </TxPopover>
</template>

<style lang="scss" scoped>
.tx-tree-select {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
  min-width: 180px;
  min-height: 32px;
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  background: var(--tx-bg-color, #fff);
  box-sizing: border-box;
  cursor: pointer;
  transition: border-color 0.25s, box-shadow 0.25s;
  outline: none;

  &:hover:not(.is-disabled) {
    border-color: var(--tx-color-primary-light-3, #79bbff);
  }

  &:focus-visible:not(.is-disabled) {
    border-color: var(--tx-color-primary, #409eff);
    box-shadow: 0 0 0 3px var(--tx-color-primary-light-7, #c6e2ff);
  }

  &.is-disabled {
    background: var(--tx-disabled-bg-color, #f5f7fa);
    cursor: not-allowed;
    opacity: 0.7;
  }

  &__value {
    flex: 1;
    min-width: 0;
  }

  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  &__text {
    font-size: 14px;
    color: var(--tx-text-color-primary, #303133);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__placeholder {
    font-size: 14px;
    color: var(--tx-text-color-placeholder, #a8abb2);
  }

  &__clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    padding: 2px;
    margin-right: 4px;
    color: var(--tx-text-color-placeholder, #a8abb2);
    cursor: pointer;

    &:hover {
      color: var(--tx-text-color-secondary, #909399);
    }
  }

  &__arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--tx-text-color-secondary, #909399);
    transition: transform 0.2s ease;
  }

  &.is-open {
    border-color: var(--tx-color-primary, #409eff);

    .tx-tree-select__arrow {
      transform: rotate(180deg);
    }
  }
}

.tx-tree-select__panel {
  width: 100%;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tx-tree-select__search {
  padding: 2px;
}

.tx-tree-select__list {
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tx-tree-select__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 6px;
  padding-bottom: 6px;
  border-radius: 10px;
  user-select: none;
  cursor: pointer;
  color: var(--tx-text-color-primary, #303133);

  &:hover:not(.is-disabled) {
    background: var(--tx-fill-color-light, #f5f7fa);
  }

  &.is-selected {
    background: color-mix(in srgb, var(--tx-color-primary, #409eff) 10%, transparent);
  }

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }
}

.tx-tree-select__caret {
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

.tx-tree-select__caret-placeholder {
  width: 18px;
  height: 18px;
}

.tx-tree-select__label {
  font-size: 14px;
}

.tx-tree-select__empty {
  padding: 10px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
