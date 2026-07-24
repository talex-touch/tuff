import type { Placement } from '@floating-ui/vue'

export type { Placement }

/** How the dropdown panel is summoned. */
export type TxFlatDropdownTrigger = 'hover' | 'click' | 'manual'

export type TxFlatDropdownClass =
  | string
  | Record<string, boolean>
  | Array<string | Record<string, boolean>>

export interface TxFlatDropdownProps {
  /** Controlled open state. Omit for uncontrolled (internal) behaviour. */
  modelValue?: boolean
  /** How the panel is triggered. Default `'hover'`. */
  trigger?: TxFlatDropdownTrigger
  /** Floating placement relative to the trigger. Default `'bottom-start'`. */
  placement?: Placement
  /** Gap in px between the trigger and the panel. Default `10`. */
  offset?: number
  /**
   * Delay before opening on hover/focus (ms). Default `0` — the panel appears
   * immediately when the pointer lands on the trigger.
   */
  openDelay?: number
  /**
   * Delay before closing after the pointer leaves (ms). Default `600` — keeps
   * the panel around long enough to travel into it, then it dissolves away.
   */
  closeDelay?: number
  /** Duration of the exit (scale + blur) animation in ms. Default `280`. */
  exitDuration?: number
  /** Disable every interaction. */
  disabled?: boolean
  /** Teleport target for the panel. Default `'body'`; pass `false` to render inline. */
  teleport?: boolean | string
  /** Match the panel's min-width to the trigger width. Default `false`. */
  matchTriggerWidth?: boolean
  /** Fixed panel width (px number or any CSS length). Overrides `matchTriggerWidth`. */
  width?: number | string
  /** Close when clicking outside the trigger/panel (click & hover triggers). Default `true`. */
  closeOnClickOutside?: boolean
  /** Close when pressing Escape. Default `true`. */
  closeOnEsc?: boolean
  /** Close after any click inside the panel. Default `false`. */
  closeOnContentClick?: boolean
  /** Extra class(es) merged onto the floating panel element. */
  panelClass?: TxFlatDropdownClass
}

export interface TxFlatDropdownTriggerSlotProps {
  /** Whether the panel is currently open. */
  open: boolean
  /** Toggle the panel (respects `disabled`). */
  toggle: () => void
  /** Force the panel open. */
  show: () => void
  /** Force the panel closed. */
  hide: () => void
}

export interface TxFlatDropdownContentSlotProps {
  /** Whether the panel is currently open. */
  open: boolean
  /** Close the panel. */
  close: () => void
  /** Resolved side the panel is rendered on (after flip). */
  side: 'top' | 'bottom' | 'left' | 'right'
}
