import type { TuffSection } from '@talex-touch/utils'
import type { Ref } from 'vue'
import type { IBoxOptions } from '..'
import { BoxMode } from '..'
import { onBeforeUnmount } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { createCoreBoxKeyTransport, type ForwardedKeyEvent } from '../transport/key-transport'

interface SectionRange {
  start: number
  end: number
  count: number
}

/** Build section ranges from sections config */
function buildSectionRanges(sections: TuffSection[]): SectionRange[] {
  const ranges: SectionRange[] = []
  let start = 0
  for (const section of sections) {
    const count = section.itemIds.length
    if (count > 0) {
      ranges.push({ start, end: start + count - 1, count })
      start += count
    }
  }
  return ranges
}

/** Find which section a global index belongs to */
function findSectionIndex(index: number, ranges: SectionRange[]): number {
  for (let i = 0; i < ranges.length; i++) {
    if (index >= ranges[i].start && index <= ranges[i].end) {
      return i
    }
  }
  return ranges.length - 1
}

/** Navigate down in multi-section grid */
function navigateGridDown(
  currentIndex: number,
  cols: number,
  sections: TuffSection[],
  totalItems: number
): number {
  const ranges = buildSectionRanges(sections)
  if (ranges.length === 0) return currentIndex

  const sectionIdx = findSectionIndex(currentIndex, ranges)
  const section = ranges[sectionIdx]
  const localIndex = currentIndex - section.start
  const localCol = localIndex % cols
  const localRow = Math.floor(localIndex / cols)
  const sectionRows = Math.ceil(section.count / cols)

  // Try to move down within current section
  const nextLocalRow = localRow + 1
  if (nextLocalRow < sectionRows) {
    const nextLocalIndex = nextLocalRow * cols + localCol
    if (nextLocalIndex < section.count) {
      return section.start + nextLocalIndex
    }
    // Target column doesn't exist in last row, go to last item in section
    return section.end
  }

  // Move to next section
  if (sectionIdx < ranges.length - 1) {
    const nextSection = ranges[sectionIdx + 1]
    // Go to same column in first row of next section, or last item if not enough
    const targetIndex = Math.min(localCol, nextSection.count - 1)
    return nextSection.start + targetIndex
  }

  // Already at last section, cycle to first section
  if (totalItems <= 20) {
    return Math.min(localCol, ranges[0].count - 1)
  }

  return currentIndex
}

/** Navigate up in multi-section grid */
function navigateGridUp(
  currentIndex: number,
  cols: number,
  sections: TuffSection[]
): number {
  const ranges = buildSectionRanges(sections)
  if (ranges.length === 0) return currentIndex

  const sectionIdx = findSectionIndex(currentIndex, ranges)
  const section = ranges[sectionIdx]
  const localIndex = currentIndex - section.start
  const localCol = localIndex % cols
  const localRow = Math.floor(localIndex / cols)

  // Try to move up within current section
  if (localRow > 0) {
    return section.start + (localRow - 1) * cols + localCol
  }

  // Move to previous section
  if (sectionIdx > 0) {
    const prevSection = ranges[sectionIdx - 1]
    const prevSectionRows = Math.ceil(prevSection.count / cols)
    const lastRowStart = (prevSectionRows - 1) * cols
    // Go to same column in last row of previous section
    const targetLocalIndex = lastRowStart + localCol
    if (targetLocalIndex < prevSection.count) {
      return prevSection.start + targetLocalIndex
    }
    // Target column doesn't exist, go to last item
    return prevSection.end
  }

  // Already at first section, cycle to last section
  const totalItems = ranges.reduce((sum, r) => sum + r.count, 0)
  if (totalItems <= 20 && ranges.length > 0) {
    const lastSection = ranges[ranges.length - 1]
    const lastSectionRows = Math.ceil(lastSection.count / cols)
    const lastRowStart = (lastSectionRows - 1) * cols
    const targetLocalIndex = lastRowStart + localCol
    if (targetLocalIndex < lastSection.count) {
      return lastSection.start + targetLocalIndex
    }
    return lastSection.end
  }

  return currentIndex
}

declare global {
  interface Window {
    __coreboxHistoryVisible?: boolean
  }
}

/**
 * Keys that should always be forwarded to plugin UI view when in UI mode.
 * ArrowLeft/ArrowRight are NOT forwarded unless meta/ctrl is pressed,
 * as they are used for text cursor navigation in the input field.
 */
const FORWARD_KEYS = new Set(['Enter', 'ArrowUp', 'ArrowDown'])

/**
 * Keys that should be forwarded when Alt/Option key is pressed.
 * These are common text editing shortcuts:
 * - Option+Backspace: Delete word backward
 * - Option+Delete: Delete word forward
 * - Option+Left/Right: Move by word
 */
