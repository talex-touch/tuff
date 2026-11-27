// The arrow keys in a menu: focus moves from item to item.

const KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End'])

/**
 * A text field, or a caret in an editable region. `isContentEditable` covers inherited
 * editability (the caret sits in a <b> inside the editable host); the `closest` walk covers
 * engines without the property, jsdom among them. Neither alone is sufficient.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
    return true
  return target.isContentEditable || !!target.closest('[contenteditable]:not([contenteditable="false"])')
}

export interface RovingFocusOptions {
  /** Passes over items with aria-disabled="true". */
  skipDisabled?: boolean
  /**
   * Leaves Home and End to a field they are pressed in, a search box say, to move its caret. The
   * arrows still move focus: that is how the field hands it to the items.
   */
  editableKeepsHomeEnd?: boolean
  /** How an item is focused. */
  focusOptions?: FocusOptions
}

export interface RovingFocus {
  /** The items the keys move among, in order. */
  items: () => HTMLElement[]
  /**
   * ArrowDown and ArrowUp focus the next item and the previous, round from the last to the first
   * and back; from outside the items, ArrowDown comes in at the first and ArrowUp at the last.
   * Home and End focus the first and the last. `from` is the item the key moves on from, the
   * focused one unless given. Returns whether focus moved; the key's default is then prevented.
   */
  move: (event: KeyboardEvent, from?: Element | null) => boolean
}

export function createRovingFocus(source: () => Iterable<HTMLElement>, options: RovingFocusOptions = {}): RovingFocus {
  function items(): HTMLElement[] {
    const all = Array.from(source())
    return options.skipDisabled ? all.filter(item => item.getAttribute('aria-disabled') !== 'true') : all
  }

  function move(event: KeyboardEvent, from?: Element | null): boolean {
    if (!KEYS.has(event.key))
      return false
    if ((event.key === 'Home' || event.key === 'End') && options.editableKeepsHomeEnd && isEditableTarget(event.target))
      return false
    const list = items()
    if (list.length === 0)
      return false
    event.preventDefault()
    const at = list.indexOf((from ?? document.activeElement) as HTMLElement)
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? list.length - 1
        : event.key === 'ArrowDown'
          ? (at + 1) % list.length
          : (at <= 0 ? list.length : at) - 1
    list[next]!.focus(options.focusOptions)
    return true
  }

  return { items, move }
}
