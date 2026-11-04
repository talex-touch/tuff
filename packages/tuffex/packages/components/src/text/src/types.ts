export type TxTextOverflow = 'start' | 'middle' | 'end'

export type TxTextScroll = 'none' | 'auto' | 'hover' | 'loop'

export type TxTextLoopEdge = 'gap' | 'clip' | 'fade' | 'wrap'

export interface TxTextProps {
  /** The full text. It is shown whole when it fits. */
  text: string
  /** Where the ellipsis goes when the text is cut: the start, the middle or the end. */
  overflow?: TxTextOverflow
  /** `auto` swings overflowing text back and forth; `loop` carries it round seamlessly; `hover` slides the rest in while the pointer is over it, and on touch a tap toggles it. */
  scroll?: TxTextScroll
  /** How a looping text leaves at the edge and comes back: `gap` clears fully, `clip` cuts with a short gap, `fade` also fades the edges, `wrap` keeps text in view. Only with `scroll="loop"`. */
  loopEdge?: TxTextLoopEdge
}
