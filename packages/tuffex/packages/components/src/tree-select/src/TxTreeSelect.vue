<script setup lang="ts">
import type { TreeSelectEmits, TreeSelectKey, TreeSelectNode, TreeSelectProps, TreeSelectValue } from './types'
import { computed, nextTick, ref, watch } from 'vue'
import TxCardItem from '../../card-item/src/TxCardItem.vue'
import TxCheckbox from '../../checkbox/src/TxCheckbox.vue'
import TuffInput from '../../input/src/TxInput.vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import TxTag from '../../tag/src/TxTag.vue'
import TxTree from '../../tree/src/TxTree.vue'

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

function walk(nodes: TreeSelectNode[], cb: (n: TreeSelectNode) => void) {
  for (const n of nodes) {
    cb(n)
    if (n.children?.length)
      walk(n.children, cb)
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
    if (l)
      labels.push(l)
  }
  return labels
})

function setValue(v: TreeSelectValue) {
  emit('update:modelValue', v)
  emit('change', v)
}

function clear() {
  if (props.disabled)
    return
  setValue(props.multiple ? [] : undefined)
}

function onClearClick() {
  clear()
  open.value = false
}

function onTreeUpdate(value: TreeSelectValue) {
  setValue(value)
  if (!props.multiple)
    open.value = false
}

watch(
  open,
  async (v) => {
    if (v)
      emit('open')
    else
      emit('close')
    if (v && props.searchable) {
      await nextTick()
    }
    if (!v)
      query.value = ''
  },
  { flush: 'post' },
)

function onTriggerKeydown(e: KeyboardEvent) {
  if (props.disabled)
    return
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
        <TxTree
          :nodes="nodes"
          :model-value="modelValue"
          :multiple="multiple"
          :checkable="multiple"
          :disabled="disabled"
          :default-expanded-keys="defaultExpandedKeys"
          :filter-text="query"
          :indent="16"
          @update:model-value="onTreeUpdate"
        >
          <template #item="{ node, level, hasChildren, expanded, selected, toggleExpand, toggleSelect, indent }">
            <TxCardItem
              class="tx-tree-select__item"
              :class="{ 'is-disabled': node.disabled, 'is-selected': selected }"
              :clickable="!node.disabled"
              :disabled="!!node.disabled"
              :active="selected"
              :style="{ paddingLeft: `${10 + level * indent}px` }"
              @click="toggleSelect()"
            >
              <template #avatar>
                <div class="tx-tree-select__left" @click.stop>
                  <button
                    v-if="hasChildren"
                    type="button"
                    class="tx-tree-select__caret"
                    :aria-label="expanded ? 'Collapse' : 'Expand'"
                    @click.stop="toggleExpand()"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" :style="{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }">
                      <path fill="currentColor" d="M10 6l6 6-6 6" />
                    </svg>
                  </button>
                  <span v-else class="tx-tree-select__caret-placeholder" aria-hidden="true" />

                  <TxCheckbox
                    v-if="multiple"
                    :model-value="selected"
                    :disabled="!!node.disabled"
                    aria-label="Select"
                    @click.stop
                    @update:model-value="() => toggleSelect()"
                  />
                </div>
              </template>

              <template #title>
                <slot
                  name="node"
                  :node="node"
                  :level="level"
                  :expanded="expanded"
                  :selected="selected"
                >
                  <span class="tx-tree-select__label">{{ node.label }}</span>
                </slot>
              </template>
            </TxCardItem>
          </template>

          <template #empty>
            <div class="tx-tree-select__empty">
              No results
            </div>
          </template>
        </TxTree>
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
  overflow: hidden;
}

.tx-tree-select__search {
  padding: 2px;
}

.tx-tree-select__list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tx-tree-select__item {
  --tx-card-item-padding: 6px 10px;
  --tx-card-item-radius: 10px;
  --tx-card-item-gap: 8px;
}

.tx-tree-select__left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
