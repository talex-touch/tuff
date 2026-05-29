import type { Component, VNode } from 'vue'

/**
 * Button type for visual styling.
 *
 * @public
 */
export type DialogButtonType = 'info' | 'warning' | 'error' | 'success'

/**
 * Interface for dialog button configuration.
 *
 * @public
 */
export interface DialogButton {
  /**
   * The text content displayed on the button.
   */
  content: string

  /**
   * The visual type/style of the button.
   */
  type?: DialogButtonType

  /**
   * Auto-click countdown timer in seconds.
   * When provided, the button will automatically click after the specified time.
   */
  time?: number

  /**
   * Click handler function.
   * Return true to close the dialog, false to keep it open.
   */
  onClick: () => Promise<boolean> | boolean

  /**
   * Loading callback function.
   * Called with a done function that should be invoked when loading is complete.
   */
  loading?: (done: () => void) => void
}

/**
 * Props interface for the TxBottomDialog component.
 *
 * @public
 */
export interface BottomDialogProps {
  /**
   * The title displayed in the dialog header.
   * @default ''
   */
  title?: string

  /**
   * The message content of the dialog.
   * Rendered as plain text. New lines are preserved by component styles.
   * @default ''
   */
  message?: string

  /**
   * Duration in milliseconds before the dialog auto-closes.
   * Set to 0 to disable auto-close.
   * @default 0
   */
  stay?: number

  /**
   * Callback function to close the dialog.
   */
  close: () => void

  /**
   * Array of button configurations.
   * @default []
   */
  btns?: DialogButton[]

  /**
   * Icon class name to display in the dialog.
   * @default ''
   */
  icon?: string

  /**
   * Z-index offset for the dialog.
   * Final z-index = baseZIndex + index.
   * @default 0
   */
  index?: number
}

/**
 * Props interface for the TxBlowDialog component.
 *
 * @public
 */
export interface BlowDialogProps {
  /**
   * Callback function to close the dialog.
   */
  close: () => void

  /**
   * The title displayed in the dialog.
   * @default ''
   */
  title?: string

  /**
   * The message content of the dialog.
   * Rendered as plain text. New lines are preserved by component styles.
   * @default ''
   */
  message?: string
  /**
   * Trusted HTML message content. Use only for sanitized internal call sites.
   * @default ''
   */
  messageHtml?: string

  /**
   * Confirm button text.
   * @default 'Confirm'
   */
  confirmText?: string

  /**
   * A Vue component to render in the dialog.
   */
  comp?: Component

  /**
   * A render function that returns a VNode.
   */
  render?: () => VNode
}

/**
 * Emits interface for dialog components.
 *
 * @public
 */
export interface DialogEmits {
  /**
   * Emitted when the dialog is closed.
   */
  (e: 'close'): void
}

export interface PopperDialogProps {
  close: () => void
  title?: string
  message?: string
  messageHtml?: string
  confirmText?: string
  comp?: Component
  render?: () => VNode
}

export interface TouchTipButton {
  content: string
  type?: DialogButtonType
  onClick: () => Promise<boolean> | boolean
  loading?: (done: () => void) => void
}

export interface TouchTipProps {
  title?: string
  message?: string
  messageHtml?: string
  buttons: TouchTipButton[]
  close: () => void
}
