export type CornerOverlayPlacement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface CornerOverlayProps {
  placement?: CornerOverlayPlacement
  offsetX?: string | number
  offsetY?: string | number
  overlayPointerEvents?: 'none' | 'auto'
}
