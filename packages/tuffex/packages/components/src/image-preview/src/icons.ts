import type { ImagePreviewAction } from './types'

// The icons of TxImagePreview, on a 24px grid, each a list of strokes for ImagePreviewIcon.

export const PREVIEW_ICONS = {
  close: ['M6 6l12 12M18 6 6 18'],
  previous: ['m15 6-6 6 6 6'],
  next: ['m9 6 6 6-6 6'],
  zoomIn: ['M12 6v12M6 12h12'],
  zoomOut: ['M6 12h12'],
  check: ['m5 12.5 4.5 4.5L19 7.5'],
} as const satisfies Record<string, readonly string[]>

export const ACTION_ICONS: Record<ImagePreviewAction, readonly string[]> = {
  rotate: ['M19.5 12a7.5 7.5 0 1 1-2.2-5.3', 'M19.6 4.2v3.4h-3.4'],
  copy: [
    'M10.7 8.5h6.6a2.2 2.2 0 0 1 2.2 2.2v6.6a2.2 2.2 0 0 1-2.2 2.2h-6.6a2.2 2.2 0 0 1-2.2-2.2v-6.6a2.2 2.2 0 0 1 2.2-2.2z',
    'M15.5 8.5V6.7a2.2 2.2 0 0 0-2.2-2.2H6.7a2.2 2.2 0 0 0-2.2 2.2v6.6a2.2 2.2 0 0 0 2.2 2.2h1.8',
  ],
  share: ['M12 3.5v11', 'm8 7.5 4-4 4 4', 'M8.5 10.5H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1.5'],
  download: ['M12 4v11', 'm7.5 10.5 4.5 4.5 4.5-4.5', 'M5 19.5h14'],
}
