<script setup lang="ts">
import type { CascaderNode, CascaderPath } from './types'
import { inject } from 'vue'
import TxCardItem from '../../card-item/src/TxCardItem.vue'
import TxCheckbox from '../../checkbox/src/TxCheckbox.vue'
import { CASCADER_CONTEXT } from './context'

/**
 * One option row. Split out from the level because a branch row is rendered
 * into a popover's reference slot and a leaf row is rendered plainly — one
 * component keeps those two paths from drifting into two different-looking
 * rows, and keeps a popover instance off every leaf.
 */
defineOptions({ name: 'TxCascaderRow' })

const props = defineProps<{
  node: CascaderNode
  path: CascaderPath
  rowKey: string
  leaf: boolean
  loading: boolean
  checked: boolean
  active: boolean
  /** Branch rows only: reflected as `aria-expanded`. */
  expanded?: boolean
}>()

const emit = defineEmits<{
  (e: 'pick'): void
}>()

const ctx = inject(CASCADER_CONTEXT)!
</script>

<template>
  <TxCardItem
    class="tx-cascader__item"
    :class="{ 'is-disabled': node.disabled, 'is-active': active, 'is-checked': checked }"
    role="option"
    :tabindex="-1"
    :data-row-key="props.rowKey"
    data-cascader-row
    :clickable="!node.disabled"
    :disabled="!!node.disabled"
    :active="active || checked"
    :aria-selected="checked"
    :aria-haspopup="leaf ? undefined : 'listbox'"
    :aria-expanded="leaf ? undefined : (expanded ? 'true' : 'false')"
    @click="emit('pick')"
  >
    <template v-if="ctx.multiple() && leaf" #avatar>
      <TxCheckbox
        :model-value="checked"
        :disabled="!!node.disabled"
        aria-label="Select"
        @click.stop
        @update:model-value="() => ctx.select(props.path)"
      />
    </template>

    <template #title>
      <span class="tx-cascader__label">{{ node.label }}</span>
    </template>

    <template #right>
      <span v-if="loading" class="tx-cascader__meta">Loading</span>
      <span v-else-if="!leaf" class="tx-cascader__meta tx-cascader__chevron" aria-hidden="true">›</span>
    </template>
  </TxCardItem>
</template>

<style lang="scss" scoped>
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

// The chevron points at the panel this row opens, which is why a branch reads
// as a branch before it is hovered.
.tx-cascader__chevron {
  font-size: 15px;
  line-height: 1;
}
</style>
