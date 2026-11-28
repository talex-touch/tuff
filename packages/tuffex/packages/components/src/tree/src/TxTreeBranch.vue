<script setup lang="ts">
import type { PropType } from 'vue'
import type { TreeFlatItem, TreeItemSlotProps } from './context'
import type { TreeNode } from './types'
import { computed, inject } from 'vue'
import { TxCheckbox } from '../../checkbox'
import { TxIcon } from '../../icon'
import { TREE_CONTEXT_KEY } from './context'

defineOptions({ name: 'TxTreeBranch' })

defineSlots<{
  item?: (props: TreeItemSlotProps) => unknown
}>()

const props = defineProps({
  node: { type: Object as PropType<TreeNode>, required: true },
  level: { type: Number, required: true },
  posInSet: { type: Number, required: true },
  setSize: { type: Number, required: true },
})

const ctx = inject(TREE_CONTEXT_KEY)!

const childNodes = computed(() => props.node.children ?? [])
const hasChildren = computed(() => props.node.leaf === false || childNodes.value.length > 0)
const expanded = computed(() => hasChildren.value && ctx.effectiveExpanded.value.has(props.node.key))
const selected = computed(() => ctx.selectedSet.value.has(props.node.key))
const isDisabled = computed(() => ctx.disabled.value || !!props.node.disabled)

const flatItem = computed<TreeFlatItem>(() => ({
  node: props.node,
  level: props.level,
  hasChildren: hasChildren.value,
  expanded: expanded.value,
  posInSet: props.posInSet,
  setSize: props.setSize,
}))

const rowPaddingLeft = computed(() => `${10 + props.level * ctx.indent.value}px`)

function toggleExpand() {
  ctx.toggleExpand(props.node)
}

function toggleSelect() {
  ctx.toggleSelect(props.node)
}

// CSS cannot tween height:0 ↔ height:auto, so drive subtree height in JS just
// like TxCollapseItem, while preserving current height on mid-flight reversals.
function onBeforeEnter(el: Element) {
  const node = el as HTMLElement
  if (!node.style.height)
    node.style.height = '0px'
  node.style.overflow = 'hidden'
}

function onEnter(el: Element) {
  const node = el as HTMLElement
  void node.offsetHeight
  node.style.height = `${node.scrollHeight}px`
}

function onAfterEnter(el: Element) {
  const node = el as HTMLElement
  node.style.height = ''
  node.style.overflow = ''
}

function onEnterCancelled(el: Element) {
  const node = el as HTMLElement
  node.style.height = `${node.getBoundingClientRect().height}px`
  node.style.overflow = 'hidden'
}

function onBeforeLeave(el: Element) {
  const node = el as HTMLElement
  if (!node.style.height)
    node.style.height = `${node.getBoundingClientRect().height || node.scrollHeight}px`
  node.style.overflow = 'hidden'
}

function onLeave(el: Element) {
  const node = el as HTMLElement
  void node.offsetHeight
  node.style.height = '0px'
}

function onAfterLeave(el: Element) {
  const node = el as HTMLElement
  node.style.height = ''
  node.style.overflow = ''
}

function onLeaveCancelled(el: Element) {
  const node = el as HTMLElement
  node.style.height = `${node.getBoundingClientRect().height}px`
  node.style.overflow = 'hidden'
}
</script>

