export type TxTextOverflow = 'start' | 'middle' | 'end'

export type TxTextScroll = 'none' | 'auto' | 'hover'

export interface TxTextProps {
  /** The full text. It is shown whole when it fits. */
  text: string
  /** Where the ellipsis goes when the text is cut: the start, the middle or the end. */
  overflow?: TxTextOverflow
  /** `auto` loops overflowing text back and forth; `hover` slides the rest in while the pointer is over it, and on touch a tap toggles it. */
  scroll?: TxTextScroll
}
