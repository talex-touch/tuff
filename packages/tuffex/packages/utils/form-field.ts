import type { InjectionKey, MaybeRefOrGetter } from 'vue'
import { inject, onBeforeUnmount, onMounted, provide, toValue } from 'vue'

/*
 * The contract between a form item and the control inside it. It lives here,
 * outside `form/`, because every control reads it: an on-demand import of
 * TxInput must not pull the form in with it.
 */

export type FormControlSize = 'sm' | 'md' | 'lg'

/** `input`: a native field. `button`: a button acting as a control. `group`: an element a `<label for>` cannot name. */
export type FormControlKind = 'input' | 'button' | 'group'

/**
 * What a control inside a `TxFormItem` reads from `useTxFormField()`. Every
 * member is reactive, so read it inside a `computed` or the template.
 */
export interface TxFormField {
  /** The control's id, which the item's label points at. Only the first control in an item receives one. */
  readonly id: string | undefined
  /** Id of the item's visible label, for controls a `<label for>` cannot name. */
  readonly labelId: string | undefined
  readonly label: string
  readonly describedBy: string | undefined
  /** An error is showing. */
  readonly invalid: boolean
  readonly required: boolean
  readonly disabled: boolean
  /** The form shows its values to read: the control may take focus but not change its value. */
  readonly readonly: boolean
  readonly size: FormControlSize
  /**
   * Attributes for the control's focusable element, merged over `host` — the
   * attributes the control was given — so the host's win, except
   * `aria-describedby`, which keeps both. The kind passed to
   * `useTxFormField()` decides the rest: an `input` carries native `required`;
   * a `button` or `group` carries `aria-required`, and a `group`, which a
   * `<label for>` cannot name, points at the label with `aria-labelledby`.
   */
  attrs: (host?: Record<string, unknown>) => Record<string, unknown>
}

/** What a `TxFormItem` or a `TxBlockSlot` with `prop` offers the control inside it. */
export interface FormFieldSource {
  /** Undefined while the item offers no field: a `TxBlockSlot` without `prop`. */
  readonly controlId: string | undefined
  readonly labelId: string | undefined
  readonly messageId: string | undefined
  readonly hintId: string | undefined
  readonly label: string
  /** `for`: the label is a `<label for>`. `aria`: controls must point at it with `aria-labelledby`. */
  readonly labelledBy: 'for' | 'aria'
  readonly invalid: boolean
  readonly required: boolean
  readonly disabled: boolean
  readonly readonly: boolean
  readonly size: FormControlSize
  claim: (token: object) => boolean
  /** Tells the item which kind of control took the id, once it has mounted. */
  adopt: (token: object, kind: () => FormControlKind) => void
  release: (token: object) => void
  /** Keeps the field out of the form's draft while `holdsSecret` returns true. Returns the release. */
  protect: (holdsSecret: () => boolean) => () => void
}

export const TX_FORM_FIELD_KEY: InjectionKey<FormFieldSource | null> = Symbol('TxFormField')

export interface TxFormFieldOptions {
  /**
   * The control holds a secret: a credential, a one-time code, a card
   * number. Its field never goes into the form's draft, and stays out for the
   * form's life once this has been true.
   */
  sensitive?: MaybeRefOrGetter<boolean>
}

/**
 * Connects a control to the `TxFormItem` around it: the id the label points
 * at, the description, the invalid and required state, and the form's
 * `size`, `disabled` and `readonly`, which also reach controls outside every
 * item. Returns `null` outside a form.
 *
 * Only the first control in an item receives the id. The call also hides the
 * item from everything the control renders, so the input inside a select or
 * the radios inside a group never claim the field a second time.
 */
export function useTxFormField(
  kind: MaybeRefOrGetter<FormControlKind> = 'input',
  options: TxFormFieldOptions = {},
): TxFormField | null {
  const source = inject(TX_FORM_FIELD_KEY, null)
  provide(TX_FORM_FIELD_KEY, null)
  if (!source)
    return null

  const token = {}
  const owner = source.claim(token)
  if (owner) {
    // After mount, so the item is not asked to re-render while it renders.
    onMounted(() => source.adopt(token, () => toValue(kind)))
    onBeforeUnmount(() => source.release(token))
  }
  if (options.sensitive !== undefined)
    onBeforeUnmount(source.protect(() => !!toValue(options.sensitive)))

  return {
    get id() {
      return owner ? source.controlId : undefined
    },
    get labelId() {
      return source.labelId
    },
    get label() {
      return source.label
    },
    get describedBy() {
      return [source.messageId, source.hintId].filter(Boolean).join(' ') || undefined
    },
    get invalid() {
      return source.invalid
    },
    get required() {
      return source.required
    },
    get disabled() {
      return source.disabled
    },
    get readonly() {
      return source.readonly
    },
    get size() {
      return source.size
    },
    attrs(host = {}) {
      const currentKind = toValue(kind)
      const controlId = source.controlId
      const hostId = host.id
      const ownsId = owner && controlId !== undefined && (hostId === undefined || hostId === controlId)
      const attrs: Record<string, unknown> = {}
      if (ownsId)
        attrs.id = controlId
      // A `<label for>` names only the element carrying the id; everything
      // else is named by pointing at the label.
      if (source.labelId && (!ownsId || currentKind === 'group' || source.labelledBy === 'aria'))
        attrs['aria-labelledby'] = source.labelId
      if (source.invalid)
        attrs['aria-invalid'] = 'true'
      if (source.required) {
        if (currentKind === 'input')
          attrs.required = true
        else
          attrs['aria-required'] = 'true'
      }
      const merged: Record<string, unknown> = { ...attrs }
      // `:aria-invalid="undefined"` from a slot prop means "not set", not "remove".
      for (const [key, value] of Object.entries(host)) {
        if (value !== undefined)
          merged[key] = value
      }
      const describedBy = new Set([source.messageId, source.hintId, ...String(host['aria-describedby'] ?? '').split(/\s+/)].filter(Boolean))
      if (describedBy.size)
        merged['aria-describedby'] = [...describedBy].join(' ')
      return merged
    },
  }
}
