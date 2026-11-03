/** One custom emoji image: written into Markdown as `:name:`, picked in the icon picker as a `url:` identifier. */
export interface TxCustomEmoji {
  /** Shortcode without colons: lowercase letters, digits, `_`, `+` or `-`, up to 40 characters. */
  name: string
  /** An image the renderer can load: an https URL or a `data:` URL. */
  src: string
  /** Extra search terms, separated by spaces. */
  keywords?: string
}

/** A named set of custom emoji, shown as one tab or one heading. */
export interface TxEmojiPack {
  /** Stable key for the pack. */
  id: string
  /** The tab or heading label, already localized by the host. */
  name: string
  emoji: TxCustomEmoji[]
}
