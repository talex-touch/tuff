import type { Ref } from 'vue'
import type { FieldMessage, FormFieldHandle, FormFieldSource } from './context'
import type { FormControlKind, FormLayout, FormMessages, FormRule } from './types'
import { computed, inject, onBeforeUnmount, provide, shallowRef, useId, watch } from 'vue'
import { TX_FORM_CONTEXT_KEY, TX_FORM_FIELD_KEY, TX_FORM_ROW_KEY } from './context'
import { toIdSegment, toPathKey } from './path'
import { FORM_DEFAULT_MESSAGES } from './types'

export interface FormItemOptions {
  prop: () => string | undefined
  label: () => string | undefined
  rules: () => FormRule | FormRule[] | undefined
  required: () => boolean
  help: () => string | undefined
  /** Detail behind the field's `?`. Only `TxFormItem` offers it. */
  hint?: () => string | undefined
  showMessage: () => boolean
  root: Readonly<Ref<HTMLElement | null>>
  /**
   * `for`: the item renders a `<label for>`, which names the control holding
   * the id. `aria`: it renders a heading, and controls point at it.
   */
  labelledBy: FormFieldSource['labelledBy']
  /**
   * Whether the control inside gets the field: the id, the label and message
   * it points at, the invalid and required state. A `TxBlockSlot` offers it
   * only with `prop`, so a plain settings row stays as it was. Default: always.
   */
  offersField?: () => boolean
  /** A check of the field finished: focus left it changed, or the form validated. */
  onValidated?: (valid: boolean) => void
  /** `false` keeps the field out of the form's draft. Default: kept. */
  persist?: () => boolean
}

/** What sits under the control: the field's message while one shows, its help text otherwise. */
export interface FormItemNote {
  kind: FieldMessage['kind'] | 'help'
  text: string
}

/**
 * The part of a form item that is not markup: registering its path with the
 * form, the ids that tie label, control and message together, and when focus
 * counts as leaving. `TxFormItem` and `TxBlockSlot` render it differently.
 */
