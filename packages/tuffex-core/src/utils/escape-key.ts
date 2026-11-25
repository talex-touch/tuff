import { hasDocument } from './env'

/** Whether a key event starts inside a TxForm, where Escape does not close an enclosing dialog. */
export function isFormFieldTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.tx-form') !== null
}

export interface EscapeKeyOptions {
  /** Event target document/window. Defaults to global `document`. */
  target?: Document | Window | HTMLElement | null
  /** Whether to ignore Escape originating inside a `.tx-form`. @default false */
  ignoreFormFields?: boolean
  /** Use capture phase listener. @default false */
  capture?: boolean
}

/**
 * Subscribes to Escape keydown events and returns a cleanup function.
 */
export function onEscapeKey(
  handler: (event: KeyboardEvent) => void,
  options: EscapeKeyOptions = {},
): () => void {
  const target = options.target ?? (hasDocument() ? document : null)
  if (!target)
    return () => {}

  const listener = (event: Event) => {
    const keyEvent = event as KeyboardEvent
    if (keyEvent.key !== 'Escape' || keyEvent.defaultPrevented)
      return
    if (options.ignoreFormFields && isFormFieldTarget(keyEvent.target))
      return
    handler(keyEvent)
  }

  target.addEventListener('keydown', listener, options.capture ?? false)
  return () => {
    target.removeEventListener('keydown', listener, options.capture ?? false)
  }
}
