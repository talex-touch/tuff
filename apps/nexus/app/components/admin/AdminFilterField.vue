<script setup lang="ts">
import { onMounted, ref, useId } from 'vue'

/**
 * One labelled control of `AdminFilterBar`.
 *
 * The label never wraps the control. A wrapping `<label>` forwards a click on
 * `TxSelect`'s arrow to its input, the anchor sees two clicks and the panel opens
 * and closes at once (`.trellis/spec/frontend/tuffex-docs-sync.md`). So:
 * - pass `for` with the id of a control that forwards `id` to its `<input>`
 *   (TuffInput, TxSearchInput) for a real `<label for>`;
 * - otherwise the label is plain text, and on mount the first combobox or input
 *   inside without an accessible name is pointed at it through `aria-labelledby`
 *   — how `TxPagination` names its size select, since `TxSelect` takes no id.
 */
const props = withDefaults(defineProps<{
  label: string
  /** Id of the control, for a `<label for>`. */
  for?: string
  /** Give the field room for a search box. */
  wide?: boolean
}>(), {
  wide: false,
})

const labelId = useId()
const root = ref<HTMLElement | null>(null)

onMounted(() => {
  if (props.for)
    return
  const control = root.value?.querySelector<HTMLElement>('[role="combobox"], input, select, textarea')
  if (control && !control.hasAttribute('aria-labelledby') && !control.hasAttribute('aria-label'))
    control.setAttribute('aria-labelledby', labelId)
})
</script>

<template>
  <div ref="root" class="AdminFilterField" :class="{ 'is-wide': wide }">
    <label v-if="props.for" :id="labelId" class="AdminFilterField-Label" :for="props.for">{{ label }}</label>
    <span v-else :id="labelId" class="AdminFilterField-Label">{{ label }}</span>
    <div class="AdminFilterField-Control">
      <slot :label-id="labelId" />
    </div>
  </div>
</template>

<style scoped>
.AdminFilterField {
  display: flex;
  flex: 1 1 200px;
  flex-direction: column;
  gap: 6px;
  min-width: 180px;
  max-width: 320px;
}

.AdminFilterField.is-wide {
  flex-basis: 320px;
  max-width: 480px;
}

/* A label is read: 13px, regular ink, no tracking (tuffex-design-rules). */
.AdminFilterField-Label {
  color: var(--tx-text-color-regular);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}

.AdminFilterField-Control {
  min-width: 0;
}

.AdminFilterField-Control > :deep(*) {
  width: 100%;
}
</style>
