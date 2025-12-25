<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import TxSearchInput from '../../search-input/src/TxSearchInput.vue'
import TxTag from '../../tag/src/TxTag.vue'
import TxCheckbox from '../../checkbox/src/TxCheckbox.vue'
import TxCardItem from '../../card-item/src/TxCardItem.vue'
import type { CascaderEmits, CascaderNode, CascaderPath, CascaderProps, CascaderValue } from './types'

defineOptions({ name: 'TxCascader' })

const props = withDefaults(defineProps<CascaderProps>(), {
  options: () => [],
  multiple: false,
  disabled: false,
  placeholder: '请选择',
  searchable: true,
  clearable: true,
  placement: 'bottom-start',
  dropdownOffset: 6,
  dropdownWidth: 360,
  dropdownMaxWidth: 520,
  dropdownMaxHeight: 340,
  expandTrigger: 'both',
  load: undefined,
})

const emit = defineEmits<CascaderEmits>()

const open = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const query = ref('')

const activePath = ref<CascaderPath>([])

const loadedChildren = ref(new Map<string, CascaderNode[]>())
const loadingKeys = ref(new Set<string>())

function pathKey(path: CascaderPath): string {
  return path.join('::')
}

function getChildren(node: CascaderNode | null, path: CascaderPath): CascaderNode[] {
  if (!node) return props.options
  if (Array.isArray(node.children) && node.children.length) return node.children
  const k = pathKey(path)
  return loadedChildren.value.get(k) ?? []
}

function isLeaf(node: CascaderNode, path: CascaderPath): boolean {
  if (node.leaf) return true
  const children = getChildren(node, path)
  if (children.length) return false
  return !props.load
}

async function ensureChildren(node: CascaderNode | null, path: CascaderPath, level: number) {
  if (!props.load) return
  if (!node) return
  if (node.leaf) return

  const direct = node.children
  if (Array.isArray(direct) && direct.length) return

  const k = pathKey(path)
  if (loadedChildren.value.has(k)) return
  if (loadingKeys.value.has(k)) return

  loadingKeys.value.add(k)
  try {
    const children = await props.load(node, level)
    loadedChildren.value.set(k, children)
  }
  finally {
    loadingKeys.value.delete(k)
  }
}

const selectedPaths = computed<CascaderPath[]>(() => {
  const v = props.modelValue
  if (props.multiple) return Array.isArray(v) ? (v as CascaderPath[]) : []
  return Array.isArray(v) ? [v as CascaderPath] : []
})

function samePath(a: CascaderPath, b: CascaderPath): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function setValue(v: CascaderValue) {
  emit('update:modelValue', v)
  emit('change', v)
}

