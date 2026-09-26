import { hasDocument, hasWindow } from '../../../../utils/env'

/**
 * One theme watcher shared by every mounted card.
 *
 * A card's aura and progress ring are mixed from a colour read off its icon
 * (`--tx-stat-card-icon-color`, written as a resolved `rgb()` literal), so
 * a theme switch that re-points `--tx-color-success` and friends would leave
 * them on the previous theme's hue. A dashboard mounts four or five cards at
 * once; they subscribe here instead of each attaching a MutationObserver and
 * media-query listeners of its own. The observer and the listeners exist only
 * while at least one card is mounted.
 */
type ThemeListener = () => void

// Every switch the token sheet answers to: the `.dark` / `.contrast` classes
// and the `data-theme` / `data-tx-contrast` attributes on `<html>`, and the two
// OS preferences (the high-contrast palette also applies under
// `prefers-contrast: more`, with no attribute or class changing).
const THEME_ATTRIBUTES = ['class', 'data-theme', 'data-tx-contrast']
const THEME_QUERIES = ['(prefers-color-scheme: dark)', '(prefers-contrast: more)']

const listeners = new Set<ThemeListener>()
let observer: MutationObserver | null = null
let mediaQueries: MediaQueryList[] = []
let frame = 0

function flush(): void {
  frame = 0
  for (const listener of listeners)
    listener()
}

// Read on the frame after the change, once the new theme's styles apply. A
// burst of mutations (a class and `data-theme` written together) moves the
// pending frame instead of queueing a second one.
function schedule(): void {
  if (frame)
    cancelAnimationFrame(frame)
  frame = requestAnimationFrame(flush)
}

function connect(): void {
  if (typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(schedule)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: THEME_ATTRIBUTES,
    })
  }
  if (typeof window.matchMedia === 'function') {
    mediaQueries = THEME_QUERIES.map(query => window.matchMedia(query))
    for (const query of mediaQueries)
      query.addEventListener('change', schedule)
  }
}

function disconnect(): void {
  observer?.disconnect()
  observer = null
  for (const query of mediaQueries)
    query.removeEventListener('change', schedule)
  mediaQueries = []
  if (frame)
    cancelAnimationFrame(frame)
  frame = 0
}

/**
 * Calls `listener` on the frame after the page theme changes: a `class`,
 * `data-theme` or `data-tx-contrast` write on `<html>`, or the OS colour scheme
 * or contrast preference flipping. Returns the unsubscribe. Without a DOM (SSR)
 * it subscribes nothing.
 */
export function onThemeChange(listener: ThemeListener): () => void {
  if (!hasWindow() || !hasDocument())
    return () => {}
  listeners.add(listener)
  if (listeners.size === 1)
    connect()
  return () => {
    if (listeners.delete(listener) && listeners.size === 0)
      disconnect()
  }
}
