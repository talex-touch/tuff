export interface ImageGalleryItem {
  id: string
  url: string
  name?: string
}

export interface ImageGalleryProps {
  items: ImageGalleryItem[]
  startIndex?: number
}

export interface ImageGalleryEmits {
  (e: 'open', payload: { index: number, item: ImageGalleryItem }): void
  (e: 'close'): void
}
