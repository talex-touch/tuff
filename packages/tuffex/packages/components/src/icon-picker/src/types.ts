import type { TxEmojiPack } from '../../icon/src/emoji-pack'
import type { TxIconSource } from '../../icon/src/types'

/**
 * The shape of the plate an icon is mounted on.
 *
 * The first three are deliberately the same words as `AvatarShape`: a picked
 * icon often ends up inside a `TxAvatar`, and two vocabularies for one concept
 * is how a host ends up writing a translation table. The rest are shapes only
 * the picker's own plate draws; a host handing the value to an avatar maps
 * them down itself.
 */
export type IconPickerShape =
  | 'circle'
  | 'squircle'
  | 'rounded'
  | 'square'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'arch'
  | 'cookie'
  | 'clover'
  | 'burst'
  | 'heart'

/** The catalog sections a panel can show, in tab order. */
export type IconPickerSection = 'emoji' | 'icon' | 'brand' | 'ai' | 'file'

/** The sections that are a grid of rows, rather than the file action. */
export type IconPickerCatalogSection = Exclude<IconPickerSection, 'file'>

/**
 * One catalog row.
 *
 * `keywords` is what the search box matches against — space-separated, and
 * bilingual for the bundled catalog, because a zh-CN host whose users type
 * "火箭" gets nothing back from an English-only index.
 */
export interface IconPickerEntry {
  /** The icon identifier this row yields, e.g. `class:i-ri-rocket-line`. */
  id: string
  icon: TxIconSource
  keywords: string
  /**
   * The heading the row is grouped under, and a search term in its own
   * right. Rows without one are grouped after every named category.
   */
  category?: string
}

/**
 * A host-supplied file chooser, resolving to an absolute path or `null` when
 * the user cancels.
 *
 * TuffEx cannot open a native dialog, and the component refuses to guess: an
 * Electron host passes its `dialog.showOpenDialog` bridge, and a host that
 * passes nothing falls back to a hidden `<input type="file">` whose result is
 * a data URL. Both end up as an icon identifier; only the host knows which of
 * the two its renderer can actually load.
 */
export type IconPickerFileChooser = () => Promise<string | null>

export interface IconPickerProps {
  /** The icon identifier, e.g. `emoji:🚀`, `class:i-ri-rocket-line`, `file:/a/b.png`. */
  modelValue?: string
  /** The plate shape. Paired with `v-model:shape`. */
  shape?: IconPickerShape
  /** Sections to offer, in tab order. `file` is dropped when empty. */
  sections?: IconPickerSection[]
  /**
   * Replaces the bundled catalog for a section. The host owns the CSS that
   * renders a `class:` icon it supplies, so a host with its own icon set
   * replaces the rows rather than adding to a catalog it cannot style.
   */
  catalog?: Partial<Record<IconPickerCatalogSection, IconPickerEntry[]>>
  /**
   * Custom emoji packs, listed ahead of the emoji from `catalog` or the bundled
   * set. Each pack is a heading; a picked emoji is stored as a `url:` identifier.
   */
  emojiPacks?: readonly TxEmojiPack[]
  /** Offer the shape row. Off when the host renders the icon on its own plate. */
  shapeSelectable?: boolean
  fileChooser?: IconPickerFileChooser
  /** File-dialog accept list, also used for the fallback `<input type="file">`. */
  accept?: string
  disabled?: boolean
  /** Edge length of the trigger plate, in px. */
  size?: number
  placeholder?: string
  /** Render the panel directly instead of behind a trigger. */
  inline?: boolean
  /** Section labels, search placeholder, headings and the clear/file actions. */
  labels?: Partial<IconPickerLabels>
}

export interface IconPickerLabels {
  emoji: string
  icon: string
  brand: string
  ai?: string
  file: string
  search: string
  empty: string
  clear: string
  chooseFile: string
  shape: string
  /** Shape names, for the shape row's tooltips and its current-shape caption. */
  shapes?: Partial<Record<IconPickerShape, string>>
  /** Category headings, keyed by `IconPickerEntry.category`. */
  categories?: Partial<Record<string, string>>
  /** @deprecated Use `shapes.circle`. */
  shapeCircle?: string
  /** @deprecated Use `shapes.rounded`. */
  shapeRounded?: string
  /** @deprecated Use `shapes.square`. */
  shapeSquare?: string
}

export interface IconPickerEmits {
  (e: 'update:modelValue', value: string): void
  (e: 'update:shape', value: IconPickerShape): void
  (e: 'change', value: string): void
  /** The chooser threw, or the fallback input could not read the file. */
  (e: 'file-error', error: unknown): void
}
