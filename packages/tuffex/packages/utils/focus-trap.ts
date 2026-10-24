import { hasDocument } from './env'

// Focus in a modal dialog. `aria-modal` promises the page behind is inert, so Tab must not walk
// out into it; and once the dialog closes, focus goes back to where it was.

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [contenteditable], [tabindex]'

/** In the tab order: tabindex 0 or more, or an editable region, which takes focus without one. */
function inTabOrder(el: HTMLElement): boolean {
  return el.tabIndex >= 0 || (el.isContentEditable && !el.hasAttribute('tabindex'))
}

/**
 * What Tab reaches inside `root`, in document order: what takes focus, is in the tab order, and
 * shows. Not an element held out of it with tabindex="-1" or under `inert`, nor one hidden, laid
 * out of the way with `visibility`, or skipped by `content-visibility`.
 */
export function tabbableIn(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el =>
    inTabOrder(el) && !el.closest('[inert]')
    && (el.checkVisibility?.({ checkVisibilityCSS: true, visibilityProperty: true }) ?? true))
}

export interface TrapTabOptions {
  /** Where focus goes while nothing inside is tabbable. @default root */
  fallback?: HTMLElement | null
}

/**
 * Keeps a Tab keydown inside `root`. From the last stop it wraps to the first, and Shift+Tab from
 * the first to the last; from `root` itself, or from outside, it comes in at the end it is headed
 * for. With nothing to reach, focus goes to `fallback`, or stays on `root`.
 */
export function trapTab(event: KeyboardEvent, root: HTMLElement, options: TrapTabOptions = {}): void {
  const focusable = tabbableIn(root)
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) {
    event.preventDefault()
    ;(options.fallback ?? root).focus({ preventScroll: true })
    return
  }
  const active = document.activeElement
  if (event.shiftKey) {
    if (!root.contains(active) || active === first || active === root) {
      event.preventDefault()
      last.focus()
    }
  }
  else if (!root.contains(active) || active === root || active === last) {
    event.preventDefault()
    first.focus()
  }
}

/** Where focus goes back to once a dialog closes. */
export interface FocusReturn {
  /**
   * Remembers where focus is, as the dialog opens. Not a place inside `root`: a dialog opened
   * again before focus went back keeps the place it remembered first.
   */
  save: (root?: Element | null) => void
  /** Sends focus back there, unless that has left the page, without scrolling to it; and forgets it. */
  restore: () => void
}

export function createFocusReturn(): FocusReturn {
  let saved: HTMLElement | SVGElement | null = null
  return {
    save(root) {
      if (!hasDocument())
        return
      const active = document.activeElement
      if (root?.contains(active))
        return
      saved = active instanceof HTMLElement || active instanceof SVGElement ? active : null
    },
    restore() {
      const target = saved
      saved = null
      if (target?.isConnected)
        target.focus({ preventScroll: true })
    },
  }
}