<template>
  <div class="tx-tree__branch" role="presentation">
    <div
      :ref="element => ctx.setItemRef(node.key, element)"
      class="tx-tree__item"
      role="treeitem"
      :tabindex="isDisabled ? -1 : (ctx.tabStopKey.value === node.key ? 0 : -1)"
      :aria-level="level + 1"
      :aria-setsize="setSize"
      :aria-posinset="posInSet"
      :aria-expanded="hasChildren ? expanded : undefined"
      :aria-selected="ctx.selectable.value ? selected : undefined"
      :aria-disabled="isDisabled || undefined"
      @focus="ctx.handleItemFocus(flatItem)"
      @click="ctx.handleItemClick(flatItem)"
      @keydown="ctx.handleItemKeydown($event, flatItem)"
    >
      <slot
        name="item"
        :node="node"
        :level="level"
        :expanded="expanded"
        :has-children="hasChildren"
        :selected="selected"
        :toggle-expand="toggleExpand"
        :toggle-select="toggleSelect"
        :indent="ctx.indent.value"
      >
        <div
          class="tx-tree__row"
          :class="{ 'is-selected': selected, 'is-disabled': isDisabled, 'is-morphing': ctx.morphing.value }"
          :style="{ paddingLeft: rowPaddingLeft }"
        >
          <button
            v-if="hasChildren"
            type="button"
            class="tx-tree__caret"
            :class="{ 'is-expanded': expanded }"
            tabindex="-1"
            :aria-label="expanded ? ctx.collapseLabel.value : ctx.expandLabel.value"
            @click.stop="toggleExpand"
          >
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path fill="currentColor" d="M10 6l6 6-6 6" />
            </svg>
          </button>
          <span v-else class="tx-tree__caret-placeholder" aria-hidden="true" />

          <TxCheckbox
            v-if="ctx.checkable.value"
            :model-value="selected"
            :disabled="isDisabled"
            :aria-label="ctx.selectLabel.value"
            tabindex="-1"
            @click.stop
            @update:model-value="toggleSelect"
          />

          <TxIcon v-if="node.icon" :icon="ctx.resolveIcon(node.icon)" :size="16" />

          <span class="tx-tree__label" @pointerenter="ctx.syncLabelTitle($event, node.label)">{{ node.label }}</span>
        </div>
      </slot>
    </div>

    <Transition
      name="tx-tree-children"
      @before-enter="onBeforeEnter"
      @enter="onEnter"
      @after-enter="onAfterEnter"
      @enter-cancelled="onEnterCancelled"
      @before-leave="onBeforeLeave"
      @leave="onLeave"
      @after-leave="onAfterLeave"
      @leave-cancelled="onLeaveCancelled"
    >
      <div
        v-if="hasChildren && expanded && childNodes.length > 0"
        class="tx-tree__children"
        role="group"
      >
        <div class="tx-tree__children-inner" role="presentation">
          <TxTreeBranch
            v-for="(child, index) in childNodes"
            :key="child.key"
            :node="child"
            :level="level + 1"
            :pos-in-set="index + 1"
            :set-size="childNodes.length"
          >
            <template v-if="$slots.item" #item="slotProps">
              <slot name="item" v-bind="slotProps" />
            </template>
          </TxTreeBranch>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.tx-tree__branch {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
}

.tx-tree__item {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
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
  min-width: 0;
  padding: 6px 10px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--tx-text-color-primary, #303133);
}

.tx-tree__row > :not(.tx-tree__label) {
  flex-shrink: 0;
}

.tx-tree__row.is-morphing {
  transition: background 150ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-tree__row.is-selected {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
}

.tx-tree__row.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* `:hover:not(.is-disabled)` is (0,3,0) and `.is-selected` is (0,2,0), so
   hovering a selected row used to swap its accent for the neutral hover grey —
   the row looked deselected exactly while you were pointing at it. Excluding
   the selected row here, and giving it its own hover shade, keeps the accent. */
.tx-tree__row:hover:not(.is-disabled):not(.is-selected) {
  background: color-mix(in srgb, var(--tx-fill-color, #f5f7fa) 70%, transparent);
}

.tx-tree__row.is-selected:hover:not(.is-disabled) {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 20%, transparent);
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

  svg {
    transition: transform 0.24s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
  }

  &.is-expanded svg {
    transform: rotate(90deg);
  }
}

.tx-tree__caret-placeholder {
  width: 18px;
  height: 18px;
}

.tx-tree__label {
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-tree__children {
  min-width: 0;
}

.tx-tree__children-inner {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
  min-width: 0;
}

.tx-tree-children-enter-active,
.tx-tree-children-leave-active {
  overflow: hidden;
  transition: height 0.26s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
}

.tx-tree-children-enter-active > .tx-tree__children-inner,
.tx-tree-children-leave-active > .tx-tree__children-inner {
  transition:
    opacity 0.22s ease,
    transform 0.26s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
}

.tx-tree-children-enter-from > .tx-tree__children-inner,
.tx-tree-children-leave-to > .tx-tree__children-inner {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .tx-tree__caret svg,
  .tx-tree-children-enter-active,
  .tx-tree-children-leave-active,
  .tx-tree-children-enter-active > .tx-tree__children-inner,
  .tx-tree-children-leave-active > .tx-tree__children-inner {
    transition-duration: 0.01ms;
  }

  .tx-tree-children-enter-from > .tx-tree__children-inner,
  .tx-tree-children-leave-to > .tx-tree__children-inner {
    transform: none;
  }
}
</style>
