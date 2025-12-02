import type { Ref } from 'vue'
import type { IBoxOptions } from '..'
import { BoxMode } from '..'
import { onBeforeUnmount } from 'vue'

declare global {
  interface Window {
    __coreboxHistoryVisible?: boolean
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
  /**
   * Global keyboard event handler for CoreBox window
   * @param event - KeyboardEvent from user interaction
   */
  function onKeyDown(event: KeyboardEvent): void {
    if (!document.body.classList.contains('core-box')) {
      return
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'v') {
      handlePaste({ overrideDismissed: true })
      event.preventDefault()
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
      // Support cycling to first item when list is small (≤ 20 items)
      // For larger lists, keep current behavior to avoid rendering performance issues
      if (res.value.length <= 20 && boxOptions.focus === res.value.length - 1) {
        boxOptions.focus = 0
      } else {
        boxOptions.focus += 1
      }
      event.preventDefault()
    }
    else if (event.key === 'ArrowUp') {
      // Support cycling to last item when list is small (≤ 20 items)
      // For larger lists, keep current behavior to avoid rendering performance issues
      if (res.value.length <= 20 && boxOptions.focus === 0) {
        boxOptions.focus = res.value.length - 1
      } else {
        boxOptions.focus -= 1
      }
      event.preventDefault()
    }
    else if (
      event.key === 'ArrowLeft'
      && event.metaKey
      && !event.ctrlKey
      && !event.altKey
      && !event.shiftKey
    ) {
      const current = res.value[boxOptions.focus]
      if (current?.source?.id === 'preview-provider') {
        window.dispatchEvent(new CustomEvent('corebox:show-calculation-history', { detail: current }))
        event.preventDefault()
        return
      }
    }
    else if (
      event.key === 'ArrowRight'
      && event.metaKey
      && !event.ctrlKey
      && !event.altKey
      && !event.shiftKey
    ) {
      if (window.__coreboxHistoryVisible) {
        window.dispatchEvent(new CustomEvent('corebox:hide-calculation-history'))
        event.preventDefault()
        return
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