function toggleSelect(path: CascaderPath) {
  if (props.disabled) return

  if (props.multiple) {
    const next = selectedPaths.value.slice()
    const idx = next.findIndex(p => samePath(p, path))
    if (idx >= 0) next.splice(idx, 1)
    else next.push(path)
    setValue(next)
    return
  }

  setValue(path)
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

function findNodeByPath(path: CascaderPath): CascaderNode | null {
  let current: CascaderNode | null = null
  let list = props.options
  for (let i = 0; i < path.length; i++) {
    const v = path[i]
    const n = list.find(x => x.value === v) ?? null
    if (!n) return null
    current = n
    list = getChildren(n, path.slice(0, i + 1))
  }
  return current
}

function formatPath(path: CascaderPath): string {
  const labels: string[] = []
  let list = props.options
  for (let i = 0; i < path.length; i++) {
    const v = path[i]
    const n = list.find(x => x.value === v)
    if (!n) break
    labels.push(n.label)
    list = getChildren(n, path.slice(0, i + 1))
  }
  return labels.join(' / ')
}

const displayText = computed(() => {
  if (props.multiple) return ''
  const v = props.modelValue
  const path = Array.isArray(v) ? (v as CascaderPath) : null
  if (!path || !path.length) return ''
  return formatPath(path)
})

const displayTags = computed(() => {
  if (!props.multiple) return []
  return selectedPaths.value.map(p => ({ key: pathKey(p), label: formatPath(p) }))
})

type ColumnItem = { node: CascaderNode; level: number; path: CascaderPath; leaf: boolean; loading: boolean }

const columns = computed<ColumnItem[][]>(() => {
  const out: ColumnItem[][] = []
  let list = props.options
  let current: CascaderNode | null = null

  for (let level = 0; level <= activePath.value.length; level++) {
    const column: ColumnItem[] = list.map((n) => {
      const p = [...activePath.value.slice(0, level), n.value]
      const k = pathKey(p)
      return {
        node: n,
        level,
        path: p,
        leaf: isLeaf(n, p),
        loading: loadingKeys.value.has(k),
      }
    })

    out.push(column)

    const nextVal = activePath.value[level]
    if (nextVal === undefined) break
    current = list.find(x => x.value === nextVal) ?? null
    if (!current) break

    const p = activePath.value.slice(0, level + 1)
    list = getChildren(current, p)

    if (!list.length) break
  }

  return out
})

async function onHoverItem(item: ColumnItem) {
  if (props.expandTrigger === 'click') return
  if (props.disabled || item.node.disabled) return
  if (item.leaf) return

  activePath.value = item.path
  if (!props.load) return
  if (item.leaf) return
  await ensureChildren(item.node, item.path, item.level + 1)
}

async function onPick(item: ColumnItem) {
  if (props.disabled || item.node.disabled) return

  if (item.leaf) {
    toggleSelect(item.path)
    return
  }

  if (props.expandTrigger === 'hover') {
    return
  }

  activePath.value = item.path
  await ensureChildren(item.node, item.path, item.level + 1)
}

type SearchHit = { key: string; path: CascaderPath; label: string; disabled: boolean; checked: boolean }

function walkPaths(list: CascaderNode[], prefix: CascaderPath, out: SearchHit[]) {
  for (const n of list) {
    const p = [...prefix, n.value]
    const k = pathKey(p)

    const kids = getChildren(n, p)
    const leaf = isLeaf(n, p)

    if (leaf) {
      out.push({
        key: k,
        path: p,
        label: formatPath(p),
        disabled: !!n.disabled,
        checked: selectedPaths.value.some(x => samePath(x, p)),
      })
    }

    if (kids.length) {
      walkPaths(kids, p, out)
    }
  }
}

const searchHits = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return [] as SearchHit[]

  const all: SearchHit[] = []
  walkPaths(props.options, [], all)
  return all.filter(h => h.label.toLowerCase().includes(q))
})

watch(
  open,
  async (v) => {
    emit(v ? 'open' : 'close')
    if (!v) {
      query.value = ''
      return
    }

    await nextTick()
    if (props.load && activePath.value.length) {
      const node = findNodeByPath(activePath.value)
      if (node) await ensureChildren(node, activePath.value, activePath.value.length)
    }
  },
  { flush: 'post' },
)

