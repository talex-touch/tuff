import type { MaybeRefOrGetter, ObjectDirective, Ref } from 'vue'
import type { AdminFieldControlApplied, AdminFieldRoot } from '~/utils/admin-kit'
import { onMounted, onUpdated, toValue } from 'vue'
import { ADMIN_FIELD_NOTHING_APPLIED, findAdminFieldControl, identifyAdminControl, nameAdminControl, syncAdminFieldControl } from '~/utils/admin-kit'

export interface AdminFieldControlOptions {
  /** The field's root element; its control is searched for inside it. */
  root: Readonly<Ref<AdminFieldRoot | null>>
  /** Id of the field's label element. */
  labelId: string
  /** The field's `for`: the control's id, already named by the `<label for>`. */
  controlId: MaybeRefOrGetter<string | null | undefined>
  /** Id of the hint under the control, `null` while there is none. */
  hintId?: MaybeRefOrGetter<string | null | undefined>
  invalid?: MaybeRefOrGetter<boolean | undefined>
}

/**
 * The labelling shared by `AdminFilterField` and `AdminFormField`: the field's
 * control is named after its label, described by its hint and marked invalid as
 * the field says (`syncAdminFieldControl`). Synced after mount and after every
 * re-render of the field, so a control a slot swaps in gets the same treatment.
 *
 * Client only. The server renders the field's own markup — the `<label for>`, the
 * hint — and the attributes follow once the page mounts; console pages only
 * mount on the client anyway.
 */
export function useAdminFieldControl(options: AdminFieldControlOptions): void {
  let applied: AdminFieldControlApplied = ADMIN_FIELD_NOTHING_APPLIED

  function sync() {
    const controlId = toValue(options.controlId) || null
    applied = syncAdminFieldControl(findAdminFieldControl(options.root.value, controlId), {
      labelId: options.labelId,
      labelledByFor: Boolean(controlId),
      hintId: toValue(options.hintId) || null,
      invalid: Boolean(toValue(options.invalid)),
    }, applied)
  }

  onMounted(sync)
  onUpdated(sync)
}

/**
 * `v-admin-control-label="label"` on a `TuffSelect`, or any element around a
 * control with no visible label: `nameAdminControl` after every render. The
 * server render marks the element with `data-admin-control-label`.
 */
export const vAdminControlLabel: ObjectDirective<HTMLElement, string> = {
  mounted: (el, binding) => nameAdminControl(el, binding.value),
  updated: (el, binding) => nameAdminControl(el, binding.value),
  getSSRProps: binding => ({ 'data-admin-control-label': binding.value }),
}

/**
 * `v-admin-control-id="id"` on a `TuffSelect` inside an `AdminFormField` with
 * `:for="id"`: `identifyAdminControl` before the field labels its control (a
 * directive on a child mounts before the field's own `onMounted`). The server
 * render marks the select's root with `data-admin-control-id`.
 */
export const vAdminControlId: ObjectDirective<HTMLElement, string> = {
  mounted: (el, binding) => identifyAdminControl(el, binding.value),
  updated: (el, binding) => identifyAdminControl(el, binding.value),
  getSSRProps: binding => ({ 'data-admin-control-id': binding.value }),
}
