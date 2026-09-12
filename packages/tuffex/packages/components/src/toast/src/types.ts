export type TxToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export interface TxToastHostProps {
  /** Corner (or edge centre) the stack grows from. */
  position?: TxToastPosition
  /** How many toasts stay on screen; the rest wait behind, fully transparent. */
  visibleToasts?: number
  /** Keep the stack expanded instead of collapsing it when the pointer leaves. */
  expand?: boolean
  /** Pixels between toasts — both the expanded gap and the collapsed peek. */
  gap?: number
  /** Distance from the viewport edges. */
  offset?: number
  /** Let a pointer drag flick a toast off toward its own edge. */
  swipeToDismiss?: boolean
}
