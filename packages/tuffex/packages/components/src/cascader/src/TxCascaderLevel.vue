<script setup lang="ts">
import type { CascaderNode, CascaderPath } from './types'
import { computed, inject, nextTick, onMounted, reactive, ref } from 'vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import { CASCADER_CONTEXT } from './context'
import TxCascaderRow from './TxCascaderRow.vue'

/**
 * One level of the cascade, rendered as its own list.
 *
 * A branch row is the reference of a popover whose panel holds the next level,
 * so the tree renders as a chain of panels anchored to the row that opened each
 * one, instead of one panel holding every column side by side. The anchor-delay
 * service links a child panel to the panel it opened from (component-tree
 * provide/inject), so hover travel between them, the outside-click exemption
 * and cascading close all come from the family plumbing — the same arrangement
 * `TxDropdownSubmenu` uses.
 *
 * The component references itself for the next level; only branch panels that
 * have actually been opened are ever mounted.
 */
defineOptions({ name: 'TxCascaderLevel' })

const props = withDefaults(defineProps<{
  nodes: CascaderNode[]
  parentPath?: CascaderPath
  level?: number
  /** Set when a parent opened this level from the keyboard: focus lands on row one. */
  autofocus?: boolean
}>(), {
  parentPath: () => [],
  level: 0,
  autofocus: false,
})

const emit = defineEmits<{
  /** ArrowLeft: hand control back to the row that opened this level. */
  (e: 'close'): void
}>()

const ctx = inject(CASCADER_CONTEXT)!

interface LevelRow {
  key: string
  node: CascaderNode
  path: CascaderPath
  leaf: boolean
  loading: boolean
  checked: boolean
  active: boolean
  children: CascaderNode[]
}

const rows = computed<LevelRow[]>(() => props.nodes.map((node) => {
  const path = [...props.parentPath, node.value]
  return {
    key: ctx.pathKey(path),
    node,
    path,
    leaf: ctx.isLeaf(node, path),
    loading: ctx.isLoading(path),
    checked: ctx.isChecked(path),
    active: ctx.isOnActivePath(path),
    children: ctx.childrenOf(node, path),
  }
}))

const openRows = reactive<Record<string, boolean>>({})
/** Which branches were opened by keyboard, so only those steal focus. */
const keyboardRows = reactive<Record<string, boolean>>({})

const branchTrigger = computed(() => (ctx.expandTrigger() === 'click' ? 'click' : 'hover'))

function isBranchDisabled(row: LevelRow): boolean {
  return ctx.disabled() || !!row.node.disabled
}

function onBranchOpenChange(row: LevelRow, next: boolean): void {
  if (next && isBranchDisabled(row))
    return

  openRows[row.key] = next

  if (!next) {
    keyboardRows[row.key] = false
    return
  }

  ctx.setActivePath(row.path)
  void ctx.ensureChildren(row.node, row.path, props.level + 1)
}

function openBranch(row: LevelRow, viaKeyboard = false): void {
  if (isBranchDisabled(row))
    return
  keyboardRows[row.key] = viaKeyboard
  onBranchOpenChange(row, true)
}

function onPick(row: LevelRow): void {
  if (isBranchDisabled(row))
    return
  if (row.leaf) {
    ctx.select(row.path)
    return
  }
  // A branch's action is to expand. Under `hover` the popover already owns
  // opening, but a click on the row must not be a dead spot.
  openBranch(row)
}

const listRef = ref<HTMLElement | null>(null)

/**
 * Rows belonging to this level only. Child panels are teleported out of this
 * subtree in the browser, but under a test stub they render inline, so the
 * ownership check is what keeps a nested row out of this level's roving focus.
 */
function ownRows(): HTMLElement[] {
  if (!listRef.value)
    return []
  return Array.from(listRef.value.querySelectorAll<HTMLElement>('[data-cascader-row]'))
    .filter(el => el.closest('[data-cascader-level]') === listRef.value)
    .filter(el => el.getAttribute('aria-disabled') !== 'true')
}

