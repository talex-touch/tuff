/** Whether a key event starts inside a TxForm, where Escape does not close an enclosing dialog. */
export function isFormFieldTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.tx-form') !== null
}