const ALT_FORWARD_KEYS = new Set(['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight'])

/**
 * Keys that should NOT be forwarded even in input-hidden mode.
 * These are system-level shortcuts handled by CoreBox itself.
 */
const SYSTEM_KEYS = new Set(['Escape'])

/**
 * Event name for triggering DivisionBox detach (Command+D)
 */
const COREBOX_DETACH_EVENT = 'corebox:detach-item'

/**
 * Event name for triggering Flow transfer
 */
const COREBOX_FLOW_EVENT = 'corebox:flow-item'

/**
 * Event name for triggering pin toggle (Command+K)
 */
const COREBOX_PIN_EVENT = 'corebox:toggle-pin'

/**
 * Determines if a keyboard event should be forwarded to the plugin UI view.
 *
 * Common shortcuts that should be forwarded:
 * - Cmd/Ctrl+A: Select all
 * - Cmd/Ctrl+C: Copy
 * - Cmd/Ctrl+X: Cut
 * - Cmd/Ctrl+Z: Undo
 * - Cmd/Ctrl+Shift+Z: Redo
 * - Cmd/Ctrl+Backspace: Delete to line start
 * - Option/Alt+Backspace: Delete word backward
 * - Option/Alt+Delete: Delete word forward
 * - Option/Alt+Left/Right: Move by word
 * - Cmd/Ctrl+Left/Right: Move to line start/end
 *
 * @param event - The keyboard event to check
 * @param inputHidden - Whether the input is hidden (UI mode with no input box)
 * @returns True if the event should be forwarded
 */
function shouldForwardKey(event: KeyboardEvent, inputHidden = false): boolean {
  // Never forward system keys (Escape for exit)
  if (SYSTEM_KEYS.has(event.key)) {
    return false
  }

  // Never forward ⌘←/⌘→ - reserved for CoreBox history panel
  if ((event.metaKey || event.ctrlKey) && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    return false
  }

  // In input-hidden mode (UI mode), forward almost all keys except system keys
  if (inputHidden) {
    // Don't forward Cmd+V (handled separately for paste)
    if ((event.metaKey || event.ctrlKey) && event.key === 'v') {
      return false
    }
    return true
  }

  // Normal mode: forward specific keys
  // Forward all Cmd/Ctrl shortcuts except Cmd+V (handled separately for paste)
  if ((event.metaKey || event.ctrlKey) && event.key !== 'v') {
    return true
  }
  // Forward Alt/Option key combinations for word-level editing
  if (event.altKey && ALT_FORWARD_KEYS.has(event.key)) {
    return true
  }
  return FORWARD_KEYS.has(event.key)
}

/**
 * Serializes a DOM KeyboardEvent into a plain object for IPC transport.
 *
 * @param event - The keyboard event to serialize
 * @returns A serializable keyboard event object
 */
function serializeKeyEvent(event: KeyboardEvent): ForwardedKeyEvent {
  return {
    key: event.key,
    code: event.code,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    repeat: event.repeat
  }
}

