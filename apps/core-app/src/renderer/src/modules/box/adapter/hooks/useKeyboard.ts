import type { Ref } from 'vue'
import type { IBoxOptions } from '..'
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
  handleExit: () => void,
  inputEl: Ref<HTMLInputElement | undefined>,
  clipboardOptions: any,
  clearClipboard: () => void,
  activeActivations: Ref<any>,
  handlePaste: (options?: { overrideDismissed?: boolean }) => void,
  itemRefs: Ref<any[]>,
) {
  function onKeyDown(event: KeyboardEvent): void {
    if (!document.body.classList.contains('core-box')) {
      return
    }

    // Handle Cmd/Ctrl+V for manual paste
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
      boxOptions.focus += 1
      event.preventDefault()
    }
    else if (event.key === 'ArrowUp') {
      boxOptions.focus -= 1
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
      // Priority: activeProvider → clipboard → mode/search → hide
      // 1. If there's an active provider, exit it first
      if (activeActivations.value && activeActivations.value.length > 0) {
        handleExit() // This will deactivate providers
        return
      }

      // 2. If there's clipboard data, clear it
      if (clipboardOptions.last) {
        clearClipboard()
        event.preventDefault()
        return
      }

      // 3. Handle other exits (mode, searchVal, hide)
      handleExit()
    }

    if (boxOptions.focus < 0) {
      boxOptions.focus = 0
    }
    else if (boxOptions.focus > res.value.length - 1) {
      boxOptions.focus = res.value.length - 1
    }

    // Dynamic scrolling logic
    requestAnimationFrame(() => {
      // Safety check: ensure focus index is valid
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

        // Check if item is above the visible area
        if (itemTop < scrollTop) {
          sb.scrollTo(0, itemTop)
        }
        // Check if item is below the visible area
        else if (itemTop + itemHeight > scrollTop + containerHeight) {
          sb.scrollTo(0, itemTop + itemHeight - containerHeight)
        }
      }
    })
  }

  document.addEventListener('keydown', onKeyDown)

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeyDown)
  })
}
