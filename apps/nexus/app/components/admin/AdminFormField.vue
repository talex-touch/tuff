<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useAdminFieldControl } from '~/composables/useAdminFieldControl'

/**
 * One labelled field of a console form: a drawer's, a dialog's. Block and full
 * width, so the form decides the columns. A filter row uses `AdminFilterField`,
 * a flex item sized for a row of filters, whose 200px basis a column would read
 * as a 200px height.
 *
 * - `hint` sits under the control (an accepted range, a format) and describes it
 *   through `aria-describedby`; `invalid` turns the hint to the danger colour and
 *   marks the control `aria-invalid`.
 * - The label never wraps the control: a wrapping `<label>` makes `TxSelect` open
 *   and close at once. Pass `for` with the id of a control that forwards `id` to
 *   its `<input>` (TuffInput, TxSearchInput), or of a single `TxSelect` given that
 *   id by `v-admin-control-id`; without it the first combobox or input inside is
 *   pointed at the label through `aria-labelledby` (a `multiple` select's).
 * - The field writes those three attributes on its control itself
 *   (`useAdminFieldControl`, shared with `AdminFilterField`), so the page does not
 *   bind them on the control as well. The slot's `labelId` and `hintId` are for a
 *   custom control the field cannot find.
 */
const props = withDefaults(defineProps<{
  label: string
  /** Id of the control, for a `<label for>`. */
  for?: string
  /** What the field accepts, under the control. */
  hint?: string
  /** The value is not accepted: the hint turns to the danger colour and the control gets `aria-invalid`. */
  invalid?: boolean
}>(), {
  invalid: false,
})

const labelId = useId()
const hintElementId = useId()
const root = ref<HTMLElement | null>(null)
const hintId = computed(() => (props.hint ? hintElementId : null))

useAdminFieldControl({
  root,
  labelId,
  controlId: () => props.for,
  hintId,
  invalid: () => props.invalid,
})
</script>

<template>
  <div ref="root" class="AdminFormField" :class="{ 'is-invalid': invalid }">
    <label v-if="props.for" :id="labelId" class="AdminFormField-Label" :for="props.for">{{ label }}</label>
    <span v-else :id="labelId" class="AdminFormField-Label">{{ label }}</span>
    <div class="AdminFormField-Control">
      <slot :label-id="labelId" :hint-id="hintId" />
    </div>
    <p v-if="hint" :id="hintElementId" class="AdminFormField-Hint">
      {{ hint }}
    </p>
  </div>
</template>

<style scoped>
/* Label → control → hint 6px apart (tuffex-design-rules); the form owns the
   larger gap between fields. */
.AdminFormField {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

/* A label is read: 13px, regular ink, no tracking (tuffex-design-rules). */
.AdminFormField-Label {
  color: var(--tx-text-color-regular);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}

.AdminFormField-Control {
  min-width: 0;
}

.AdminFormField-Control > :deep(*) {
  width: 100%;
}

/* Helper copy is 12px; regular ink, because the range is read before typing. */
.AdminFormField-Hint {
  margin: 0;
  color: var(--tx-text-color-regular);
  font-size: 12px;
  line-height: 1.4;
}

.AdminFormField.is-invalid .AdminFormField-Hint {
  color: var(--tx-color-danger);
}
</style>
