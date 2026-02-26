import type { CSSProperties } from 'vue'

export type FlipDialogSize = 'md' | 'lg' | 'xl' | 'full'
export type FlipDialogReference = HTMLElement | DOMRect | null

export const FLIP_DIALOG_SIZE_WIDTH_MAP: Record<FlipDialogSize, string> = {
  md: 'min(860px, calc(100vw - 48px))',
  lg: 'min(1040px, calc(100vw - 48px))',
  xl: 'min(1200px, calc(100vw - 48px))',
  full: 'calc(100vw - 32px)'
}

export const FLIP_DIALOG_DEFAULT_MAX_HEIGHT = 'calc(82dvh - 24px)'
export const FLIP_DIALOG_FULL_MAX_HEIGHT = 'calc(92dvh - 24px)'

export interface FlipDialogSizeStyleOptions {
  size: FlipDialogSize
  width?: string
  maxHeight?: string
  minHeight?: string
}

export interface HiddenReferenceSnapshot {
  opacity: string
  pointerEvents: string
}

export function resolveFlipDialogReference(input: {
  hasReferenceProp: boolean
  propReference: FlipDialogReference | undefined
  slotReference: HTMLElement | null
}): FlipDialogReference {
  if (input.hasReferenceProp) return input.propReference ?? null
  return input.slotReference
}

export function isDomRect(value: unknown): value is DOMRect {
  return typeof DOMRect !== 'undefined' && value instanceof DOMRect
}

export function resolveFlipDialogHideTarget(input: {
  reference: FlipDialogReference
  slotReference: HTMLElement | null
}): HTMLElement | null {
  if (input.reference instanceof HTMLElement) return input.reference
  if (isDomRect(input.reference)) return input.slotReference
  return null
}

export function shouldFlipDialogAutoOpenOnReferenceClick(input: {
  referenceAutoOpen: boolean
  visible: boolean
}): boolean {
  return input.referenceAutoOpen && !input.visible
}

export function hideFlipDialogReference(target: HTMLElement): HiddenReferenceSnapshot {
  const snapshot: HiddenReferenceSnapshot = {
    opacity: target.style.opacity,
    pointerEvents: target.style.pointerEvents
  }
  target.style.opacity = '0'
  target.style.pointerEvents = 'none'
  return snapshot
}

export function restoreFlipDialogReference(
  target: HTMLElement,
  snapshot: HiddenReferenceSnapshot
): void {
  target.style.opacity = snapshot.opacity
  target.style.pointerEvents = snapshot.pointerEvents
}

export function resolveFlipDialogCardStyleVariables(
  options: FlipDialogSizeStyleOptions
): CSSProperties {
  const variables: CSSProperties & Record<string, string> = {
    '--flip-dialog-width': options.width || FLIP_DIALOG_SIZE_WIDTH_MAP[options.size],
    '--flip-dialog-max-height':
      options.maxHeight ||
      (options.size === 'full' ? FLIP_DIALOG_FULL_MAX_HEIGHT : FLIP_DIALOG_DEFAULT_MAX_HEIGHT)
  }
  if (options.minHeight) variables['--flip-dialog-min-height'] = options.minHeight
  return variables
}