export function useFormItem(options: FormItemOptions) {
  const form = inject(TX_FORM_CONTEXT_KEY, null)
  const inRow = inject(TX_FORM_ROW_KEY, false)
  const autoId = useId()

  const path = computed(() => {
    const prop = options.prop()
    return prop ? toPathKey(prop) : ''
  })
  // `<form id>-<path>` is stable across renders and servers, so tests and
  // analytics can select a field by it.
  const controlId = computed(() => (form && path.value ? `${form.id.value}-${toIdSegment(path.value)}` : autoId))
  const labelId = computed(() => `${controlId.value}-label`)
  const messageId = computed(() => `${controlId.value}-message`)
  const label = computed(() => options.label() ?? '')
  const messages = computed<FormMessages>(() => form?.messages.value ?? FORM_DEFAULT_MESSAGES)
  const hintId = computed(() => `${autoId}-hint`)
  const hasHint = computed(() => Boolean(options.hint?.()))
  const hintName = computed(() => messages.value.hint(label.value || options.prop() || messages.value.field))

  /** One getter per control inside that may hold a secret. */
  const secrets = shallowRef<Array<() => boolean>>([])
  const handle = shallowRef<FormFieldHandle | null>(null)
  watch(path, (key) => {
    handle.value?.dispose()
    handle.value = form && key
      ? form.register({
          path: key,
          label: () => options.label() || options.prop() || '',
          rules: options.rules,
          required: options.required,
          root: () => options.root.value,
          controlId: () => controlId.value,
          labelId: () => (label.value ? labelId.value : undefined),
          validated: valid => options.onValidated?.(valid),
          sensitive: () => options.persist?.() === false || secrets.value.some(holdsSecret => holdsSecret()),
        })
      : null
  }, { immediate: true })
  onBeforeUnmount(() => {
    handle.value?.dispose()
    handle.value = null
  })

  const message = computed(() => (options.showMessage() ? handle.value?.message.value ?? null : null))
  /** An error is showing. It stays true with `showMessage` off, where the host shows the error itself. */
  const invalid = computed(() => handle.value?.message.value?.kind === 'error')
  const readonly = computed(() => form?.readonly.value ?? false)
  // A value only shown is not asked for: no mark, no `required` on the control.
  const required = computed(() => !readonly.value && (handle.value?.required.value ?? options.required()))
  const note = computed<FormItemNote | null>(() => {
    if (message.value)
      return message.value
    const help = options.help()
    return help ? { kind: 'help', text: help } : null
  })
  /** Read before the note, hidden on screen, so a message is not taken for help text. */
  const notePrefix = computed(() => {
    if (note.value?.kind === 'error')
      return messages.value.errorPrefix
    return note.value?.kind === 'warning' ? messages.value.warningPrefix : ''
  })

  const requiredMark = computed(() => form?.requiredMark.value ?? 'asterisk')
  const markRequired = computed(() => required.value && requiredMark.value === 'asterisk')
  const markOptional = computed(() => !required.value && requiredMark.value === 'optional')

  /** Items in a `TxFormRow` stack: the row already took the label column. */
  const layout = computed<FormLayout>(() => (form && !inRow ? form.layout.value : 'stacked'))
  const labelAlign = computed(() => form?.labelAlign.value ?? 'end')

  // The first control to ask takes the id; what kind it is decides how the
  // label names it.
  let owner: object | null = null
  const ownerKind = shallowRef<(() => FormControlKind) | null>(null)
  /** `for` on the label, dropped for a control a `<label for>` cannot name. */
  const labelFor = computed(() => (ownerKind.value?.() === 'group' ? undefined : controlId.value))

  const offersField = options.offersField ?? (() => true)
  const source: FormFieldSource = {
    get controlId() {
      return offersField() ? controlId.value : undefined
    },
    get labelId() {
      return offersField() && label.value ? labelId.value : undefined
    },
    get messageId() {
      return offersField() && note.value ? messageId.value : undefined
    },
    get hintId() {
      return offersField() && hasHint.value ? hintId.value : undefined
    },
    get label() {
      return label.value
    },
    labelledBy: options.labelledBy,
    get invalid() {
      return offersField() && invalid.value
    },
    get required() {
      return offersField() && required.value
    },
    get disabled() {
      return form?.disabled.value ?? false
    },
    get readonly() {
      return readonly.value
    },
    get size() {
      return form?.size.value ?? 'md'
    },
    claim(token) {
      if (owner)
        return false
      owner = token
      return true
    },
    adopt(token, kind) {
      if (owner === token)
        ownerKind.value = kind
    },
    release(token) {
      if (owner !== token)
        return
      owner = null
      ownerKind.value = null
    },
    protect(holdsSecret) {
      secrets.value = [...secrets.value, holdsSecret]
      return () => {
        secrets.value = secrets.value.filter(item => item !== holdsSecret)
      }
    },
  }
  provide(TX_FORM_FIELD_KEY, source)

  function onFocusout(event: FocusEvent): void {
    const root = options.root.value
    if (!root || !handle.value)
      return
    const next = event.relatedTarget
    if (next instanceof Node && root.contains(next))
      return
    // Focus moving within the page leaves the body active while focusout
    // runs. Switching to another app leaves the field itself active: the user
    // has not finished with it.
    const active = root.ownerDocument.activeElement
    if (active && active !== root.ownerDocument.body && root.contains(active))
      return
    handle.value.commit()
  }

  /** For a control the host renders itself: `<input :id="id" :aria-invalid="ariaInvalid" …>`. */
  const slotProps = computed(() => ({
    id: controlId.value,
    labelId: label.value ? labelId.value : undefined,
    ariaInvalid: invalid.value ? 'true' as const : undefined,
    ariaDescribedby: [note.value ? messageId.value : '', hasHint.value ? hintId.value : ''].filter(Boolean).join(' ') || undefined,
    invalid: invalid.value,
    required: required.value,
  }))

  return {
    form,
    path,
    controlId,
    labelId,
    messageId,
    hintId,
    hintName,
    label,
    labelFor,
    messages,
    note,
    notePrefix,
    invalid,
    required,
    markRequired,
    markOptional,
    layout,
    labelAlign,
    slotProps,
    onFocusout,
  }
}
