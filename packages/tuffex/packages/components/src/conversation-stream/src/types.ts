export type ConversationStreamKey = string | number

export type ConversationStreamItemKey<T> =
  | string
  | ((item: T, index: number) => ConversationStreamKey)

/**
 * The loader owns the data: it prepends older items into the `items` prop
 * itself before resolving, and only reports whether more history exists.
 * Returning items here would make the component a second source of truth.
 */
export interface ConversationStreamLoadResult {
  hasMore: boolean
}

export type ConversationStreamEmptyAlign = 'center' | 'top' | 'bottom'

export interface ConversationStreamProps<T> {
  items: T[]
  itemKey: ConversationStreamItemKey<T>
  /** Height assumed for unmeasured items; measurements correct it. */
  estimatedItemHeight?: number
  /** Extra items rendered on both sides of the visible range. */
  overscan?: number
  /** Called near the top; consumer prepends into `items`, then resolves. */
  loadOlder?: () => Promise<ConversationStreamLoadResult>
  /** Whether history may exist before the first `loadOlder` answers. */
  hasMoreInitial?: boolean
  /** Drives the scroll-to-bottom pill's "new content" state. */
  streaming?: boolean
  /** Scroller top padding (`--tx-conversation-stream-pad-top`). */
  topPadding?: number | string
  /** Scroller bottom clearance for floating composers (`--tx-conversation-stream-pad-bottom`). */
  bottomClearance?: number | string
  /** Vertical gap between rows (`--tx-conversation-stream-item-gap`). */
  itemGap?: number | string
  /** Bottom offset for the jump-to-latest pill (`--tx-conversation-stream-pill-bottom`). */
  pillBottom?: number | string
  /** Accessible label for the jump-to-latest pill. @default 'Scroll to bottom' */
  scrollToBottomLabel?: string
  /** Vertical placement of the empty slot. @default 'center' */
  emptyAlign?: ConversationStreamEmptyAlign
}
