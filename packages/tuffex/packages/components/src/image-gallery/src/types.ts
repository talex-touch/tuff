export interface ImageGalleryItem {
  id: string
  url: string
  name?: string
}

export interface ImageGalleryProps {
  items: ImageGalleryItem[]
  startIndex?: number
  /** Accessible label for the previous-image button. @default 'Previous image' */
  previousLabel?: string
  /** Accessible label for the next-image button. @default 'Next image' */
  nextLabel?: string
  /** Visible text of the previous-image button. @default 'Prev' */
  previousText?: string
  /** Visible text of the next-image button. @default 'Next' */
  nextText?: string
  /** Fallback modal title when the current item has no `name`. @default 'Preview' */
  previewTitle?: string
  /** Builds an item's display name when `item.name` is absent. @default (i) => `Image ${i + 1}` */
  itemLabelFormatter?: (index: number) => string
  /** Builds a thumbnail's aria-label from an item's display name. @default (label) => `Open ${label} preview` */
  openLabelFormatter?: (label: string) => string
}

export interface ImageGalleryEmits {
  (e: 'open', payload: { index: number, item: ImageGalleryItem }): void
  (e: 'close'): void
}