function rowOf(element: HTMLElement | null): LevelRow | undefined {
  const key = element?.dataset.rowKey
  return key ? rows.value.find(row => row.key === key) : undefined
}

function focusRow(index: number): void {
  const items = ownRows()
  if (!items.length)
    return
  const bounded = (index + items.length) % items.length
  items[bounded]?.focus()
}

function closeBranch(row: LevelRow): void {
  openRows[row.key] = false
  keyboardRows[row.key] = false
  void nextTick(() => {
    ownRows().find(el => el.dataset.rowKey === row.key)?.focus()
  })
}

function onKeydown(event: KeyboardEvent): void {
  const items = ownRows()
  if (!items.length)
    return

  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  // A keydown inside a child panel bubbles through this handler under a test
  // stub; the child owns those keys.
  if (active && !items.includes(active))
    return

  const index = active ? items.indexOf(active) : -1

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const direction = event.key === 'ArrowDown' ? 1 : -1
    focusRow(index < 0 ? (direction > 0 ? 0 : items.length - 1) : index + direction)
    return
  }

  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    focusRow(event.key === 'Home' ? 0 : items.length - 1)
    return
  }

  if (event.key === 'ArrowRight') {
    const row = rowOf(active)
    if (!row || row.leaf)
      return
    event.preventDefault()
    openBranch(row, true)
    return
  }

  if (event.key === 'ArrowLeft' && props.level > 0) {
    event.preventDefault()
    emit('close')
  }
}

onMounted(async () => {
  if (!props.autofocus)
    return
  await nextTick()
  focusRow(0)
})
</script>

<template>
  <div
    ref="listRef"
    class="tx-cascader__level"
    data-cascader-level
    role="listbox"
    @keydown="onKeydown"
  >
    <template v-for="row in rows" :key="row.key">
      <TxPopover
        v-if="!row.leaf"
        class="tx-cascader__branch"
        :model-value="!!openRows[row.key]"
        :trigger="branchTrigger"
        :disabled="isBranchDisabled(row)"
        placement="right-start"
        :offset="6"
        :min-width="ctx.panelMinWidth()"
        :max-width="ctx.panelMaxWidth()"
        :max-height="ctx.panelMaxHeight()"
        :match-reference-width="false"
        reference-full-width
        :show-arrow="false"
        :panel-padding="6"
        :panel-radius="14"
        @update:model-value="value => onBranchOpenChange(row, value)"
      >
        <template #reference>
          <TxCascaderRow
            :node="row.node"
            :path="row.path"
            :row-key="row.key"
            :leaf="false"
            :loading="row.loading"
            :checked="row.checked"
            :active="row.active"
            :expanded="!!openRows[row.key]"
            @pick="onPick(row)"
          />
        </template>

        <div class="tx-cascader__branch-panel">
          <div v-if="row.loading" class="tx-cascader__empty">
            Loading
          </div>
          <TxCascaderLevel
            v-else-if="row.children.length"
            :nodes="row.children"
            :parent-path="row.path"
            :level="level + 1"
            :autofocus="!!keyboardRows[row.key]"
            @close="closeBranch(row)"
          />
          <div v-else class="tx-cascader__empty">
            No results
          </div>
        </div>
      </TxPopover>

      <TxCascaderRow
        v-else
        :node="row.node"
        :path="row.path"
        :row-key="row.key"
        leaf
        :loading="row.loading"
        :checked="row.checked"
        :active="row.active"
        @pick="onPick(row)"
      />
    </template>
  </div>
</template>

<style lang="scss" scoped>
.tx-cascader__level {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

// The popover wrapper sits between the level and its row, so it has to pass the
// row's full width through instead of shrinking to fit.
.tx-cascader__branch {
  display: block;
  min-width: 0;
}

.tx-cascader__branch-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tx-cascader__empty {
  padding: 10px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
