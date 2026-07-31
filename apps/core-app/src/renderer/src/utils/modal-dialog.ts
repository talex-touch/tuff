const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

function dialogControls(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true'
  )
}

export function focusModalDialog(
  root: HTMLElement | null,
  preferred: HTMLElement | null = null
): void {
  if (!root) return
  const target = preferred && root.contains(preferred) ? preferred : dialogControls(root)[0]
  ;(target ?? root).focus()
}

export function handleModalDialogKeydown(
  event: KeyboardEvent,
  root: HTMLElement | null,
  options: { close: () => void; pending: boolean }
): void {
  if (!root) return

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (!options.pending) options.close()
    return
  }

  if (event.key !== 'Tab') return
  const controls = dialogControls(root)
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (!first || !last) {
    event.preventDefault()
    root.focus()
    return
  }

  const active = document.activeElement
  if (event.shiftKey && (active === first || active === root || !root.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}
