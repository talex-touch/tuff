<script setup lang="ts">
import type { DescriptionsLayout, DescriptionsProps, DescriptionsSize } from './types'
import { computed, provide } from 'vue'
import { DESCRIPTIONS_KEY } from './types'

defineOptions({ name: 'TxDescriptions' })

const props = withDefaults(defineProps<DescriptionsProps>(), {
  columns: 2,
  layout: 'horizontal',
  size: 'md',
  emptyText: '—',
})

const columnCount = computed(() => {
  const count = Math.floor(Number(props.columns))
  return Number.isFinite(count) && count >= 1 ? count : 1
})

const resolvedLayout = computed<DescriptionsLayout>(() => (props.layout === 'vertical' ? 'vertical' : 'horizontal'))
const resolvedSize = computed<DescriptionsSize>(() => (props.size === 'sm' ? 'sm' : 'md'))

// The root is the only writer of both properties; the narrow-container rule below
// overrides the column count on the list, never here.
const rootStyle = computed(() => {
  const style: Record<string, string> = { '--tx-descriptions-columns': String(columnCount.value) }
  const width = props.labelWidth
  if (resolvedLayout.value === 'horizontal' && width !== undefined && width !== '')
    style['--tx-descriptions-label-width'] = typeof width === 'number' ? `${width}px` : width
  return style
})

provide(DESCRIPTIONS_KEY, {
  layout: resolvedLayout,
  columns: columnCount,
  emptyText: computed(() => props.emptyText),
})
</script>

<template>
  <div
    class="tx-descriptions"
    :class="[`tx-descriptions--${resolvedLayout}`, `tx-descriptions--${resolvedSize}`]"
    :style="rootStyle"
  >
    <!-- The list sits inside its own query container: a container query cannot
         restyle the container itself, and the narrow fallback rewrites the list. -->
    <dl class="tx-descriptions__list">
      <slot />
    </dl>
  </div>
</template>

<style lang="scss">
// Not scoped: every selector carries the `tx-descriptions` prefix, so nothing
// reaches past the component, and leaving out the scope attribute keeps the sheet
// small against the CSS size gate (TxStatusHint and TxChoiceCard do the same). The
// items' rules live here too, so TxDescriptionsItem ships no stylesheet of its own.
.tx-descriptions {
  // Query container for the one-column fallback at the end. Its width has to come
  // from the parent: a shrink-to-fit parent (an inline-block, a flex item that does
  // not stretch) collapses an inline-size container to nothing.
  container-type: inline-size;
  line-height: 1.5;
}

.tx-descriptions__list {
  display: grid;
  grid-template-columns: repeat(var(--tx-descriptions-columns), minmax(0, 1fr));
  gap: var(--tx-descriptions-gap, 12px) calc(var(--tx-descriptions-gap, 12px) * 2);
  margin: 0;
}

// A column is a label track plus a value track. Every item is a subgrid over its
// pair, so all the labels of a column share one track and the values line up. The
// track is as wide as the longest label, up to 40% of the column.
.tx-descriptions--horizontal .tx-descriptions__list {
  grid-template-columns: repeat(
    var(--tx-descriptions-columns),
    var(--tx-descriptions-label-width, fit-content(calc(40% / var(--tx-descriptions-columns)))) minmax(0, 1fr)
  );
}

.tx-descriptions__item {
  display: flex;
  flex-direction: column;
  gap: calc(var(--tx-descriptions-gap, 12px) / 4);
  // Track count, written by the item: the pair count in the horizontal layout.
  grid-column: span var(--tx-descriptions-span, 1);
  min-width: 0;
}

// The subgrid's own gutter: a label sits half as far from its value as the value
// sits from the next pair, so the pairs read as groups.
.tx-descriptions--horizontal .tx-descriptions__item {
  display: grid;
  grid-template-columns: subgrid;
  column-gap: var(--tx-descriptions-gap, 12px);
  align-items: baseline;
}

// Regular ink, not secondary: 13px labels are read, and secondary measures under
// 4.5:1 on white. The empty placeholder shares it, a step back from the values.
.tx-descriptions__label,
.tx-descriptions__value.is-empty {
  color: var(--tx-text-color-regular, #606266);
}

// One step under the value, but never under 13px: a label is read, and read text
// stays at 13–14px (tuffex-design-rules). In `sm` label and value are both 13px,
// so the ink alone carries the step, as in TxSensitiveInput's `sm`.
.tx-descriptions__label {
  font-size: max(13px, var(--tx-descriptions-font-size, 14px) - 1px);
}

.tx-descriptions__value {
  grid-column: 2 / -1;
  min-width: 0;
  margin: 0;
  color: var(--tx-text-color-primary, #303133);
  font-size: var(--tx-descriptions-font-size, 14px);
  overflow-wrap: anywhere;
}

.tx-descriptions--sm {
  --tx-descriptions-gap: 8px;
  --tx-descriptions-font-size: 13px;
}

// One column below 480px of container, whatever `columns` says: every item takes
// the whole row, and the label track is capped against the full width.
@container (width < 480px) {
  .tx-descriptions__list {
    --tx-descriptions-columns: 1;
  }

  .tx-descriptions__item {
    grid-column: 1 / -1;
  }
}
</style>
