// Editable controls, plus anything inside a TxForm. Escape pressed there does not close an
// enclosing dialog; `contenteditable="false"` is the only way out of the editable match.
const FORM_FIELD_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="combobox"]',
  '[role="textbox"]',
  '[role="spinbutton"]',
].join(', ')

/** Whether a key event starts in a form: inside a TxForm, or on an editable control. */
export function isFormFieldTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element))
    return false
  return target.closest('.tx-form') !== null || target.matches(FORM_FIELD_SELECTOR)
}
