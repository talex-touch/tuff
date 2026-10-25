import type { ImagePreviewActionEvent, ImagePreviewProps } from '../../image-preview/src/types'

/**
 * The preview's options the gallery leaves to its host: the actions and their menu, the strip
 * along the bottom, the motion and the materials. The gallery sets the pictures, the ones that
 * failed, where each one flies from, and the labels it has props of its own for.
 */
export type ImageGalleryPreviewProps = Omit<
  ImagePreviewProps,
  'images' | 'failed' | 'origin' | 'label' | 'previousLabel' | 'nextLabel' | 'closeLabel' | 'zoomInLabel' | 'zoomOutLabel' | 'resetLabel' | 'failedText'
>

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
  /** @deprecated Not shown: the preview's page buttons are icons, named by `previousLabel` and `nextLabel`. */
  previousText?: string
  /** @deprecated Not shown: the preview's page buttons are icons, named by `previousLabel` and `nextLabel`. */
  nextText?: string
  /** The preview's accessible name, followed by the current item's `name`. @default 'Preview' */
  previewTitle?: string
  /** Accessible label for the preview's close button. @default 'Close' */
  closeLabel?: string
  /** Accessible label for the preview's zoom-in button. @default 'Zoom in' */
  zoomInLabel?: string
  /** Accessible label for the preview's zoom-out button. @default 'Zoom out' */
  zoomOutLabel?: string
  /** The first item of the menu the preview's zoom readout opens, which shows the whole image again. @default 'Fit to screen' */
  resetLabel?: string
  /** Shown in the preview in place of an image that failed to load. @default 'This image could not be loaded' */
  failedText?: string
  /** Builds an item's display name when `item.name` is absent. @default (i) => `Image ${i + 1}` */
  itemLabelFormatter?: (index: number) => string
  /** Builds a thumbnail's aria-label from an item's display name. @default (label) => `Open ${label} preview` */
  openLabelFormatter?: (label: string) => string
  /** The preview's other options, passed on as they are. */
  previewProps?: ImageGalleryPreviewProps
}

export interface ImageGalleryEmits {
  (e: 'open', payload: { index: number, item: ImageGalleryItem }): void
  (e: 'close'): void
  /** An action was chosen in the preview, before it runs; `preventDefault()` runs it yourself. */
  (e: 'action', payload: ImagePreviewActionEvent): void
}
