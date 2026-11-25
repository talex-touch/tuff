import { hasDocument } from '@talex-touch/tuffex-core'
import { useEffect, useRef } from 'react'

let globalZIndex = 2000

export function allocateZIndex(minSeed?: number): number {
  if (typeof minSeed === 'number' && Number.isFinite(minSeed) && minSeed > globalZIndex)
    globalZIndex = minSeed
  globalZIndex += 1
  return globalZIndex
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function trapFocusInContainer(event: KeyboardEvent, container: HTMLElement | null): void {
  if (!container || event.key !== 'Tab')
    return
  const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true')
  if (focusables.length === 0) {
    event.preventDefault()
    container.focus()
    return
  }
  const first = focusables[0]!
  const last = focusables[focusables.length - 1]!
  const active = document.activeElement
  if (event.shiftKey) {
    if (active === first || !container.contains(active)) {
      event.preventDefault()
      last.focus()
    }
  }
  else {
    if (active === last || !container.contains(active)) {
      event.preventDefault()
      first.focus()
    }
  }
}

export interface DismissableLayerOptions {
  open: boolean
  onDismiss: (reason: 'escape' | 'outside') => void
  closeOnEscape?: boolean
  closeOnOutsideClick?: boolean
  containerRefs?: Array<React.RefObject<HTMLElement | null>>
}

/**
 * Handles Escape key dismissal and outside pointerdown dismissal for overlays.
 */
export function useDismissableLayer({
  open,
  onDismiss,
  closeOnEscape = true,
  closeOnOutsideClick = true,
  containerRefs = [],
}: DismissableLayerOptions): void {
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss
  const containersRef = useRef(containerRefs)
  containersRef.current = containerRefs

  useEffect(() => {
    if (!open || !hasDocument())
      return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!closeOnEscape || event.defaultPrevented || event.key !== 'Escape')
        return
      event.preventDefault()
      onDismissRef.current('escape')
    }

    const handlePointerDown = (event: MouseEvent | PointerEvent) => {
      if (!closeOnOutsideClick)
        return
      const target = event.target as Node | null
      if (!target)
        return
      const isInside = containersRef.current.some(ref => ref.current?.contains(target))
      if (!isInside)
        onDismissRef.current('outside')
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [open, closeOnEscape, closeOnOutsideClick])
}

/**
 * Saves focus when a modal layer opens and restores it when it closes.
 */
export function useFocusReturn(open: boolean, containerRef: React.RefObject<HTMLElement | null>): void {
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!hasDocument())
      return

    if (open) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      const el = containerRef.current
      if (el) {
        if (!el.hasAttribute('tabindex'))
          el.setAttribute('tabindex', '-1')
        el.focus({ preventScroll: true })
      }
      return () => {
        const prev = previousFocusRef.current
        previousFocusRef.current = null
        if (prev && prev.isConnected)
          prev.focus({ preventScroll: true })
      }
    }
  }, [open, containerRef])
}