export function useKeyboard(
  boxOptions: IBoxOptions,
  res: Ref<any[]>,
  select: Ref<number>,
  scrollbar: Ref<any>,
  searchVal: Ref<string>,
  handleExecute: (item: any) => void,
  handleExit: () => Promise<void>,
  inputEl: Ref<HTMLInputElement | undefined>,
  clipboardOptions: any,
  clearClipboard: (options?: { remember?: boolean }) => void,
  activeActivations: Ref<any>,
  handlePaste: (options?: { overrideDismissed?: boolean }) => void,
  itemRefs: Ref<any[]>,
) {
  const keyTransport = createCoreBoxKeyTransport(touchChannel)

  /**
   * Checks if CoreBox is currently in UI mode (plugin view attached).
   */
  function isInUIMode(): boolean {
    return activeActivations.value?.length > 0
  }

  /**
   * Forwards a keyboard event to the plugin UI view via IPC.
   */
  function forwardToUIView(event: KeyboardEvent): void {
    keyTransport.forwardKeyEvent(serializeKeyEvent(event))
  }

  /**
   * Global keyboard event handler for CoreBox window
   * @param event - KeyboardEvent from user interaction
   */
  function onKeyDown(event: KeyboardEvent): void {
    // Debug: log all meta+arrow events at entry point
    if (event.metaKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      console.log('[useKeyboard] META+ARROW at entry, key:', event.key, 'hasClass:', document.body.classList.contains('core-box'))
    }

    if (!document.body.classList.contains('core-box')) {
      return
    }

    // Check if in UI mode - input is hidden when in UI mode
    const uiMode = isInUIMode()
    const inputHidden = uiMode // In UI mode, input box is hidden

    // Debug: log ⌘← events
    if (event.metaKey && event.key === 'ArrowLeft') {
      console.log('[useKeyboard] ⌘← after class check, uiMode:', uiMode, 'shouldForward:', shouldForwardKey(event, inputHidden))
    }

    // Forward keys to plugin UI view when in UI mode
    if (uiMode && shouldForwardKey(event, inputHidden)) {
      forwardToUIView(event)
      event.preventDefault()
      return
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'v') {
      handlePaste({ overrideDismissed: true })
      event.preventDefault()
      return
    }

    // Skip CoreBox's own navigation when in UI mode (already forwarded)
    if (uiMode && FORWARD_KEYS.has(event.key)) {
      return
    }

    if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      const key = event.key
      const index = key === '0' ? 9 : Number.parseInt(key, 10) - 1
      if (!Number.isNaN(index) && index >= 0 && index < 10) {
        if (res.value[index]) {
          boxOptions.focus = index
          event.preventDefault()
        }
      }
    }

    if (event.key === 'Enter') {
      select.value = boxOptions.focus
      const target = res.value[boxOptions.focus]

      handleExecute(target)
    }
    else if (event.key === 'ArrowDown') {
      const isGrid = boxOptions.layout?.mode === 'grid'
      const cols = boxOptions.layout?.grid?.columns || 5
      const sections = boxOptions.layout?.sections

      if (isGrid && sections && sections.length > 1) {
        // Multi-section grid navigation
        const nextIndex = navigateGridDown(boxOptions.focus, cols, sections, res.value.length)
        boxOptions.focus = nextIndex
      } else {
        const step = isGrid ? cols : 1
        const nextIndex = boxOptions.focus + step

        if (nextIndex < res.value.length) {
          boxOptions.focus = nextIndex
        } else if (res.value.length <= 20) {
          boxOptions.focus = isGrid ? (boxOptions.focus % cols) : 0
        }
      }
      event.preventDefault()
    }
    else if (event.key === 'ArrowUp') {
      const isGrid = boxOptions.layout?.mode === 'grid'
      const cols = boxOptions.layout?.grid?.columns || 5
      const sections = boxOptions.layout?.sections

      if (isGrid && sections && sections.length > 1) {
        // Multi-section grid navigation
        const prevIndex = navigateGridUp(boxOptions.focus, cols, sections)
        boxOptions.focus = prevIndex
      } else {
        const step = isGrid ? cols : 1
        const prevIndex = boxOptions.focus - step

        if (prevIndex >= 0) {
          boxOptions.focus = prevIndex
        } else if (res.value.length <= 20) {
          const lastRowStart = Math.floor((res.value.length - 1) / cols) * cols
          const targetCol = boxOptions.focus % cols
          const targetIndex = Math.min(lastRowStart + targetCol, res.value.length - 1)
          boxOptions.focus = isGrid ? targetIndex : (res.value.length - 1)
        }
      }
      event.preventDefault()
    }
    else if (event.key === 'ArrowLeft') {
      // Meta+Left: show calculation history (check first to ensure it works in all modes)
      if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        console.log('[useKeyboard] Dispatching corebox:show-calculation-history event')
        window.dispatchEvent(new CustomEvent('corebox:show-calculation-history'))
        event.preventDefault()
        return
      }
      const isGrid = boxOptions.layout?.mode === 'grid'
      // Grid mode: move left
      if (isGrid) {
        if (boxOptions.focus > 0) {
          boxOptions.focus -= 1
        }
        event.preventDefault()
        return
      }
    }
    else if (event.key === 'ArrowRight') {
      const isGrid = boxOptions.layout?.mode === 'grid'
      // Grid mode: move right
      if (isGrid && !event.metaKey) {
        if (boxOptions.focus < res.value.length - 1) {
          boxOptions.focus += 1
        }
        event.preventDefault()
        return
      }
      // Meta+Right: hide calculation history
      if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        if (window.__coreboxHistoryVisible) {
          window.dispatchEvent(new CustomEvent('corebox:hide-calculation-history'))
          event.preventDefault()
          return
        }
      }
    }
    else if (event.key === 'Tab') {
      if (res.value[boxOptions.focus]) {
        const completion
          = res.value[boxOptions.focus].render.completion
            ?? res.value[boxOptions.focus].render.basic?.title
            ?? ''
        searchVal.value = completion

        if (inputEl.value) {
          requestAnimationFrame(() => {
            inputEl.value!.setSelectionRange(completion.length, completion.length)
          })
        }
      }
      event.preventDefault()
    }
    else if (event.key === 'd' || event.key === 'D') {
      /**
       * Command/Ctrl+D: Detach current item to DivisionBox
       *
       * This allows users to "pop out" the currently focused item into
       * an independent DivisionBox window for persistent access.
       *
       * With Shift: Opens Flow selector to transfer data to another plugin
       */
      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        const currentItem = res.value[boxOptions.focus]
        if (!currentItem) {
          event.preventDefault()
          return
        }

        if (event.shiftKey) {
          // Command+Shift+D: Flow transfer to another plugin
          window.dispatchEvent(new CustomEvent(COREBOX_FLOW_EVENT, {
            detail: { item: currentItem, query: searchVal.value }
          }))
        } else {
          // Command+D: Detach to DivisionBox
          window.dispatchEvent(new CustomEvent(COREBOX_DETACH_EVENT, {
            detail: { item: currentItem, query: searchVal.value }
          }))
        }
        event.preventDefault()
        return
      }
    }
    else if (event.key === 'k' || event.key === 'K') {
      // Command/Ctrl+K: Toggle pin for current item
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        console.log('[useKeyboard] ⌘K detected, focus:', boxOptions.focus, 'item:', res.value[boxOptions.focus]?.render?.basic?.title)
        const currentItem = res.value[boxOptions.focus]
        if (!currentItem) {
          console.log('[useKeyboard] ⌘K no current item')
          event.preventDefault()
          return
        }

        console.log('[useKeyboard] ⌘K dispatching event for item:', currentItem.id)
        window.dispatchEvent(new CustomEvent(COREBOX_PIN_EVENT, {
          detail: { item: currentItem }
        }))
        event.preventDefault()
        return
      }
    }
    else if (event.key === 'Escape') {
      /**
       * ESC key strict sequential handling (FIXED):
       * 1. Clear clipboard/file attachments (PRIORITY)
       * 2. Deactivate active providers (attachUIView)
       * 3. Clear input query
       * 4. Handle mode transitions
       * 5. Hide CoreBox window
       *
       * Note: handleExit is async but we use void operator (fire-and-forget)
       * because keyboard event handlers cannot be async. The async operations
       * will continue in the background without blocking the UI.
       *
       * Fix: Prioritize clearing clipboard/attachments before deactivating providers
       * to prevent attachUIView from closing while clipboard data remains attached.
       */

      // Step 1: Clear clipboard/file attachments FIRST (highest priority)
      if (clipboardOptions.last || boxOptions.file?.paths?.length > 0) {
        if (clipboardOptions.last) {
          clearClipboard({ remember: true })
        }
        if (boxOptions.mode === BoxMode.FILE) {
          boxOptions.mode = BoxMode.INPUT
          boxOptions.file = { buffer: null, paths: [] }
        }
        event.preventDefault()
        return
      }

      // Step 2: Deactivate active providers (attachUIView)
      if (activeActivations.value?.length > 0) {
        void handleExit()
        event.preventDefault()
        return
      }

      // Step 3: Clear input query
      if (searchVal.value) {
        searchVal.value = ''
        event.preventDefault()
        return
      }

      // Step 4: Hide CoreBox window (final step)
      void handleExit()
    }

    if (boxOptions.focus < 0) {
      boxOptions.focus = 0
    }
    else if (boxOptions.focus > res.value.length - 1) {
      boxOptions.focus = res.value.length - 1
    }

    requestAnimationFrame(() => {
      if (boxOptions.focus < 0 || boxOptions.focus >= itemRefs.value.length) {
        return
      }

      const activeItemComponent = itemRefs.value[boxOptions.focus]
      if (!activeItemComponent) {
        return
      }

      const activeEl = activeItemComponent?.$el || activeItemComponent
      const sb = scrollbar.value

      if (activeEl && sb) {
        const scrollInfo = sb.getScrollInfo()
        const containerHeight = scrollInfo.clientHeight
        const scrollTop = scrollInfo.scrollTop

        const itemTop = activeEl.offsetTop
        const itemHeight = activeEl.offsetHeight

        if (itemTop < scrollTop) {
          sb.scrollTo(0, itemTop)
        }
        else if (itemTop + itemHeight > scrollTop + containerHeight) {
          sb.scrollTo(0, itemTop + itemHeight - containerHeight)
        }
      }
    })
  }

  /**
   * Use capture phase (true) to ensure keyboard events are handled
   * before input element's event handlers. This fixes the issue where
   * keyboard events don't reach the global handler when input has focus.
   *
   * Event propagation phases:
   * 1. Capture phase (document → input) - WE LISTEN HERE
   * 2. Target phase (input itself)
   * 3. Bubble phase (input → document)
   */
  document.addEventListener('keydown', onKeyDown, true)

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeyDown, true)
  })
}