watch(
  () => props.modelValue,
  (v) => {
    if (props.multiple) return
    const path = Array.isArray(v) ? (v as CascaderPath) : []
    if (path.length) activePath.value = path
  },
  { immediate: true },
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
        class="tx-cascader"
        :class="{ 'is-open': open, 'is-disabled': disabled }"
        :tabindex="disabled ? -1 : 0"
        role="combobox"
        aria-haspopup="listbox"
        :aria-expanded="open"
        @keydown="onTriggerKeydown"
      >
        <div class="tx-cascader__value">
          <template v-if="multiple">
            <div v-if="displayTags.length" class="tx-cascader__tags">
              <TxTag v-for="t in displayTags" :key="t.key" :label="t.label" />
            </div>
            <span v-else class="tx-cascader__placeholder">{{ placeholder }}</span>
          </template>
          <template v-else>
            <span v-if="displayText" class="tx-cascader__text">{{ displayText }}</span>
            <span v-else class="tx-cascader__placeholder">{{ placeholder }}</span>
          </template>
        </div>

        <button
          v-if="clearable && !disabled && selectedPaths.length"
          type="button"
          class="tx-cascader__clear"
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

        <span class="tx-cascader__arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              fill="currentColor"
              d="M12 15.0006L7.75732 10.758L9.17154 9.34375L12 12.1722L14.8284 9.34375L16.2426 10.758L12 15.0006Z"
            />
          </svg>
        </span>
      </div>
    </template>

    <div class="tx-cascader__panel" role="listbox" :style="{ maxHeight: `${dropdownMaxHeight}px` }">
      <div v-if="searchable" class="tx-cascader__search">
        <TxSearchInput v-model="query" placeholder="Search" />
      </div>

      <div v-if="query.trim()" class="tx-cascader__search-list">
        <TxCardItem
          v-for="hit in searchHits"
          :key="hit.key"
          class="tx-cascader__search-item"
          :class="{ 'is-disabled': hit.disabled }"
          :clickable="!hit.disabled"
          :active="hit.checked"
          :disabled="hit.disabled"
          @click="toggleSelect(hit.path)"
        >
          <template v-if="multiple" #avatar>
            <TxCheckbox
              :model-value="hit.checked"
              :disabled="hit.disabled"
              aria-label="Select"
              @click.stop
              @update:model-value="() => toggleSelect(hit.path)"
            />
          </template>
          <template #title>
            <span class="tx-cascader__search-label">{{ hit.label }}</span>
          </template>
        </TxCardItem>
        <div v-if="!searchHits.length" class="tx-cascader__empty">No results</div>
      </div>

      <div v-else class="tx-cascader__columns">
        <div v-for="(col, idx) in columns" :key="idx" class="tx-cascader__col">
          <TxCardItem
            v-for="item in col"
            :key="pathKey(item.path)"
            class="tx-cascader__item"
            :class="{
              'is-disabled': item.node.disabled,
              'is-active': activePath[item.level] === item.node.value,
              'is-checked': selectedPaths.some(p => samePath(p, item.path)),
            }"
            @mouseenter="onHoverItem(item)"
            @click="onPick(item)"
            :clickable="!item.node.disabled"
            :disabled="!!item.node.disabled"
            :active="activePath[item.level] === item.node.value || selectedPaths.some(p => samePath(p, item.path))"
          >
            <template v-if="multiple && item.leaf" #avatar>
              <TxCheckbox
                :model-value="selectedPaths.some(p => samePath(p, item.path))"
                :disabled="!!item.node.disabled"
                aria-label="Select"
                @click.stop
                @update:model-value="() => toggleSelect(item.path)"
              />
            </template>

            <template #title>
              <span class="tx-cascader__label">{{ item.node.label }}</span>
            </template>

            <template #right>
              <span v-if="item.loading" class="tx-cascader__meta">Loading</span>
              <span v-else-if="!item.leaf" class="tx-cascader__meta">›</span>
            </template>
          </TxCardItem>
        </div>
      </div>
    </div>
  </TxPopover>
</template>

<style lang="scss" scoped>
.tx-cascader {
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

    .tx-cascader__arrow {
      transform: rotate(180deg);
    }
  }
}

.tx-cascader__panel {
  width: 100%;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tx-cascader__search {
  padding: 2px;
}

.tx-cascader__columns {
  display: flex;
  gap: 10px;
  overflow: auto;
  padding: 2px;
}

.tx-cascader__col {
  min-width: 180px;
  max-height: 260px;
  overflow: auto;
  border-right: 1px solid var(--tx-border-color-light, #e4e7ed);
  padding-right: 8px;

  &:last-child {
    border-right: none;
    padding-right: 0;
  }
}

.tx-cascader__item {
  --tx-card-item-padding: 6px 10px;
  --tx-card-item-radius: 10px;
  --tx-card-item-gap: 8px;
}

.tx-cascader__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tx-text-color-primary, #303133);
}

.tx-cascader__meta {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.tx-cascader__search-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: auto;
  padding: 2px;
}

.tx-cascader__search-item {
  --tx-card-item-padding: 6px 10px;
  --tx-card-item-radius: 10px;
  --tx-card-item-gap: 8px;
}

.tx-cascader__search-label {
  font-size: 14px;
  color: var(--tx-text-color-primary, #303133);
}

.tx-cascader__empty {
  padding: 10px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
